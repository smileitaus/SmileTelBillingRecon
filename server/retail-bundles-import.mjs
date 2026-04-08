/**
 * retail-bundles-import.mjs
 *
 * Imports SmileTelRetailInternetbundles.xlsx into the retail_bundles and
 * retail_bundle_cost_inputs tables.
 *
 * Rules applied:
 *  - Duplicate account numbers: keep the row with the non-Zam25M2M product name
 *    (i.e. remove the Zam25M2M row when a better product name exists for the same account)
 *  - isByod = true if product name contains HDBOYD OR if 'hardware' is NOT in bundle components
 *  - Default billing inputs per bundle:
 *      hardware   $7.50/mo  — only if hasHardware=1 AND isByod=0
 *      support    $21.00/mo — always if hasSupport=1
 *      sip_channel $1.50/mo — only if hasVoip=1
 *  - Customers matched to existing DB records by fuzzy name (normalised Levenshtein)
 *  - Matched customers get customerType='retail_offering' and billingPlatforms updated with 'OneBill'
 */

import ExcelJS from 'exceljs';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── DB connection ─────────────────────────────────────────────────────────────
const db = await mysql.createConnection(process.env.DATABASE_URL);

// ── Product name standardisation map ─────────────────────────────────────────
const PRODUCT_NAME_MAP = {
  'Zam25M2M':                                                    'NBN 25/10 M2M Bundle',
  'Zam25-36':                                                    'NBN 25/10 36-Month Bundle',
  'Zam25-12':                                                    'NBN 25/10 12-Month Bundle',
  'Zam50M2M':                                                    'NBN 50/20 M2M Bundle',
  'Zam50-36':                                                    'NBN 50/20 36-Month Bundle',
  'Zam50-24':                                                    'NBN 50/20 24-Month Bundle',
  'Zam100M2M':                                                   'NBN 100/40 M2M Bundle',
  'Zam-MBB':                                                     'MBB Bundle',
  'STelShop-MBB-SP':                                             'MBB Bundle (Standard)',
  'STelShop25M2M':                                               'NBN 25/10 M2M Bundle',
  'STelShop50M2M':                                               'NBN 50/20 M2M Bundle',
  'Yiros25M2M':                                                  'NBN 25/10 M2M Bundle',
  'Yiros25-36':                                                  'NBN 25/10 36-Month Bundle',
  'Yiros50-36':                                                  'NBN 50/20 36-Month Bundle',
  'Yiros50-24':                                                  'NBN 50/20 24-Month Bundle',
  'Yiros100- 36':                                                'NBN 100/40 36-Month Bundle',
  'LChaC25M2M':                                                  'NBN 25/10 M2M Bundle',
  'LChaF25M2M':                                                  'NBN 25/10 M2M Bundle',
  'ST-Retail Premium Support NBN 25/10- 36 Months HDWINC':      'NBN 25/10 36-Month Bundle (HW Incl)',
  'ST-Retail Premium Support NBN 50/20- 36 Months HDWINC':      'NBN 50/20 36-Month Bundle (HW Incl)',
  'ST-Retail Premium Support NBN 100/40 - 36 Months HDWINC':    'NBN 100/40 36-Month Bundle (HW Incl)',
  'ST-Premium Support- NBN & Hardware - 25/10 - 36 months':     'NBN 25/10 36-Month Bundle (HW Incl)',
  'ST-Retail Premium Support NBN 25/10- M2M- HDBOYD':           'NBN 25/10 M2M Bundle (BYOD)',
  'ST-Premium Support NBN 100/40- 12 Month Contract- HDBOYD':   'NBN 100/40 12-Month Bundle (BYOD)',
  'ST-NBN500-50':                                                'NBN 500/50 Bundle',
  'ST- NBN 50/20Mbps- 12':                                      'NBN 50/20 12-Month Bundle',
  'ST-NBN250/100-36Months':                                      'NBN 250/100 36-Month Bundle',
};

// ── Fuzzy matching helpers ────────────────────────────────────────────────────

function normaliseName(s) {
  return s
    .toLowerCase()
    .replace(/\bpty\s+ltd\b|\bpty\.?\s*ltd\.?\b/g, '')
    .replace(/\bthe\s+trustee\s+for\b/gi, '')
    .replace(/\bunit\s+trust\b/gi, '')
    .replace(/\(.*?\)/g, '')   // remove parenthetical suffixes
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s) {
  return new Set(normaliseName(s).split(' ').filter(Boolean));
}

