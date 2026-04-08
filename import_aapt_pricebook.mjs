/**
 * AAPT / PIPE Networks FAST Fibre Pricebook v8.5 Import
 * - Creates pricebook version in internet_pricebook_versions
 * - Inserts all product tiers into internet_pricebook_items
 * - Validates all 64 AAPT services against the pricebook
 * - Flags cost discrepancies
 */

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── PRICEBOOK DATA ───────────────────────────────────────────────────────────
// Source: WholesaleFASTFibrePricebookv8.5.xlsx
// All prices ex GST, AUD

// Section 1: FAST Fibre On-Net (TC2 Intrastate) - IPLine/VPN/E-Line/SIP
// Rows 98-140 of FAST Fibre sheet
// Structure: Bandwidth(Mbps) | Route1 | Route2 | Route3 (Route1 = Metro/Regional1)
const onNetTC2 = [
  // [speedMbps, route1, route2, route3]
  [5,   199,  239,  null],
  [10,  239,  279,  null],
  [20,  339,  389,  null],
  [30,  389,  439,  null],
  [40,  429,  479,  null],
  [50,  479,  529,  null],
  [100, 549,  649,  null],
  [200, 699,  849,  null],
  [500, 999, 1299,  null],
  [1000,1499,1999,  null],
];

// Section 2: FAST Fibre NBN (No NTU) TC-2 Monthly Charges
// Rows 97-129 of FAST Fibre sheet
// Metro/Regional1 | Regional2
const nbnTC2NoNTU = [
  [5,    199,  239],
  [10,   239,  279],
  [20,   339,  389],
  [30,   389,  439],
  [40,   429,  479],
  [50,   479,  529],
  ['25/10',  null, null, 59,  69],  // NBN TC4 No NTU
  ['50/20',  74,   79,   69,  79],
  ['Home Fast - 100/20', null, null, 89, 99],
  ['100/40',  99,  109,  99, 109],
  ['Home Fast - 500/50', null, null, 89, 99],
  ['Home Superfast - 750/50', null, null, 101, 111],
  ['Home Ultrafast - 1000/100', null, null, 104, 113],
  ['250/100', 110.31, 120.31, 100.31, 110.31],
  ['500/200', 149, 154, 149, 154],
  ['1000/400', 190, 195, 190, 195],
];

// Section 1.1 On-Net (with NTU) - key speeds
// From rows 9-43 of FAST Fibre sheet (1Gbps, 500Mbps, 400Mbps, 250Mbps)
const onNetWithNTU = [
  // product, option1Install, option2Install, term24mo, term36mo, term48mo
  { product: '1Gbps On-Net', install1: 0, install2: 1999, m24: 799, m36: 499, m48: 499 },
  { product: '500Mbps On-Net', install1: 0, install2: 1999, m24: 599, m36: 299, m48: 299 },
  { product: '400Mbps On-Net', install1: 0, install2: 1999, m24: 599, m36: 299, m48: 299 },
  { product: '250Mbps On-Net', install1: 0, install2: 1999, m24: 399, m36: 249, m48: 249 },
];

// NBN Enterprise Ethernet (EE) - 12 month term, Metro, Low Traffic Class
// Rows 160-163 of FAST Fibre sheet
const nbnEE12mo = [
  { speed: 100,  metroLow: 421.66, zone1Low: 528.11, metroHigh: 519.30, zone1High: 686.55 },
  { speed: 250,  metroLow: 421.66, zone1Low: 528.11, metroHigh: 519.30, zone1High: 686.55 },
  { speed: 500,  metroLow: 585.53, zone1Low: 799.80, metroHigh: 776.60, zone1High: 1119.72 },
  { speed: 1000, metroLow: 773.07, zone1Low: 1122.51, metroHigh: 993.95, zone1High: 1571.52 },
];

// NBN EE 24 month term, Metro, Low Traffic Class
const nbnEE24mo = [
  { speed: 100,  metroLow: 372.56, zone1Low: 490.41, metroHigh: 484.32, zone1High: 637.53 },
  { speed: 250,  metroLow: 372.56, zone1Low: 490.41, metroHigh: 484.32, zone1High: 637.53 },
  { speed: 500,  metroLow: 514.31, zone1Low: 738.47, metroHigh: 692.50, zone1High: 1033.51 },
  { speed: 1000, metroLow: 692.50, zone1Low: 1033.51, metroHigh: 900.00, zone1High: 1400.00 },
];

