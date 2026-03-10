import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all services
const [services] = await conn.execute('SELECT id, externalId, serviceType, serviceTypeDetail, planName, supplierAccount, supplierName, customerName, locationAddress, connectionId, dataSource, discoveryNotes, carbonServiceId, simOwner, blitzCategory FROM services');

console.log(`Total services: ${services.length}`);

// Provider detection rules
function detectProvider(svc) {
  const notes = (svc.discoveryNotes || '').toLowerCase();
  const plan = (svc.planName || '').toLowerCase();
  const dataSource = (svc.dataSource || '').toLowerCase();
  const supplier = (svc.supplierName || '').toLowerCase();
  const account = (svc.supplierAccount || '');
  const connId = (svc.connectionId || '').toLowerCase();
  const serviceType = (svc.serviceType || '').toLowerCase();
  const serviceDetail = (svc.serviceTypeDetail || '').toLowerCase();
  const customerName = (svc.customerName || '').toLowerCase();
  const address = (svc.locationAddress || '').toLowerCase();
  const simOwner = (svc.simOwner || '').toLowerCase();
  const blitz = (svc.blitzCategory || '').toLowerCase();
  const externalId = (svc.externalId || '');

  // Already has Carbon API data = ABB
  if (svc.carbonServiceId) return 'ABB';

  // Data source indicators
  if (dataSource.includes('smiletel') || dataSource.includes('abb') || dataSource.includes('aussie broadband')) return 'ABB';
  if (dataSource.includes('rvc customer list')) return 'Telstra'; // RVC SIMs are Telstra
  if (dataSource.includes('blitz') || dataSource.includes('2025 blitz')) return 'Telstra'; // Blitz report is Telstra

  // Plan name indicators
  if (plan.includes('wholesale nbn') || plan.includes('aussie fibre') || plan.includes('4g broadband backup')) return 'ABB';
  if (plan.includes('nbn enterprise ethernet')) return 'ABB';
  if (plan.includes('exetel')) return 'Exetel';
  if (plan.includes('aapt') || plan.includes('powertel')) return 'AAPT';
  if (plan.includes('vocus') || plan.includes('dodo') || plan.includes('commander')) return 'Vocus';
  if (plan.includes('optus')) return 'Optus';

  // Notes indicators
  if (notes.includes('abb') || notes.includes('aussie broadband') || notes.includes('carbon')) return 'ABB';
  if (notes.includes('exetel')) return 'Exetel';
  if (notes.includes('aapt')) return 'AAPT';
  if (notes.includes('vocus')) return 'Vocus';
  if (notes.includes('optus')) return 'Optus';

  // Supplier name
  if (supplier.includes('telstra')) return 'Telstra';
  if (supplier.includes('abb') || supplier.includes('aussie')) return 'ABB';
  if (supplier.includes('exetel')) return 'Exetel';
  if (supplier.includes('optus')) return 'Optus';
  if (supplier.includes('vocus')) return 'Vocus';
  if (supplier.includes('aapt')) return 'AAPT';

  // Connection ID patterns
  if (connId.startsWith('avc') || connId.startsWith('ovc')) return 'ABB'; // AVC/OVC from ABB import
  
  // Service type patterns for ABB-imported services
  if (serviceDetail.includes('fttn') || serviceDetail.includes('fttc') || serviceDetail.includes('hfc') || serviceDetail.includes('fibre')) {
    // These could be ABB or Telstra - check if from SmileTel import
    if (dataSource.includes('smiletel')) return 'ABB';
  }

  // Account number patterns
  // Telstra accounts are typically 10-13 digit numbers
  if (account && account.length >= 10 && account.length <= 13) return 'Telstra';
  
  // Blitz category (Telstra blitz report)
  if (blitz) return 'Telstra';

  // SIM owner patterns
  if (simOwner.includes('rvc') || simOwner.includes('tildon')) return 'Telstra';

  // Default: check if it has a Telstra-style supplier account
  if (account) return 'Telstra';

  return 'Unknown';
}

// Detect and count
const providerCounts = {};
const updates = [];

for (const svc of services) {
  const provider = detectProvider(svc);
  providerCounts[provider] = (providerCounts[provider] || 0) + 1;
  updates.push({ id: svc.id, provider });
}

console.log('\nProvider distribution:');
for (const [provider, count] of Object.entries(providerCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${provider}: ${count}`);
}

// Apply updates in batches
console.log('\nUpdating services...');
let updated = 0;
for (const { id, provider } of updates) {
  await conn.execute('UPDATE services SET provider = ? WHERE id = ?', [provider, id]);
  updated++;
}
console.log(`Updated ${updated} services with provider information`);

// Verify
const [verify] = await conn.execute('SELECT provider, COUNT(*) as cnt FROM services GROUP BY provider ORDER BY cnt DESC');
console.log('\nVerification:');
for (const row of verify) {
  console.log(`  ${row.provider}: ${row.cnt}`);
}

await conn.end();
