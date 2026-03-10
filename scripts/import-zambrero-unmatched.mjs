// Import 181 unmatched Zambrero sites from the report as new customer records
import 'dotenv/config';
import mysql from 'mysql2/promise';
import XLSX from 'xlsx';

const url = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: url.port || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: true }
});

// Read the unmatched sites report
const wb = XLSX.readFile('Zambrero_Unmatched_Sites_Report.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const sites = XLSX.utils.sheet_to_json(ws);
console.log(`Read ${sites.length} unmatched Zambrero sites from report`);

// Get the current max external ID number
const [maxIdRows] = await conn.execute('SELECT MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED)) as maxNum FROM customers');
let nextIdNum = (maxIdRows[0].maxNum || 0) + 1;

// Get existing customer names to avoid duplicates
const [existingCustomers] = await conn.execute('SELECT name, externalId FROM customers');
const existingNames = new Set(existingCustomers.map(c => c.name.toLowerCase().trim()));

let imported = 0;
let skipped = 0;

for (const site of sites) {
  const zamName = (site['Zam Name'] || '').trim();
  if (!zamName) {
    skipped++;
    continue;
  }
  
  // Check if this customer already exists (case-insensitive)
  if (existingNames.has(zamName.toLowerCase())) {
    console.log(`  SKIP (exists): ${zamName}`);
    skipped++;
    continue;
  }
  
  const externalId = `C${nextIdNum}`;
  nextIdNum++;
  
  // Build full address from parts
  const addr1 = (site['Address 1'] || '').trim();
  const addr2 = (site['Address 2'] || '').trim();
  const suburb = (site['Suburb'] || '').trim();
  const state = (site['State'] || '').trim();
  const postcode = (site['Postcode'] || '').toString().trim();
  
  const addressParts = [addr1, addr2, suburb, state, postcode].filter(Boolean);
  const fullAddress = addressParts.join(', ');
  
  const franchisee = (site['Franchisee'] || '').trim();
  const contactName = (site['Contact Name'] || '').trim();
  const email = (site['Email'] || '').trim();
  const phone = (site['Phone'] || '').trim();
  const ownership = (site['Ownership'] || '').trim();
  const siteStatus = (site['Status'] || '').trim();
  const hardware = (site['Hardware'] || '').trim();
  const notes = (site['Notes'] || '').trim();
  
  // Build notes from extra fields
  const notesParts = [];
  if (franchisee) notesParts.push(`Franchisee: ${franchisee}`);
  if (siteStatus) notesParts.push(`Site Status: ${siteStatus}`);
  if (hardware) notesParts.push(`Hardware: ${hardware}`);
  if (notes) notesParts.push(`Notes: ${notes}`);
  const combinedNotes = notesParts.join(' | ');
  
  await conn.execute(
    `INSERT INTO customers (externalId, name, businessName, contactName, contactEmail, contactPhone, ownershipType, siteAddress, notes, billingPlatforms, serviceCount, monthlyCost, unmatchedCount, matchedCount, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'review', NOW(), NOW())`,
    [
      externalId,
      zamName,
      franchisee || zamName,
      contactName,
      email,
      phone,
      ownership,
      fullAddress,
      combinedNotes,
      '' // No billing platform yet - placeholder
    ]
  );
  
  imported++;
}

console.log(`\nImport complete:`);
console.log(`  Imported: ${imported} new Zambrero customer records`);
console.log(`  Skipped: ${skipped} (already exist or empty name)`);

// Verify total
const [totalCount] = await conn.execute('SELECT COUNT(*) as cnt FROM customers');
console.log(`  Total customers in DB: ${totalCount[0].cnt}`);

const [zamCount] = await conn.execute("SELECT COUNT(*) as cnt FROM customers WHERE name LIKE '%Zambrero%' OR businessName LIKE '%Zambrero%'");
console.log(`  Total Zambrero customers: ${zamCount[0].cnt}`);

await conn.end();
