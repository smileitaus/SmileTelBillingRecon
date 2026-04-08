import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get Mackellar Mining customer ID
const [mackRows] = await conn.execute("SELECT externalId FROM customers WHERE name LIKE '%Mackellar%' LIMIT 1");
const mackId = mackRows[0]?.externalId || 'C_MACK01';

// ============================================================
// Services to create
// ============================================================
const services = [
  {
    externalId: 'S_NS_NSP011058',
    serviceId: 'NETSIP-NSP011058',
    planName: 'SIP Trunk (30 ch @ $1.10) + 2x 1300 + 100-DID packs + MS Teams x10',
    supplierAccount: 'NSP011058',
    customerExternalId: null,
    customerName: 'Smile IT Pty Ltd',
    address: '1/60 Enterprise Place, Tingalpa QLD 4173',
    monthlyCost: 279.66,
    notes: 'Smile IT main SIP account. 30 SIP channels @ $1.10. 2x 1300 numbers (175636, 776657). 2x 100-DID packs (322502##, 354443##). 50+ individual DIDs. 2x MS Teams Direct Routing trunks (p829167p x5, p862386p x5). Invoice: 0000807904 Mar 2026.'
  },
  {
    externalId: 'S_NS_NSP011241',
    serviceId: 'NETSIP-NSP011241',
    planName: 'SIP Trunk (5 ch @ $1.10) - Wholesale Test',
    supplierAccount: 'NSP011241',
    customerExternalId: null,
    customerName: 'Smile IT Pty Ltd (Wholesale Test)',
    address: '1/60 Enterprise Place, Tingalpa QLD 4173',
    monthlyCost: 5.50,
    notes: 'Smile IT Wholesale Standard test account. 5 SIP channels only. Likely used for testing/development. Review for possible cancellation. Invoice: 0000810154 Mar 2026.'
  },
  {
    externalId: 'S_NS_NSP009387',
    serviceId: 'NETSIP-NSP009387',
    planName: 'SIP Trunk (8 ch @ $47.30) + 100-DID pack + MS Teams x4',
    supplierAccount: 'NSP009387',
    customerExternalId: 'C0057',
    customerName: 'CDI Lawyers',
    address: '4/49 Park Rd, Milton, QLD, 4064',
    monthlyCost: 413.35,
    notes: 'CDI Lawyers SIP trunk. 8 SIP channels @ $47.30. 100 DID pack 617351854##. MS Teams Direct Routing 4 channels (p476387p). Teams Unlimited Plus 43 users. Billed via Trimble Networks. Invoice: 0000811235 Mar 2026.'
  },
  {
    externalId: 'S_NS_NSP000019',
    serviceId: 'NETSIP-NSP000019',
    planName: 'SIP Trunk (50 ch @ $2.20) + 2x 1300 + 100-DID packs + MS Teams x7',
    supplierAccount: 'NSP000019',
    customerExternalId: null,
    customerName: 'Trimble Networks Pty Ltd',
    address: 'Suite 3ab, Level 3, 5 Cribb Street, Milton QLD 4006',
    monthlyCost: 301.67,
    notes: 'Trimble Networks main SIP account (oldest account NSP000019). 50 SIP channels @ $2.20. 2x 100-DID packs (343896##, 354441##). 2x 1300 numbers (882615, 884603). 3 individual DIDs. 3x MS Teams trunks (p775905p x2, p798666p x2, p849733p x3). Invoice: 0000808429 Mar 2026.'
  },
  {
    externalId: 'S_NS_NSP010568',
    serviceId: 'NETSIP-NSP010568',
    planName: 'SIP Trunk (1 ch @ $47.30) + 2x 10-DID packs + MS Teams x1',
    supplierAccount: 'NSP010568',
    customerExternalId: 'C0167',
    customerName: 'NDC PLASTIC MOULDING PTY LTD',
    address: '3/123 Bancroft Road, Pinkenba QLD 4008',
    monthlyCost: 82.15,
    notes: 'NDC Plastic Moulding SIP trunk. 1 SIP channel @ $47.30. 1 DID (61732163324). 2x 10-DID packs (3159305#, 3709338#). MS Teams Direct Routing 1 channel (p681225p). Teams Unlimited Plus 43 users. Consistent $82.15/month. Invoice: 0000810021 Mar 2026.'
  },
  {
    externalId: 'S_NS_NSP010335',
    serviceId: 'NETSIP-NSP010335',
    planName: 'SIP Trunk (4 ch @ $47.30) + 2x 10-DID packs + MS Teams x4',
    supplierAccount: 'NSP010335',
    customerExternalId: mackId,
    customerName: 'Mackellar Mining',
    address: 'Billed via Trimble Networks, Suite 3ab, Level 3, 5 Cribb Street, Milton QLD 4006',
    monthlyCost: 219.10,
    notes: 'Mackellar Mining SIP trunk. 4 SIP channels @ $47.30. 2x 10-DID packs (4860213#, 5211052#). MS Teams Direct Routing 4 channels (p615915p). Teams Unlimited Plus 43 users. Consistent $219.10/month. Billed via Trimble Networks. Invoice: 0000808337 Mar 2026.'
  },
  {
    externalId: 'S_NS_NSP010341',
    serviceId: 'NETSIP-NSP010341',
    planName: 'SIP Trunk (4 ch @ $47.30) + 100-DID pack + Fax-to-Email + MS Teams x4',
    supplierAccount: 'NSP010341',
    customerExternalId: 'C0039',
    customerName: 'Body Corporate Systems Pty Ltd',
    address: 'Suite 106, 621 Wynnum Road, Morningside, QLD, 4170',
    monthlyCost: 256.00,
    notes: 'Body Corporate Systems SIP trunk. 4 SIP channels @ $47.30. 2 individual DIDs (61738990225, 61738990299). 100 DID pack (617347299##). Fax-to-Email on 61738990225 ($6.95/mo). MS Teams Direct Routing 4 channels (p617226p). Teams Unlimited Plus 43 users. 60 calls Mar 2026 (489 min). Invoice: 0000809879 Mar 2026.'
  },
];