// SIP Voice - PAYG Monthly Recurring (from SIP PAYG NRC & MRC sheet)
// Per-channel pricing
const sipPaygMRC = [
  { sessions: '1-10',    pricePerChannel: 2 },
  { sessions: '11-50',   pricePerChannel: 2 },
  { sessions: '51-110',  pricePerChannel: 2 },
  { sessions: '120-200', pricePerChannel: 2 },
  { sessions: '250-500', pricePerChannel: 2 },
  { sessions: '600-1000',pricePerChannel: 2 },
];

// SIP Feature charges
const sipFeatures = [
  { feature: 'In-dial Number Range - 100 numbers', mrc: 30 },
  { feature: 'In-dial Number Range - 50 numbers',  mrc: 20 },
  { feature: 'In-dial Number Range - 10 numbers',  mrc: 10 },
  { feature: 'National Number Hosting',             mrc: 0  },
  { feature: 'Disaster Recovery Redirection Maintenance', mrc: 20 },
];

// ─── STEP 1: Create pricebook version ────────────────────────────────────────
console.log('=== STEP 1: Creating AAPT pricebook version ===');

const [existing] = await conn.execute(
  `SELECT id FROM internet_pricebook_versions WHERE label LIKE 'AAPT%v8.5%' LIMIT 1`
);

let versionId;
if (existing.length > 0) {
  versionId = existing[0].id;
  console.log(`AAPT pricebook v8.5 already exists, id: ${versionId} — refreshing items`);
  await conn.execute(`DELETE FROM internet_pricebook_items WHERE versionId = ?`, [versionId]);
} else {
  const [result] = await conn.execute(
    `INSERT INTO internet_pricebook_versions (label, sourceFile, effectiveDate, importedBy, notes)
     VALUES (?, ?, ?, ?, ?)`,
    ['AAPT FAST Fibre Pricebook v8.5', 'WholesaleFASTFibrePricebookv8.5.xlsx', '2026-01-01', 'SmileTel Billing Recon', 'PIPE Networks Wholesale FAST Fibre Pricebook v8.5. Reference only — use Frontier portal for live quoting/ordering.']
  );
  versionId = result.insertId;
  console.log(`Created AAPT pricebook version, id: ${versionId}`);
}

// ─── STEP 2: Insert pricebook items ──────────────────────────────────────────
console.log('\n=== STEP 2: Inserting pricebook items ===');

const items = [];

// NBN TC-4 No NTU (most common - the standard NBN products)
const nbnTC4Products = [
  { speedTier: '25/10Mbps',   tech: 'NBN',  region: 'Metro',     cost: null,   note: 'N/A Metro' },
  { speedTier: '25/10Mbps',   tech: 'NBN',  region: 'Regional2', cost: 59,     note: 'Regional 2 only' },
  { speedTier: '50/20Mbps',   tech: 'NBN',  region: 'Metro',     cost: 74,     note: '12mo term' },
  { speedTier: '50/20Mbps',   tech: 'NBN',  region: 'Regional1', cost: 79,     note: '12mo term' },
  { speedTier: '50/20Mbps',   tech: 'NBN',  region: 'Regional2', cost: 69,     note: '12mo term' },
  { speedTier: '100/20Mbps',  tech: 'NBN',  region: 'Regional2', cost: 89,     note: 'Home Fast - FTTB/FTTN/FTTC only' },
  { speedTier: '100/40Mbps',  tech: 'NBN',  region: 'Metro',     cost: 99,     note: '12mo term' },
  { speedTier: '100/40Mbps',  tech: 'NBN',  region: 'Regional1', cost: 109,    note: '12mo term' },
  { speedTier: '100/40Mbps',  tech: 'NBN',  region: 'Regional2', cost: 99,     note: '12mo term' },
  { speedTier: '500/50Mbps',  tech: 'FTTP', region: 'Regional2', cost: 89,     note: 'Home Fast - FTTP/HFC only' },
  { speedTier: '750/50Mbps',  tech: 'FTTP', region: 'Regional2', cost: 101,    note: 'Home Superfast - FTTP/HFC only' },
  { speedTier: '1000/100Mbps',tech: 'FTTP', region: 'Regional2', cost: 104,    note: 'Home Ultrafast - FTTP/HFC only' },
  { speedTier: '250/100Mbps', tech: 'NBN',  region: 'Metro',     cost: 110.31, note: '12mo term' },
  { speedTier: '250/100Mbps', tech: 'NBN',  region: 'Regional1', cost: 120.31, note: '12mo term' },
  { speedTier: '250/100Mbps', tech: 'NBN',  region: 'Regional2', cost: 100.31, note: '12mo term' },
  { speedTier: '500/200Mbps', tech: 'NBN',  region: 'Metro',     cost: 149,    note: '12mo term' },
  { speedTier: '500/200Mbps', tech: 'NBN',  region: 'Regional1', cost: 154,    note: '12mo term' },
  { speedTier: '1000/400Mbps',tech: 'NBN',  region: 'Metro',     cost: 190,    note: '12mo term' },
  { speedTier: '1000/400Mbps',tech: 'NBN',  region: 'Regional1', cost: 195,    note: '12mo term' },
];

