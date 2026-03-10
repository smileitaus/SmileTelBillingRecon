import 'dotenv/config';
import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
const url = new URL(dbUrl);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: url.port || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: true }
});

// ============ ADDRESS NORMALISATION ============

const STREET_ABBREVS = {
  'street': 'st', 'st': 'st',
  'road': 'rd', 'rd': 'rd',
  'avenue': 'ave', 'ave': 'ave', 'av': 'ave',
  'drive': 'dr', 'dr': 'dr', 'drv': 'dr',
  'place': 'pl', 'pl': 'pl',
  'court': 'ct', 'ct': 'ct', 'crt': 'ct',
  'crescent': 'cres', 'cres': 'cres', 'cr': 'cres',
  'terrace': 'tce', 'tce': 'tce', 'ter': 'tce',
  'parade': 'pde', 'pde': 'pde',
  'highway': 'hwy', 'hwy': 'hwy',
  'boulevard': 'blvd', 'blvd': 'blvd',
  'lane': 'ln', 'ln': 'ln',
  'close': 'cl', 'cl': 'cl',
  'circuit': 'cct', 'cct': 'cct', 'cir': 'cct',
  'way': 'way',
  'grove': 'gr', 'gr': 'gr',
  'esplanade': 'esp', 'esp': 'esp',
  'square': 'sq', 'sq': 'sq',
  'track': 'trk', 'trk': 'trk',
  'trail': 'trl', 'trl': 'trl',
  'rise': 'rise',
  'loop': 'loop',
  'mews': 'mews',
  'walk': 'walk',
  'promenade': 'prom', 'prom': 'prom',
};

const STATE_ABBREVS = {
  'queensland': 'qld', 'qld': 'qld',
  'new south wales': 'nsw', 'nsw': 'nsw',
  'victoria': 'vic', 'vic': 'vic',
  'south australia': 'sa', 'sa': 'sa',
  'western australia': 'wa', 'wa': 'wa',
  'tasmania': 'tas', 'tas': 'tas',
  'northern territory': 'nt', 'nt': 'nt',
  'australian capital territory': 'act', 'act': 'act',
};

function normaliseAddress(addr) {
  if (!addr) return '';
  let norm = addr.toLowerCase().trim();
  
  // Remove common prefixes like "Unit X," "Suite X," "Level X," "Shop X,"
  norm = norm.replace(/^(unit|suite|level|shop|lot|flat)\s+\d+[a-z]?\s*[,/]\s*/i, '');
  // Also handle "1/123" format (unit/street number)
  norm = norm.replace(/^\d+\s*\/\s*/, '');
  
  // Remove punctuation
  norm = norm.replace(/[.,;:'"()]/g, ' ');
  
  // Normalise whitespace
  norm = norm.replace(/\s+/g, ' ').trim();
  
  // Normalise street types
  const words = norm.split(' ');
  const normWords = words.map(w => {
    if (STREET_ABBREVS[w]) return STREET_ABBREVS[w];
    if (STATE_ABBREVS[w]) return STATE_ABBREVS[w];
    return w;
  });
  
  return normWords.join(' ');
}

// Extract key parts: street number + street name + suburb
function extractAddressParts(addr) {
  if (!addr) return { streetNum: '', streetName: '', suburb: '', state: '', postcode: '' };
  
  const norm = normaliseAddress(addr);
  const words = norm.split(' ');
  
  // Try to find postcode (4 digits at end)
  let postcode = '';
  if (words.length > 0 && /^\d{4}$/.test(words[words.length - 1])) {
    postcode = words.pop();
  }
  
  // Try to find state
  let state = '';
  const states = ['qld', 'nsw', 'vic', 'sa', 'wa', 'tas', 'nt', 'act'];
  if (words.length > 0 && states.includes(words[words.length - 1])) {
    state = words.pop();
  }
  
  // Find street number (first number-like token)
  let streetNum = '';
  let streetStart = 0;
  if (words.length > 0 && /^\d/.test(words[0])) {
    streetNum = words[0];
    streetStart = 1;
  }
  
  // Find street type to split street name from suburb
  let streetTypeIdx = -1;
  const streetTypes = Object.values(STREET_ABBREVS);
  for (let i = streetStart; i < words.length; i++) {
    if (streetTypes.includes(words[i])) {
      streetTypeIdx = i;
      break;
    }
  }
  
  let streetName = '';
  let suburb = '';
  
  if (streetTypeIdx >= 0) {
    streetName = words.slice(streetStart, streetTypeIdx + 1).join(' ');
    suburb = words.slice(streetTypeIdx + 1).join(' ');
  } else {
    // No street type found, use all remaining words
    streetName = words.slice(streetStart).join(' ');
  }
  
  return { streetNum, streetName, suburb, state, postcode };
}

// Similarity score between two strings (simple word overlap)
function wordSimilarity(a, b) {
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(' ').filter(w => w.length > 1));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 1));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }
  
  return matches / Math.max(wordsA.size, wordsB.size);
}

