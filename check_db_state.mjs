import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'local.db');

const db = new Database(dbPath);

const totalUnmatched = db.prepare("SELECT count(*) as c FROM services WHERE status = 'unmatched'").get();
const noCustomer = db.prepare("SELECT count(*) as c FROM services WHERE status = 'unmatched' AND (customerExternalId IS NULL OR customerExternalId = '')").get();
const withCustomer = db.prepare("SELECT count(*) as c FROM services WHERE status = 'unmatched' AND customerExternalId IS NOT NULL AND customerExternalId != ''").get();

console.log('Total unmatched:', totalUnmatched.c);
console.log('Unmatched with no customer:', noCustomer.c);
console.log('Unmatched with customer:', withCustomer.c);

// Check providers of the no-customer ones
const providers = db.prepare("SELECT provider, supplierName, count(*) as c FROM services WHERE status = 'unmatched' AND (customerExternalId IS NULL OR customerExternalId = '') GROUP BY provider, supplierName ORDER BY c DESC").all();
console.log('\nProviders of no-customer unmatched:');
providers.forEach(p => console.log(`  ${p.provider || p.supplierName || 'unknown'}: ${p.c}`));

// Sample some of the no-customer ones
const samples = db.prepare("SELECT externalId, serviceId, provider, supplierName, planName, locationAddress, customerName FROM services WHERE status = 'unmatched' AND (customerExternalId IS NULL OR customerExternalId = '') LIMIT 10").all();
console.log('\nSample no-customer unmatched services:');
samples.forEach(s => console.log(JSON.stringify(s)));

db.close();