// On-Net (dedicated fibre) products
const onNetProducts = [
  { speedTier: '250Mbps',  tech: 'Fibre', region: 'Metro', cost: 249, contractTerm: '36mo', note: 'On-Net dedicated fibre, 36/48mo' },
  { speedTier: '400Mbps',  tech: 'Fibre', region: 'Metro', cost: 299, contractTerm: '36mo', note: 'On-Net dedicated fibre, 36/48mo' },
  { speedTier: '500Mbps',  tech: 'Fibre', region: 'Metro', cost: 299, contractTerm: '36mo', note: 'On-Net dedicated fibre, 36/48mo' },
  { speedTier: '1Gbps',    tech: 'Fibre', region: 'Metro', cost: 499, contractTerm: '36mo', note: 'On-Net dedicated fibre, 36/48mo' },
  { speedTier: '250Mbps',  tech: 'Fibre', region: 'Metro', cost: 399, contractTerm: '24mo', note: 'On-Net dedicated fibre, 24mo' },
  { speedTier: '400Mbps',  tech: 'Fibre', region: 'Metro', cost: 599, contractTerm: '24mo', note: 'On-Net dedicated fibre, 24mo' },
  { speedTier: '500Mbps',  tech: 'Fibre', region: 'Metro', cost: 599, contractTerm: '24mo', note: 'On-Net dedicated fibre, 24mo' },
  { speedTier: '1Gbps',    tech: 'Fibre', region: 'Metro', cost: 799, contractTerm: '24mo', note: 'On-Net dedicated fibre, 24mo' },
];

// NBN EE products
const nbnEEProducts = [
  { speedTier: '100Mbps',  tech: 'NBN-EE', region: 'Metro',  trafficClass: 'Low',  cost: 421.66, contractTerm: '12mo' },
  { speedTier: '100Mbps',  tech: 'NBN-EE', region: 'Zone1',  trafficClass: 'Low',  cost: 528.11, contractTerm: '12mo' },
  { speedTier: '100Mbps',  tech: 'NBN-EE', region: 'Metro',  trafficClass: 'High', cost: 519.30, contractTerm: '12mo' },
  { speedTier: '100Mbps',  tech: 'NBN-EE', region: 'Zone1',  trafficClass: 'High', cost: 686.55, contractTerm: '12mo' },
  { speedTier: '500Mbps',  tech: 'NBN-EE', region: 'Metro',  trafficClass: 'Low',  cost: 585.53, contractTerm: '12mo' },
  { speedTier: '500Mbps',  tech: 'NBN-EE', region: 'Zone1',  trafficClass: 'Low',  cost: 799.80, contractTerm: '12mo' },
  { speedTier: '1000Mbps', tech: 'NBN-EE', region: 'Metro',  trafficClass: 'Low',  cost: 773.07, contractTerm: '12mo' },
  { speedTier: '100Mbps',  tech: 'NBN-EE', region: 'Metro',  trafficClass: 'Low',  cost: 372.56, contractTerm: '24mo' },
  { speedTier: '100Mbps',  tech: 'NBN-EE', region: 'Zone1',  trafficClass: 'Low',  cost: 490.41, contractTerm: '24mo' },
  { speedTier: '500Mbps',  tech: 'NBN-EE', region: 'Metro',  trafficClass: 'Low',  cost: 514.31, contractTerm: '24mo' },
  { speedTier: '1000Mbps', tech: 'NBN-EE', region: 'Metro',  trafficClass: 'Low',  cost: 692.50, contractTerm: '24mo' },
];

