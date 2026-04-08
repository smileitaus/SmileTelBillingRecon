import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ============================================================
// 1. Add NetSIP to supplier_registry
// ============================================================
await conn.execute(`
  INSERT INTO supplier_registry 
    (id, name, displayName, category, `rank`, abn, supportPhone, supportEmail, uploadFormats, uploadInstructions, isActive, notes)
  VALUES
    (120001, 'NetSIP', 'NetSIP (Aussie Broadband)', 'VoIP', 7, '19 131 968 744', '1300 638 747', 'accounts@netsip.com.au', 'pdf',
     'Upload the NetSIP Tax Invoice PDF. The system will extract SIP channels, DID numbers, MS Teams channels, and call charges per account.',
     1,
     'NetSIP PTY LTD (ABN 19 131 968 744), part of Aussie Broadband. Provides SIP trunking, DID/Indial numbers, MS Teams Direct Routing, and Fax-to-Email. Portal: https://portal.overthewire.com.au. Smile IT holds multiple reseller accounts (NSP000019 via Trimble Networks, NSP011058 direct). Customer sub-accounts billed monthly.')
  ON DUPLICATE KEY UPDATE
    displayName='NetSIP (Aussie Broadband)', abn='19 131 968 744', supportPhone='1300 638 747', supportEmail='accounts@netsip.com.au',
    isActive=1, updatedAt=NOW()
`);
console.log('✓ NetSIP added to supplier_registry');

