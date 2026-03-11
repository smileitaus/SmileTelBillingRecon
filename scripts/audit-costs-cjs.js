'use strict';
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const fs = require('fs');
require('dotenv').config();

const BUY_COL = ' Buy (ex gst) ';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const buf = fs.readFileSync('/home/ubuntu/billing-tool/scripts/audit-source.xlsx');
  const wb = XLSX.read(buf);
  const abbData = XLSX.utils.sheet_to_json(wb.Sheets['ABB ExDa']);

  // Get all ABB services from DB
  const [dbABB] = await conn.execute(
    "SELECT externalId, connectionId, planName, monthlyCost FROM services WHERE provider = 'ABB' AND status != 'terminated' AND monthlyCost > 0"
  );

  console.log('DB ABB services with cost:', dbABB.length);
  console.log('Spreadsheet ABB rows:', abbData.length);

  let inflated = 0, correct = 0, noMatch = 0;
  const mismatches = [];

  for (const s of dbABB) {
    const match = abbData.find(function(r) { return r['Connection ID 1'] === s.connectionId; });
    if (!match || match[BUY_COL] === undefined) { noMatch++; continue; }
    const sheetCost = parseFloat(match[BUY_COL]);
    const dbCost = parseFloat(s.monthlyCost);
    if (!sheetCost) { noMatch++; continue; }
    const ratio = dbCost / sheetCost;
    if (Math.abs(ratio - 1) > 0.05) {
      inflated++;
      mismatches.push({ id: s.externalId, db: dbCost, sheet: sheetCost, ratio: ratio.toFixed(2), plan: s.planName });
    } else {
      correct++;
    }
  }

  console.log('\nMismatches:');
  mismatches.forEach(function(m) {
    console.log('  ' + m.id + ': DB=$' + m.db + ' Sheet=$' + m.sheet + ' ratio=' + m.ratio + 'x | ' + m.plan);
  });
  console.log('\nSummary: ' + inflated + ' mismatched, ' + correct + ' correct, ' + noMatch + ' no spreadsheet match');

  // Check cost distribution
  const [dist] = await conn.execute(
    "SELECT monthlyCost, COUNT(*) as cnt FROM services WHERE provider = 'ABB' AND status != 'terminated' AND monthlyCost > 0 GROUP BY monthlyCost ORDER BY cnt DESC LIMIT 15"
  );

  console.log('\nABB Cost distribution (top 15):');
  dist.forEach(function(r) {
    const perMonth3 = (parseFloat(r.monthlyCost) / 3).toFixed(2);
    console.log('  $' + r.monthlyCost + ' x ' + r.cnt + ' services | /3 = $' + perMonth3 + '/mo');
  });

  // Also check Telstra cost distribution
  const [telstraDist] = await conn.execute(
    "SELECT monthlyCost, COUNT(*) as cnt FROM services WHERE provider = 'Telstra' AND status != 'terminated' AND monthlyCost > 0 GROUP BY monthlyCost ORDER BY cnt DESC LIMIT 10"
  );
  console.log('\nTelstra Cost distribution (top 10):');
  telstraDist.forEach(function(r) {
    const perMonth3 = (parseFloat(r.monthlyCost) / 3).toFixed(2);
    console.log('  $' + r.monthlyCost + ' x ' + r.cnt + ' services | /3 = $' + perMonth3 + '/mo');
  });

  // Check the smiletel.xlsx ABB sheet
  const buf2 = fs.readFileSync('/home/ubuntu/smiletel.xlsx');
  const wb2 = XLSX.read(buf2);
  const abbData2 = XLSX.utils.sheet_to_json(wb2.Sheets['ABB']);
  const BUY_COL2 = ' Buy (ex gst) ';
  console.log('\nsmiletel.xlsx ABB columns:', Object.keys(abbData2[0]));

  let correct2 = 0, inflated2 = 0, noMatch2 = 0;
  const mismatches2 = [];
  for (const s of dbABB) {
    const match = abbData2.find(function(r) { return r['AVC'] === s.connectionId; });
    if (!match || match[BUY_COL2] === undefined) { noMatch2++; continue; }
    const sheetCost = parseFloat(match[BUY_COL2]);
    const dbCost = parseFloat(s.monthlyCost);
    if (!sheetCost) { noMatch2++; continue; }
    const ratio = dbCost / sheetCost;
    if (Math.abs(ratio - 1) > 0.05) {
      inflated2++;
      mismatches2.push({ id: s.externalId, db: dbCost, sheet: sheetCost, ratio: ratio.toFixed(2) });
    } else {
      correct2++;
    }
  }
  console.log('\nsmiletel.xlsx mismatches:');
  mismatches2.forEach(function(m) {
    console.log('  ' + m.id + ': DB=$' + m.db + ' Sheet=$' + m.sheet + ' ratio=' + m.ratio + 'x');
  });
  console.log('smiletel.xlsx: ' + inflated2 + ' mismatched, ' + correct2 + ' correct, ' + noMatch2 + ' no match');

  await conn.end();
}

main().catch(console.error);