// SIP Voice products
const sipProducts = [
  { speedTier: 'SIP Channel', tech: 'SIP', region: 'National', cost: 2.00, contractTerm: 'month', note: 'Per concurrent session/channel, PAYG' },
  { speedTier: 'DID 100-block', tech: 'SIP', region: 'National', cost: 30.00, contractTerm: 'month', note: 'In-dial 100 number range' },
  { speedTier: 'DID 50-block',  tech: 'SIP', region: 'National', cost: 20.00, contractTerm: 'month', note: 'In-dial 50 number range' },
  { speedTier: 'DID 10-block',  tech: 'SIP', region: 'National', cost: 10.00, contractTerm: 'month', note: 'In-dial 10 number range' },
];

const allProducts = [
  ...nbnTC4Products.filter(p => p.cost !== null).map(p => ({
    productCode: `AAPT-NBN-TC4-${p.speedTier.replace('/','_')}-${p.region}`,
    speedTier: p.speedTier,
    serviceType: 'Internet',
    supportTier: 'standard',
    contractTerm: '12mo',
    wholesaleCost: p.cost,
    sellPrice: Math.round((p.cost / 0.70) * 100) / 100,
    supportNote: p.note || null,
    tech: p.tech,
    region: p.region,
  })),
  ...onNetProducts.map(p => ({
    productCode: `AAPT-OnNet-${p.speedTier}-${p.contractTerm}`,
    speedTier: p.speedTier,
    serviceType: 'Internet',
    supportTier: 'premium',
    contractTerm: p.contractTerm,
    wholesaleCost: p.cost,
    sellPrice: Math.round((p.cost / 0.70) * 100) / 100,
    supportNote: p.note || null,
  })),
  ...nbnEEProducts.map(p => ({
    productCode: `AAPT-NBN-EE-${p.speedTier}-${p.region}-${p.trafficClass}-${p.contractTerm}`,
    speedTier: p.speedTier,
    serviceType: 'Internet',
    supportTier: 'enterprise',
    contractTerm: p.contractTerm,
    wholesaleCost: p.cost,
    sellPrice: Math.round((p.cost / 0.70) * 100) / 100,
    supportNote: `NBN EE ${p.trafficClass} Traffic, ${p.region}`,
  })),
  ...sipProducts.map(p => ({
    productCode: `AAPT-SIP-${p.speedTier.replace(/ /g,'-')}`,
    speedTier: p.speedTier,
    serviceType: 'Voice',
    supportTier: 'standard',
    contractTerm: p.contractTerm,
    wholesaleCost: p.cost,
    sellPrice: Math.round((p.cost / 0.70) * 100) / 100,
    supportNote: p.note || null,
  })),
];