function jaccardSimilarity(a, b) {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  const intersection = new Set([...sa].filter(x => sb.has(x)));
  const union = new Set([...sa, ...sb]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function normalizedLevenshtein(a, b) {
  const na = normaliseName(a), nb = normaliseName(b);
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

function bestMatch(subscriberName, customers) {
  let best = null;
  let bestScore = 0;

  for (const c of customers) {
    // Try both name and businessName
    const candidates = [c.name, c.businessName].filter(Boolean);
    for (const cname of candidates) {
      const jaccard = jaccardSimilarity(subscriberName, cname);
      const lev = normalizedLevenshtein(subscriberName, cname);
      const score = jaccard * 0.6 + lev * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = { customer: c, score, method: 'name_fuzzy' };
      }
    }
  }

  if (!best || bestScore < 0.35) return null;

  const confidence =
    bestScore >= 0.85 ? 'exact' :
    bestScore >= 0.65 ? 'high' :
    bestScore >= 0.50 ? 'medium' : 'low';

  return { ...best, confidence };
}

// ── Load spreadsheet ──────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('/home/ubuntu/upload/SmileTelRetailInternetbundles.xlsx');
const ws = wb.getWorksheet('Sheet1');

const rows = [];
ws.eachRow((row, rowNum) => {
  if (rowNum === 1) return; // header
  const acct = row.getCell(1).value;
  const bundle = row.getCell(2).value;
  const subscriber = row.getCell(3).value;
  const product = row.getCell(4).value;
  const cost = row.getCell(5).value;
  const price = row.getCell(6).value;
  if (!acct || !subscriber) return;
  rows.push({
    acct: String(acct),
    bundle: String(bundle || ''),
    subscriber: String(subscriber),
    product: String(product || ''),
    cost: Number(cost) || 0,
    price: Number(price) || 0,
  });
});

console.log(`Loaded ${rows.length} rows from spreadsheet`);

// ── Resolve duplicates ────────────────────────────────────────────────────────
// For accounts with multiple rows: remove Zam25M2M row if a better product exists
const byAcct = {};
for (const r of rows) {
  if (!byAcct[r.acct]) {
    byAcct[r.acct] = [];
  }
  byAcct[r.acct].push(r);
}

const deduped = [];
for (const [acct, acctRows] of Object.entries(byAcct)) {
  if (acctRows.length === 1) {
    deduped.push(acctRows[0]);
  } else {
    // Multiple rows — keep non-Zam25M2M rows; if all are Zam25M2M keep highest price
    const nonZam = acctRows.filter(r => r.product !== 'Zam25M2M');
    if (nonZam.length > 0) {
      // Keep the highest-priced non-Zam25M2M row
      nonZam.sort((a, b) => b.price - a.price);
      deduped.push(nonZam[0]);
      console.log(`  Deduped ${acct}: kept '${nonZam[0].product}' ($${nonZam[0].price}), dropped Zam25M2M`);
    } else {
      acctRows.sort((a, b) => b.price - a.price);
      deduped.push(acctRows[0]);
    }
  }
}

console.log(`After deduplication: ${deduped.length} unique bundles`);

// ── Load existing customers ───────────────────────────────────────────────────
const [customerRows] = await db.execute(
  'SELECT externalId, name, businessName FROM customers'
);
console.log(`Loaded ${customerRows.length} existing customers`);

// ── Process each bundle row ───────────────────────────────────────────────────
let matched = 0, unmatched = 0, inserted = 0;

for (const r of deduped) {
  const components = r.bundle.toLowerCase().split(',').map(s => s.trim());
  const hasInternet = components.includes('internet') ? 1 : 0;
  const hasSim = components.includes('sim') ? 1 : 0;
  const hasVoip = components.includes('voip') ? 1 : 0;
  const hasHardware = components.includes('hardware') ? 1 : 0;
  const hasSupport = components.includes('support') ? 1 : 0;

  // BYOD: explicit HDBOYD in product name, OR hardware not in components
  const isByod = (r.product.toUpperCase().includes('HDBOYD') || !hasHardware) ? 1 : 0;

  const standardProductName = PRODUCT_NAME_MAP[r.product] || r.product;

  // Fuzzy match to existing customer
  const match = bestMatch(r.subscriber, customerRows);
  let customerExternalId = null;
  let matchConfidence = 'none';
  let matchMethod = '';

  if (match) {
    customerExternalId = match.customer.externalId;
    matchConfidence = match.confidence;
    matchMethod = match.method;
    matched++;
  } else {
    unmatched++;
  }

  // Insert retail_bundle row
  const [result] = await db.execute(
    `INSERT INTO retail_bundles
      (oneBillAccountNumber, customerExternalId, subscriberName, rawBundleComponents,
       hasInternet, hasSim, hasVoip, hasHardware, hasSupport, isByod,
       legacyProductName, standardProductName, retailPriceExGst,
       matchConfidence, matchMethod, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      r.acct, customerExternalId, r.subscriber, r.bundle,
      hasInternet, hasSim, hasVoip, hasHardware, hasSupport, isByod,
      r.product, standardProductName, r.price.toFixed(4),
      matchConfidence, matchMethod,
    ]
  );
  const bundleId = result.insertId;

  // ── Default billing inputs ────────────────────────────────────────────────
  const inputs = [];

  // Hardware rental: $7.50/mo — only if hasHardware=1 AND isByod=0
  if (hasHardware && !isByod) {
    inputs.push(['hardware', 'Hardware Rental', '7.5000', 'default', null, null, 'Default $7.50/mo hardware rental']);
  }

  // Support: $21.00/mo — only if hasSupport=1
  if (hasSupport) {
    inputs.push(['support', 'Support', '21.0000', 'default', null, null, 'Default $21.00/mo support']);
  }

  // SIP Channel: $1.50/mo — only if hasVoip=1
  if (hasVoip) {
    inputs.push(['sip_channel', 'SIP Channel', '1.5000', 'default', null, null, 'Default $1.50/mo SIP channel']);
  }

  for (const [slotType, label, cost, source, linkedId, linkedExtId, notes] of inputs) {
    await db.execute(
      `INSERT INTO retail_bundle_cost_inputs
        (bundleId, slotType, label, monthlyCostExGst, costSource, linkedServiceId, linkedServiceExternalId, notes, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [bundleId, slotType, label, cost, source, linkedId, linkedExtId, notes]
    );
  }

  inserted++;
}

console.log(`\nImport complete:`);
console.log(`  Bundles inserted:  ${inserted}`);
console.log(`  Matched to DB:     ${matched}`);
console.log(`  Unmatched:         ${unmatched}`);

// ── Update matched customers: customerType and billingPlatforms ───────────────
const [bundleRows] = await db.execute(
  `SELECT customerExternalId FROM retail_bundles WHERE customerExternalId IS NOT NULL`
);
const matchedIds = [...new Set(bundleRows.map(r => r.customerExternalId))];

let updatedCustomers = 0;
for (const extId of matchedIds) {
  // Get current billingPlatforms
  const [[cust]] = await db.execute(
    'SELECT billingPlatforms FROM customers WHERE externalId = ?',
    [extId]
  );
  if (!cust) continue;

  let platforms = [];
  try { platforms = JSON.parse(cust.billingPlatforms || '[]'); } catch { platforms = []; }
  if (!Array.isArray(platforms)) platforms = [];
  if (!platforms.includes('OneBill')) platforms.push('OneBill');

  await db.execute(
    `UPDATE customers SET customerType = 'retail_offering', billingPlatforms = ? WHERE externalId = ?`,
    [JSON.stringify(platforms), extId]
  );
  updatedCustomers++;
}

console.log(`  Customers updated to retail_offering: ${updatedCustomers}`);

// ── Summary of unmatched ──────────────────────────────────────────────────────
const [unmatchedBundles] = await db.execute(
  `SELECT oneBillAccountNumber, subscriberName, matchConfidence FROM retail_bundles WHERE customerExternalId IS NULL`
);
if (unmatchedBundles.length > 0) {
  console.log(`\nUnmatched bundles (${unmatchedBundles.length}):`);
  for (const b of unmatchedBundles) {
    console.log(`  ${b.oneBillAccountNumber.padEnd(12)} ${b.subscriberName}`);
  }
}

await db.end();
console.log('\nDone.');
