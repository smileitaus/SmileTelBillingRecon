/**
 * Datagate Jan 2026 billing items import + service matching script
 * All prices are ex-GST as confirmed from Datagate API (taxInclusive=false on all items)
 */
import fs from 'fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/SmileTelBillingRecon/.env' });

const data = JSON.parse(fs.readFileSync('/home/ubuntu/datagate_jan2026.json', 'utf8'));

// ── Helpers ──────────────────────────────────────────────────────────────────
function slug(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fuzzyMatch(a, b) {
  const sa = slug(a), sb = slug(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1.0;
  if (sa.includes(sb) || sb.includes(sa)) return 0.9;
  // Levenshtein-based similarity
  const longer = sa.length > sb.length ? sa : sb;
  const shorter = sa.length > sb.length ? sb : sa;
  const dist = levenshtein(longer, shorter);
  return (longer.length - dist) / longer.length;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// Map Datagate product labels to service types
function inferServiceType(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('internet') || l.includes('nbn') || l.includes('broadband') || l.includes('fibre') || l.includes('fiber')) return 'Data';
  if (l.includes('voice') || l.includes('sip') || l.includes('phone') || l.includes('pbx') || l.includes('hunt') || l.includes('voicemail') || l.includes('collaboration') || l.includes('basic') || l.includes('premium') || l.includes('support')) return 'Voice';
  if (l.includes('mobile') || l.includes('sim') || l.includes('4g') || l.includes('lte')) return 'Mobile';
  if (l.includes('managed') || l.includes('support')) return 'Managed';
  return 'Voice'; // default for Datagate (mostly UCaaS)
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // ── Step 1: Build customer name → externalId lookup ──────────────────────
  const [custRows] = await conn.execute(
    "SELECT externalId, name FROM customers WHERE billingPlatforms LIKE '%DataGate%' OR billingPlatforms LIKE '%DATAGATE%'"
  );
  const customerMap = {};
  for (const c of custRows) {
    customerMap[slug(c.name)] = c.externalId;
  }
  console.log(`Loaded ${custRows.length} DataGate customers from DB`);

  // ── Step 2: Build service lookup per customer ─────────────────────────────
  const [svcRows] = await conn.execute(
    `SELECT s.externalId, s.serviceType, s.planName, s.serviceTypeDetail, s.customerExternalId, s.monthlyRevenue, s.monthlyCost
     FROM services s
     JOIN customers c ON s.customerExternalId = c.externalId
     WHERE (c.billingPlatforms LIKE '%DataGate%' OR c.billingPlatforms LIKE '%DATAGATE%')
     AND s.status = 'active'`
  );
  // Group by customerExternalId
  const servicesByCustomer = {};
  for (const s of svcRows) {
    if (!servicesByCustomer[s.customerExternalId]) servicesByCustomer[s.customerExternalId] = [];
    servicesByCustomer[s.customerExternalId].push(s);
  }
  console.log(`Loaded ${svcRows.length} active services for DataGate customers`);

  // ── Step 3: Check existing DataGate billing items ─────────────────────────
  const [existingItems] = await conn.execute("SELECT externalId FROM billing_items WHERE billingPlatform = 'DataGate'");
  const existingIds = new Set(existingItems.map(r => r.externalId));
  console.log(`Existing DataGate billing items: ${existingIds.size}`);

  // ── Step 4: Import billing items and match to services ────────────────────
  let inserted = 0, skipped = 0, matched = 0, unmatched = 0;
  const assignments = [];

  for (const customer of data) {
    // Find customer externalId
    const custExtId = customerMap[slug(customer.customerName)];
    if (!custExtId) {
      console.warn(`  ⚠ No DB match for customer: "${customer.customerName}"`);
      continue;
    }

    const custServices = servicesByCustomer[custExtId] || [];

    for (const tx of customer.transactions) {
      if (tx.isOneOff) continue; // skip one-off charges for now

      const biExternalId = `DG-${tx.id.replace(/-/g, '').substring(0, 28)}`;
      
      if (existingIds.has(biExternalId)) {
        skipped++;
        continue;
      }

      // All prices confirmed ex-GST from Datagate API
      const unitAmountExGST = tx.sell;           // ex-GST sell price per unit
      const lineAmountExGST = Math.round(tx.sell * tx.qty * 100) / 100; // ex-GST line total
      const taxAmount = Math.round(lineAmountExGST * 0.1 * 100) / 100;  // 10% GST

      // Determine match status and service
      let matchStatus = 'unmatched';
      let matchConfidence = '';
      let serviceExternalId = '';
      let bestScore = 0;
      let bestService = null;

      const txType = inferServiceType(tx.productLabel);

      // Try to match to a service
      for (const svc of custServices) {
        // Score based on service type match + name similarity
        let score = 0;
        if (svc.serviceType === txType) score += 0.4;
        
        // Name similarity between product label and plan name
        const nameSim = fuzzyMatch(tx.productLabel, svc.planName);
        score += nameSim * 0.6;

        // Bonus: if serviceItem description matches
        if (tx.serviceItemDescription) {
          const descSim = fuzzyMatch(tx.serviceItemDescription, svc.planName);
          score = Math.max(score, descSim * 0.8);
        }

        if (score > bestScore) {
          bestScore = score;
          bestService = svc;
        }
      }

      if (bestScore >= 0.7 && bestService) {
        matchStatus = 'matched';
        matchConfidence = bestScore >= 0.9 ? 'high' : 'medium';
        serviceExternalId = bestService.externalId;
        matched++;
        assignments.push({ biExternalId, serviceExternalId, score: bestScore, label: tx.productLabel, customer: customer.customerName });
      } else if (bestScore >= 0.5 && bestService) {
        matchStatus = 'review';
        matchConfidence = 'low';
        serviceExternalId = bestService.externalId;
        unmatched++;
      } else {
        matchStatus = 'unmatched';
        matchConfidence = '';
        unmatched++;
      }

      // Insert billing item
      await conn.execute(
        `INSERT INTO billing_items 
         (externalId, invoiceDate, invoiceNumber, contactName, description, quantity, unitAmount, discount, lineAmount, taxAmount, accountCode, category, customerExternalId, serviceExternalId, matchStatus, matchConfidence, billingPlatform)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          biExternalId,
          '2026-01-31',                    // Jan 2026 period end
          tx.invoiceNumber || 'DG-JAN2026',
          customer.customerName,
          tx.productLabel,
          tx.qty,
          unitAmountExGST,                 // ex-GST unit price
          0,
          lineAmountExGST,                 // ex-GST line total
          taxAmount,
          '',
          tx.isOneOff ? 'one-off' : 'recurring',
          custExtId,
          serviceExternalId,
          matchStatus,
          matchConfidence,
          'DataGate'
        ]
      );
      inserted++;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   Inserted: ${inserted} billing items`);
  console.log(`   Skipped (already exist): ${skipped}`);
  console.log(`   Matched to services: ${matched}`);
  console.log(`   Unmatched/review: ${unmatched}`);

  // ── Step 5: Create service_billing_assignments for matched items ──────────
  let assignInserted = 0;
  for (const a of assignments) {
    try {
      // Get the billing item id
      const [biRows] = await conn.execute('SELECT id FROM billing_items WHERE externalId = ?', [a.biExternalId]);
      if (!biRows.length) continue;
      const biId = biRows[0].id;

      // Check if assignment already exists
      const [existAssign] = await conn.execute(
        'SELECT id FROM service_billing_assignments WHERE billingItemId = ? AND serviceExternalId = ?',
        [biId, a.serviceExternalId]
      );
      if (existAssign.length) continue;

      await conn.execute(
        'INSERT INTO service_billing_assignments (billingItemId, serviceExternalId, allocationPercent, notes) VALUES (?, ?, ?, ?)',
        [biId, a.serviceExternalId, 100, `Auto-matched: ${a.label} (score: ${a.score.toFixed(2)})`]
      );
      assignInserted++;
    } catch(e) {
      // assignment table might have different structure
      console.warn('Assignment insert error:', e.message);
    }
  }
  console.log(`   Service assignments created: ${assignInserted}`);

  // ── Step 6: Update monthlyRevenue on matched services ────────────────────
  // For each matched service, sum up all DataGate billing item line amounts
  const [updateRows] = await conn.execute(`
    SELECT bi.serviceExternalId, SUM(bi.lineAmount) as totalRevenue
    FROM billing_items bi
    WHERE bi.billingPlatform = 'DataGate'
    AND bi.matchStatus = 'matched'
    AND bi.serviceExternalId != ''
    GROUP BY bi.serviceExternalId
  `);

  let revenueUpdated = 0;
  for (const row of updateRows) {
    const [svcCheck] = await conn.execute(
      'SELECT monthlyRevenue FROM services WHERE externalId = ?',
      [row.serviceExternalId]
    );
    if (!svcCheck.length) continue;
    
    // Only update if revenue is currently 0 (don't overwrite existing revenue)
    if (parseFloat(svcCheck[0].monthlyRevenue) === 0) {
      await conn.execute(
        'UPDATE services SET monthlyRevenue = ? WHERE externalId = ?',
        [row.totalRevenue, row.serviceExternalId]
      );
      revenueUpdated++;
    }
  }
  console.log(`   Service revenues updated: ${revenueUpdated}`);

  await conn.end();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