for (const svc of services) {
  const [existing] = await conn.execute('SELECT id FROM services WHERE serviceId = ?', [svc.serviceId]);
  if (existing.length > 0) {
    await conn.execute(
      'UPDATE services SET supplierName=?, supplierAccount=?, planName=?, monthlyCost=?, customerExternalId=?, customerName=?, locationAddress=?, notes=?, updatedAt=NOW() WHERE serviceId=?',
      ['NetSIP', svc.supplierAccount, svc.planName, svc.monthlyCost, svc.customerExternalId, svc.customerName, svc.address, svc.notes, svc.serviceId]
    );
    console.log(`Updated: ${svc.serviceId}`);
  } else {
    await conn.execute(
      'INSERT INTO services (externalId, serviceId, serviceType, serviceTypeDetail, planName, status, supplierAccount, supplierName, customerExternalId, customerName, locationAddress, monthlyCost, discoveryNotes, dataSource) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [svc.externalId, svc.serviceId, 'VoIP', 'SIP Trunk', svc.planName, 'active', svc.supplierAccount, 'NetSIP', svc.customerExternalId, svc.customerName, svc.address, svc.monthlyCost, svc.notes, 'netsip_invoice']
    );
    console.log(`Created: ${svc.serviceId} — ${svc.customerName} $${svc.monthlyCost}/mo`);
  }
}

