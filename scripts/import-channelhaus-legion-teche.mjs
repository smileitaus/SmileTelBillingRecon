/**
 * Import Channel Haus, Legion, Tech-e invoice services into the database.
 * - Matched services: create as 'active' linked to the matched customer
 * - Unmatched services: create as 'unmatched' for review on the Unmatched screen
 */
import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);
const results = JSON.parse(readFileSync('/tmp/match-results.json', 'utf8'));

function nowIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function genId(prefix) { return prefix + Math.random().toString(36).slice(2, 8).toUpperCase(); }

// Map provider name to the providerCode used in the DB
const PROVIDER_CODE = {
  'Channel Haus': 'ChannelHaus',
  'Legion': 'Legion',
  'Tech-e': 'Tech-e',
};

// Map serviceType string to DB enum
const SERVICE_TYPE_MAP = {
  'Internet': 'Internet',
  'Voice': 'Voice',
};

let created = 0, skipped = 0, errors = 0;

// Check if a service with this serviceId already exists
async function serviceExists(serviceId) {
  const [rows] = await db.query(
    `SELECT externalId FROM services WHERE externalId = ? OR serviceId = ? LIMIT 1`,
    [serviceId, serviceId]
  );
  return rows.length > 0;
}

// Check column names
const [cols] = await db.query(`SHOW COLUMNS FROM services`);
const colNames = cols.map(c => c.Field);
console.log('Service columns:', colNames.filter(c => ['serviceId','provider','providerCode','phoneNumber','phone'].includes(c)));

// Insert a service
async function insertService(svc, customerExternalId, customerName, status) {
  const externalId = genId('S');
  const now = nowIso();
  
  // Determine which phone/serviceId column to use
  const hasServiceId = colNames.includes('serviceId');
  const hasPhoneNumber = colNames.includes('phoneNumber');
  const hasPhone = colNames.includes('phone');
  
  try {
    await db.query(
      `INSERT INTO services (
        externalId, customerExternalId, customerName,
        serviceType, planName, supplierName,
        monthlyCost, status,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        externalId,
        customerExternalId || null,
        customerName || null,
        SERVICE_TYPE_MAP[svc.serviceType] || 'Other',
        svc.friendlyName,
        PROVIDER_CODE[svc.provider],
        svc.amount,
        status,
        now, now,
      ]
    );
    created++;
    return externalId;
  } catch (e) {
    console.error(`  ERROR inserting ${svc.friendlyName}: ${e.message}`);
    errors++;
    return null;
  }
}

console.log('\n=== IMPORTING MATCHED SERVICES ===');
for (const m of results.matched) {
  // Only import HIGH and MED confidence matches automatically
  // LOW confidence: still import but mark as unmatched for review
  const isConfident = m.confidence >= 0.4;
  const status = isConfident ? 'active' : 'unmatched';
  const custId = isConfident ? m.matchedCustomer.externalId : null;
  const custName = isConfident ? m.matchedCustomer.name : null;
  
  const conf = m.confidence >= 0.7 ? 'HIGH' : m.confidence >= 0.4 ? 'MED' : 'LOW';
  const id = await insertService(m, custId, custName, status);
  if (id) {
    console.log(`  [${conf}] ${m.friendlyName.padEnd(45)} → ${(custName || 'UNMATCHED').padEnd(40)} $${m.amount.toFixed(2)}`);
    
    // Update customer service count if matched
    if (isConfident && custId) {
      await db.query(
        `UPDATE customers SET serviceCount = COALESCE(serviceCount, 0) + 1, matchedCount = COALESCE(matchedCount, 0) + 1, status = 'active', updatedAt = ? WHERE externalId = ?`,
        [nowIso(), custId]
      );
    }
  }
}

console.log('\n=== IMPORTING UNMATCHED SERVICES ===');
for (const u of results.unmatched) {
  const id = await insertService(u, null, null, 'unmatched');
  if (id) {
    console.log(`  ${u.friendlyName.padEnd(45)} $${u.amount.toFixed(2)} (${u.provider})`);
  }
}

console.log(`\n=== DONE ===`);
console.log(`Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);

await db.end();
