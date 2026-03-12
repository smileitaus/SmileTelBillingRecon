/**
 * Fuzzy-match Channel Haus, Legion, Tech-e invoice services to existing customers.
 * Outputs a match report and import plan.
 */
import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

// Load parsed services
const services = JSON.parse(readFileSync('/tmp/invoice-services.json', 'utf8'));

// Load all active customers
const [customers] = await db.query(
  `SELECT externalId, name, status FROM customers WHERE status != 'inactive' ORDER BY name`
);

// Simple fuzzy match: normalise strings and find best overlap
function normalise(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenScore(a, b) {
  const ta = new Set(normalise(a).split(' ').filter(t => t.length > 2));
  const tb = new Set(normalise(b).split(' ').filter(t => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let matches = 0;
  for (const t of ta) {
    if (tb.has(t)) matches++;
    // partial match: one contains the other
    else for (const u of tb) if (t.includes(u) || u.includes(t)) { matches += 0.5; break; }
  }
  return matches / Math.max(ta.size, tb.size);
}

function findBestCustomer(friendlyName, hint) {
  let best = null, bestScore = 0;
  const query = hint ? `${friendlyName} ${hint}` : friendlyName;
  for (const c of customers) {
    const score = tokenScore(query, c.name);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 0.3 ? { customer: best, score: bestScore } : null;
}

// Match each service
const results = { matched: [], unmatched: [] };

for (const svc of services) {
  const match = findBestCustomer(svc.friendlyName, svc.customerHint);
  if (match) {
    results.matched.push({ ...svc, matchedCustomer: match.customer, confidence: match.score });
  } else {
    results.unmatched.push(svc);
  }
}

console.log(`\n=== MATCH RESULTS ===`);
console.log(`Matched:   ${results.matched.length}`);
console.log(`Unmatched: ${results.unmatched.length}`);

console.log(`\n=== MATCHED SERVICES ===`);
for (const m of results.matched) {
  const conf = m.confidence >= 0.7 ? 'HIGH' : m.confidence >= 0.4 ? 'MED' : 'LOW';
  console.log(`  [${conf}] ${m.friendlyName.padEnd(45)} → ${m.matchedCustomer.name.padEnd(45)} $${m.amount.toFixed(2)}`);
}

console.log(`\n=== UNMATCHED SERVICES ===`);
for (const u of results.unmatched) {
  console.log(`  ${u.friendlyName.padEnd(45)} $${u.amount.toFixed(2)} (${u.provider})`);
}

// Save results
import { writeFileSync } from 'fs';
writeFileSync('/tmp/match-results.json', JSON.stringify(results, null, 2));
console.log('\nSaved to /tmp/match-results.json');

await db.end();