// ============================================================
// Phone numbers / DIDs
// ============================================================
const phoneNumbers = [
  // NSP011058 - Smile IT
  { number: '1300175636', display: '1300 175 636', type: '1300', cost: 11.00, custId: null, custName: 'Smile IT Pty Ltd', svcId: 'S_NS_NSP011058', acct: 'NSP011058' },
  { number: '1300776657', display: '1300 776 657', type: '1300', cost: 11.00, custId: null, custName: 'Smile IT Pty Ltd', svcId: 'S_NS_NSP011058', acct: 'NSP011058' },
  { number: '61734735582', display: '61 7347 35582', type: 'did_block', cost: 2.20, custId: null, custName: 'Smile IT Pty Ltd', svcId: 'S_NS_NSP011058', acct: 'NSP011058', note: '10 DID block 61734735582#' },
  { number: '61879424020', display: '61 8794 24020', type: 'did_block', cost: 2.20, custId: null, custName: 'Smile IT Pty Ltd', svcId: 'S_NS_NSP011058', acct: 'NSP011058', note: '10 DID block 6187942402#' },
  { number: '617322502', display: '100 DID 617322502##', type: 'did_block_100', cost: 22.00, custId: null, custName: 'Smile IT Pty Ltd', svcId: 'S_NS_NSP011058', acct: 'NSP011058', note: '100 DID pack' },
  { number: '617354443', display: '100 DID 617354443##', type: 'did_block_100', cost: 22.00, custId: null, custName: 'Smile IT Pty Ltd', svcId: 'S_NS_NSP011058', acct: 'NSP011058', note: '100 DID pack' },
  // Individual DIDs for NSP011058
  ...['61250245559','61253431172','61342247230','61342249024','61380005046','61399682358','61720008145','61720040679','61720040989','61728023873','61730398980','61730636638','61731712447','61731712448','61731712449','61731712450','61731712451','61734531820','61734727326','61734728843','61734729121','61734730616','61734735557','61734735558','61734735590','61734735591','61734735592','61734824087','61734950176','61734969155','61735071114','61737377838','61741115937','61741115938','61743307014','61748591914','61752111664','61752374582','61752392464','61753294594','61754062007','61754940684','61754940685','61754940687','61754946002','61754946120','61754946133','61754946203','61754946293','61754994588','61862059981','61862556621','61867067257','61889110060','61893009470'].map(n => ({
    number: n, display: n, type: 'did', cost: 0.22, custId: null, custName: 'Smile IT Pty Ltd', svcId: 'S_NS_NSP011058', acct: 'NSP011058'
  })),
  // NSP009387 - CDI Lawyers
  { number: '617351854', display: '100 DID 617351854##', type: 'did_block_100', cost: 34.95, custId: 'C0057', custName: 'CDI Lawyers', svcId: 'S_NS_NSP009387', acct: 'NSP009387', note: '100 DID pack' },
  // NSP000019 - Trimble Networks
  { number: '1300882615', display: '1300 882 615', type: '1300', cost: 11.00, custId: null, custName: 'Trimble Networks Pty Ltd', svcId: 'S_NS_NSP000019', acct: 'NSP000019' },
  { number: '1300884603', display: '1300 884 603', type: '1300', cost: 11.00, custId: null, custName: 'Trimble Networks Pty Ltd', svcId: 'S_NS_NSP000019', acct: 'NSP000019' },
  { number: '617343896', display: '100 DID 617343896##', type: 'did_block_100', cost: 22.00, custId: null, custName: 'Trimble Networks Pty Ltd', svcId: 'S_NS_NSP000019', acct: 'NSP000019', note: '100 DID pack' },
  { number: '617354441', display: '100 DID 617354441##', type: 'did_block_100', cost: 22.00, custId: null, custName: 'Trimble Networks Pty Ltd', svcId: 'S_NS_NSP000019', acct: 'NSP000019', note: '100 DID pack' },
  { number: '61733792926', display: '02 6173 3792 926', type: 'did', cost: 0.22, custId: null, custName: 'Trimble Networks Pty Ltd', svcId: 'S_NS_NSP000019', acct: 'NSP000019' },
  { number: '61738082651', display: '02 6173 8082 651', type: 'did', cost: 0.22, custId: null, custName: 'Trimble Networks Pty Ltd', svcId: 'S_NS_NSP000019', acct: 'NSP000019' },
  { number: '61738524498', display: '02 6173 8524 498', type: 'did', cost: 0.22, custId: null, custName: 'Trimble Networks Pty Ltd', svcId: 'S_NS_NSP000019', acct: 'NSP000019' },
  // NSP010568 - NDC Plastic Moulding
  { number: '61732163324', display: '02 6173 2163 324', type: 'did', cost: 4.95, custId: 'C0167', custName: 'NDC PLASTIC MOULDING PTY LTD', svcId: 'S_NS_NSP010568', acct: 'NSP010568' },
  { number: '6173159305', display: '10 DID 6173159305#', type: 'did_block', cost: 14.95, custId: 'C0167', custName: 'NDC PLASTIC MOULDING PTY LTD', svcId: 'S_NS_NSP010568', acct: 'NSP010568', note: '10 DID pack' },
  { number: '6173709338', display: '10 DID 6173709338#', type: 'did_block', cost: 14.95, custId: 'C0167', custName: 'NDC PLASTIC MOULDING PTY LTD', svcId: 'S_NS_NSP010568', acct: 'NSP010568', note: '10 DID pack' },
  // NSP010335 - Mackellar Mining
  { number: '6174860213', display: '10 DID 6174860213#', type: 'did_block', cost: 14.95, custId: mackId, custName: 'Mackellar Mining', svcId: 'S_NS_NSP010335', acct: 'NSP010335', note: '10 DID pack' },
  { number: '6175211052', display: '10 DID 6175211052#', type: 'did_block', cost: 14.95, custId: mackId, custName: 'Mackellar Mining', svcId: 'S_NS_NSP010335', acct: 'NSP010335', note: '10 DID pack' },
  // NSP010341 - Body Corporate Systems
  { number: '61738990225', display: '02 6173 8990 225', type: 'did', cost: 4.95, custId: 'C0039', custName: 'Body Corporate Systems Pty Ltd', svcId: 'S_NS_NSP010341', acct: 'NSP010341' },
  { number: '61738990299', display: '02 6173 8990 299', type: 'did', cost: 4.95, custId: 'C0039', custName: 'Body Corporate Systems Pty Ltd', svcId: 'S_NS_NSP010341', acct: 'NSP010341' },
  { number: '617347299', display: '100 DID 617347299##', type: 'did_block_100', cost: 34.95, custId: 'C0039', custName: 'Body Corporate Systems Pty Ltd', svcId: 'S_NS_NSP010341', acct: 'NSP010341', note: '100 DID pack' },
];

