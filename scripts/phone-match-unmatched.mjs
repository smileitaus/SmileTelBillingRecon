import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Normalize phone number: strip spaces, dashes, parens, leading +61 or 0
function normalizePhone(phone) {
  if (!phone) return '';
  let p = phone.replace(/[\s\-\(\)\.]/g, '');
  // Convert +61 to 0
  if (p.startsWith('+61')) p = '0' + p.slice(3);
  if (p.startsWith('61') && p.length === 11) p = '0' + p.slice(2);
  // Ensure leading 0
  if (p.length === 9 && /^[2-9]/.test(p)) p = '0' + p;
  return p;
}

// Get all unmatched services with phone numbers
const [unmatched] = await conn.query(`
  SELECT externalId, phoneNumber, customerName, serviceType
  FROM services 
  WHERE (customerExternalId IS NULL OR customerExternalId = '')
    AND phoneNumber IS NOT NULL AND phoneNumber != ''
`);

console.log(`Unmatched services with phone numbers: ${unmatched.length}\n`);

// Build phone-to-customer lookup from:
// 1. Customer contact phones
// 2. Matched service phone numbers (same phone = same customer)

const phoneToCustomer = new Map(); // normalized phone -> { customerId, customerName, source }

// Source 1: Customer contact phones
const [custPhones] = await conn.query(`
  SELECT externalId, name, contactPhone 
  FROM customers 
  WHERE contactPhone IS NOT NULL AND contactPhone != ''
`);

for (const c of custPhones) {
  const norm = normalizePhone(c.contactPhone);
  if (norm.length >= 8) {
    phoneToCustomer.set(norm, { customerId: c.externalId, customerName: c.name, source: 'customer_contact' });
  }
}
console.log(`Phone lookup entries from customer contacts: ${phoneToCustomer.size}`);

// Source 2: Matched service phone numbers
const [matchedSvcs] = await conn.query(`
  SELECT DISTINCT customerExternalId, phoneNumber 
  FROM services 
  WHERE customerExternalId IS NOT NULL AND customerExternalId != '' 
    AND phoneNumber IS NOT NULL AND phoneNumber != ''
`);

// Get customer names for these
const [allCustomers] = await conn.query(`SELECT externalId, name FROM customers`);
const custNameMap = Object.fromEntries(allCustomers.map(c => [c.externalId, c.name]));

let svcPhoneEntries = 0;
for (const s of matchedSvcs) {
  const norm = normalizePhone(s.phoneNumber);
  if (norm.length >= 8 && !phoneToCustomer.has(norm)) {
    phoneToCustomer.set(norm, { 
      customerId: s.customerExternalId, 
      customerName: custNameMap[s.customerExternalId] || 'Unknown',
      source: 'service_phone' 
    });
    svcPhoneEntries++;
  }
}
console.log(`Additional entries from matched service phones: ${svcPhoneEntries}`);
console.log(`Total phone lookup entries: ${phoneToCustomer.size}\n`);

// Try to match each unmatched service
let matched = 0;
let notMatched = 0;
const matches = [];

for (const svc of unmatched) {
  const norm = normalizePhone(svc.phoneNumber);
  const match = phoneToCustomer.get(norm);
  
  if (match) {
    matches.push({
      serviceId: svc.externalId,
      phone: svc.phoneNumber,
      customerId: match.customerId,
      customerName: match.customerName,
      source: match.source,
      svcCustomerName: svc.customerName
    });
    matched++;
  } else {
    notMatched++;
  }
}

console.log(`=== PHONE MATCHING RESULTS ===`);
console.log(`Matched: ${matched}`);
console.log(`Not matched: ${notMatched}\n`);

// Show matches
for (const m of matches) {
  console.log(`  ${m.serviceId}: phone=${m.phone} -> ${m.customerName} (${m.customerId}) via ${m.source}`);
  if (m.svcCustomerName && m.svcCustomerName !== 'Unassigned') {
    console.log(`    (service label: ${m.svcCustomerName})`);
  }
}

// Apply matches
console.log('\nApplying matches...');
for (const m of matches) {
  await conn.query(
    `UPDATE services SET customerExternalId = ? WHERE externalId = ?`,
    [m.customerId, m.serviceId]
  );
}

// Recount service totals
console.log('Recounting service totals...');
await conn.query(`
  UPDATE customers c
  SET serviceCount = (
    SELECT COUNT(*) FROM services s WHERE s.customerExternalId = c.externalId
  )
`);

// Get final stats
const [remaining] = await conn.query(`
  SELECT COUNT(*) as cnt FROM services 
  WHERE (customerExternalId IS NULL OR customerExternalId = '')
`);
const [totalMatched] = await conn.query(`
  SELECT COUNT(*) as cnt FROM services 
  WHERE customerExternalId IS NOT NULL AND customerExternalId != ''
`);
const [totalSvcs] = await conn.query(`SELECT COUNT(*) as cnt FROM services`);

console.log(`\n=== FINAL STATUS ===`);
console.log(`Total services: ${totalSvcs[0].cnt}`);
console.log(`Matched services: ${totalMatched[0].cnt} (${(totalMatched[0].cnt / totalSvcs[0].cnt * 100).toFixed(1)}%)`);
console.log(`Remaining unmatched: ${remaining[0].cnt}`);

await conn.end();
