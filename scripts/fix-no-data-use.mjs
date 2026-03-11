import * as XLSX from '/home/ubuntu/billing-tool/node_modules/xlsx/xlsx.mjs';
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Read the Blitz Report to get the actual monthly data usage
const buf = readFileSync('/home/ubuntu/blitz.xlsx');
const wb = XLSX.read(buf);
const ws = wb.Sheets['No Data Usage'];
const data = XLSX.utils.sheet_to_json(ws, { defval: null });

console.log(`Blitz "No Data Usage" sheet: ${data.length} rows\n`);

// Data usage columns: May 2024 - Apr 2025 (12 months)
const dataUsageCols = [
  'Apr 2025 Domestic Data Usage (MB)',
  'Mar 2025 Domestic Data Usage (MB)',
  'Feb 2025 Domestic Data Usage (MB)',
  'Jan 2025 Domestic Data Usage (MB)',
  'Dec 2024 Domestic Data Usage (MB)',
  'Nov 2024 Domestic Data Usage (MB)',
  'Oct 2024 Domestic Data Usage (MB)',
  'Sep 2024 Domestic Data Usage (MB)',
  'Aug 2024 Domestic Data Usage (MB)',
  'Jul 2024 Domestic Data Usage (MB)',
  'Jun 2024 Domestic Data Usage (MB)',
  'May 2024 Domestic Data Usage (MB)',
];

// Bill total columns (12 months) - also check if service had any billing activity
const billTotalCols = [
  'Bill Total Apr 2025',
  'Bill Total Mar 2025',
  'Bill Total Feb 2025',
  'Bill Total Jan 2025',
  'Bill Total Dec 2024',
  'Bill Total Nov 2024',
  'Bill Total Oct 2024',
  'Bill Total Sep 2024',
  'Bill Total Aug 2024',
  'Bill Total Jul 2024',
  'Bill Total Jun 2024',
  'Bill Total May 2024',
];

// Build a SIM Serial Number -> usage map from the spreadsheet
const simUsageMap = new Map();

for (const row of data) {
  const sim = row['SIM Serial Number'] ? String(row['SIM Serial Number']).trim() : null;
  if (!sim) continue;
  
  let totalDataMB = 0;
  let monthsWithData = [];
  
  for (const col of dataUsageCols) {
    const val = parseFloat(row[col]) || 0;
    if (val > 0) {
      totalDataMB += val;
      monthsWithData.push(col.replace(' Domestic Data Usage (MB)', ''));
    }
  }
  
  let totalBill = 0;
  let monthsWithBill = [];
  for (const col of billTotalCols) {
    const val = parseFloat(row[col]) || 0;
    if (val > 0) {
      totalBill += val;
      monthsWithBill.push(col.replace('Bill Total ', ''));
    }
  }
  
  simUsageMap.set(sim, {
    totalDataMB,
    monthsWithData,
    hasData: totalDataMB > 0,
    totalBill,
    monthsWithBill,
    hasBill: totalBill > 0
  });
}

console.log(`SIM usage entries: ${simUsageMap.size}`);
const withData = [...simUsageMap.values()].filter(v => v.hasData);
const withBill = [...simUsageMap.values()].filter(v => v.hasBill);
console.log(`SIMs with data usage in any month: ${withData.length}`);
console.log(`SIMs with bill total in any month: ${withBill.length}`);
console.log(`SIMs with zero data across all 12 months: ${simUsageMap.size - withData.length}\n`);

// Get all services currently flagged as No Data Use
const [flaggedServices] = await conn.query(`
  SELECT externalId, simSerialNumber, phoneNumber, planName, customerName
  FROM services WHERE noDataUse = 1
`);

console.log(`Services currently flagged No Data Use: ${flaggedServices.length}\n`);

// Cross-reference: find services that should NOT be flagged
const toUnflag = [];
const confirmed = [];
let noSimMatch = 0;

for (const svc of flaggedServices) {
  const sim = svc.simSerialNumber ? svc.simSerialNumber.trim() : null;
  
  if (sim && simUsageMap.has(sim)) {
    const usage = simUsageMap.get(sim);
    if (usage.hasData) {
      toUnflag.push({
        externalId: svc.externalId,
        sim,
        totalDataMB: usage.totalDataMB,
        monthsWithData: usage.monthsWithData,
        totalBill: usage.totalBill,
        planName: svc.planName,
        customerName: svc.customerName
      });
    } else {
      confirmed.push(svc.externalId);
    }
  } else {
    noSimMatch++;
    confirmed.push(svc.externalId);
  }
}

console.log(`=== RESULTS ===`);
console.log(`Services to UNFLAG (have data usage in at least 1 month): ${toUnflag.length}`);
console.log(`Services CONFIRMED no data use (zero across all 12 months): ${confirmed.length}`);
console.log(`No SIM match in spreadsheet: ${noSimMatch}\n`);

if (toUnflag.length > 0) {
  console.log('Services to unflag:');
  for (const svc of toUnflag) {
    console.log(`  ${svc.externalId}: SIM=${svc.sim}, plan=${svc.planName}, totalData=${svc.totalDataMB.toFixed(1)}MB, totalBill=$${svc.totalBill.toFixed(2)}`);
    console.log(`    Months with data: ${svc.monthsWithData.join(', ')}`);
  }
  
  // Apply the fix
  console.log('\nApplying fixes...');
  for (const svc of toUnflag) {
    await conn.query(
      `UPDATE services SET noDataUse = 0 WHERE externalId = ?`,
      [svc.externalId]
    );
  }
}

// Verify
const [newCount] = await conn.query('SELECT COUNT(*) as cnt FROM services WHERE noDataUse = 1');
console.log(`\nNo Data Use services after fix: ${newCount[0].cnt} (was ${flaggedServices.length})`);
console.log(`Removed flag from ${flaggedServices.length - newCount[0].cnt} services`);

await conn.end();
