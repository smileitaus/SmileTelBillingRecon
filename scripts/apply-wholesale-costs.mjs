/**
 * Apply correct wholesale costs to all SasBoss services in the database.
 * Uses the supplier_product_cost_map table (Access4 Diamond pricebook) as the source of truth.
 * Fuzzy-matches service planName to product names in the cost map.
 * Records before/after for audit trail.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

// Load all cost mappings
const [costMaps] = await conn.execute(
  `SELECT productName, wholesaleCost, rrp, productCategory FROM supplier_product_cost_map WHERE supplier = 'SasBoss' AND isActive = 1`
);

// Build lookup: exact match first, then normalized
const exactMap = new Map();
const normalizedMap = new Map();
for (const cm of costMaps) {
  const name = cm.productName.trim();
  exactMap.set(name.toLowerCase(), cm);
  // Normalized: remove punctuation, lowercase
  const norm = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  normalizedMap.set(norm, cm);
}

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function tokenScore(a, b) {
  const ta = new Set(a.split(' ').filter(t => t.length > 2));
  const tb = new Set(b.split(' ').filter(t => t.length > 2));
  let matches = 0;
  for (const t of ta) if (tb.has(t)) matches++;
  return matches / Math.max(ta.size, tb.size, 1);
}

function findCostMap(planName) {
  if (!planName) return null;
  const lower = planName.trim().toLowerCase();
  // 1. Exact match
  if (exactMap.has(lower)) return exactMap.get(lower);
  // 2. Normalized match
  const norm = normalize(planName);
  if (normalizedMap.has(norm)) return normalizedMap.get(norm);
  // 3. Token score match
  let best = null, bestScore = 0;
  for (const [key, cm] of normalizedMap) {
    const score = tokenScore(norm, key);
    if (score > bestScore) { bestScore = score; best = cm; }
  }
  return bestScore >= 0.5 ? best : null;
}

// Load all SasBoss services
const [services] = await conn.execute(
  `SELECT externalId, planName, monthlyCost, costSource FROM services WHERE provider = 'SasBoss' AND status != 'terminated'`
);

console.log(`Processing ${services.length} SasBoss services...`);

let updated = 0, skipped = 0, noMatch = 0;
const noMatchList = [];
const updateLog = [];

for (const svc of services) {
  const cm = findCostMap(svc.planName);
  if (!cm) {
    noMatch++;
    noMatchList.push(svc.planName);
    continue;
  }
  const newCost = parseFloat(cm.wholesaleCost);
  const oldCost = parseFloat(svc.monthlyCost || 0);
  
  // Skip if cost is already correct (within 1 cent)
  if (Math.abs(newCost - oldCost) < 0.01) {
    skipped++;
    continue;
  }
  
  await conn.execute(
    `UPDATE services SET monthlyCost = ?, costSource = 'access4_diamond_pricebook', updatedAt = NOW() WHERE externalId = ?`,
    [newCost.toFixed(2), svc.externalId]
  );
  updateLog.push({ externalId: svc.externalId, planName: svc.planName, oldCost, newCost, matchedProduct: cm.productName });
  updated++;
}

console.log(`\n=== Results ===`);
console.log(`✓ Updated: ${updated} services`);
console.log(`  Skipped (already correct): ${skipped}`);
console.log(`  No match found: ${noMatch}`);

if (updateLog.length > 0) {
  console.log(`\n=== Sample updates (first 20) ===`);
  for (const u of updateLog.slice(0, 20)) {
    console.log(`  ${u.planName}: $${u.oldCost.toFixed(2)} → $${u.newCost.toFixed(2)} (matched: ${u.matchedProduct})`);
  }
}

if (noMatchList.length > 0) {
  const unique = [...new Set(noMatchList)].sort();
  console.log(`\n=== Products with no cost mapping (${unique.length} unique) ===`);
  for (const p of unique) console.log(`  - ${p}`);
}

// Recalculate customer monthlyCost totals
console.log('\nRecalculating customer cost totals...');
await conn.execute(`
  UPDATE customers c
  SET monthlyCost = (
    SELECT COALESCE(SUM(s.monthlyCost), 0)
    FROM services s
    WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'
  ),
  updatedAt = NOW()
`);
console.log('✓ Customer cost totals updated');

await conn.end();
