/**
 * fix-unmatched-xero-contacts.mjs
 *
 * Diagnoses and fixes the case where billing_items have an unmatched contactName
 * that IS present in the Xero contacts extract but was NOT in the customer database
 * at the time import-xero-contacts.mjs ran.
 *
 * For each such contact:
 *  1. Creates a new customer record using the Xero contact data
 *  2. Sets xeroContactName and xeroAccountNumber
 *  3. Assigns all unmatched billing items for that contact to the new customer
 *
 * Run: node scripts/fix-unmatched-xero-contacts.mjs
 */

import * as XLSX from '/home/ubuntu/billing-tool/node_modules/xlsx/xlsx.mjs';
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── Load Xero contacts extract ──────────────────────────────────────────────
const buf = readFileSync('/home/ubuntu/upload/Contacts_Extractedasof110326.xlsx');
const wb = XLSX.read(buf);
const ws = wb.Sheets[wb.SheetNames[0]];
const xeroData = XLSX.utils.sheet_to_json(ws, { defval: null });
console.log(`Xero contacts loaded: ${xeroData.length}`);

// Build map: lowercase contactName → xero row
const xeroByName = new Map();
for (const row of xeroData) {
  const name = row['*ContactName'];
  if (name) xeroByName.set(name.toLowerCase().trim(), row);
}

// ── Get all unmatched billing contacts ──────────────────────────────────────
const [unmatched] = await conn.execute(
  "SELECT DISTINCT contactName FROM billing_items WHERE matchStatus = 'unmatched'"
);
const unmatchedNames = unmatched.map(r => r.contactName).filter(Boolean);
console.log(`Unmatched billing contacts: ${unmatchedNames.length}`);

// ── Find which are in the Xero extract ──────────────────────────────────────
const toCreate = [];
for (const name of unmatchedNames) {
  const xeroRow = xeroByName.get(name.toLowerCase().trim());
  if (xeroRow) {
    toCreate.push({ billingContactName: name, xeroRow });
  }
}
console.log(`Contacts in Xero extract (need customer records): ${toCreate.length}`);

if (toCreate.length === 0) {
  console.log('Nothing to do.');
  await conn.end();
  process.exit(0);
}

// ── Get max externalId ───────────────────────────────────────────────────────
const [maxRow] = await conn.execute(
  "SELECT externalId FROM customers ORDER BY CAST(SUBSTRING(externalId, 2) AS UNSIGNED) DESC LIMIT 1"
);
let nextIdNum = maxRow.length > 0 ? parseInt(maxRow[0].externalId.slice(1)) + 1 : 3000;

// ── Create customer records and assign billing items ─────────────────────────
let created = 0;
let alreadyExists = 0;
let itemsAssigned = 0;

for (const { billingContactName, xeroRow } of toCreate) {
  const xeroContactName = xeroRow['*ContactName'];
  const xeroAccountNumber = xeroRow['AccountNumber'] || '';
  const email = xeroRow['EmailAddress'] || '';
  const firstName = xeroRow['FirstName'] || '';
  const lastName = xeroRow['LastName'] || '';
  const phone = xeroRow['PhoneNumber'] || xeroRow['MobileNumber'] || '';

  // Build address from Xero SA fields
  const addrParts = [
    xeroRow['SAAddressLine1'],
    xeroRow['SAAddressLine2'],
    xeroRow['SAAddressLine3'],
    xeroRow['SAAddressLine4'],
    xeroRow['SACity'],
    xeroRow['SARegion'],
    xeroRow['SAPostalCode'],
  ].filter(Boolean);
  const siteAddress = addrParts.join(', ');
  const contactName = [firstName, lastName].filter(Boolean).join(' ');

  // Check if a customer with this xeroContactName already exists (race condition guard)
  const [existing] = await conn.execute(
    "SELECT externalId, name FROM customers WHERE LOWER(xeroContactName) = LOWER(?) OR LOWER(name) = LOWER(?)",
    [xeroContactName, xeroContactName]
  );

  let customerExternalId;
  if (existing.length > 0) {
    customerExternalId = existing[0].externalId;
    console.log(`  SKIP (exists): "${xeroContactName}" → ${customerExternalId} (${existing[0].name})`);
    alreadyExists++;
  } else {
    // Create new customer
    customerExternalId = `C${nextIdNum}`;
    nextIdNum++;

    await conn.execute(
      `INSERT INTO customers (externalId, name, xeroContactName, xeroAccountNumber, contactEmail, contactPhone, contactName, siteAddress, status, serviceCount, monthlyCost, unmatchedCount, matchedCount, monthlyRevenue)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0.00, 0, 0, 0.00)`,
      [customerExternalId, xeroContactName, xeroContactName, xeroAccountNumber, email, phone, contactName, siteAddress]
    );
    console.log(`  CREATED: "${xeroContactName}" → ${customerExternalId}`);
    created++;
  }

  // Assign all unmatched billing items for this contact to the customer
  const [updateResult] = await conn.execute(
    `UPDATE billing_items
     SET customerExternalId = ?, matchStatus = 'customer-matched'
     WHERE contactName = ? AND (matchStatus = 'unmatched' OR customerExternalId = '' OR customerExternalId IS NULL)`,
    [customerExternalId, billingContactName]
  );
  const assigned = updateResult.affectedRows;
  itemsAssigned += assigned;
  console.log(`    → Assigned ${assigned} billing item(s)`);
}

// ── Update customer unmatchedCount / matchedCount ────────────────────────────
// Recalculate counts for all affected customers
const affectedIds = toCreate.map(t => {
  // We need to find the externalId we just created or found
  return null; // We'll do a bulk recalc instead
});

// Bulk recalculate matchedCount and unmatchedCount for all customers
await conn.execute(`
  UPDATE customers c
  SET 
    matchedCount = (SELECT COUNT(*) FROM billing_items bi WHERE bi.customerExternalId = c.externalId AND bi.matchStatus != 'unmatched'),
    unmatchedCount = (SELECT COUNT(*) FROM billing_items bi WHERE bi.customerExternalId = c.externalId AND bi.matchStatus = 'unmatched'),
    monthlyRevenue = (SELECT COALESCE(SUM(bi.lineAmount), 0) FROM billing_items bi WHERE bi.customerExternalId = c.externalId)
  WHERE c.externalId IN (
    SELECT DISTINCT customerExternalId FROM billing_items WHERE customerExternalId != ''
  )
`);
console.log('\nRecalculated customer counts.');

console.log(`\n=== RESULTS ===`);
console.log(`Customers created: ${created}`);
console.log(`Already existed (items reassigned): ${alreadyExists}`);
console.log(`Billing items assigned: ${itemsAssigned}`);

await conn.end();
