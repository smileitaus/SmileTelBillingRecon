/**
 * One-time script to sync Carbon API costs to monthlyCost for all ABB services.
 * Run with: node scripts/run-carbon-sync.mjs
 */
import { createConnection } from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

async function main() {
  const conn = await createConnection(DATABASE_URL);
  console.log('Connected to database');

  // Step 1: Find all ABB services with carbonMonthlyCost > 0
  const [abbServices] = await conn.execute(`
    SELECT externalId, planName, monthlyCost, costSource, carbonMonthlyCost, carbonPlanName, carbonServiceId
    FROM services
    WHERE provider = 'ABB' AND carbonMonthlyCost IS NOT NULL AND carbonMonthlyCost > 0
  `);

  console.log(`Found ${abbServices.length} ABB services with Carbon API costs`);

  let updated = 0;
  let skipped = 0;
  let snapshotted = 0;
  let totalCarbonCost = 0;
  const changed = [];

  for (const svc of abbServices) {
    const carbonCost = parseFloat(svc.carbonMonthlyCost);
    const currentCost = parseFloat(svc.monthlyCost);
    totalCarbonCost += carbonCost;

    // Skip if already at Carbon API cost
    if (Math.abs(currentCost - carbonCost) < 0.005 && svc.costSource === 'carbon_api') {
      skipped++;
      continue;
    }

    // Snapshot old cost if non-zero and not already from carbon_api
    if (currentCost > 0 && svc.costSource !== 'carbon_api') {
      await conn.execute(`
        INSERT INTO service_cost_history (serviceExternalId, monthlyCost, costSource, snapshotReason, snapshotBy, notes)
        VALUES (?, ?, ?, 'carbon_sync', 'system-migration', ?)
      `, [
        svc.externalId,
        currentCost.toFixed(2),
        svc.costSource || 'unknown',
        `Overridden by Carbon API cost $${carbonCost.toFixed(2)} (plan: ${svc.carbonPlanName || svc.planName || ''})`
      ]);
      snapshotted++;
    }

    // Update monthlyCost to Carbon API cost
    await conn.execute(`
      UPDATE services SET monthlyCost = ?, costSource = 'carbon_api' WHERE externalId = ?
    `, [carbonCost.toFixed(2), svc.externalId]);

    if (Math.abs(currentCost - carbonCost) > 0.005) {
      changed.push({ externalId: svc.externalId, oldCost: currentCost, newCost: carbonCost, planName: svc.carbonPlanName || svc.planName || '' });
    }
    updated++;
  }

  console.log(`\n=== Carbon Sync Results ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already current): ${skipped}`);
  console.log(`Snapshotted old costs: ${snapshotted}`);
  console.log(`Total Carbon API cost: $${totalCarbonCost.toFixed(2)}/mo`);

  if (changed.length > 0) {
    console.log(`\nServices with changed costs (${changed.length}):`);
    changed.forEach(c => {
      console.log(`  ${c.externalId}: $${c.oldCost.toFixed(2)} → $${c.newCost.toFixed(2)} (${c.planName})`);
    });
  }

  // Step 2: Backfill costSource for non-ABB services with monthlyCost > 0
  const [r1] = await conn.execute(`
    UPDATE services
    SET costSource = 'supplier_invoice'
    WHERE provider NOT IN ('ABB', 'Unknown', 'SmileTel')
      AND monthlyCost > 0
      AND (costSource IS NULL OR costSource = '' OR costSource = 'unknown')
  `);
  console.log(`\nBackfilled costSource='supplier_invoice' for ${r1.affectedRows} non-ABB services`);

  // Step 3: Recalculate customer aggregate costs
  const [r2] = await conn.execute(`
    UPDATE customers c
    SET monthlyCost = COALESCE((
      SELECT SUM(s.monthlyCost)
      FROM services s
      WHERE s.customerExternalId = c.externalId
        AND s.status NOT IN ('terminated', 'inactive')
    ), 0)
  `);
  console.log(`Recalculated costs for ${r2.affectedRows} customers`);

  // Step 4: Verify final state
  const [[abbTotal]] = await conn.execute(`
    SELECT COUNT(*) as cnt, SUM(monthlyCost) as total FROM services WHERE provider = 'ABB' AND monthlyCost > 0
  `);
  const [[carbonApiCount]] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM services WHERE costSource = 'carbon_api'
  `);
  const [[supplierInvoiceCount]] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM services WHERE costSource = 'supplier_invoice'
  `);
  const [[historyCount]] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM service_cost_history
  `);

  console.log(`\n=== Final State ===`);
  console.log(`ABB services with cost > 0: ${abbTotal.cnt} (total: $${parseFloat(abbTotal.total).toFixed(2)}/mo)`);
  console.log(`Services with costSource='carbon_api': ${carbonApiCount.cnt}`);
  console.log(`Services with costSource='supplier_invoice': ${supplierInvoiceCount.cnt}`);
  console.log(`Cost history snapshots: ${historyCount.cnt}`);

  await conn.end();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
