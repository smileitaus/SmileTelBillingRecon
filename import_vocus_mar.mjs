/**
 * Vocus March 2026 Wholesale Invoice Import
 * - Creates Vocus pricebook version with 14 SVC product codes
 * - Matches 58 invoice service IDs to DB services and updates monthlyCost
 * - Creates Static IP add-on service records ($2.00/mo) for 25 services
 * - Flags unmatched invoice services as new/unknown
 * - Flags DB Vocus services not on invoice as possible cancellations
 * - Stores pro-rata credits as discoveryNotes
 */

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── 1. PRICEBOOK ─────────────────────────────────────────────────────────────
console.log('\n=== STEP 1: Creating Vocus Pricebook Version ===');

// Check if a Vocus version already exists
const [existingVers] = await conn.execute(
  "SELECT id FROM internet_pricebook_versions WHERE label LIKE 'Vocus%' LIMIT 1"
);

let versionId;
if (existingVers.length > 0) {
  versionId = existingVers[0].id;
  console.log('Vocus pricebook version already exists, id:', versionId, '— updating items');
  await conn.execute('DELETE FROM internet_pricebook_items WHERE versionId = ?', [versionId]);
} else {
  const [ins] = await conn.execute(
    `INSERT INTO internet_pricebook_versions (label, sourceFile, effectiveDate, importedAt, importedBy, notes)
     VALUES (?, ?, ?, NOW(), ?, ?)`,
    [
      'Vocus Wholesale Mar 2026',
      'Vocus-Wholesale-Mar.pdf',
      '2026-03-01',
      'system-import',
      'Imported from Vocus M2 Wholesale invoice #13277326 dated 4 March 2026'
    ]
  );
  versionId = ins.insertId;
  console.log('Created Vocus pricebook version, id:', versionId);
}

// The 14 SVC product codes from the invoice
const pricebookItems = [
  // SVC code, speedTier, serviceType, technology, wholesaleCost, note
  { code: 'SVC#5934', speedTier: '25/5Mbps',    svcType: 'nbn', tech: 'WLS',  cost: 49.52 },
  { code: 'SVC#5937', speedTier: '50/20Mbps',   svcType: 'nbn', tech: 'FTTP', cost: 66.35 },
  { code: 'SVC#5938', speedTier: '50/20Mbps',   svcType: 'nbn', tech: 'WLS',  cost: 66.35, note: 'FWPlus NSX WLS' },
  { code: 'SVC#5939', speedTier: '100/40Mbps',  svcType: 'nbn', tech: 'FTTP', cost: 76.19 },
  { code: 'SVC#5944', speedTier: '100/40Mbps',  svcType: 'nbn', tech: 'FTTB', cost: 76.19 },
  { code: 'SVC#5948', speedTier: '50/20Mbps',   svcType: 'nbn', tech: 'FTTN', cost: 66.35 },
  { code: 'SVC#5949', speedTier: '100/40Mbps',  svcType: 'nbn', tech: 'FTTN', cost: 76.19 },
  { code: 'SVC#5953', speedTier: '50/20Mbps',   svcType: 'nbn', tech: 'HFC',  cost: 66.35 },
  { code: 'SVC#5954', speedTier: '100/40Mbps',  svcType: 'nbn', tech: 'HFC',  cost: 76.19 },
  { code: 'SVC#6303', speedTier: '50/20Mbps',   svcType: 'nbn', tech: 'FttC', cost: 66.35 },
  { code: 'SVC#6304', speedTier: '100/40Mbps',  svcType: 'nbn', tech: 'FttC', cost: 76.19 },
  { code: 'SVC#6722', speedTier: '750/50Mbps',  svcType: 'nbn', tech: 'FTTP', cost: 78.93 },
  { code: 'SVC#6862', speedTier: '250/100Mbps', svcType: 'nbn', tech: 'FTTP', cost: 76.19 },
  { code: 'SVC#45',   speedTier: 'Static IP',   svcType: 'addon', tech: '',   cost: 2.00,  note: 'Static IP add-on per service' },
];

