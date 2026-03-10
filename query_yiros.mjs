import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Yiros customer services
const [yirosServices] = await conn.execute(
  "SELECT phoneNumber, locationAddress, serviceType, connectionId, customerExternalId FROM services WHERE customerName LIKE '%Yiros%'"
);
console.log("=== Yiros Services ===");
console.log(JSON.stringify(yirosServices, null, 2));

// How many unmatched services have phone numbers starting with common prefixes
const [phonePrefixes] = await conn.execute(
  "SELECT LEFT(phoneNumber, 6) as prefix, COUNT(*) as cnt FROM services WHERE status = 'unmatched' AND phoneNumber IS NOT NULL AND phoneNumber != '' GROUP BY prefix ORDER BY cnt DESC LIMIT 20"
);
console.log("\n=== Top Phone Prefixes in Unmatched Services ===");
console.log(JSON.stringify(phonePrefixes, null, 2));

// How many matched services share those same prefixes (the source of suggestions)
const topPrefix = phonePrefixes[0]?.prefix;
if (topPrefix) {
  const [matchedWithPrefix] = await conn.execute(
    `SELECT customerName, COUNT(*) as cnt FROM services WHERE phoneNumber LIKE ? AND status = 'active' GROUP BY customerName ORDER BY cnt DESC LIMIT 10`,
    [topPrefix + '%']
  );
  console.log(`\n=== Matched services with prefix '${topPrefix}' ===`);
  console.log(JSON.stringify(matchedWithPrefix, null, 2));
}

// Check how many unmatched services have phone numbers vs addresses vs connectionIds
const [unmatchedStats] = await conn.execute(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN phoneNumber IS NOT NULL AND phoneNumber != '' THEN 1 ELSE 0 END) as hasPhone,
    SUM(CASE WHEN locationAddress IS NOT NULL AND locationAddress != '' AND locationAddress != 'Unknown Location' THEN 1 ELSE 0 END) as hasAddress,
    SUM(CASE WHEN connectionId IS NOT NULL AND connectionId != '' THEN 1 ELSE 0 END) as hasConnectionId,
    SUM(CASE WHEN supplierAccount IS NOT NULL AND supplierAccount != '' THEN 1 ELSE 0 END) as hasSupplierAccount
  FROM services WHERE status = 'unmatched'
`);
console.log("\n=== Unmatched Service Data Availability ===");
console.log(JSON.stringify(unmatchedStats, null, 2));

// Check supplier account distribution
const [supplierAcctMatch] = await conn.execute(`
  SELECT supplierAccount, 
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as matched,
    SUM(CASE WHEN status = 'unmatched' THEN 1 ELSE 0 END) as unmatched
  FROM services 
  WHERE supplierAccount IS NOT NULL AND supplierAccount != ''
  GROUP BY supplierAccount
  ORDER BY unmatched DESC
  LIMIT 10
`);
console.log("\n=== Supplier Account Distribution ===");
console.log(JSON.stringify(supplierAcctMatch, null, 2));

await conn.end();
