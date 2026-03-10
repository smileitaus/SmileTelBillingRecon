import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Sample unmatched services to see what data they have
const [samples] = await conn.execute(
  "SELECT externalId, phoneNumber, locationAddress, serviceType, connectionId, supplierAccount, serviceId, planName FROM services WHERE status = 'unmatched' LIMIT 10"
);
console.log("=== Sample Unmatched Services ===");
for (const s of samples) {
  console.log(`  ${s.externalId}: phone=${s.phoneNumber}, addr=${s.locationAddress}, type=${s.serviceType}, acct=${s.supplierAccount}, plan=${s.planName}`);
}

// For the first sample, simulate the current phone prefix match
const sample = samples[0];
if (sample?.phoneNumber) {
  const prefix = sample.phoneNumber.substring(0, 6);
  const [matches] = await conn.execute(
    `SELECT DISTINCT customerName, customerExternalId, COUNT(*) as cnt FROM services WHERE phoneNumber LIKE ? AND status = 'active' AND customerExternalId != '' GROUP BY customerName, customerExternalId ORDER BY cnt DESC LIMIT 10`,
    [prefix + '%']
  );
  console.log(`\n=== Phone prefix '${prefix}' matches for ${sample.externalId} ===`);
  console.log(JSON.stringify(matches, null, 2));
}

// Check: how many customers have services on account 586992900 (the big unmatched account)?
const [acct586] = await conn.execute(
  "SELECT DISTINCT customerName, customerExternalId, COUNT(*) as cnt FROM services WHERE supplierAccount = '586992900' AND customerExternalId != '' GROUP BY customerName, customerExternalId ORDER BY cnt DESC LIMIT 10"
);
console.log("\n=== Customers on account 586992900 ===");
console.log(JSON.stringify(acct586, null, 2));

// Check: how many customers have services on account 192549800?
const [acct192] = await conn.execute(
  "SELECT DISTINCT customerName, customerExternalId, COUNT(*) as cnt FROM services WHERE supplierAccount = '192549800' AND status = 'active' AND customerExternalId != '' GROUP BY customerName, customerExternalId ORDER BY cnt DESC LIMIT 10"
);
console.log("\n=== Customers on account 192549800 (matched) ===");
console.log(JSON.stringify(acct192, null, 2));

// Check: for unmatched on 192549800, do any share phone prefixes with matched ones?
const [unmatched192] = await conn.execute(
  "SELECT externalId, phoneNumber, serviceType, planName FROM services WHERE supplierAccount = '192549800' AND status = 'unmatched' LIMIT 10"
);
console.log("\n=== Unmatched on account 192549800 ===");
for (const s of unmatched192) {
  console.log(`  ${s.externalId}: phone=${s.phoneNumber}, type=${s.serviceType}, plan=${s.planName}`);
}

// Check: what service types are most common in unmatched
const [unmatchedTypes] = await conn.execute(
  "SELECT serviceType, COUNT(*) as cnt FROM services WHERE status = 'unmatched' GROUP BY serviceType ORDER BY cnt DESC"
);
console.log("\n=== Unmatched by Service Type ===");
console.log(JSON.stringify(unmatchedTypes, null, 2));

// Check: for Mobile services, do phone numbers with same first 8 digits tend to belong to same customer?
const [mobilePattern] = await conn.execute(
  `SELECT LEFT(phoneNumber, 8) as prefix8, COUNT(DISTINCT customerExternalId) as custCount, COUNT(*) as svcCount
   FROM services WHERE serviceType = 'Mobile' AND status = 'active' AND phoneNumber != '' AND customerExternalId != ''
   GROUP BY prefix8 HAVING custCount = 1 AND svcCount > 1
   ORDER BY svcCount DESC LIMIT 10`
);
console.log("\n=== Mobile phone 8-digit prefixes belonging to single customer ===");
console.log(JSON.stringify(mobilePattern, null, 2));

await conn.end();