for (const item of pricebookItems) {
  // Estimate sell price at ~30% margin
  const sellPrice = Math.round((item.cost / 0.70) * 100) / 100;
  const gp = Math.round((sellPrice - item.cost) * 100) / 100;
  const mp = Math.round(((sellPrice - item.cost) / sellPrice) * 1000000) / 1000000;
  await conn.execute(
    `INSERT INTO internet_pricebook_items
     (versionId, productCode, speedTier, serviceType, supportTier, contractTerm, wholesaleCost, sellPrice, grossProfit, marginPercent, supportNote, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [versionId, item.code, `${item.speedTier} ${item.tech}`.trim(), item.svcType, 'standard', 'month', item.cost, sellPrice, gp, mp, item.note || null]
  );
}
console.log(`Inserted ${pricebookItems.length} pricebook items`);

// ─── 2. INVOICE DATA ──────────────────────────────────────────────────────────
// All 58 Vocus service IDs from the March invoice with their SVC codes and costs
const invoiceServices = [
  { vocusId: '12777454', svcCode: 'SVC#6722', cost: 78.93, tech: 'FTTP', speed: '750/50Mbps' },
  { vocusId: '12781447', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps' },
  { vocusId: '12793239', svcCode: 'SVC#5938', cost: 66.35, tech: 'WLS',  speed: '50/20Mbps' },
  { vocusId: '12796473', svcCode: 'SVC#5938', cost: 66.35, tech: 'WLS',  speed: '50/20Mbps' },
  { vocusId: '12846107', svcCode: 'SVC#5949', cost: 76.19, tech: 'FTTN', speed: '100/40Mbps' },
  { vocusId: '12852129', svcCode: 'SVC#5948', cost: 66.35, tech: 'FTTN', speed: '50/20Mbps' },
  { vocusId: '12853040', svcCode: 'SVC#5944', cost: 76.19, tech: 'FTTB', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '12853154', svcCode: 'SVC#5948', cost: 66.35, tech: 'FTTN', speed: '50/20Mbps' },
  { vocusId: '12855904', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '12864339', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '12864340', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '12866076', svcCode: 'SVC#5948', cost: 66.35, tech: 'FTTN', speed: '50/20Mbps', hasStaticIp: true },
  { vocusId: '12867108', svcCode: 'SVC#5948', cost: 66.35, tech: 'FTTN', speed: '50/20Mbps', hasStaticIp: true },
  { vocusId: '12867121', svcCode: 'SVC#5948', cost: 66.35, tech: 'FTTN', speed: '50/20Mbps' },
  { vocusId: '12871411', svcCode: 'SVC#5954', cost: 76.19, tech: 'HFC',  speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '12888064', svcCode: 'SVC#6303', cost: 66.35, tech: 'FttC', speed: '50/20Mbps', hasStaticIp: true },
  { vocusId: '12888300', svcCode: 'SVC#6303', cost: 66.35, tech: 'FttC', speed: '50/20Mbps', hasStaticIp: true },
  { vocusId: '12902124', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps' },
  { vocusId: '12902317', svcCode: 'SVC#5944', cost: 76.19, tech: 'FTTB', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '12925075', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps' },
  { vocusId: '12937523', svcCode: 'SVC#5953', cost: 66.35, tech: 'HFC',  speed: '50/20Mbps' },
  { vocusId: '12972968', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '12980462', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '12981103', svcCode: 'SVC#5944', cost: 76.19, tech: 'FTTB', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '12988924', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '12994107', svcCode: 'SVC#5938', cost: 66.35, tech: 'WLS',  speed: '50/20Mbps' },
  { vocusId: '13014291', svcCode: 'SVC#5954', cost: 76.19, tech: 'HFC',  speed: '100/40Mbps' },
  { vocusId: '13015790', svcCode: 'SVC#5949', cost: 76.19, tech: 'FTTN', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '13034176', svcCode: 'SVC#5944', cost: 76.19, tech: 'FTTB', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '13040423', svcCode: 'SVC#5938', cost: 66.35, tech: 'WLS',  speed: '50/20Mbps' },
  { vocusId: '13040427', svcCode: 'SVC#5938', cost: 66.35, tech: 'WLS',  speed: '50/20Mbps' },
  { vocusId: '13061244', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps' },
  { vocusId: '13072517', svcCode: 'SVC#5934', cost: 49.52, tech: 'WLS',  speed: '25/5Mbps' },
  { vocusId: '13073719', svcCode: 'SVC#6304', cost: 76.19, tech: 'FttC', speed: '100/40Mbps' },
  { vocusId: '13078321', svcCode: 'SVC#5944', cost: 76.19, tech: 'FTTB', speed: '100/40Mbps' },
  { vocusId: '13081361', svcCode: 'SVC#6304', cost: 76.19, tech: 'FttC', speed: '100/40Mbps' },
  { vocusId: '13083495', svcCode: 'SVC#5938', cost: 66.35, tech: 'WLS',  speed: '50/20Mbps', hasStaticIp: true },
  { vocusId: '13091679', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps' },
  { vocusId: '13105841', svcCode: 'SVC#5944', cost: 76.19, tech: 'FTTB', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '13146454', svcCode: 'SVC#5948', cost: 66.35, tech: 'FTTN', speed: '50/20Mbps' },
  { vocusId: '13146570', svcCode: 'SVC#6304', cost: 76.19, tech: 'FttC', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '13147300', svcCode: 'SVC#5949', cost: 76.19, tech: 'FTTN', speed: '100/40Mbps' },
  { vocusId: '13153500', svcCode: 'SVC#5944', cost: 76.19, tech: 'FTTB', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '13165768', svcCode: 'SVC#5949', cost: 76.19, tech: 'FTTN', speed: '100/40Mbps' },
  { vocusId: '13168568', svcCode: 'SVC#6862', cost: 76.19, tech: 'FTTP', speed: '250/100Mbps', hasStaticIp: true },
  { vocusId: '13197601', svcCode: 'SVC#5954', cost: 76.19, tech: 'HFC',  speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '13203944', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '13207099', svcCode: 'SVC#5953', cost: 66.35, tech: 'HFC',  speed: '50/20Mbps' },
  { vocusId: '13251072', svcCode: 'SVC#5949', cost: 76.19, tech: 'FTTN', speed: '100/40Mbps' },
  { vocusId: '13259229', svcCode: 'SVC#5949', cost: 76.19, tech: 'FTTN', speed: '100/40Mbps' },
  { vocusId: '13259230', svcCode: 'SVC#5949', cost: 76.19, tech: 'FTTN', speed: '100/40Mbps' },
  { vocusId: '13264619', svcCode: 'SVC#5949', cost: 76.19, tech: 'FTTN', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '13270902', svcCode: 'SVC#5937', cost: 66.35, tech: 'FTTP', speed: '50/20Mbps' },
  { vocusId: '13300275', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps', hasStaticIp: true },
  { vocusId: '13317997', svcCode: 'SVC#5937', cost: 66.35, tech: 'FTTP', speed: '50/20Mbps' },
  { vocusId: '13335564', svcCode: 'SVC#5937', cost: 66.35, tech: 'FTTP', speed: '50/20Mbps' },
  { vocusId: '13353950', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps' },
  { vocusId: '13360383', svcCode: 'SVC#5939', cost: 76.19, tech: 'FTTP', speed: '100/40Mbps' },
];

// Pro-rata credits (mid-month activations/cancellations — note only, no cost change)
const proRataCredits = [
  { vocusId: '13078321', note: 'Pro-rata credit: NBN 100/40 FTTB — activated 01-Feb-2026, credit $0.00 (full month)' },
  { vocusId: '13270902', note: 'Pro-rata credit: 50/20 FTTP — partial month credit applied' },
  { vocusId: '13317997', note: 'Pro-rata credit: 50/20 FTTP — partial month credit applied' },
  { vocusId: '13335564', note: 'Pro-rata credit: 50/20 FTTP — partial month credit applied' },
];

// ─── 3. MATCH INVOICE SERVICES TO DB ─────────────────────────────────────────
console.log('\n=== STEP 2: Matching invoice services to DB ===');

// Get all Vocus services from DB
const [dbVocusServices] = await conn.execute(
  "SELECT id, externalId, serviceId, serviceType, technology, speedTier, monthlyCost, customerName, customerExternalId, locationAddress, status FROM services WHERE provider IN ('Vocus','Optus') ORDER BY serviceId"
);

const dbById = {};
for (const svc of dbVocusServices) {
  if (svc.serviceId) dbById[svc.serviceId] = svc;
}

let matched = 0, notInDb = 0, updated = 0;
const unmatchedInvoice = [];
const staticIpToCreate = [];

for (const inv of invoiceServices) {
  const dbSvc = dbById[inv.vocusId];
  if (!dbSvc) {
    notInDb++;
    unmatchedInvoice.push(inv);
    console.log(`  NOT IN DB: Vocus #${inv.vocusId} (${inv.speed} ${inv.tech} @ $${inv.cost})`);
    continue;
  }

  matched++;
  const oldCost = parseFloat(dbSvc.monthlyCost) || 0;
  
  // Update cost, technology, speedTier, and add invoice note
  const proRataNote = proRataCredits.find(c => c.vocusId === inv.vocusId);
  const noteText = `Vocus invoice Mar-2026: ${inv.svcCode} ${inv.speed} ${inv.tech} @ $${inv.cost}/mo ex GST.${proRataNote ? ' ' + proRataNote.note : ''}`;
  
  await conn.execute(
    `UPDATE services SET 
       monthlyCost = ?,
       technology = ?,
       speedTier = ?,
       discoveryNotes = CONCAT(IFNULL(discoveryNotes,''), ?)
     WHERE id = ?`,
    [inv.cost, inv.tech, inv.speed, '\n[Vocus Mar-2026] ' + noteText, dbSvc.id]
  );
  updated++;

  if (oldCost !== inv.cost) {
    console.log(`  UPDATED: #${inv.vocusId} ${dbSvc.customerName?.substring(0,30)} — cost $${oldCost} → $${inv.cost}`);
  }

  // Queue Static IP add-on creation
  if (inv.hasStaticIp) {
    staticIpToCreate.push({ parentId: inv.vocusId, parentDbId: dbSvc.id, customerName: dbSvc.customerName, customerExternalId: dbSvc.customerExternalId, locationAddress: dbSvc.locationAddress });
  }
}

