/**
 * Fuzzy match tiab_customers → platform customers
 * Uses multiple signals: companyName, firstName+lastName (contact), suburb, email
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// ── helpers ──────────────────────────────────────────────────────────────────

function normalise(s = '') {
  return s.toLowerCase()
    .replace(/\bpty\s+ltd\b/g, '')
    .replace(/\bpty\b/g, '')
    .replace(/\bltd\b/g, '')
    .replace(/\binc\b/g, '')
    .replace(/\bthe\s+trustee\s+for\s+the\b/g, '')
    .replace(/\btrust\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(a, b) {
  const ta = new Set(normalise(a).split(' ').filter(Boolean));
  const tb = new Set(normalise(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return (2 * overlap) / (ta.size + tb.size);
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function stringSimilarity(a, b) {
  const na = normalise(a), nb = normalise(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  const lev = 1 - levenshtein(na, nb) / maxLen;
  const tok = tokenSimilarity(a, b);
  return Math.max(lev, tok);
}

function contactString(tc) {
  // Build a search string from the contact name (firstName = site name, lastName = suffix)
  const parts = [tc.firstName, tc.lastName].filter(Boolean).join(' ');
  return parts.replace(/\s*4G\s*$/i, '').trim();
}

// ── load data ────────────────────────────────────────────────────────────────

const [tiabRows] = await db.query(`
  SELECT tiabCustomerId, companyName, firstName, lastName, email, suburb
  FROM tiab_customers
  ORDER BY companyName
`);

const [platformRows] = await db.query(`
  SELECT externalId, name, siteAddress, contactEmail as email
  FROM customers
  ORDER BY name
`);

console.log(`TIAB customers: ${tiabRows.length}, Platform customers: ${platformRows.length}`);

// ── match ─────────────────────────────────────────────────────────────────────

const results = [];

for (const tc of tiabRows) {
  const contact = contactString(tc);
  
  let bestMatch = null;
  let bestScore = 0;
  let bestReason = '';

  for (const pc of platformRows) {
    // Score 1: company name similarity
    const companyScore = stringSimilarity(tc.companyName, pc.name);
    
    // Score 2: contact name (site name) similarity  
    const contactScore = contact ? stringSimilarity(contact, pc.name) : 0;
    
    // Score 3: email match
    let emailScore = 0;
    if (tc.email && pc.email && tc.email.toLowerCase() === pc.email.toLowerCase()) {
      emailScore = 1.0;
    }
    
    // Score 4: suburb match bonus
    let suburbBonus = 0;
    if (tc.suburb && pc.suburb && 
        normalise(tc.suburb) === normalise(pc.siteAddress || '')) {
      suburbBonus = 0.1;
    }
    
    // Combined score — contact name is most reliable for TIAB
    const combined = Math.max(
      contactScore * 0.9 + suburbBonus,
      companyScore * 0.7 + suburbBonus,
      emailScore
    );
    
    if (combined > bestScore) {
      bestScore = combined;
      bestMatch = pc;
      bestReason = emailScore === 1.0 ? 'email' :
                   contactScore >= companyScore ? `contact:"${contact}"` : `company:"${tc.companyName}"`;
    }
  }

  const confidence = Math.round(bestScore * 100);
  const matchType = confidence >= 90 ? 'exact' :
                    confidence >= 75 ? 'fuzzy_high' :
                    confidence >= 60 ? 'fuzzy_low' : 'unmatched';

  results.push({
    tiabCustomerId: tc.tiabCustomerId,
    companyName: tc.companyName,
    contact,
    suburb: tc.suburb,
    matchedId: bestMatch?.externalId,
    matchedName: bestMatch?.name,
    confidence,
    matchType,
    reason: bestReason,
  });
}

// ── print results ─────────────────────────────────────────────────────────────

console.log('\n=== MATCH RESULTS ===\n');
for (const r of results.sort((a, b) => b.confidence - a.confidence)) {
  const flag = r.confidence >= 75 ? '✓' : r.confidence >= 60 ? '?' : '✗';
  console.log(`${flag} [${r.confidence}%] TIAB:${r.tiabCustomerId} "${r.companyName}" / contact:"${r.contact}"`);
  console.log(`    → ${r.matchedId} "${r.matchedName}" (${r.reason})`);
}

// ── apply high-confidence matches ─────────────────────────────────────────────

const toApply = results.filter(r => r.confidence >= 75 && r.matchedId);
console.log(`\n=== APPLYING ${toApply.length} HIGH-CONFIDENCE MATCHES ===\n`);

for (const r of toApply) {
  await db.query(`
    UPDATE tiab_customers 
    SET internalCustomerExternalId = ?,
        matchConfidence = ?,
        matchType = ?
    WHERE tiabCustomerId = ?
  `, [r.matchedId, (r.confidence / 100).toFixed(2), r.matchType, r.tiabCustomerId]);
  console.log(`  Updated ${r.tiabCustomerId} → ${r.matchedId} "${r.matchedName}" [${r.confidence}%]`);
}

// ── review items ──────────────────────────────────────────────────────────────

const toReview = results.filter(r => r.confidence < 75);
if (toReview.length) {
  console.log(`\n=== NEEDS MANUAL REVIEW (${toReview.length}) ===\n`);
  for (const r of toReview) {
    console.log(`  TIAB:${r.tiabCustomerId} "${r.companyName}" / "${r.contact}" [${r.confidence}%]`);
    console.log(`    Best guess: ${r.matchedId} "${r.matchedName}"`);
  }
}

await db.end();
console.log('\nDone.');
