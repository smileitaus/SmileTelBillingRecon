/**
 * Checks and reinstates the Signs ETC Platform Check if it was removed.
 */
import { config } from 'dotenv';
config();

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [customers] = await conn.execute(
  `SELECT c.externalId as cId, c.name as cName, 
          s.externalId as sId, s.serviceType, s.phoneNumber, 
          s.monthlyCost, s.provider, s.locationAddress
   FROM customers c 
   LEFT JOIN services s ON s.customerExternalId = c.externalId 
   WHERE c.name LIKE '%Signs%' 
   LIMIT 5`
);

console.log('Signs ETC customer/service data:');
console.log(JSON.stringify(customers, null, 2));

if (customers.length === 0) {
  console.log('No Signs ETC customer found!');
  await conn.end();
  process.exit(1);
}

for (const row of customers) {
  if (!row.sId) continue;

  const [existing] = await conn.execute(
    `SELECT id, status, actionedNote FROM billing_platform_checks WHERE targetId = ? AND targetType = 'service' LIMIT 3`,
    [row.sId]
  );

  console.log(`\nService ${row.sId} existing checks:`, JSON.stringify(existing, null, 2));

  const hasOpen = existing.some(r => r.status === 'open');
  if (hasOpen) {
    console.log(`Service ${row.sId} already has an open check — skipping.`);
    continue;
  }

  const description = `New customer assignment: "${row.cName}" was created and service ${row.sId} (${row.serviceType || 'Unknown'}) was assigned. Verify billing platform reflects this assignment. Monthly cost: $${parseFloat(row.monthlyCost || 0).toFixed(2)}/mo via ${row.provider || 'Unknown'}.`;

  const [result] = await conn.execute(
    `INSERT INTO billing_platform_checks 
     (targetType, targetId, customerExternalId, issueType, issueDescription, platform, priority, status, createdBy, createdAt)
     VALUES ('service', ?, ?, 'new-customer-assignment', ?, 'Manual', 'medium', 'open', 'System (Reinstated)', NOW())`,
    [row.sId, row.cId, description]
  );

  console.log(`Platform Check reinstated for ${row.cName} / ${row.sId}! Insert ID: ${result.insertId}`);
}

await conn.end();
