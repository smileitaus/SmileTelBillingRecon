'use strict';
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const fs = require('fs');
require('dotenv').config();

const DRY_RUN = process.argv[2] !== '--commit';
const BUY_COL = ' Buy (ex gst) ';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Load both spreadsheets for maximum coverage
  const buf1 = fs.readFileSync('/home/ubuntu/billing-tool/scripts/audit-source.xlsx');
  const wb1 = XLSX.read(buf1);
  const auditABB = XLSX.utils.sheet_to_json(wb1.Sheets['ABB ExDa']);

  const buf2 = fs.readFileSync('/home/ubuntu/smiletel.xlsx');
  const wb2 = XLSX.read(buf2);
  const smitelABB = XLSX.utils.sheet_to_json(wb2.Sheets['ABB']);

  // Build lookup: connectionId -> buy price (ex GST)
  const buyPriceMap = new Map();

  // smiletel.xlsx takes priority (more recent)
  for (const r of smitelABB) {
    const avc = r['AVC'];
    const buy = parseFloat(r[BUY_COL]);
    if (avc && buy && !isNaN(buy)) {
      buyPriceMap.set(avc, buy);
    }
  }

  // Audit spreadsheet fills in gaps
  for (const r of auditABB) {
    const avc = r['Connection ID 1'];
    const buy = parseFloat(r[BUY_COL]);
    if (avc && buy && !isNaN(buy) && !buyPriceMap.has(avc)) {
      buyPriceMap.set(avc, buy);
    }
  }

  console.log('Buy price map size:', buyPriceMap.size);

  // Get all ABB services from DB
  const [dbABB] = await conn.execute(
    "SELECT id, externalId, connectionId, planName, monthlyCost FROM services WHERE provider = 'ABB' AND status != 'terminated'"
  );

  console.log('ABB services in DB:', dbABB.length);

  let updated = 0, noMatch = 0, alreadyCorrect = 0;
  const updates = [];

  for (const s of dbABB) {
    const correctBuy = buyPriceMap.get(s.connectionId);
    if (correctBuy === undefined) {
      noMatch++;
      continue;
    }
    const dbCost = parseFloat(s.monthlyCost);
    // Only update if the difference is significant (>5%)
    if (Math.abs(dbCost - correctBuy) / correctBuy > 0.05) {
      updates.push({ id: s.id, externalId: s.externalId, oldCost: dbCost, newCost: correctBuy, plan: s.planName });
      updated++;
    } else {
      alreadyCorrect++;
    }
  }

  console.log('\nProposed updates:');
  updates.forEach(function(u) {
    console.log('  ' + u.externalId + ': $' + u.oldCost + ' -> $' + u.newCost + ' (ex GST) | ' + u.plan);
  });

  console.log('\nSummary: ' + updated + ' to update, ' + alreadyCorrect + ' already correct, ' + noMatch + ' no match');

  if (DRY_RUN) {
    console.log('\nDRY RUN - run with --commit to apply changes');
    await conn.end();
    return;
  }

  // Apply updates
  let applied = 0;
  for (const u of updates) {
    await conn.execute(
      'UPDATE services SET monthlyCost = ? WHERE id = ?',
      [u.newCost, u.id]
    );
    applied++;
  }

  // Recalculate customer totals for affected customers
  await conn.execute(`
    UPDATE customers c
    SET totalMonthlyCost = (
      SELECT COALESCE(SUM(s.monthlyCost), 0)
      FROM services s
      WHERE s.customerId = c.id AND s.status NOT IN ('terminated', 'inactive')
    )
  `);

  console.log('\nApplied ' + applied + ' cost corrections');
  console.log('Customer totals recalculated');

  await conn.end();
}

main().catch(console.error);