// ============================================================
// 2. Define the 7 NetSIP accounts / services to create
// ============================================================
const accounts = [
  {
    // Smile IT main account
    accountNum: 'NSP011058',
    invoiceNum: '0000807904',
    invoiceDate: '2026-03-13',
    period: '13 Feb 2026 – 12 Mar 2026',
    customerExternalId: null, // internal Smile IT account
    customerName: 'Smile IT Pty Ltd',
    totalMonthly: 279.66,
    sipChannels: 30,
    sipChannelRate: 1.10,
    callCharges: 54.16,
    didCost: 82.50,
    teamsCost: 110.00,
    teamsChannels: '10 (p829167p x5, p862386p x5)',
    address: '1/60 Enterprise Place, Tingalpa QLD 4173',
    notes: 'Smile IT main SIP account. 30 SIP channels @ $1.10. 2x 1300 numbers (175636, 776657). 2x 100-DID packs (322502, 354443). 50+ individual DIDs. 2x MS Teams Direct Routing trunks (5 channels each).',
    dids: [
      { number: '0261734735582', display: '02 6173 4735 582', type: 'did_block', cost: 2.20, note: '10 DID block 61734735582#' },
      { number: '0261879424020', display: '02 6187 9424 02', type: 'did_block', cost: 2.20, note: '10 DID block 6187942402#' },
      { number: '0261732250200', display: '100 DID 617322502##', type: 'did_block_100', cost: 22.00, note: '100 DID pack 617322502##' },
      { number: '0261735444300', display: '100 DID 617354443##', type: 'did_block_100', cost: 22.00, note: '100 DID pack 617354443##' },
      { number: '1300175636', display: '1300 175 636', type: '1300', cost: 11.00, note: '1300 Number' },
      { number: '1300776657', display: '1300 776 657', type: '1300', cost: 11.00, note: '1300 Number' },
      // Individual DIDs
      { number: '0261250245559', display: '02 6125 0245 559', type: 'did', cost: 0.22 },
      { number: '0261253431172', display: '02 6125 3431 172', type: 'did', cost: 0.22 },
      { number: '0261342247230', display: '02 6134 2247 230', type: 'did', cost: 0.22 },
      { number: '0261342249024', display: '02 6134 2249 024', type: 'did', cost: 0.22 },
      { number: '0261380005046', display: '02 6138 0005 046', type: 'did', cost: 0.22 },
      { number: '0261399682358', display: '02 6139 9682 358', type: 'did', cost: 0.22 },
      { number: '0261720008145', display: '02 6172 0008 145', type: 'did', cost: 0.22 },
      { number: '0261720040679', display: '02 6172 0040 679', type: 'did', cost: 0.22 },
      { number: '0261720040989', display: '02 6172 0040 989', type: 'did', cost: 0.22 },
      { number: '0261728023873', display: '02 6172 8023 873', type: 'did', cost: 0.22 },
      { number: '0261730398980', display: '02 6173 0398 980', type: 'did', cost: 0.22 },
      { number: '0261730636638', display: '02 6173 0636 638', type: 'did', cost: 0.22 },
      { number: '0261731712447', display: '02 6173 1712 447', type: 'did', cost: 0.22 },
      { number: '0261731712448', display: '02 6173 1712 448', type: 'did', cost: 0.22 },
      { number: '0261731712449', display: '02 6173 1712 449', type: 'did', cost: 0.22 },
      { number: '0261731712450', display: '02 6173 1712 450', type: 'did', cost: 0.22 },
      { number: '0261731712451', display: '02 6173 1712 451', type: 'did', cost: 0.22 },
      { number: '0261734531820', display: '02 6173 4531 820', type: 'did', cost: 0.22 },
      { number: '0261734727326', display: '02 6173 4727 326', type: 'did', cost: 0.22 },
      { number: '0261734728843', display: '02 6173 4728 843', type: 'did', cost: 0.22 },
      { number: '0261734729121', display: '02 6173 4729 121', type: 'did', cost: 0.22 },
      { number: '0261734730616', display: '02 6173 4730 616', type: 'did', cost: 0.22 },
      { number: '0261734735557', display: '02 6173 4735 557', type: 'did', cost: 0.22 },
      { number: '0261734735558', display: '02 6173 4735 558', type: 'did', cost: 0.22 },
      { number: '0261734735590', display: '02 6173 4735 590', type: 'did', cost: 0.22 },
      { number: '0261734735591', display: '02 6173 4735 591', type: 'did', cost: 0.22 },
      { number: '0261734735592', display: '02 6173 4735 592', type: 'did', cost: 0.22 },
      { number: '0261734824087', display: '02 6173 4824 087', type: 'did', cost: 0.22 },
      { number: '0261734950176', display: '02 6173 4950 176', type: 'did', cost: 0.22 },
      { number: '0261734969155', display: '02 6173 4969 155', type: 'did', cost: 0.22 },
      { number: '0261735071114', display: '02 6173 5071 114', type: 'did', cost: 0.22 },
      { number: '0261737377838', display: '02 6173 7377 838', type: 'did', cost: 0.22 },
      { number: '0261741115937', display: '02 6174 1115 937', type: 'did', cost: 0.22 },
      { number: '0261741115938', display: '02 6174 1115 938', type: 'did', cost: 0.22 },
      { number: '0261743307014', display: '02 6174 3307 014', type: 'did', cost: 0.22 },
      { number: '0261748591914', display: '02 6174 8591 914', type: 'did', cost: 0.22 },
      { number: '0261752111664', display: '02 6175 2111 664', type: 'did', cost: 0.22 },
      { number: '0261752374582', display: '02 6175 2374 582', type: 'did', cost: 0.22 },
      { number: '0261752392464', display: '02 6175 2392 464', type: 'did', cost: 0.22 },
      { number: '0261753294594', display: '02 6175 3294 594', type: 'did', cost: 0.22 },
      { number: '0261754062007', display: '02 6175 4062 007', type: 'did', cost: 0.22 },
      { number: '0261754940684', display: '02 6175 4940 684', type: 'did', cost: 0.22 },
      { number: '0261754940685', display: '02 6175 4940 685', type: 'did', cost: 0.22 },
      { number: '0261754940687', display: '02 6175 4940 687', type: 'did', cost: 0.22 },
      { number: '0261754946002', display: '02 6175 4946 002', type: 'did', cost: 0.22 },
      { number: '0261754946120', display: '02 6175 4946 120', type: 'did', cost: 0.22 },
      { number: '0261754946133', display: '02 6175 4946 133', type: 'did', cost: 0.22 },
      { number: '0261754946203', display: '02 6175 4946 203', type: 'did', cost: 0.22 },
      { number: '0261754946293', display: '02 6175 4946 293', type: 'did', cost: 0.22 },
      { number: '0261754994588', display: '02 6175 4994 588', type: 'did', cost: 0.22 },
      { number: '0261862059981', display: '02 6186 2059 981', type: 'did', cost: 0.22 },
      { number: '0261862556621', display: '02 6186 2556 621', type: 'did', cost: 0.22 },
      { number: '0261867067257', display: '02 6186 7067 257', type: 'did', cost: 0.22 },
      { number: '0261889110060', display: '02 6188 9110 060', type: 'did', cost: 0.22 },
      { number: '0261893009470', display: '02 6189 3009 470', type: 'did', cost: 0.22 },
    ]
  },
  {
    // Smile IT Wholesale/Test account
    accountNum: 'NSP011241',
    invoiceNum: '0000810154',
    invoiceDate: '2026-03-23',
    period: '23 Feb 2026 – 22 Mar 2026',
    customerExternalId: null,
    customerName: 'Smile IT Pty Ltd (Wholesale Test)',
    totalMonthly: 5.50,
    sipChannels: 5,
    sipChannelRate: 1.10,
    callCharges: 0,
    didCost: 0,
    teamsCost: 0,
    address: '1/60 Enterprise Place, Tingalpa QLD 4173',
    notes: 'Smile IT Wholesale Standard test account. 5 SIP channels only. Likely used for testing/development. Review for possible cancellation.',
    dids: []
  },
  {
    // CDI Lawyers
    accountNum: 'NSP009387',
    invoiceNum: '0000811235',
    invoiceDate: '2026-03-29',
    period: '28 Feb 2026 – 28 Mar 2026',
    customerExternalId: 'C0057',
    customerName: 'CDI Lawyers',
    totalMonthly: 413.35,
    sipChannels: 8,
    sipChannelRate: 47.30,
    callCharges: 0,
    didCost: 34.95,
    teamsCost: 0,
    teamsChannels: '4 (p476387p), Teams Unlimited Plus 43 users',
    address: '4/49 Park Rd, Milton, QLD, 4064',
    notes: 'CDI Lawyers SIP trunk. 8 SIP channels @ $47.30. 100 DID pack 617351854##. MS Teams Direct Routing 4 channels (p476387p). Teams Unlimited Plus 43 users. Billed via Trimble Networks reseller account.',
    dids: [
      { number: '0261735185400', display: '100 DID 617351854##', type: 'did_block_100', cost: 34.95, note: '100 DID pack' },
    ]
  },
  {
    // Trimble Networks own account
    accountNum: 'NSP000019',
    invoiceNum: '0000808429',
    invoiceDate: '2026-03-16',
    period: '16 Feb 2026 – 15 Mar 2026',
    customerExternalId: null, // Trimble Networks is a reseller entity, not a customer
    customerName: 'Trimble Networks Pty Ltd',
    totalMonthly: 301.67,
    sipChannels: 50,
    sipChannelRate: 2.20,
    callCharges: 48.01,
    didCost: 66.66,
    teamsCost: 77.00,
    teamsChannels: '7 channels across 3 trunks (p775905p x2, p798666p x2, p849733p x3)',
    address: 'Suite 3ab, Level 3, 5 Cribb Street, Milton QLD 4006',
    notes: 'Trimble Networks main SIP account (oldest account NSP000019). 50 SIP channels @ $2.20. 2x 100-DID packs (343896, 354441). 2x 1300 numbers (882615, 884603). 3 individual DIDs. 3x MS Teams Direct Routing trunks. Trimble Networks is a reseller entity used by Smile IT to manage customer SIP accounts.',
    dids: [
      { number: '0261734389600', display: '100 DID 617343896##', type: 'did_block_100', cost: 22.00, note: '100 DID pack' },
      { number: '0261735444100', display: '100 DID 617354441##', type: 'did_block_100', cost: 22.00, note: '100 DID pack' },
      { number: '1300882615', display: '1300 882 615', type: '1300', cost: 11.00 },
      { number: '1300884603', display: '1300 884 603', type: '1300', cost: 11.00 },
      { number: '0261733792926', display: '02 6173 3792 926', type: 'did', cost: 0.22 },
      { number: '0261738082651', display: '02 6173 8082 651', type: 'did', cost: 0.22 },
      { number: '0261738524498', display: '02 6173 8524 498', type: 'did', cost: 0.22 },
    ]
  },
  {
    // NDC Plastic Moulding
    accountNum: 'NSP010568',
    invoiceNum: '0000810021',
    invoiceDate: '2026-03-22',
    period: '22 Feb 2026 – 21 Mar 2026',
    customerExternalId: 'C0167',
    customerName: 'NDC PLASTIC MOULDING PTY LTD',
    totalMonthly: 82.15,
    sipChannels: 1,
    sipChannelRate: 47.30,
    callCharges: 0,
    didCost: 34.85,
    teamsCost: 0,
    teamsChannels: '1 channel (p681225p), Teams Unlimited Plus 43 users',
    address: '3/123 Bancroft Road, Pinkenba QLD 4008',
    notes: 'NDC Plastic Moulding SIP trunk. 1 SIP channel @ $47.30. 1 individual DID (61732163324). 2x 10-DID packs (3159305, 3709338). MS Teams Direct Routing 1 channel (p681225p). Teams Unlimited Plus 43 users. Consistent $82.15/month for 6+ months.',
    dids: [
      { number: '0261732163324', display: '02 6173 2163 324', type: 'did', cost: 4.95 },
      { number: '0261731593050', display: '10 DID 6173159305#', type: 'did_block', cost: 14.95, note: '10 DID pack' },
      { number: '0261737093380', display: '10 DID 6173709338#', type: 'did_block', cost: 14.95, note: '10 DID pack' },
    ]
  },
  {
    // Mackellar Mining
    accountNum: 'NSP010335',
    invoiceNum: '0000808337',
    invoiceDate: '2026-03-15',
    period: '15 Feb 2026 – 14 Mar 2026',
    customerExternalId: null, // NOT FOUND in DB - needs new customer
    customerName: 'Mackellar Mining',
    totalMonthly: 219.10,
    sipChannels: 4,
    sipChannelRate: 47.30,
    callCharges: 0,
    didCost: 29.90,
    teamsCost: 0,
    teamsChannels: '4 channels (p615915p), Teams Unlimited Plus 43 users',
    address: 'Billed via Trimble Networks, Suite 3ab, Level 3, 5 Cribb Street, Milton QLD 4006',
    notes: 'Mackellar Mining SIP trunk. 4 SIP channels @ $47.30. 2x 10-DID packs (4860213, 5211052). MS Teams Direct Routing 4 channels (p615915p). Teams Unlimited Plus 43 users. Consistent $219.10/month. Billed via Trimble Networks reseller account. Customer not yet in billing system — needs to be created.',
    dids: [
      { number: '0261748602130', display: '10 DID 6174860213#', type: 'did_block', cost: 14.95, note: '10 DID pack' },
      { number: '0261752110520', display: '10 DID 6175211052#', type: 'did_block', cost: 14.95, note: '10 DID pack' },
    ]
  },
  {
    // Body Corporate Systems
    accountNum: 'NSP010341',
    invoiceNum: '0000809879',
    invoiceDate: '2026-03-21',
    period: '21 Feb 2026 – 20 Mar 2026',
    customerExternalId: 'C0039',
    customerName: 'Body Corporate Systems Pty Ltd',
    totalMonthly: 256.00,
    sipChannels: 4,
    sipChannelRate: 47.30,
    callCharges: 15.00,
    didCost: 44.85,
    teamsCost: 6.95,
    teamsChannels: '4 channels (p617226p), Teams Unlimited Plus 43 users',
    address: 'Suite 106, 621 Wynnum Road, Morningside, QLD, 4170',
    notes: 'Body Corporate Systems SIP trunk. 4 SIP channels @ $47.30. 2 individual DIDs (61738990225, 61738990299). 100 DID pack (617347299##). Fax-to-Email on 61738990225 ($6.95). MS Teams Direct Routing 4 channels (p617226p). Teams Unlimited Plus 43 users. 60 calls in March (489 min, all 13/1300).',
    dids: [
      { number: '0261738990225', display: '02 6173 8990 225', type: 'did', cost: 4.95 },
      { number: '0261738990299', display: '02 6173 8990 299', type: 'did', cost: 4.95 },
      { number: '0261734729900', display: '100 DID 617347299##', type: 'did_block_100', cost: 34.95, note: '100 DID pack' },
    ]
  },
];