console.log(`\nMatched: ${matched} | Updated: ${updated} | Not in DB: ${notInDb}`);

// ─── 4. CREATE STATIC IP ADD-ON RECORDS ──────────────────────────────────────
console.log('\n=== STEP 3: Creating Static IP add-on service records ===');

let staticCreated = 0;
for (const sip of staticIpToCreate) {
  // Check if already exists
  const [existing] = await conn.execute(
    "SELECT id FROM services WHERE serviceId = ? AND serviceType = 'Static IP'",
    [`${sip.parentId}-staticip`]
  );
  if (existing.length > 0) {
    console.log(`  SKIP (exists): Static IP for #${sip.parentId}`);
    continue;
  }

  const extId = `VSIP-${sip.parentId}`;
  await conn.execute(
    `INSERT INTO services 
     (externalId, serviceId, serviceType, serviceCategory, provider, monthlyCost, status,
      customerName, customerExternalId, locationAddress, planName, discoveryNotes, createdAt, updatedAt)
     VALUES (?, ?, 'Static IP', 'Internet Add-on', 'Vocus', 2.00, 'active',
             ?, ?, ?, 'Vocus Static IP Add-on (SVC#45)', ?, NOW(), NOW())`,
    [
      extId,
      `${sip.parentId}-staticip`,
      sip.customerName || null,
      sip.customerExternalId || null,
      sip.locationAddress || null,
      `Static IP add-on for Vocus NBN service #${sip.parentId}. Vocus invoice Mar-2026: SVC#45 @ $2.00/mo ex GST.`
    ]
  );
  staticCreated++;
  console.log(`  CREATED: Static IP for #${sip.parentId} (${sip.customerName?.substring(0,30)})`);
}
console.log(`Static IP records created: ${staticCreated}`);

