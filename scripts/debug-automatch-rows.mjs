/**
 * Debug script to check what row format db.execute returns for the globalAutoMatch customer query
 */
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Try to load the .env file from the project
try {
  const envContent = readFileSync('/home/ubuntu/SmileTelBillingRecon/.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
} catch (e) {
  console.log('Could not load .env:', e.message);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

console.log('DATABASE_URL found, connecting...');
const conn = await createConnection(dbUrl);

const [rows] = await conn.execute(`
  SELECT DISTINCT s.customerExternalId
  FROM services s
  WHERE s.status NOT IN ('terminated', 'flagged_for_termination')
    AND s.customerExternalId IS NOT NULL
    AND s.customerExternalId != ''
    AND s.externalId NOT IN (
      SELECT serviceExternalId FROM service_billing_assignments
    )
    AND s.externalId NOT IN (
      SELECT serviceExternalId FROM unbillable_services
    )
  LIMIT 5
`);

console.log('Row count:', rows.length);
console.log('First row keys:', rows.length > 0 ? Object.keys(rows[0]) : 'none');
console.log('First 3 rows:', JSON.stringify(rows.slice(0, 3), null, 2));

await conn.end();
