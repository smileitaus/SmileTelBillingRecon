/**
 * Recalculate noDataUse flag using ALL-TIME data usage from the Blitz report.
 * 
 * The original import set noDataUse=1 for all 145 services in the "No Data Usage" sheet.
 * But that sheet is a Telstra report that flags services with no usage in a SINGLE month.
 * 
 * The correct logic: only flag noDataUse=1 if the service has ZERO data usage
 * across ALL available months (May 2024 – Apr 2025 = 12 months).
 * 
 * Services with ANY non-zero data usage in any month should have noDataUse=0.
 */

import XLSX from 'xlsx';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the Blitz report
const blitzPath = '/home/ubuntu/upload/SMILEIT-FULLBLITZ.xlsx';
const workbook = XLSX.readFile(blitzPath);
const ws = workbook.Sheets['No Data Usage'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

const headers = rows[0];
console.log('Total rows in No Data Usage sheet:', rows.length - 1);

// Find column indices
const mobileNumCol = headers.indexOf('Mobile Number');
const simSerialCol = headers.indexOf('SIM Serial Number');
const simNumberCol = headers.indexOf('SIM Number');

// Find all domestic data usage columns (May 2024 – Apr 2025)
const dataUsageCols = headers.reduce((acc, h, i) => {
  if (h && typeof h === 'string' && h.includes('Domestic Data Usage (MB)')) {
    acc.push(i);
  }
  return acc;
}, []);

console.log(`Found ${dataUsageCols.length} monthly data usage columns`);
console.log('Mobile col:', mobileNumCol, 'SIM Serial col:', simSerialCol);

// Build a map of phone/SIM -> total all-time data usage
const serviceUsage = new Map(); // key: normalised phone or SIM serial -> { totalMB, months }

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || row.length === 0) continue;
  
  const mobileRaw = row[mobileNumCol];
  const simSerial = row[simSerialCol];
  const simNumber = row[simNumberCol];
  
  // Normalise mobile number
  let mobile = null;
  if (mobileRaw) {
    mobile = String(mobileRaw).replace(/\s+/g, '').replace(/[^0-9]/g, '');
    if (mobile.startsWith('61')) mobile = '0' + mobile.slice(2);
  }
  
  // Sum all monthly data usage
  let totalMB = 0;
  let nonZeroMonths = 0;
  for (const col of dataUsageCols) {
    const val = row[col];
    if (val && typeof val === 'number' && val > 0) {
      totalMB += val;
      nonZeroMonths++;
    }
  }
  
  const key = mobile || String(simSerial || simNumber || '');
  if (key) {
    const existing = serviceUsage.get(key) || { totalMB: 0, nonZeroMonths: 0 };
    serviceUsage.set(key, {
      totalMB: existing.totalMB + totalMB,
      nonZeroMonths: existing.nonZeroMonths + nonZeroMonths,
    });
  }
}

console.log(`Built usage map with ${serviceUsage.size} entries`);

// Count how many have zero vs non-zero usage
let zeroUsage = 0, hasUsage = 0;
for (const [key, usage] of serviceUsage) {
  if (usage.totalMB === 0) zeroUsage++;
  else hasUsage++;
}
console.log(`Zero all-time usage: ${zeroUsage}, Has usage: ${hasUsage}`);

// Connect to DB and update noDataUse flags
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all services currently marked as noDataUse=1
const [services] = await conn.query(
  'SELECT externalId, phoneNumber, simSerialNumber FROM services WHERE noDataUse = 1'
);
console.log(`\nServices currently marked noDataUse=1: ${services.length}`);

let cleared = 0;
let kept = 0;
const updates = [];

for (const svc of services) {
  // Normalise phone number for lookup
  let phone = svc.phoneNumber ? String(svc.phoneNumber).replace(/\s+/g, '').replace(/[^0-9]/g, '') : null;
  if (phone && phone.startsWith('61')) phone = '0' + phone.slice(2);
  
  const simSerial = svc.simSerialNumber ? String(svc.simSerialNumber).replace(/\s+/g, '') : null;
  
  // Look up usage by phone or SIM serial
  const usageByPhone = phone ? serviceUsage.get(phone) : null;
  const usageBySim = simSerial ? serviceUsage.get(simSerial) : null;
  const usage = usageByPhone || usageBySim;
  
  if (usage && usage.totalMB > 0) {
    // Service HAS data usage across all time - clear the flag
    updates.push({ externalId: svc.externalId, noDataUse: 0, totalMB: usage.totalMB });
    cleared++;
  } else {
    kept++;
  }
}

console.log(`\nWill clear noDataUse for ${cleared} services (they have all-time data usage)`);
console.log(`Will keep noDataUse=1 for ${kept} services (confirmed zero all-time usage)`);

// Apply updates
if (updates.length > 0) {
  for (const u of updates) {
    await conn.query('UPDATE services SET noDataUse = 0 WHERE externalId = ?', [u.externalId]);
  }
  console.log(`\nUpdated ${updates.length} services`);
  
  // Show sample of cleared services
  console.log('\nSample cleared services:');
  updates.slice(0, 5).forEach(u => console.log(`  ${u.externalId}: ${u.totalMB.toFixed(0)} MB all-time`));
}

// Final count
const [finalCount] = await conn.query('SELECT COUNT(*) as cnt FROM services WHERE noDataUse = 1');
console.log(`\nFinal noDataUse=1 count: ${finalCount[0].cnt}`);

await conn.end();
console.log('\nDone!');
