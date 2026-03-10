import { readFileSync } from 'fs';
import { drizzle } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2/promise';
import 'dotenv/config';

const DATA_DIR = './client/src/data';

async function seed() {
  const connection = await createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection);

  // Load JSON data
  const customers = JSON.parse(readFileSync(`${DATA_DIR}/customers.json`, 'utf-8'));
  const locations = JSON.parse(readFileSync(`${DATA_DIR}/locations.json`, 'utf-8'));
  const services = JSON.parse(readFileSync(`${DATA_DIR}/services.json`, 'utf-8'));
  const supplierAccounts = JSON.parse(readFileSync(`${DATA_DIR}/supplierAccounts.json`, 'utf-8'));

  console.log(`Seeding: ${customers.length} customers, ${locations.length} locations, ${services.length} services, ${supplierAccounts.length} supplier accounts`);

  // Seed customers in batches
  console.log('Seeding customers...');
  const custBatch = 50;
  for (let i = 0; i < customers.length; i += custBatch) {
    const batch = customers.slice(i, i + custBatch);
    const values = batch.map(c => [
      c.id,
      c.name,
      JSON.stringify(c.billingPlatforms || []),
      c.serviceCount || 0,
      c.monthlyCost || 0,
      c.unmatchedCount || 0,
      c.matchedCount || 0,
      c.status || 'active'
    ]);
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const flat = values.flat();
    await connection.execute(
      `INSERT IGNORE INTO customers (externalId, name, billingPlatforms, serviceCount, monthlyCost, unmatchedCount, matchedCount, status) VALUES ${placeholders}`,
      flat
    );
    process.stdout.write(`  ${Math.min(i + custBatch, customers.length)}/${customers.length}\r`);
  }
  console.log(`\n  Done: ${customers.length} customers`);

  // Seed locations
  console.log('Seeding locations...');
  const locBatch = 50;
  for (let i = 0; i < locations.length; i += locBatch) {
    const batch = locations.slice(i, i + locBatch);
    const values = batch.map(l => [
      l.id,
      l.address,
      l.customerId || '',
      l.customerName || '',
      l.serviceCount || 0,
      JSON.stringify(l.services || [])
    ]);
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const flat = values.flat();
    await connection.execute(
      `INSERT IGNORE INTO locations (externalId, address, customerExternalId, customerName, serviceCount, serviceIds) VALUES ${placeholders}`,
      flat
    );
  }
  console.log(`  Done: ${locations.length} locations`);

  // Seed services
  console.log('Seeding services...');
  const svcBatch = 25;
  for (let i = 0; i < services.length; i += svcBatch) {
    const batch = services.slice(i, i + svcBatch);
    const values = batch.map(s => [
      s.id,
      s.serviceId || '',
      s.serviceType || 'Other',
      s.serviceTypeDetail || '',
      s.planName || '',
      s.status || 'active',
      s.locationId || '',
      s.locationAddress || '',
      s.supplierAccount || '',
      s.supplierName || 'Telstra',
      s.phoneNumber || '',
      s.email || '',
      s.connectionId || '',
      s.locId || '',
      s.ipAddress || '',
      s.customerName || '',
      s.customerId || '',
      s.monthlyCost || 0,
      JSON.stringify(s.billingHistory || [])
    ]);
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const flat = values.flat();
    await connection.execute(
      `INSERT IGNORE INTO services (externalId, serviceId, serviceType, serviceTypeDetail, planName, status, locationExternalId, locationAddress, supplierAccount, supplierName, phoneNumber, email, connectionId, locId, ipAddress, customerName, customerExternalId, monthlyCost, billingHistory) VALUES ${placeholders}`,
      flat
    );
    process.stdout.write(`  ${Math.min(i + svcBatch, services.length)}/${services.length}\r`);
  }
  console.log(`\n  Done: ${services.length} services`);

  // Seed supplier accounts
  console.log('Seeding supplier accounts...');
  for (const sa of supplierAccounts) {
    await connection.execute(
      `INSERT IGNORE INTO supplier_accounts (accountNumber, supplierName, serviceCount, monthlyCost) VALUES (?, ?, ?, ?)`,
      [sa.accountNumber || '', sa.supplierName || 'Telstra', sa.serviceCount || 0, sa.monthlyCost || 0]
    );
  }
  console.log(`  Done: ${supplierAccounts.length} supplier accounts`);

  // Verify
  const [custRows] = await connection.execute('SELECT COUNT(*) as cnt FROM customers');
  const [svcRows] = await connection.execute('SELECT COUNT(*) as cnt FROM services');
  const [locRows] = await connection.execute('SELECT COUNT(*) as cnt FROM locations');
  const [saRows] = await connection.execute('SELECT COUNT(*) as cnt FROM supplier_accounts');
  console.log('\nVerification:');
  console.log(`  Customers: ${custRows[0].cnt}`);
  console.log(`  Services: ${svcRows[0].cnt}`);
  console.log(`  Locations: ${locRows[0].cnt}`);
  console.log(`  Supplier Accounts: ${saRows[0].cnt}`);

  await connection.end();
  console.log('\nSeed complete!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