let inserted = 0;
for (const item of allProducts) {
  const gp = Math.round((item.sellPrice - item.wholesaleCost) * 100) / 100;
  const mp = item.sellPrice > 0 ? Math.round(((item.sellPrice - item.wholesaleCost) / item.sellPrice) * 1000000) / 1000000 : 0;
  await conn.execute(
    `INSERT INTO internet_pricebook_items
     (versionId, productCode, speedTier, serviceType, supportTier, contractTerm, wholesaleCost, sellPrice, grossProfit, marginPercent, supportNote, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [versionId, item.productCode, item.speedTier, item.serviceType, item.supportTier,
     item.contractTerm || 'month', item.wholesaleCost, item.sellPrice, gp, mp, item.supportNote || null]
  );
  inserted++;
}
console.log(`Inserted ${inserted} pricebook items`);

// ─── STEP 3: Validate active AAPT services ───────────────────────────────────
console.log('\n=== STEP 3: Validating AAPT services ===');

const [aaptServices] = await conn.execute(`
  SELECT s.id, s.serviceId, s.serviceType, s.technology, s.speedTier, s.monthlyCost,
         s.status, s.planName, s.locationAddress, c.name as customerName
  FROM services s
  LEFT JOIN customers c ON s.customerExternalId = c.externalId
  WHERE s.provider = 'AAPT'
  ORDER BY s.serviceType, s.speedTier, c.name
`);

console.log(`Total AAPT services: ${aaptServices.length}`);

// Build expected cost map from pricebook
// Key: speedTier normalised -> expected cost range
const expectedCosts = {
  // NBN TC4 standard speeds (Metro)
  '50/20': { min: 69, max: 79, typical: 74 },
  '50/20mbps': { min: 69, max: 79, typical: 74 },
  '100/40': { min: 99, max: 109, typical: 99 },
  '100/40mbps': { min: 99, max: 109, typical: 99 },
  '250/100': { min: 100.31, max: 120.31, typical: 110.31 },
  '250/100mbps': { min: 100.31, max: 120.31, typical: 110.31 },
  '500/200': { min: 149, max: 154, typical: 149 },
  '1000/400': { min: 190, max: 195, typical: 190 },
  // On-Net
  '250mbps': { min: 249, max: 399, typical: 299 },
  '500mbps': { min: 299, max: 599, typical: 399 },
  '1gbps': { min: 499, max: 799, typical: 599 },
  '1000mbps': { min: 499, max: 799, typical: 599 },
  // NBN EE
  '100mbps ee': { min: 372, max: 686, typical: 422 },
};

let matched = 0, costOk = 0, costWrong = 0, noSpeed = 0, unmatched = 0;
const discrepancies = [];
const noSpeedList = [];

for (const svc of aaptServices) {
  if (svc.status === 'unmatched') { unmatched++; continue; }

  const speedKey = (svc.speedTier || '').toLowerCase().trim();
  const cost = parseFloat(svc.monthlyCost) || 0;

  if (!speedKey) {
    noSpeed++;
    noSpeedList.push({ id: svc.id, serviceId: svc.serviceId, customer: svc.customerName, cost, plan: svc.planName });
    continue;
  }

  matched++;
  const expected = expectedCosts[speedKey];
  if (expected) {
    if (cost >= expected.min * 0.9 && cost <= expected.max * 1.1) {
      costOk++;
    } else {
      costWrong++;
      discrepancies.push({
        id: svc.id, serviceId: svc.serviceId, customer: svc.customerName,
        speedTier: svc.speedTier, actualCost: cost,
        expectedRange: `$${expected.min}–$${expected.max}`, typicalCost: expected.typical
      });
    }
  } else {
    // Speed tier not in our map — flag for review
    costWrong++;
    discrepancies.push({
      id: svc.id, serviceId: svc.serviceId, customer: svc.customerName,
      speedTier: svc.speedTier, actualCost: cost,
      expectedRange: 'Unknown speed tier', typicalCost: null
    });
  }
}

console.log(`\nValidation Results:`);
console.log(`  Active/matched services: ${matched}`);
console.log(`  Cost within expected range: ${costOk}`);
console.log(`  Cost discrepancies: ${costWrong}`);
console.log(`  No speed tier recorded: ${noSpeed}`);
console.log(`  Unmatched (no customer): ${unmatched}`);

if (discrepancies.length > 0) {
  console.log(`\nCost discrepancies:`);
  discrepancies.forEach(d => {
    console.log(`  [${d.id}] ${(d.customer||'?').substring(0,40)} | ${d.speedTier} | Actual: $${d.actualCost} | Expected: ${d.expectedRange}`);
  });
}

if (noSpeedList.length > 0) {
  console.log(`\nServices with no speed tier (need manual review):`);
  noSpeedList.forEach(s => {
    console.log(`  [${s.id}] ${(s.customer||'?').substring(0,40)} | SvcID: ${s.serviceId} | Cost: $${s.cost} | Plan: ${(s.planName||'').substring(0,40)}`);
  });
}

// ─── STEP 4: Update supplier record ──────────────────────────────────────────
console.log('\n=== STEP 4: Updating AAPT supplier record ===');
const [suppCheck] = await conn.execute(
  `SELECT id FROM supplier_registry WHERE name = 'AAPT' OR name = 'PIPE Networks' LIMIT 1`
);
if (suppCheck.length > 0) {
  await conn.execute(
    `UPDATE supplier_registry SET
       notes = 'PIPE Networks Wholesale FAST Fibre. Pricebook v8.5 loaded. Use Frontier portal (https://frontier.aapt.com.au) for live quoting and ordering — pricebook is reference only and updated periodically.',
       updatedAt = NOW()
     WHERE id = ?`,
    [suppCheck[0].id]
  );
  console.log('Updated AAPT supplier record');
} else {
  console.log('AAPT supplier not found in registry — may need manual creation');
}

await conn.end();
console.log('\n=== AAPT pricebook import complete ===');
