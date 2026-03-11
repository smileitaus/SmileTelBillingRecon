import * as XLSX from '/home/ubuntu/billing-tool/node_modules/xlsx/xlsx.mjs';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Load ABB ExDa spreadsheet
const wb = XLSX.readFile('/home/ubuntu/billing-tool/scripts/audit-source.xlsx');
const abbData = XLSX.utils.sheet_to_json(wb.Sheets['ABB ExDa']);

// The column has a space: ' Buy (ex gst) '
const BUY_COL = ' Buy (ex gst) ';

console.log('ABB ExDa sample row:', JSON.stringify(abbData[0]));
console.log('Buy column value:', abbData[0][BUY_COL]);

// Get all ABB services from DB with their costs
const [dbABB] = await conn.execute(`
  SELECT externalId, connectionId, planName, monthlyCost
  FROM services
  WHERE provider = 'ABB' AND status != 'terminated'
  AND monthlyCost > 0
`);

console.log(`\nDB has ${dbABB.length} ABB services with cost > 0`);
console.log(`Spreadsheet has ${abbData.length} ABB rows\n`);

let inflated = 0;
let correct = 0;
let noMatch = 0;
const mismatches = [];

for (const s of dbABB) {
  const match = abbData.find(r => r['Connection ID 1'] === s.connectionId);
  if (!match) { noMatch++; continue; }
  const sheetCost = match[BUY_COL];
  const dbCost = parseFloat(s.monthlyCost);
  if (!sheetCost) { noMatch++; continue; }
  const ratio = dbCost / sheetCost;
  if (Math.abs(ratio - 1) > 0.05) {
    inflated++;
    mismatches.push({ id: s.externalId, db: dbCost, sheet: sheetCost, ratio: ratio.toFixed(2), plan: s.planName });
    console.log(`MISMATCH ${s.externalId}: DB=$${dbCost} Sheet=$${sheetCost} ratio=${ratio.toFixed(2)}x | ${s.planName}`);
  } else {
    correct++;
  }
}

console.log(`\nSummary: ${inflated} inflated/mismatched, ${correct} correct, ${noMatch} no spreadsheet match`);

// Now check the smiletel.xlsx for the same
const wb2 = XLSX.readFile('/home/ubuntu/smiletel.xlsx');
const abbData2 = XLSX.utils.sheet_to_json(wb2.Sheets['ABB']);
const BUY_COL2 = ' Buy (ex gst) ';
console.log('\nsmiletel.xlsx ABB columns:', Object.keys(abbData2[0]));

let correct2 = 0, inflated2 = 0, noMatch2 = 0;
for (const s of dbABB) {
  const match = abbData2.find(r => r['AVC'] === s.connectionId);
  if (!match) { noMatch2++; continue; }
  const sheetCost = match[BUY_COL2];
  const dbCost = parseFloat(s.monthlyCost);
  if (!sheetCost) { noMatch2++; continue; }
  const ratio = dbCost / sheetCost;
  if (Math.abs(ratio - 1) > 0.05) {
    inflated2++;
    console.log(`smiletel MISMATCH ${s.externalId}: DB=$${dbCost} Sheet=$${sheetCost} ratio=${ratio.toFixed(2)}x`);
  } else {
    correct2++;
  }
}
console.log(`\nsmiletel.xlsx: ${inflated2} mismatched, ${correct2} correct, ${noMatch2} no match`);

// Check the $180.18 pattern - is it 3x monthly?
console.log('\n--- $180.18 pattern analysis ---');
const [bigGroup] = await conn.execute(`
  SELECT COUNT(*) as cnt, monthlyCost
  FROM services
  WHERE provider = 'ABB' AND status != 'terminated'
  GROUP BY monthlyCost
  ORDER BY cnt DESC
  LIMIT 10
`);
bigGroup.forEach(r => {
  const perMonth = (parseFloat(r.monthlyCost) / 3).toFixed(2);
  console.log(`$${r.monthlyCost} x ${r.cnt} services | /3 = $${perMonth}/mo`);
});

await conn.end();
