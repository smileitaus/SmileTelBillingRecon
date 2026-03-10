import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check what the Yiros phone prefix is and if it matches unmatched services
const [yirosPhones] = await conn.execute(
  "SELECT phoneNumber, locationAddress FROM services WHERE customerName LIKE '%Yiros%'"
);
console.log("=== Yiros Phone Numbers ===");
console.log(JSON.stringify(yirosPhones, null, 2));

// Check: how many unmatched services have phone starting with 07327 (Yiros prefix)
if (yirosPhones[0]?.phoneNumber) {
  const prefix = yirosPhones[0].phoneNumber.substring(0, 6);
  const [unmatchedWithPrefix] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM services WHERE phoneNumber LIKE ? AND status = 'unmatched'`,
    [prefix + '%']
  );
  console.log(`\nUnmatched services with Yiros prefix '${prefix}': ${unmatchedWithPrefix[0].cnt}`);
}

// Check: for Mobile unmatched services, what are the phone number patterns?
const [mobileUnmatched] = await conn.execute(
  "SELECT phoneNumber, supplierAccount, planName FROM services WHERE status = 'unmatched' AND serviceType = 'Mobile' LIMIT 15"
);
console.log("\n=== Sample Unmatched Mobile Services ===");
for (const s of mobileUnmatched) {
  console.log(`  phone=${s.phoneNumber}, acct=${s.supplierAccount}, plan=${s.planName}`);
}

// Check: for matched Mobile services, what customers have them?
const [mobileMatched] = await conn.execute(
  `SELECT customerName, COUNT(*) as cnt, GROUP_CONCAT(DISTINCT LEFT(phoneNumber, 4)) as prefixes
   FROM services WHERE status = 'active' AND serviceType = 'Mobile' AND customerExternalId != ''
   GROUP BY customerName ORDER BY cnt DESC LIMIT 10`
);
console.log("\n=== Top customers by matched Mobile services ===");
console.log(JSON.stringify(mobileMatched, null, 2));

// Check: for the 586992900 account (170 unmatched), is there ANY matched service?
const [acct586all] = await conn.execute(
  "SELECT status, COUNT(*) as cnt FROM services WHERE supplierAccount = '586992900' GROUP BY status"
);
console.log("\n=== Account 586992900 status breakdown ===");
console.log(JSON.stringify(acct586all, null, 2));

// Check: what plan names are on account 586992900?
const [acct586plans] = await conn.execute(
  "SELECT planName, COUNT(*) as cnt FROM services WHERE supplierAccount = '586992900' GROUP BY planName ORDER BY cnt DESC"
);
console.log("\n=== Account 586992900 plans ===");
console.log(JSON.stringify(acct586plans, null, 2));

// Check: do any matched services share the same plan names as the 586992900 unmatched?
const topPlan = acct586plans[0]?.planName;
if (topPlan) {
  const [planMatches] = await conn.execute(
    `SELECT customerName, COUNT(*) as cnt FROM services WHERE planName = ? AND status = 'active' AND customerExternalId != '' GROUP BY customerName ORDER BY cnt DESC LIMIT 10`,
    [topPlan]
  );
  console.log(`\n=== Matched services with plan '${topPlan}' ===`);
  console.log(JSON.stringify(planMatches, null, 2));
}

// The real question: simulate what happens when we look for suggestions for a typical 586992900 service
const [sample586] = await conn.execute(
  "SELECT externalId, phoneNumber, locationAddress, connectionId, supplierAccount FROM services WHERE supplierAccount = '586992900' AND status = 'unmatched' LIMIT 3"
);
console.log("\n=== Sample 586992900 services for suggestion simulation ===");
for (const s of sample586) {
  console.log(`  ${s.externalId}: phone='${s.phoneNumber}', addr='${s.locationAddress}', conn='${s.connectionId}'`);
  // Simulate phone prefix match
  if (s.phoneNumber && s.phoneNumber.length > 4) {
    const prefix = s.phoneNumber.substring(0, 6);
    const [phoneMatches] = await conn.execute(
      `SELECT DISTINCT customerName FROM services WHERE phoneNumber LIKE ? AND status = 'active' AND customerExternalId != '' LIMIT 5`,
      [prefix + '%']
    );
    console.log(`    Phone prefix '${prefix}' matches: ${phoneMatches.map(m => m.customerName).join(', ') || 'NONE'}`);
  }
}

await conn.end();
