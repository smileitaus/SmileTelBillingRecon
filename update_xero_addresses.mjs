import mysql from 'mysql2/promise';
import XLSX from 'xlsx';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const wb = XLSX.readFile('/home/ubuntu/upload/Contacts_Extractedasof110326.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

let updated = 0;
let skipped = 0;
const xeroData = [];

for (const row of rows) {
  const contactName = row['*ContactName'];
  const acctNum = row['AccountNumber'];
  if (!contactName) continue;

  // Build SA address (street address)
  const saParts = [
    row['SAAddressLine1'], row['SAAddressLine2'], row['SAAddressLine3'], row['SAAddressLine4'],
    row['SACity'], row['SARegion'], row['SAPostalCode'] ? String(row['SAPostalCode']) : null
  ].filter(Boolean);

  // Build PO address as fallback
  const poParts = [
    row['POAddressLine1'], row['POAddressLine2'], row['POAddressLine3'], row['POAddressLine4'],
    row['POCity'], row['PORegion'], row['POPostalCode'] ? String(row['POPostalCode']) : null
  ].filter(Boolean);

  const saAddr = saParts.join(', ');
  const poAddr = poParts.join(', ');
  const addr = saAddr || poAddr;

  xeroData.push({ contactName, acctNum, addr });

  // Update by xeroAccountNumber first
  let result;
  if (acctNum) {
    [result] = await conn.execute(
      `UPDATE customers SET siteAddress = ?, xeroContactName = ? 
       WHERE xeroAccountNumber = ? 
       AND (siteAddress IS NULL OR siteAddress = '' OR siteAddress = '-, -, -, -, -')`,
      [addr, contactName, acctNum]
    );
  }

  // Then try by xeroContactName
  if (!result || result.affectedRows === 0) {
    [result] = await conn.execute(
      `UPDATE customers SET siteAddress = ? 
       WHERE xeroContactName = ? 
       AND (siteAddress IS NULL OR siteAddress = '' OR siteAddress = '-, -, -, -, -')`,
      [addr, contactName]
    );
  }

  if (result && result.affectedRows > 0) {
    updated++;
  } else {
    skipped++;
  }
}

console.log(`Updated: ${updated}, Skipped: ${skipped}`);
console.log(`Total Xero contacts processed: ${xeroData.length}`);

// Check final stats
const [stats] = await conn.execute(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN siteAddress IS NOT NULL AND siteAddress != '' AND siteAddress != '-, -, -, -, -' THEN 1 ELSE 0 END) as with_addr
  FROM customers
`);
console.log('Customer address stats:', stats[0]);

await conn.end();
