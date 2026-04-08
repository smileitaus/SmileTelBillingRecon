/**
 * Populate monthlyRevenue for SasBoss services with $0 revenue
 * using retail prices from supplier_product_cost_map.
 * 
 * Only applies to services where:
 * 1. provider = 'SasBoss'
 * 2. monthlyRevenue = 0
 * 3. status NOT IN ('terminated','archived')
 * 4. planName matches a product in supplier_product_cost_map with defaultRetailPrice > 0
 * 5. The service is NOT already matched to a Xero billing item (matchStatus = 'service-matched')
 *    — those already have correct revenue from Xero
 */

import mysql2 from 'mysql2/promise';

const url = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql2.createConnection(url);

  // Get all SasBoss retail prices from product cost map
  const [priceMap] = await conn.execute(`
    SELECT productName, defaultRetailPrice
    FROM supplier_product_cost_map
    WHERE (supplier = 'SasBoss' OR supplier LIKE '%Access4%')
      AND defaultRetailPrice > 0
  `);

  const prices = {};
  for (const r of priceMap) {
    prices[r.productName.toLowerCase().trim()] = parseFloat(r.defaultRetailPrice);
  }
  console.log(`Loaded ${Object.keys(prices).length} retail price entries from product cost map`);

  // Get all SasBoss $0 revenue services that are NOT already matched to billing items
  const [services] = await conn.execute(`
    SELECT s.externalId, s.planName, s.customerExternalId, s.monthlyCost
    FROM services s
    WHERE s.provider = 'SasBoss'
      AND s.monthlyRevenue = 0
      AND s.status NOT IN ('terminated','archived')
      AND NOT EXISTS (
        SELECT 1 FROM billing_items bi 
        WHERE bi.serviceExternalId = s.externalId 
          AND bi.matchStatus = 'service-matched'
          AND bi.lineAmount > 0
      )
  `);

  console.log(`Found ${services.length} SasBoss services with $0 revenue and no Xero match`);

  let updated = 0;
  let skipped = 0;
  const updates = [];

  for (const svc of services) {
    const planKey = (svc.planName || '').toLowerCase().trim();
    const retailPrice = prices[planKey];

    if (retailPrice && retailPrice > 0) {
      updates.push({ externalId: svc.externalId, revenue: retailPrice, planName: svc.planName });
    } else {
      skipped++;
    }
  }

  console.log(`\nMatched ${updates.length} services to retail prices, ${skipped} unmatched`);
  console.log('\nPlan breakdown:');
  const planCounts = {};
  for (const u of updates) {
    const key = `${u.planName} → $${u.revenue}`;
    planCounts[key] = (planCounts[key] || 0) + 1;
  }
  for (const [k, v] of Object.entries(planCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}x ${k}`);
  }

  if (updates.length === 0) {
    console.log('Nothing to update.');
    await conn.end();
    return;
  }

  // Apply updates in batches
  console.log('\nApplying updates...');
  for (const u of updates) {
    await conn.execute(
      `UPDATE services SET monthlyRevenue = ?, updatedAt = NOW() WHERE externalId = ?`,
      [u.revenue, u.externalId]
    );
    updated++;
  }
  console.log(`Updated ${updated} services`);

  // Recalculate affected customers
  const affectedCustomers = [...new Set(updates.map(u => {
    // We need customerExternalId - get from services
    const svc = services.find(s => s.externalId === u.externalId);
    return svc?.customerExternalId;
  }).filter(Boolean))];

  console.log(`\nRecalculating ${affectedCustomers.length} customers...`);
  for (const custId of affectedCustomers) {
    await conn.execute(`
      UPDATE customers SET
        monthlyRevenue = (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')),
        monthlyCost    = (SELECT COALESCE(SUM(s.monthlyCost), 0)    FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')),
        marginPercent  = ROUND(
          ((SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived'))
           - (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')))
          / NULLIF((SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')), 0)
          * 100, 2),
        updatedAt = NOW()
      WHERE externalId = ?
    `, [custId, custId, custId, custId, custId, custId]);
  }

  console.log('Done!');
  await conn.end();
}

main().catch(e => console.error(e.message));
