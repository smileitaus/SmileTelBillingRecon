/**
 * Seed script: Populate TIAB supplier invoices, Octane customers, and Zambrero services.
 * Run with: node seed-tiab-data.mjs
 */
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '.env' });

const conn = await createConnection(process.env.DATABASE_URL);

// ============================================================
// 1. TIAB Supplier Invoices (100998-279 through 100998-282)
// ============================================================

const invoices = [
  {
    invoiceNumber: '279',
    invoiceReference: '100998-279',
    accountNumber: '100998',
    accountName: 'SmileTel',
    invoiceDate: '30/11/2025',
    paymentDueDate: '30/12/2025',
    billingMonth: '2025-11',
    supplierName: 'Telcoinabox Operations Pty Ltd',
    supplierAbn: '74 113 228 010',
    billedToName: 'Smile IT PTY LTD',
    billedToAbn: '26 615 765 231',
    billedToAddress: 'PO Box 1234, Brisbane QLD 4000',
    totalExGst: '1343.58',
    totalGst: '134.36',
    totalIncGst: '1477.94',
    fileName: '100998-279.pdf',
  },
  {
    invoiceNumber: '280',
    invoiceReference: '100998-280',
    accountNumber: '100998',
    accountName: 'SmileTel',
    invoiceDate: '31/12/2025',
    paymentDueDate: '31/01/2026',
    billingMonth: '2025-12',
    supplierName: 'Telcoinabox Operations Pty Ltd',
    supplierAbn: '74 113 228 010',
    billedToName: 'Smile IT PTY LTD',
    billedToAbn: '26 615 765 231',
    billedToAddress: 'PO Box 1234, Brisbane QLD 4000',
    totalExGst: '735.95',
    totalGst: '73.60',
    totalIncGst: '809.55',
    fileName: '100998-280.pdf',
  },
  {
    invoiceNumber: '281',
    invoiceReference: '100998-281',
    accountNumber: '100998',
    accountName: 'SmileTel',
    invoiceDate: '31/01/2026',
    paymentDueDate: '28/02/2026',
    billingMonth: '2026-01',
    supplierName: 'Telcoinabox Operations Pty Ltd',
    supplierAbn: '74 113 228 010',
    billedToName: 'Smile IT PTY LTD',
    billedToAbn: '26 615 765 231',
    billedToAddress: 'PO Box 1234, Brisbane QLD 4000',
    totalExGst: '2407.44',
    totalGst: '240.74',
    totalIncGst: '2648.18',
    fileName: '100998-281.pdf',
  },
  {
    invoiceNumber: '282',
    invoiceReference: '100998-282',
    accountNumber: '100998',
    accountName: 'SmileTel',
    invoiceDate: '28/02/2026',
    paymentDueDate: '31/03/2026',
    billingMonth: '2026-02',
    supplierName: 'Telcoinabox Operations Pty Ltd',
    supplierAbn: '74 113 228 010',
    billedToName: 'Smile IT PTY LTD',
    billedToAbn: '26 615 765 231',
    billedToAddress: 'PO Box 1234, Brisbane QLD 4000',
    totalExGst: '6606.49',
    totalGst: '660.65',
    totalIncGst: '7267.14',
    fileName: '100998-282.pdf',
  },
];

const lineItems = {
  '279': [
    { description: 'Telstra Premium Mobile', gstExclusive: 465.94, gst: 46.59, amountGstIncl: 512.53, lineCategory: 'mobile_service' },
    { description: 'SIM Cards (Retail Data Plan) x 50', gstExclusive: 500.00, gst: 50.00, amountGstIncl: 550.00, lineCategory: 'sim_card' },
    { description: 'SIM Cards (ST Data Pool 60GB) x 4', gstExclusive: 484.50, gst: 48.45, amountGstIncl: 532.95, lineCategory: 'sim_card' },
    { description: 'OTP SMS', gstExclusive: 25.00, gst: 2.50, amountGstIncl: 27.50, lineCategory: 'otp_sms' },
  ],
  '280': [
    { description: 'Telstra Premium Mobile', gstExclusive: 782.05, gst: 78.21, amountGstIncl: 860.26, lineCategory: 'mobile_service' },
    { description: 'OTP SMS', gstExclusive: 25.00, gst: 2.50, amountGstIncl: 27.50, lineCategory: 'otp_sms' },
  ],
  '281': [
    { description: 'Telstra Premium Mobile', gstExclusive: 2620.68, gst: 262.07, amountGstIncl: 2882.75, lineCategory: 'mobile_service' },
    { description: 'OTP SMS', gstExclusive: 25.00, gst: 2.50, amountGstIncl: 27.50, lineCategory: 'otp_sms' },
  ],
  '282': [
    { description: 'Telstra Premium Mobile', gstExclusive: 7239.64, gst: 723.96, amountGstIncl: 7963.60, lineCategory: 'mobile_service' },
    { description: 'OTP SMS', gstExclusive: 25.00, gst: 2.50, amountGstIncl: 27.50, lineCategory: 'otp_sms' },
  ],
};