// ─── 5. FLAG DB SERVICES NOT ON INVOICE ──────────────────────────────────────
console.log('\n=== STEP 4: Flagging DB Vocus services not on invoice ===');

const invoiceIds = new Set(invoiceServices.map(i => i.vocusId));
let flagged = 0;

for (const dbSvc of dbVocusServices) {
  if (!dbSvc.serviceId) continue;
  if (dbSvc.serviceType === 'Static IP') continue; // Skip add-ons
  if (dbSvc.serviceType === 'Mobile' || dbSvc.serviceType === 'Mobile Data') continue; // SIMs handled separately
  
  if (!invoiceIds.has(dbSvc.serviceId)) {
    // Not on invoice — flag for investigation
    await conn.execute(
      `UPDATE services SET 
         discoveryNotes = CONCAT(IFNULL(discoveryNotes,''), ?)
       WHERE id = ?`,
      ['\n[Vocus Mar-2026] ⚠️ NOT ON INVOICE — possible cancellation or billing change. Investigate.', dbSvc.id]
    );
    flagged++;
    console.log(`  FLAGGED NOT ON INVOICE: #${dbSvc.serviceId} ${dbSvc.customerName?.substring(0,30)} (${dbSvc.serviceType} ${dbSvc.technology} ${dbSvc.speedTier}) @ $${dbSvc.monthlyCost}`);
  }
}
console.log(`Services flagged as not on invoice: ${flagged}`);

