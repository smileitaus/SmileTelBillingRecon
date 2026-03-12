// Analyse unmatched services to understand address patterns
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

// Count unmatched services total
const [totalRows] = await db.query(`SELECT COUNT(*) as cnt FROM services WHERE status = 'unmatched' AND (customerExternalId IS NULL OR customerExternalId = '')`);
console.log('Total unmatched services:', totalRows[0].cnt);

// Count those with a non-empty address
const [withAddr] = await db.query(`SELECT COUNT(*) as cnt FROM services WHERE status = 'unmatched' AND (customerExternalId IS NULL OR customerExternalId = '') AND address IS NOT NULL AND address != '' AND address != '-'`);
console.log('Unmatched with address:', withAddr[0].cnt);

// Count those without address
const [noAddr] = await db.query(`SELECT COUNT(*) as cnt FROM services WHERE status = 'unmatched' AND (customerExternalId IS NULL OR customerExternalId = '') AND (address IS NULL OR address = '' OR address = '-')`);
console.log('Unmatched without address:', noAddr[0].cnt);

// Sample 20 addresses to understand format
const [samples] = await db.query(`SELECT id, address, planName, supplier FROM services WHERE status = 'unmatched' AND (customerExternalId IS NULL OR customerExternalId = '') AND address IS NOT NULL AND address != '' AND address != '-' LIMIT 20`);
console.log('\nSample addresses:');
for (const s of samples) {
  console.log(`  [${s.id}] "${s.address}" | plan: ${s.planName} | supplier: ${s.supplier}`);
}

// Count how many customers have addresses
const [custWithAddr] = await db.query(`SELECT COUNT(*) as cnt FROM customers WHERE address IS NOT NULL AND address != ''`);
console.log('\nCustomers with address:', custWithAddr[0].cnt);

// Sample customer addresses
const [custSamples] = await db.query(`SELECT externalId, name, address FROM customers WHERE address IS NOT NULL AND address != '' LIMIT 10`);
console.log('\nSample customer addresses:');
for (const c of custSamples) {
  console.log(`  [${c.externalId}] ${c.name} | "${c.address}"`);
}

// Check if services also have siteAddress or other address fields
const [cols] = await db.query(`SHOW COLUMNS FROM services`);
const addrCols = cols.filter(c => c.Field.toLowerCase().includes('addr') || c.Field.toLowerCase().includes('site') || c.Field.toLowerCase().includes('location'));
console.log('\nAddress-related columns in services:', addrCols.map(c => c.Field));

// Check customer address-related columns
const [custCols] = await db.query(`SHOW COLUMNS FROM customers`);
const custAddrCols = custCols.filter(c => c.Field.toLowerCase().includes('addr') || c.Field.toLowerCase().includes('site') || c.Field.toLowerCase().includes('location'));
console.log('Address-related columns in customers:', custAddrCols.map(c => c.Field));

await db.end();