// ============================================================
// 3. Create a customer for Mackellar Mining (not in DB)
// ============================================================
const [existingMackellar] = await conn.execute("SELECT id FROM customers WHERE name LIKE '%Mackellar%' LIMIT 1");
if (existingMackellar.length === 0) {
  await conn.execute(`
    INSERT INTO customers (externalId, name, status, siteAddress, contactEmail, billingPlatforms, notes)
    VALUES ('C_MACK01', 'Mackellar Mining', 'active', 'Billed via Trimble Networks, Milton QLD 4006', '', '[]',
      'Customer created from NetSIP invoice NSP010335. Mackellar Mining is billed via Trimble Networks reseller account. Confirm direct contact details.')
  `);
  console.log('✓ Created customer: Mackellar Mining (C_MACK01)');
  accounts[5].customerExternalId = 'C_MACK01';
} else {
  console.log('Mackellar Mining already exists');
  accounts[5].customerExternalId = 'C_MACK01';
}

// ============================================================
// 4. Create services for each account
// ============================================================
for (const acct of accounts) {
  const serviceId = `NETSIP-${acct.accountNum}`;
  const [existing] = await conn.execute('SELECT id FROM services WHERE serviceId = ?', [serviceId]);
  if (existing.length > 0) {
    console.log(`  Service ${serviceId} already exists, updating...`);
    await conn.execute(`
      UPDATE services SET 
        supplierName='NetSIP', supplierAccount=?, planName=?, monthlyCost=?, 
        customerExternalId=?, customerName=?, locationAddress=?, notes=?, updatedAt=NOW()
      WHERE serviceId=?
    `, [acct.accountNum, `SIP Trunk (${acct.sipChannels} channels)`, acct.totalMonthly,
        acct.customerExternalId, acct.customerName, acct.address, acct.notes, serviceId]);
  } else {
    await conn.execute(`
      INSERT INTO services 
        (externalId, serviceId, serviceType, serviceTypeDetail, planName, status, supplierAccount, supplierName,
         customerExternalId, customerName, locationAddress, monthlyCost, notes, dataSource)
      VALUES (?, ?, 'VoIP', 'SIP Trunk', ?, 'active', ?, 'NetSIP', ?, ?, ?, ?, ?, 'netsip_invoice')
    `, [
      `S_NS_${acct.accountNum}`,
      serviceId,
      `SIP Trunk (${acct.sipChannels} ch @ $${acct.sipChannelRate}) + DIDs + Teams`,
      acct.accountNum,
      acct.customerExternalId,
      acct.customerName,
      acct.address,
      acct.totalMonthly,
      acct.notes
    ]);
    console.log(`✓ Created service: ${serviceId} for ${acct.customerName} ($${acct.totalMonthly}/mo)`);
  }
}