// ─── 6. CREATE UNMATCHED INVOICE SERVICE RECORDS ─────────────────────────────
console.log('\n=== STEP 5: Creating unmatched invoice service records ===');

for (const inv of unmatchedInvoice) {
  const extId = `VUNM-${inv.vocusId}`;
  const [existing] = await conn.execute('SELECT id FROM services WHERE externalId = ?', [extId]);
  if (existing.length > 0) {
    console.log(`  SKIP (exists): ${extId}`);
    continue;
  }

  await conn.execute(
    `INSERT INTO services
     (externalId, serviceId, serviceType, serviceCategory, provider, monthlyCost, status,
      planName, technology, speedTier, discoveryNotes, createdAt, updatedAt)
     VALUES (?, ?, 'Internet', 'NBN', 'Vocus', ?, 'unmatched',
             ?, ?, ?, ?, NOW(), NOW())`,
    [
      extId,
      inv.vocusId,
      inv.cost,
      `Vocus ${inv.speed} ${inv.tech} NSX (${inv.svcCode})`,
      inv.tech,
      inv.speed,
      `[Vocus Mar-2026] Invoice service not matched to any customer in DB. ${inv.svcCode} ${inv.speed} ${inv.tech} @ $${inv.cost}/mo. Requires manual customer assignment.`
    ]
  );
  console.log(`  CREATED UNMATCHED: #${inv.vocusId} (${inv.speed} ${inv.tech} @ $${inv.cost})`);
}

// ─── 7. SUMMARY ──────────────────────────────────────────────────────────────
console.log('\n=== SUMMARY ===');
const [totalVocus] = await conn.execute("SELECT COUNT(*) as c FROM services WHERE provider IN ('Vocus','Optus')");
const [withCost] = await conn.execute("SELECT COUNT(*) as c FROM services WHERE provider IN ('Vocus','Optus') AND monthlyCost > 0");
const [staticIps] = await conn.execute("SELECT COUNT(*) as c FROM services WHERE provider='Vocus' AND serviceType='Static IP'");
const [unmatched] = await conn.execute("SELECT COUNT(*) as c FROM services WHERE provider='Vocus' AND status='unmatched'");
const [notOnInv] = await conn.execute("SELECT COUNT(*) as c FROM services WHERE provider IN ('Vocus','Optus') AND discoveryNotes LIKE '%NOT ON INVOICE%'");

console.log(`Total Vocus/Optus services in DB: ${totalVocus[0].c}`);
console.log(`Services with cost > $0: ${withCost[0].c}`);
console.log(`Static IP add-on records: ${staticIps[0].c}`);
console.log(`Unmatched (no customer): ${unmatched[0].c}`);
console.log(`Flagged not on invoice: ${notOnInv[0].c}`);

await conn.end();
console.log('\nImport complete.');
