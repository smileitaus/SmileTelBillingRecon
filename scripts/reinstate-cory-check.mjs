/**
 * Reinstates the Cory Johnson Platform Check that was removed when a note was added.
 * Run with: node scripts/reinstate-cory-check.mjs
 */
import { config } from 'dotenv';
config();

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find Cory Johnson customer and their service
const [customers] = await conn.execute(
  `SELECT c.externalId as cId, c.name as cName, 
          s.externalId as sId, s.serviceType, s.phoneNumber, 
          s.monthlyCost, s.provider, s.locationAddress
   FROM customers c 
   LEFT JOIN services s ON s.customerExternalId = c.externalId 
   WHERE c.name LIKE '%Cory%' 
   LIMIT 5`
);

console.log('Cory Johnson customer/service data:');
console.log(JSON.stringify(customers, null, 2));

if (customers.length === 0) {
  console.log('No Cory Johnson customer found!');
  await conn.end();
  process.exit(1);
}

const row = customers[0];
console.log(`\nCustomer: ${row.cName} (${row.cId})`);
console.log(`Service: ${row.sId} | Type: ${row.serviceType} | Phone: ${row.phoneNumber} | Cost: $${row.monthlyCost}/mo | Provider: ${row.provider}`);

// Check if a Platform Check already exists for this service
const [existing] = await conn.execute(
  `SELECT id, status, actionedNote FROM billing_platform_checks WHERE targetId = ? AND targetType = 'service' LIMIT 3`,
  [row.sId]
);

console.log('\nExisting Platform Checks for this service:', JSON.stringify(existing, null, 2));

if (existing.length > 0 && existing.some(r => r.status === 'open')) {
  console.log('An open Platform Check already exists — no need to reinstate.');
  await conn.end();
  process.exit(0);
}

// Insert the reinstated Platform Check
const description = `New customer assignment: "${row.cName}" was created and service ${row.sId} (${row.serviceType || 'Unknown'}) was assigned. Verify billing platform reflects this assignment. Monthly cost: $${parseFloat(row.monthlyCost || 0).toFixed(2)}/mo via ${row.provider || 'Unknown'}.`;

const [result] = await conn.execute(
  `INSERT INTO billing_platform_checks 
   (targetType, targetId, customerExternalId, issueType, issueDescription, platform, priority, status, createdBy, createdAt)
   VALUES ('service', ?, ?, 'new-customer-assignment', ?, 'Manual', 'medium', 'open', 'System (Reinstated)', NOW())`,
  [row.sId, row.cId, description]
);

console.log(`\nPlatform Check reinstated! Insert ID: ${result.insertId}`);
await conn.end();
