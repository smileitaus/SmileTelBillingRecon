/**
 * octane-automatch.mjs
 * Fuzzy-matches Octane customer links against SmileTel customers
 * by company name and ABN, then updates matchType and internalCustomerExternalId.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL not set');

// Parse MySQL URL
const url = new URL(DB_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log('Connected to database');

// ---- Helpers ----
function normalise(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/\bpty\b|\bltd\b|\bpty\.?\s*ltd\.?\b|\binc\b|\bco\b|\bgroup\b|\bservices\b|\bholdings\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanAbn(abn) {
  if (!abn) return '';
  return abn.replace(/\s/g, '').replace(/[^0-9]/g, '');
}

// Simple Levenshtein distance
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => 
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const na = normalise(a), nb = normalise(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

// ---- Load SmileTel customers (correct column names) ----
const [smileCustomers] = await conn.execute(
  `SELECT externalId, name, businessName, contactEmail, contactPhone, siteAddress
   FROM customers 
   WHERE status != 'terminated' OR status IS NULL
   LIMIT 5000`
);
console.log(`Loaded ${smileCustomers.length} SmileTel customers`);

// ---- Load Octane customer links ----
const [octaneLinks] = await conn.execute(
  `SELECT id, octaneCustomerId, octaneCustomerName, octaneServiceName, isZambreroService, msisdn, matchType
   FROM octane_customer_links`
);
console.log(`Loaded ${octaneLinks.length} Octane customer links`);

// ---- Load Octane customers (for ABN data) ----
const [tiabCustomers] = await conn.execute(
  `SELECT tiabCustomerId, companyName, firstName, lastName, abn, address, suburb, state, postcode
   FROM tiab_customers`
);
const tiabMap = new Map(tiabCustomers.map(c => [c.tiabCustomerId, c]));

// ---- Match each Octane link ----
let matched = 0, unmatched = 0;
const updates = [];

for (const link of octaneLinks) {
  // Skip already manually matched
  if (link.matchType === 'manual') continue;

  const tiab = tiabMap.get(link.octaneCustomerId);
  const octaneAbn = cleanAbn(tiab?.abn || '');
  
  // For Zambrero services, use the service name for matching
  const searchName = link.isZambreroService 
    ? (link.octaneServiceName || link.octaneCustomerName)
    : link.octaneCustomerName;

  let bestMatch = null;
  let bestScore = 0;
  let bestMatchType = 'unmatched';

  // 1. Name fuzzy match against all SmileTel customers
  for (const c of smileCustomers) {
    let nameScore = Math.max(
      similarity(searchName, c.name),
      similarity(searchName, c.businessName || '')
    );
    
    // For Zambrero services, also try matching just the location part
    if (link.isZambreroService) {
      const locationPart = searchName.replace(/zambrero\s*/i, '').trim();
      if (locationPart) {
        nameScore = Math.max(nameScore, similarity(locationPart, c.name));
        // Check if SmileTel customer name contains the location
        if (c.name.toLowerCase().includes(locationPart.toLowerCase()) && locationPart.length > 4) {
          nameScore = Math.max(nameScore, 0.80);
        }
      }
      // Full name match including "Zambrero"
      if (c.name.toLowerCase().includes('zambrero')) {
        nameScore = Math.max(nameScore, similarity(searchName, c.name));
      }
    }
    
    if (nameScore > bestScore && nameScore > 0.60) {
      bestScore = nameScore;
      bestMatch = c;
      bestMatchType = 'fuzzy_name';
    }
  }

  // 2. For non-Zambrero: also try matching Octane company name against SmileTel
  if (!link.isZambreroService && tiab) {
    const companyName = tiab.companyName || tiab.legalEntity || '';
    for (const c of smileCustomers) {
      const score = Math.max(
        similarity(companyName, c.name),
        similarity(companyName, c.businessName || '')
      );
      if (score > bestScore && score > 0.60) {
        bestScore = score;
        bestMatch = c;
        bestMatchType = 'fuzzy_name';
      }
    }
  }

  const confidence = Math.round(bestScore * 100);

  if (bestMatch && confidence >= 65) {
    updates.push({
      id: link.id,
      internalCustomerExternalId: bestMatch.externalId,
      internalCustomerName: bestMatch.name,
      matchType: bestMatchType,
      matchConfidence: confidence,
      matchNotes: `Auto-matched: ${bestMatchType} (score=${confidence}%)`,
    });
    matched++;
    console.log(`  ✓ "${searchName}" -> "${bestMatch.name}" [${bestMatchType} ${confidence}%]`);
  } else {
    updates.push({
      id: link.id,
      internalCustomerExternalId: null,
      internalCustomerName: null,
      matchType: 'unmatched',
      matchConfidence: confidence,
      matchNotes: bestMatch ? `Best candidate: ${bestMatch.name} (score=${confidence}% — below threshold)` : 'No suitable match found',
    });
    unmatched++;
    if (bestMatch) {
      console.log(`  ✗ "${searchName}" -> best: "${bestMatch.name}" [${confidence}% — below threshold]`);
    } else {
      console.log(`  ✗ "${searchName}" -> no match`);
    }
  }
}

console.log(`\nMatch results: ${matched} matched, ${unmatched} unmatched`);

// ---- Apply updates ----
console.log('Applying updates...');
let updated = 0;
for (const u of updates) {
  await conn.execute(
    `UPDATE octane_customer_links 
     SET internalCustomerExternalId=?, internalCustomerName=?, matchType=?, matchConfidence=?, matchNotes=?
     WHERE id=?`,
    [u.internalCustomerExternalId, u.internalCustomerName, u.matchType, u.matchConfidence, u.matchNotes, u.id]
  );
  updated++;
}
console.log(`Updated ${updated} records`);

// ---- Summary ----
const [summary] = await conn.execute(
  `SELECT matchType, COUNT(*) as cnt FROM octane_customer_links GROUP BY matchType ORDER BY cnt DESC`
);
console.log('\nMatch type summary:');
for (const row of summary) {
  console.log(`  ${row.matchType}: ${row.cnt}`);
}

// Show confirmed matches
const [topMatches] = await conn.execute(
  `SELECT octaneCustomerName, octaneServiceName, internalCustomerName, matchType, matchConfidence 
   FROM octane_customer_links 
   WHERE matchType != 'unmatched' 
   ORDER BY matchConfidence DESC 
   LIMIT 30`
);
console.log('\nConfirmed matches:');
for (const m of topMatches) {
  const name = m.octaneServiceName || m.octaneCustomerName;
  console.log(`  ${name} -> ${m.internalCustomerName} [${m.matchType} ${m.matchConfidence}%]`);
}

await conn.end();
console.log('\nDone!');