// ============ MAIN MATCHING ============

console.log('=== SECOND-PASS ADDRESS MATCHING ===\n');

// Get all unmatched services with addresses
const [unmatchedServices] = await conn.execute(
  `SELECT externalId, locationAddress, locationExternalId, customerName, serviceType, monthlyCost 
   FROM services 
   WHERE (customerExternalId IS NULL OR customerExternalId = '') 
   AND locationAddress IS NOT NULL AND locationAddress != '' AND locationAddress != 'Unknown Location'
   ORDER BY externalId`
);

console.log(`Unmatched services with addresses: ${unmatchedServices.length}`);

// Get all customers with addresses (siteAddress or from locations)
const [customers] = await conn.execute(
  `SELECT externalId, name, siteAddress, billingPlatforms FROM customers`
);

// Also get location addresses linked to customers
const [locations] = await conn.execute(
  `SELECT externalId, address, customerExternalId FROM locations WHERE customerExternalId IS NOT NULL AND customerExternalId != ''`
);

// Build customer address index: customerId -> [normalised addresses]
const customerAddresses = new Map();
for (const c of customers) {
  const addrs = [];
  if (c.siteAddress) addrs.push(normaliseAddress(c.siteAddress));
  customerAddresses.set(c.externalId, { name: c.name, addresses: addrs, platforms: c.billingPlatforms });
}

for (const loc of locations) {
  if (loc.customerExternalId && customerAddresses.has(loc.customerExternalId)) {
    customerAddresses.get(loc.customerExternalId).addresses.push(normaliseAddress(loc.address));
  }
}

// Also get addresses from services already assigned to customers
const [assignedServices] = await conn.execute(
  `SELECT customerExternalId, locationAddress FROM services 
   WHERE customerExternalId IS NOT NULL AND customerExternalId != '' 
   AND locationAddress IS NOT NULL AND locationAddress != ''`
);

for (const s of assignedServices) {
  if (customerAddresses.has(s.customerExternalId)) {
    customerAddresses.get(s.customerExternalId).addresses.push(normaliseAddress(s.locationAddress));
  }
}

// Deduplicate addresses per customer
for (const [id, data] of customerAddresses) {
  data.addresses = [...new Set(data.addresses)].filter(a => a.length > 5);
}

console.log(`Customers with addresses: ${[...customerAddresses.values()].filter(c => c.addresses.length > 0).length}`);

// Match each unmatched service
const matches = [];
const noMatch = [];