// ============================================================
// 5. Insert DID/phone numbers into phone_numbers table
// ============================================================
let didInserted = 0;
let didSkipped = 0;
for (const acct of accounts) {
  for (const did of acct.dids) {
    // Normalise number to digits only
    const normalised = did.number.replace(/\D/g, '');
    const [existing] = await conn.execute(
      'SELECT id FROM phone_numbers WHERE number = ? AND provider = ?',
      [normalised, 'NetSIP']
    );
    if (existing.length > 0) {
      didSkipped++;
      continue;
    }
    await conn.execute(`
      INSERT INTO phone_numbers 
        (number, numberDisplay, numberType, provider, status, customerExternalId, customerName,
         serviceExternalId, servicePlanName, monthlyCost, providerServiceCode, notes, dataSource)
      VALUES (?, ?, ?, 'NetSIP', 'active', ?, ?, ?, ?, ?, ?, ?, 'netsip_invoice')
    `, [
      normalised,
      did.display || normalised,
      did.type || 'did',
      acct.customerExternalId,
      acct.customerName,
      `S_NS_${acct.accountNum}`,
      `NetSIP SIP Trunk ${acct.accountNum}`,
      did.cost || 0,
      acct.accountNum,
      did.note || '',
      'netsip_invoice'
    ]);
    didInserted++;
  }
}
console.log(`✓ Phone numbers: ${didInserted} inserted, ${didSkipped} already existed`);

// ============================================================
// 6. Update supplier_registry totals
// ============================================================
const totalMonthly = accounts.reduce((s, a) => s + a.totalMonthly, 0);
await conn.execute(`
  UPDATE supplier_registry SET 
    totalServices = ?, totalMonthlyCost = ?, lastInvoiceDate = '2026-03-29', lastInvoiceNumber = '0000811235', updatedAt = NOW()
  WHERE name = 'NetSIP'
`, [accounts.length, totalMonthly.toFixed(2)]);
console.log(`✓ Updated NetSIP supplier totals: ${accounts.length} accounts, $${totalMonthly.toFixed(2)}/mo`);

await conn.end();
console.log('\n✅ NetSIP import complete');
