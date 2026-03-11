/**
 * Mischief Travel Audit & Reassignment Script
 * 
 * 1. Pull all 270 services assigned to Mischief Travel (C2654)
 * 2. For ABB services: fuzzy-match carbonAlias against all customer names
 * 3. For all services: fuzzy-match locationAddress against customer addresses/names
 * 4. Report proposed reassignments with confidence scores
 * 5. Apply reassignments (dry-run by default, set DRY_RUN=false to commit)
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const DRY_RUN = process.argv.includes('--commit') ? false : true;
const MISCHIEF_ID = 'C2654';

// ─── Normalisation helpers ──────────────────────────────────────────────────

function normalise(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\bpty\b|\bltd\b|\bpty\.?\s*ltd\.?\b|\binc\b|\bco\b|\bthe\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(str) {
  return new Set(normalise(str).split(' ').filter(t => t.length > 2));
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

function tokenOverlap(a, b) {
  const ta = tokenSet(a), tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

function aliasScore(alias, customerName, businessName) {
  if (!alias) return 0;
  const na = normalise(alias);
  const nc = normalise(customerName);
  const nb = normalise(businessName || '');
  
  // Exact normalised match
  if (na === nc || (nb && na === nb)) return 1.0;
  
  // One contains the other
  if (nc.includes(na) || na.includes(nc)) return 0.92;
  if (nb && (nb.includes(na) || na.includes(nb))) return 0.90;
  
  // Token overlap
  const to = Math.max(tokenOverlap(alias, customerName), tokenOverlap(alias, businessName || ''));
  if (to >= 0.8) return 0.85;
  if (to >= 0.6) return 0.75;
  if (to >= 0.4) return 0.60;
  
  // Levenshtein on shorter strings
  const shorter = na.length < 30 && nc.length < 30;
  if (shorter) {
    const dist = levenshtein(na, nc);
    const maxLen = Math.max(na.length, nc.length);
    const sim = 1 - dist / maxLen;
    if (sim >= 0.85) return 0.70;
    if (sim >= 0.75) return 0.55;
  }
  
  return 0;
}

function addressScore(serviceAddr, customerAddr, customerName) {
  if (!serviceAddr) return 0;
  const na = normalise(serviceAddr);
  const nc = normalise(customerAddr || '');
  const nn = normalise(customerName);
  
  if (!na) return 0;
  
  // Exact address match
  if (nc && na === nc) return 0.98;
  
  // Address contains address
  if (nc && (na.includes(nc) || nc.includes(na))) return 0.90;
  
  // Token overlap on address
  const toAddr = nc ? tokenOverlap(serviceAddr, customerAddr) : 0;
  if (toAddr >= 0.7) return 0.82;
  if (toAddr >= 0.5) return 0.65;
  
  // Check if service address mentions customer name (e.g. "Nodo Fortitude Valley" in address)
  const toName = tokenOverlap(serviceAddr, customerName);
  if (toName >= 0.6) return 0.70;
  
  return 0;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('=== MISCHIEF TRAVEL AUDIT ===');
  console.log('Mode:', DRY_RUN ? 'DRY RUN (pass --commit to apply)' : '*** COMMIT MODE ***');
  console.log('');
  
  // Load all Mischief Travel services
  const [services] = await conn.execute(
    `SELECT externalId, serviceType, planName, provider, carbonAlias, 
            phoneNumber, connectionId, locationAddress, monthlyCost, status
     FROM services WHERE customerExternalId = ? ORDER BY provider, carbonAlias`,
    [MISCHIEF_ID]
  );
  console.log(`Total services on Mischief Travel: ${services.length}`);
  
  // Load all customers (for matching)
  const [customers] = await conn.execute(
    `SELECT externalId, name, businessName, siteAddress, notes
     FROM customers WHERE externalId != ? ORDER BY name`,
    [MISCHIEF_ID]
  );
  console.log(`Total other customers to match against: ${customers.length}`);
  console.log('');
  
  const results = {
    aliasMatched: [],
    addressMatched: [],
    noMatch: [],
    alreadyMischief: [],
  };
  
  for (const svc of services) {
    let bestMatch = null;
    let bestScore = 0;
    let matchType = '';
    
    // 1. Alias matching (ABB services)
    if (svc.carbonAlias && svc.provider === 'ABB') {
      for (const cust of customers) {
        const score = aliasScore(svc.carbonAlias, cust.name, cust.businessName);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = cust;
          matchType = 'alias';
        }
      }
    }
    
    // 2. Address matching (all services, or if alias score is low)
    if (svc.locationAddress && bestScore < 0.75) {
      for (const cust of customers) {
        const score = addressScore(svc.locationAddress, cust.siteAddress, cust.name);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = cust;
          matchType = 'address';
        }
      }
    }
    
    // 3. Check if alias literally contains a customer name (partial scan)
    if (svc.carbonAlias && bestScore < 0.55) {
      const aliasNorm = normalise(svc.carbonAlias);
      for (const cust of customers) {
        const custNorm = normalise(cust.name);
        const bizNorm = normalise(cust.businessName || '');
        if (custNorm.length > 4 && aliasNorm.includes(custNorm)) {
          const score = 0.72;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = cust;
            matchType = 'alias-contains';
          }
        }
        if (bizNorm.length > 4 && aliasNorm.includes(bizNorm)) {
          const score = 0.70;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = cust;
            matchType = 'alias-contains-biz';
          }
        }
      }
    }
    
    const entry = {
      serviceId: svc.externalId,
      serviceType: svc.serviceType,
      provider: svc.provider,
      alias: svc.carbonAlias,
      address: svc.locationAddress,
      cost: svc.monthlyCost,
      matchType,
      score: bestScore,
      targetCustomer: bestMatch ? { id: bestMatch.externalId, name: bestMatch.name } : null,
    };
    
    if (bestScore >= 0.65 && bestMatch) {
      if (matchType === 'alias' || matchType === 'alias-contains' || matchType === 'alias-contains-biz') {
        results.aliasMatched.push(entry);
      } else {
        results.addressMatched.push(entry);
      }
    } else {
      results.noMatch.push(entry);
    }
  }
  
  // ─── Report ─────────────────────────────────────────────────────────────
  
  console.log(`=== ALIAS MATCHES (${results.aliasMatched.length} services) ===`);
  results.aliasMatched.sort((a,b) => b.score - a.score).forEach(m => {
    console.log(`  [${(m.score*100).toFixed(0)}%] ${m.serviceId} | ${m.provider} | alias="${m.alias}" → ${m.targetCustomer.name} (${m.targetCustomer.id})`);
  });
  
  console.log('');
  console.log(`=== ADDRESS MATCHES (${results.addressMatched.length} services) ===`);
  results.addressMatched.sort((a,b) => b.score - a.score).forEach(m => {
    console.log(`  [${(m.score*100).toFixed(0)}%] ${m.serviceId} | ${m.provider} | addr="${(m.address||'').substring(0,60)}" → ${m.targetCustomer.name} (${m.targetCustomer.id})`);
  });
  
  console.log('');
  console.log(`=== NO MATCH (${results.noMatch.length} services) ===`);
  results.noMatch.forEach(m => {
    console.log(`  ${m.serviceId} | ${m.provider} | alias="${m.alias||''}" | addr="${(m.address||'').substring(0,50)}"`);
  });
  
  const totalReassignable = results.aliasMatched.length + results.addressMatched.length;
  console.log('');
  console.log(`=== SUMMARY ===`);
  console.log(`  Alias-matched (will reassign): ${results.aliasMatched.length}`);
  console.log(`  Address-matched (will reassign): ${results.addressMatched.length}`);
  console.log(`  No match (stay on Mischief Travel): ${results.noMatch.length}`);
  console.log(`  Total to reassign: ${totalReassignable}`);
  
  // Save full report
  const report = { aliasMatched: results.aliasMatched, addressMatched: results.addressMatched, noMatch: results.noMatch };
  fs.writeFileSync('/home/ubuntu/billing-tool/scripts/mischief-audit-report.json', JSON.stringify(report, null, 2));
  console.log('');
  console.log('Full report saved to scripts/mischief-audit-report.json');
  
  // ─── Apply reassignments ─────────────────────────────────────────────────
  
  if (!DRY_RUN) {
    console.log('');
    console.log('=== APPLYING REASSIGNMENTS ===');
    let applied = 0;
    const allMatches = [...results.aliasMatched, ...results.addressMatched];
    
    for (const m of allMatches) {
      await conn.execute(
        'UPDATE services SET customerExternalId = ? WHERE externalId = ?',
        [m.targetCustomer.id, m.serviceId]
      );
      applied++;
      if (applied % 20 === 0) console.log(`  Applied ${applied}/${allMatches.length}...`);
    }
    
    // Recalculate service counts for affected customers
    const affectedCustomers = new Set([MISCHIEF_ID, ...allMatches.map(m => m.targetCustomer.id)]);
    for (const custId of affectedCustomers) {
      const [cnt] = await conn.execute(
        'SELECT COUNT(*) as c FROM services WHERE customerExternalId = ?',
        [custId]
      );
      await conn.execute(
        'UPDATE customers SET serviceCount = ? WHERE externalId = ?',
        [cnt[0].c, custId]
      );
    }
    
    console.log(`Done! Applied ${applied} reassignments.`);
    
    // Final state of Mischief Travel
    const [remaining] = await conn.execute(
      'SELECT COUNT(*) as c FROM services WHERE customerExternalId = ?',
      [MISCHIEF_ID]
    );
    console.log(`Mischief Travel now has ${remaining[0].c} services remaining.`);
  }
  
  await conn.end();
}

main().catch(console.error);