for (const svc of unmatchedServices) {
  const svcNorm = normaliseAddress(svc.locationAddress);
  const svcParts = extractAddressParts(svc.locationAddress);
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [custId, custData] of customerAddresses) {
    if (custData.addresses.length === 0) continue;
    
    for (const custAddr of custData.addresses) {
      // Strategy 1: Exact normalised match
      if (svcNorm === custAddr && svcNorm.length > 10) {
        if (1.0 > bestScore) {
          bestScore = 1.0;
          bestMatch = { custId, custName: custData.name, custAddr, method: 'exact_norm' };
        }
        continue;
      }
      
      // Strategy 2: Street number + street name match + same suburb/postcode
      const custParts = extractAddressParts(custAddr);
      
      if (svcParts.streetNum && custParts.streetNum && 
          svcParts.streetNum === custParts.streetNum &&
          svcParts.streetName && custParts.streetName) {
        
        const streetSim = wordSimilarity(svcParts.streetName, custParts.streetName);
        
        if (streetSim >= 0.8) {
          // Check suburb or postcode match
          let locationBonus = 0;
          if (svcParts.postcode && custParts.postcode && svcParts.postcode === custParts.postcode) {
            locationBonus = 0.1;
          }
          if (svcParts.suburb && custParts.suburb && wordSimilarity(svcParts.suburb, custParts.suburb) > 0.5) {
            locationBonus = Math.max(locationBonus, 0.1);
          }
          
          const score = 0.8 + (streetSim - 0.8) + locationBonus;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = { custId, custName: custData.name, custAddr, method: 'street_match' };
          }
        }
      }
      
      // Strategy 3: High word overlap (for addresses without clear structure)
      const overallSim = wordSimilarity(svcNorm, custAddr);
      if (overallSim >= 0.7 && svcNorm.length > 15 && custAddr.length > 15) {
        const score = overallSim * 0.9; // Slightly lower confidence
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { custId, custName: custData.name, custAddr, method: 'word_overlap' };
        }
      }
    }
  }
  
  if (bestMatch && bestScore >= 0.75) {
    matches.push({
      serviceId: svc.externalId,
      serviceAddr: svc.locationAddress,
      customerId: bestMatch.custId,
      customerName: bestMatch.custName,
      customerAddr: bestMatch.custAddr,
      score: bestScore,
      method: bestMatch.method
    });
  } else {
    noMatch.push({ serviceId: svc.externalId, addr: svc.locationAddress, bestScore });
  }
}

console.log(`\n=== MATCH RESULTS ===`);
console.log(`Matched: ${matches.length}`);
console.log(`Unmatched: ${noMatch.length}`);

// Show matches grouped by method
const byMethod = {};
for (const m of matches) {
  byMethod[m.method] = (byMethod[m.method] || 0) + 1;
}
console.log(`\nBy method:`);
for (const [method, count] of Object.entries(byMethod)) {
  console.log(`  ${method}: ${count}`);
}

// Show all matches for review
console.log(`\n=== ALL MATCHES ===`);
for (const m of matches) {
  console.log(`[${m.score.toFixed(2)}] ${m.serviceId}: "${m.serviceAddr}" → ${m.customerId} "${m.customerName}" (${m.method})`);
}

// Show some unmatched for context
console.log(`\n=== SAMPLE UNMATCHED (first 20) ===`);
for (const n of noMatch.slice(0, 20)) {
  console.log(`  ${n.serviceId}: "${n.addr}" (best: ${n.bestScore.toFixed(2)})`);
}

// ============ APPLY MATCHES ============
console.log(`\n=== APPLYING ${matches.length} MATCHES ===`);

let applied = 0;
for (const m of matches) {
  await conn.execute(
    `UPDATE services SET customerExternalId = ?, status = 'active' WHERE externalId = ?`,
    [m.customerId, m.serviceId]
  );
  applied++;
}

console.log(`Applied ${applied} service assignments`);

// Update customer counts
console.log(`\nUpdating customer service counts...`);
const affectedCustomerIds = [...new Set(matches.map(m => m.customerId))];

for (const custId of affectedCustomerIds) {
  const [svcRows] = await conn.execute(
    `SELECT COUNT(*) as total, 
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as matched,
            SUM(CASE WHEN status != 'active' THEN 1 ELSE 0 END) as unmatched,
            SUM(COALESCE(monthlyCost, 0)) as totalCost
     FROM services WHERE customerExternalId = ?`,
    [custId]
  );
  
  const row = svcRows[0];
  await conn.execute(
    `UPDATE customers SET serviceCount = ?, matchedCount = ?, unmatchedCount = ?, monthlyCost = ?, status = 'active' WHERE externalId = ?`,
    [row.total, row.matched, row.unmatched, row.totalCost, custId]
  );
}

console.log(`Updated counts for ${affectedCustomerIds.length} customers`);

// Final stats
const [finalStats] = await conn.execute(
  `SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN customerExternalId IS NOT NULL AND customerExternalId != '' THEN 1 ELSE 0 END) as matched
   FROM services`
);

console.log(`\n=== FINAL STATS ===`);
console.log(`Total services: ${finalStats[0].total}`);
console.log(`Matched: ${finalStats[0].matched} (${Math.round(finalStats[0].matched / finalStats[0].total * 100)}%)`);
console.log(`Unmatched: ${finalStats[0].total - finalStats[0].matched}`);

await conn.end();
console.log('\nDone!');
