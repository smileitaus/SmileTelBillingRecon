/**
 * Assigns service S7141 (4G Data Back up, TIAB) to the Smile IT customer.
 * Run with: node scripts/assign-s7141-to-smileit.mjs
 */
import { config } from 'dotenv';
config();

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Find Smile IT customer
const [smileItCustomers] = await conn.execute(
  `SELECT externalId, name, status FROM customers WHERE name LIKE '%Smile IT%' OR name LIKE '%SmileIT%' OR name LIKE '%Smile-IT%' LIMIT 10`
);
console.log('Smile IT customers found:', JSON.stringify(smileItCustomers, null, 2));

if (smileItCustomers.length === 0) {
  console.log('No Smile IT customer found! Searching broader...');
  const [broader] = await conn.execute(
    `SELECT externalId, name, status FROM customers WHERE name LIKE '%Smile%' LIMIT 10`
  );
  console.log('Broader Smile search:', JSON.stringify(broader, null, 2));
  await conn.end();
  process.exit(1);
}

const smileIt = smileItCustomers[0];
console.log(`\nUsing customer: ${smileIt.name} (${smileIt.externalId})`);

// 2. Check current state of service S7141
const [services] = await conn.execute(
  `SELECT externalId, serviceType, phoneNumber, status, customerExternalId, provider, monthlyCost, simSerialNumber
   FROM services WHERE externalId = 'S7141' LIMIT 1`
);
console.log('\nService S7141 current state:', JSON.stringify(services, null, 2));

if (services.length === 0) {
  console.log('Service S7141 not found!');
  await conn.end();
  process.exit(1);
}

const svc = services[0];

// 3. Assign service to Smile IT and set status to active
await conn.execute(
  `UPDATE services SET customerExternalId = ?, status = 'active', updatedAt = NOW() WHERE externalId = 'S7141'`,
  [smileIt.externalId]
);
console.log(`\nService S7141 assigned to ${smileIt.name} (${smileIt.externalId}) and status set to active.`);

// 4. Create a Platform Check for billing verification
const description = `Service S7141 (${svc.serviceType || 'Data'}, phone: ${svc.phoneNumber || '0493895348'}, SIM: ${svc.simSerialNumber || '4000060087000'}) was manually reassigned from unmatched/rejected to customer "${smileIt.name}" (${smileIt.externalId}). Verify billing platform (TIAB) reflects this assignment. Monthly cost: $${parseFloat(svc.monthlyCost || 0).toFixed(2)}/mo.`;

const [result] = await conn.execute(
  `INSERT INTO billing_platform_checks 
   (targetType, targetId, customerExternalId, issueType, issueDescription, platform, priority, status, createdBy, createdAt)
   VALUES ('service', 'S7141', ?, 'new-customer-assignment', ?, 'Manual', 'medium', 'open', 'System (Manual Reassignment)', NOW())`,
  [smileIt.externalId, description]
);
console.log(`Platform Check created! Insert ID: ${result.insertId}`);

// 5. Verify the update
const [updated] = await conn.execute(
  `SELECT externalId, serviceType, phoneNumber, status, customerExternalId FROM services WHERE externalId = 'S7141'`
);
console.log('\nService S7141 after update:', JSON.stringify(updated, null, 2));

await conn.end();
console.log('\nDone!');