let inserted = 0, skipped = 0;
for (const pn of phoneNumbers) {
  const [existing] = await conn.execute('SELECT id FROM phone_numbers WHERE number = ? AND provider = ?', [pn.number, 'NetSIP']);
  if (existing.length > 0) { skipped++; continue; }
  await conn.execute(
    'INSERT INTO phone_numbers (number, numberDisplay, numberType, provider, status, customerExternalId, customerName, serviceExternalId, servicePlanName, monthlyCost, providerServiceCode, notes, dataSource) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [pn.number, pn.display, pn.type, 'NetSIP', 'active', pn.custId, pn.custName, pn.svcId, `NetSIP SIP Trunk ${pn.acct}`, pn.cost, pn.acct, pn.note || '', 'netsip_invoice']
  );
  inserted++;
}
console.log(`Phone numbers: ${inserted} inserted, ${skipped} skipped`);

// Update supplier totals
const totalMonthly = services.reduce((s, a) => s + a.monthlyCost, 0);
await conn.execute(
  'UPDATE supplier_registry SET totalServices=?, totalMonthlyCost=?, lastInvoiceDate=?, lastInvoiceNumber=?, updatedAt=NOW() WHERE name=?',
  [services.length, totalMonthly.toFixed(2), '2026-03-29', '0000811235', 'NetSIP']
);
console.log(`Supplier totals updated: ${services.length} services, $${totalMonthly.toFixed(2)}/mo`);

await conn.end();
console.log('NetSIP import complete');