console.log('Seeding TIAB supplier invoices...');
for (const inv of invoices) {
  await conn.execute(
    `INSERT INTO tiab_supplier_invoices 
      (invoiceNumber, invoiceReference, accountNumber, accountName, invoiceDate, paymentDueDate, billingMonth,
       supplierName, supplierAbn, billedToName, billedToAbn, billedToAddress,
       totalExGst, totalGst, totalIncGst, fileName, importedBy, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', 'imported')
     ON DUPLICATE KEY UPDATE invoiceDate=VALUES(invoiceDate), totalIncGst=VALUES(totalIncGst)`,
    [
      inv.invoiceNumber, inv.invoiceReference, inv.accountNumber, inv.accountName,
      inv.invoiceDate, inv.paymentDueDate, inv.billingMonth,
      inv.supplierName, inv.supplierAbn, inv.billedToName, inv.billedToAbn, inv.billedToAddress,
      inv.totalExGst, inv.totalGst, inv.totalIncGst, inv.fileName,
    ]
  );

  // Get the invoice ID
  const [rows] = await conn.execute(
    'SELECT id FROM tiab_supplier_invoices WHERE invoiceNumber = ?',
    [inv.invoiceNumber]
  );
  const invoiceId = rows[0].id;

  // Delete existing line items for this invoice
  await conn.execute('DELETE FROM tiab_supplier_invoice_line_items WHERE invoiceId = ?', [invoiceId]);

  // Insert line items
  for (const li of (lineItems[inv.invoiceNumber] || [])) {
    await conn.execute(
      `INSERT INTO tiab_supplier_invoice_line_items 
        (invoiceId, invoiceNumber, description, gstExclusive, gst, amountGstIncl, lineCategory)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, inv.invoiceNumber, li.description, li.gstExclusive, li.gst, li.amountGstIncl, li.lineCategory]
    );
  }
  console.log(`  Invoice ${inv.invoiceReference}: ${(lineItems[inv.invoiceNumber] || []).length} line items`);
}

// ============================================================
// 2. Octane Customers (from octane_customers.json)
// ============================================================

const octaneCustomers = JSON.parse(readFileSync('/home/ubuntu/octane_customers.json', 'utf8'));

console.log(`\nSeeding ${octaneCustomers.length} Octane customers into tiab_customers...`);
for (const c of octaneCustomers) {
  const companyName = c.legalEntity || c.company || '';
  const displayName = companyName || `${c.firstName || ''} ${c.surname || ''}`.trim();
  const addr = [c.addr1, c.addr2, c.suburb, c.state, c.postcode].filter(Boolean).join(', ');

  await conn.execute(
    `INSERT INTO tiab_customers 
      (tiabCustomerId, companyName, firstName, lastName, email, phone, abn, address, suburb, state, postcode, status, rawJson, lastSyncedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE 
       companyName=VALUES(companyName), firstName=VALUES(firstName), lastName=VALUES(lastName),
       email=VALUES(email), phone=VALUES(phone), abn=VALUES(abn), address=VALUES(address),
       suburb=VALUES(suburb), state=VALUES(state), postcode=VALUES(postcode), status=VALUES(status),
       rawJson=VALUES(rawJson), lastSyncedAt=NOW()`,
    [
      c.custId.toString(),
      displayName,
      c.firstName || '',
      c.surname || '',
      c.mainEmail || c.altEmail || '',
      c.contactPhone || '',
      c.abn || '',
      addr,
      c.suburb || '',
      c.state || '',
      c.postcode || '',
      c.custStatus || 'active',
      JSON.stringify(c),
    ]
  );
}
console.log('  Done.');

// ============================================================
// 3. Zambrero Services as individual entries in octane_customer_links
// ============================================================

const zambreroData = JSON.parse(readFileSync('/home/ubuntu/zambrero_services.json', 'utf8'));
const zambreroServices = zambreroData.services;
const zambreroCustomerId = zambreroData.custId;

console.log(`\nSeeding ${zambreroServices.length} Zambrero services as octane_customer_links...`);

// First, insert the Zambrero parent customer link (non-service)
await conn.execute(
  `INSERT INTO octane_customer_links 
    (octaneCustomerId, octaneCustomerName, octaneServiceName, matchType, matchConfidence, isZambreroService, msisdn)
   VALUES (?, 'Zambrero (AHJ Pty Ltd)', '', 'unmatched', 0.00, 0, '')
   ON DUPLICATE KEY UPDATE octaneCustomerName=VALUES(octaneCustomerName)`,
  [zambreroCustomerId]
);

// Insert each Zambrero service as its own link entry
for (const svc of zambreroServices) {
  // Try to auto-match to existing customers by service name
  const siteName = svc.name.replace(/^Zambrero\s+/i, '').trim();
  
  await conn.execute(
    `INSERT INTO octane_customer_links 
      (octaneCustomerId, octaneCustomerName, octaneServiceName, matchType, matchConfidence, isZambreroService, msisdn)
     VALUES (?, 'Zambrero (AHJ Pty Ltd)', ?, 'unmatched', 0.00, 1, ?)
     ON DUPLICATE KEY UPDATE msisdn=VALUES(msisdn), matchType=VALUES(matchType)`,
    [zambreroCustomerId, svc.name, svc.serviceNumber]
  );
}
console.log('  Done.');

// ============================================================
// 4. Seed non-Zambrero Octane customers into octane_customer_links
// ============================================================

console.log('\nSeeding non-Zambrero Octane customers into octane_customer_links...');
for (const c of octaneCustomers) {
  if (c.custId.toString() === zambreroCustomerId) continue; // Skip Zambrero (handled above)

  const companyName = c.legalEntity || c.company || '';
  const displayName = companyName || `${c.firstName || ''} ${c.surname || ''}`.trim();

  await conn.execute(
    `INSERT INTO octane_customer_links 
      (octaneCustomerId, octaneCustomerName, octaneServiceName, matchType, matchConfidence, isZambreroService, msisdn)
     VALUES (?, ?, '', 'unmatched', 0.00, 0, '')
     ON DUPLICATE KEY UPDATE octaneCustomerName=VALUES(octaneCustomerName)`,
    [c.custId.toString(), displayName]
  );
}
console.log('  Done.');

// ============================================================
// 5. Seed Zambrero services into tiab_services
// ============================================================

console.log('\nSeeding Zambrero services into tiab_services...');
for (const svc of zambreroServices) {
  const statusMap = { OK: 'Active', DS: 'Ceased', BD: 'Suspended' };
  const tiabStatus = statusMap[svc.status] || svc.status;

  // Parse date from DD/MM/YYYY to YYYY-MM-DD
  const parseDate = (d) => {
    if (!d) return null;
    const parts = d.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return d;
  };

  await conn.execute(
    `INSERT INTO tiab_services 
      (tiabServiceId, tiabCustomerId, planName, status, serviceType, msisdn, dataPoolId, activationDate, cessationDate, reconStatus, rawJson, lastSyncedAt)
     VALUES (?, ?, ?, ?, 'mobile', ?, ?, ?, ?, 'pending', ?, NOW())
     ON DUPLICATE KEY UPDATE 
       planName=VALUES(planName), status=VALUES(status), msisdn=VALUES(msisdn),
       dataPoolId=VALUES(dataPoolId), activationDate=VALUES(activationDate),
       cessationDate=VALUES(cessationDate), rawJson=VALUES(rawJson), lastSyncedAt=NOW()`,
    [
      svc.serviceNumber, // use phone number as service ID
      zambreroCustomerId,
      svc.plan || 'Retail Data Plan',
      tiabStatus,
      svc.serviceNumber,
      svc.dataPoolId || '',
      parseDate(svc.added),
      parseDate(svc.released) || null,
      JSON.stringify(svc),
    ]
  );
}
console.log('  Done.');

await conn.end();
console.log('\n✅ Seed complete!');
