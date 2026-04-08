/**
 * import-vocus-iptel.mjs
 *
 * Imports Vocus IPTel usage data from VocusSmileITIPTel.xlsx.
 * - Aggregates charges by Contract ID → one service record per contract
 * - Fuzzy-matches Client Name to existing DB customers
 * - Creates/updates services with provider=Vocus, correct costs
 * - Logs unmatched clients for manual review
 */

import mysql from 'mysql2/promise';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = path.join(__dirname, '..', 'VocusSmileITIPTel.xlsx');

// ─── Fuzzy matching helpers ───────────────────────────────────────────────────

function normalise(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\bpty\b|\bltd\b|\bpty ltd\b|\binc\b|\bco\b|\bthe\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(a, b) {
  const ta = new Set(normalise(a).split(' ').filter(Boolean));
  const tb = new Set(normalise(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function fuzzyScore(vocusName, dbName, dbBusiness) {
  const vn = normalise(vocusName);
  const dn = normalise(dbName);
  const db = normalise(dbBusiness || '');
  
  // Token overlap (primary)
  const scoreN = tokenOverlap(vn, dn);
  const scoreB = db ? tokenOverlap(vn, db) : 0;
  const tokenScore = Math.max(scoreN, scoreB);
  
  // Levenshtein on normalised names (secondary)
  const maxLen = Math.max(vn.length, dn.length, 1);
  const levScore = 1 - levenshtein(vn, dn) / maxLen;
  
  return tokenScore * 0.7 + levScore * 0.3;
}

function findBestMatch(vocusClientName, customers) {
  if (!vocusClientName) return null;
  
  // Direct normalised match first
  const vn = normalise(vocusClientName);
  for (const c of customers) {
    if (normalise(c.name) === vn || normalise(c.businessName || '') === vn) {
      return { customer: c, score: 1.0, method: 'exact' };
    }
  }
  
  // Fuzzy match
  let best = null, bestScore = 0;
  for (const c of customers) {
    const score = fuzzyScore(vocusClientName, c.name, c.businessName);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  
  if (bestScore >= 0.55) return { customer: best, score: bestScore, method: 'fuzzy' };
  
  // Partial name containment check
  for (const c of customers) {
    const dn = normalise(c.name);
    if (dn.length > 3 && (vn.includes(dn) || dn.includes(vn))) {
      return { customer: c, score: 0.6, method: 'contains' };
    }
  }
  
  return null;
}

// ─── Map Vocus charge description to service type ────────────────────────────

function mapServiceType(chargeDesc, product) {
  if (!chargeDesc) return 'VoIP';
  const d = chargeDesc.toLowerCase();
  if (d.includes('call centre')) return 'VoIP';
  if (d.includes('collaboration')) return 'VoIP';
  if (d.includes('sip trunk') || d.includes('sip reseller')) return 'VoIP';
  if (d.includes('voice access')) return 'Voice';
  if (d.includes('number range') || d.includes('single number') || d.includes('number block')) return 'Voice';
  if (d.includes('voicemail')) return 'VoIP';
  if (d.includes('auto attendant')) return 'VoIP';
  if (d.includes('dubber') || d.includes('recording')) return 'VoIP';
  if (d.includes('webex')) return 'VoIP';
  if (d.includes('ip tel')) return 'VoIP';
  return 'VoIP';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Load spreadsheet
const wb = XLSX.readFile(XLSX_PATH);
const ws = wb.Sheets['Sheet1'];
const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null });

console.log(`Loaded ${rawRows.length} rows from spreadsheet`);

// Aggregate by Contract ID
const contractMap = new Map();
for (const row of rawRows) {
  const contractId = row['Contract ID'];
  if (!contractId) continue; // skip rows without contract ID (bulk charges)
  
  if (!contractMap.has(contractId)) {
    contractMap.set(contractId, {
      contractId,
      clientName: row['Client Name'] || '',
      purchaseOrderRef: row['Purchase Order Reference'] || '',
      product: row['Product'] || '',
      serviceType: row['Service Type'] || '',
      siteA: row['Site A'] || '',
      speed: row['Speed'] || '',
      invoiceDate: row['Invoice Date'],
      periodFrom: row['Charge Period From Date'],
      periodTo: row['Charge Period To Date'],
      vocusRef: row['Vocus Internal Reference'] || '',
      chargeDescs: new Set(),
      totalExTax: 0,
      totalIncTax: 0,
      recurringTotal: 0,
      usageTotal: 0,
      rows: [],
    });
  }
  
  const entry = contractMap.get(contractId);
  const exTax = parseFloat(row['Charge Ex-TaxAmount']) || 0;
  const incTax = parseFloat(row['Charge Inc-TaxAmount']) || 0;
  entry.totalExTax += exTax;
  entry.totalIncTax += incTax;
  if (row['Charge Type'] === 'Recurring') entry.recurringTotal += exTax;
  if (row['Charge Type'] === 'Usage') entry.usageTotal += exTax;
  if (row['Charge Description']) entry.chargeDescs.add(row['Charge Description']);
  entry.rows.push(row);
}

console.log(`Aggregated to ${contractMap.size} unique contracts`);

// Load all customers from DB
const [customers] = await conn.query('SELECT id, externalId, name, businessName FROM customers');
console.log(`Loaded ${customers.length} customers from DB`);

// Get next service externalId
const [maxSvc] = await conn.query("SELECT MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED)) as maxId FROM services WHERE externalId LIKE 'S%'");
let nextSvcId = (maxSvc[0].maxId || 0) + 1;

// Get existing Vocus IPTel services (by contractId stored in serviceIdentifier or notes)
const [existingVocus] = await conn.query(`
  SELECT id, externalId, discoveryNotes, monthlyCost, customerExternalId
  FROM services 
  WHERE provider = 'Vocus' AND dataSource LIKE '%Vocus IPTel%'
`);
const existingByContract = new Map();
for (const svc of existingVocus) {
  const match = (svc.discoveryNotes || '').match(/Contract:\s*(AB\d+|IPH\d+)/);
  if (match) existingByContract.set(match[1], svc);
}
console.log(`Found ${existingByContract.size} existing Vocus IPTel services in DB`);

// Process each contract
const results = {
  created: 0,
  updated: 0,
  unmatched: [],
  matched: [],
  skipped: [],
};

for (const [contractId, entry] of contractMap) {
  const matchResult = findBestMatch(entry.clientName, customers);
  
  // Build notes
  const chargeDescList = Array.from(entry.chargeDescs).join(', ');
  const notes = [
    `Contract: ${contractId}`,
    `Vocus Ref: ${entry.vocusRef}`,
    `Client: ${entry.clientName}`,
    entry.purchaseOrderRef ? `PO Ref: ${entry.purchaseOrderRef}` : null,
    `Recurring: $${entry.recurringTotal.toFixed(2)} | Usage: $${entry.usageTotal.toFixed(2)}`,
    `Charges: ${chargeDescList}`,
    `Period: ${entry.periodFrom ? new Date(entry.periodFrom).toLocaleDateString('en-AU') : '?'} – ${entry.periodTo ? new Date(entry.periodTo).toLocaleDateString('en-AU') : '?'}`,
  ].filter(Boolean).join('\n');
  
  const primaryChargeDesc = Array.from(entry.chargeDescs)[0] || 'IP Tel Service';
  const svcType = mapServiceType(primaryChargeDesc, entry.product);
  const customerExternalId = matchResult?.customer?.externalId || null;
  
  if (existingByContract.has(contractId)) {
    // Update existing
    const existing = existingByContract.get(contractId);
    await conn.query(`
      UPDATE services SET
        monthlyCost = ?,
        customerExternalId = ?,
        discoveryNotes = ?,
        updatedAt = NOW()
      WHERE id = ?
    `, [entry.totalExTax.toFixed(2), customerExternalId, notes, existing.id]);
    results.updated++;
  } else {
    // Create new service
    const svcExtId = `S${String(nextSvcId++).padStart(4, '0')}`;
    await conn.query(`
      INSERT INTO services (
        externalId, serviceType, planName, provider, dataSource,
        monthlyCost, monthlyRevenue, customerExternalId,
        discoveryNotes, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, 'Vocus', 'Vocus IPTel Import', ?, 0, ?, ?, 'active', NOW(), NOW())
    `, [
      svcExtId,
      svcType,
      primaryChargeDesc,
      entry.totalExTax.toFixed(2),
      customerExternalId,
      notes,
    ]);
    results.created++;
  }
  
  if (matchResult) {
    results.matched.push({
      contractId,
      clientName: entry.clientName,
      matchedTo: matchResult.customer.name,
      score: matchResult.score.toFixed(2),
      method: matchResult.method,
      total: entry.totalExTax.toFixed(2),
    });
  } else {
    results.unmatched.push({
      contractId,
      clientName: entry.clientName,
      total: entry.totalExTax.toFixed(2),
    });
  }
}

console.log('\n=== IMPORT RESULTS ===');
console.log(`Created: ${results.created} new services`);
console.log(`Updated: ${results.updated} existing services`);
console.log(`Matched to customers: ${results.matched.length}`);
console.log(`Unmatched (no customer found): ${results.unmatched.length}`);

console.log('\n=== MATCHED CONTRACTS ===');
console.table(results.matched.map(m => ({
  Contract: m.contractId,
  'Vocus Client': m.clientName.substring(0, 30),
  'Matched To': m.matchedTo.substring(0, 30),
  Score: m.score,
  Method: m.method,
  'Total $': m.total,
})));

if (results.unmatched.length > 0) {
  console.log('\n=== UNMATCHED CONTRACTS (need manual assignment) ===');
  console.table(results.unmatched);
}

// Grand total check
const grandTotal = [...contractMap.values()].reduce((s, e) => s + e.totalExTax, 0);
console.log(`\nGrand total imported: $${grandTotal.toFixed(2)} ex-GST`);

await conn.end();
console.log('\nDone.');
