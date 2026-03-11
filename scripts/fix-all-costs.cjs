'use strict';
/**
 * Comprehensive cost correction script for ABB and Telstra services.
 * 
 * Sources (priority order):
 * 1. smiletel.xlsx (ABB sheet) - most recent buy prices ex GST
 * 2. CustomerServiceAuditInternetFocus.xlsx (ABB ExDa) - backup buy prices ex GST
 * 3. billing_items linked via serviceExternalId - sell prices (ex GST = unitAmount)
 * 
 * Services with no cost match are set to $0 and flagged for manual review.
 * 
 * Run: node fix-all-costs.cjs [--commit]
 */
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const fs = require('fs');
require('dotenv').config();

const DRY_RUN = process.argv[2] !== '--commit';
const BUY_COL = ' Buy (ex gst) ';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // ── Load buy price maps from spreadsheets ──────────────────────────────────
  const buyPriceMap = new Map(); // connectionId -> { buy, source }

  // smiletel.xlsx ABB sheet (highest priority)
  const buf2 = fs.readFileSync('/home/ubuntu/smiletel.xlsx');
  const wb2 = XLSX.read(buf2);
  const smitelABB = XLSX.utils.sheet_to_json(wb2.Sheets['ABB']);
  for (const r of smitelABB) {
    const avc = r['AVC'];
    const buy = parseFloat(r[BUY_COL]);
    if (avc && !isNaN(buy) && buy > 0) {
      buyPriceMap.set(avc, { buy, source: 'smiletel.xlsx' });
    }
  }

  // CustomerServiceAuditInternetFocus.xlsx ABB ExDa (fills gaps)
  const buf1 = fs.readFileSync('/home/ubuntu/billing-tool/scripts/audit-source.xlsx');
  const wb1 = XLSX.read(buf1);
  const auditABB = XLSX.utils.sheet_to_json(wb1.Sheets['ABB ExDa']);
  for (const r of auditABB) {
    const avc = r['Connection ID 1'];
    const buy = parseFloat(r[BUY_COL]);
    if (avc && !isNaN(buy) && buy > 0 && !buyPriceMap.has(avc)) {
      buyPriceMap.set(avc, { buy, source: 'audit-spreadsheet' });
    }
  }

  // Fusion ExDa (fills Fusion provider services)
  const fusionData = XLSX.utils.sheet_to_json(wb1.Sheets['Fusion ExDa']);
  for (const r of fusionData) {
    const avc = r['Connection ID'];
    const buy = parseFloat(r['Buy (ex gst)']);
    if (avc && !isNaN(buy) && buy > 0 && !buyPriceMap.has(avc)) {
      buyPriceMap.set(avc, { buy, source: 'fusion-exda' });
    }
  }

  console.log('Buy price map entries:', buyPriceMap.size);

  // ── Load sell prices from billing_items ────────────────────────────────────
  // Sum all recurring billing items per service (ex GST = unitAmount)
  const [billingItems] = await conn.execute(`
    SELECT serviceExternalId, SUM(unitAmount) as totalSell, COUNT(*) as itemCount
    FROM billing_items
    WHERE serviceExternalId != '' AND serviceExternalId IS NOT NULL
    AND category NOT IN ('one-off', 'hardware-lease')
    GROUP BY serviceExternalId
  `);
  const sellPriceMap = new Map(); // serviceExternalId -> sell price
  for (const bi of billingItems) {
    sellPriceMap.set(bi.serviceExternalId, parseFloat(bi.totalSell));
  }
  console.log('Sell price map entries (from billing items):', sellPriceMap.size);

  // ── Get all non-terminated services ───────────────────────────────────────
  const [services] = await conn.execute(`
    SELECT id, externalId, connectionId, planName, provider, monthlyCost, monthlyRevenue, discoveryNotes
    FROM services
    WHERE status != 'terminated'
    ORDER BY externalId
  `);

  console.log('Total active services:', services.length);

  let buyUpdated = 0, sellUpdated = 0, flagged = 0, alreadyCorrect = 0;
  const updates = [];
  const noMatchServices = [];

  for (const s of services) {
    const priceEntry = buyPriceMap.get(s.connectionId);
    const sellPrice = sellPriceMap.get(s.externalId);
    
    const currentCost = parseFloat(s.monthlyCost);
    const currentRevenue = parseFloat(s.monthlyRevenue);
    
    let newCost = currentCost;
    let newRevenue = currentRevenue;
    let costChanged = false;
    let revenueChanged = false;
    let needsReview = false;
    let newNotes = s.discoveryNotes || '';

    // Update buy cost if we have a spreadsheet match
    if (priceEntry) {
      const correctBuy = priceEntry.buy;
      if (Math.abs(currentCost - correctBuy) / Math.max(correctBuy, 0.01) > 0.05) {
        newCost = correctBuy;
        costChanged = true;
        buyUpdated++;
      }
    } else if (s.provider === 'ABB' || s.provider === 'Fusion') {
      // ABB/Fusion service with no spreadsheet match - flag for review
      if (currentCost > 0) {
        newCost = 0;
        costChanged = true;
        needsReview = true;
        flagged++;
        noMatchServices.push(s.externalId + ' (' + s.provider + '): ' + s.planName + ' was $' + currentCost);
      } else if (currentCost === 0) {
        needsReview = true;
        flagged++;
      }
      if (needsReview && !newNotes.includes('[COST REVIEW NEEDED]')) {
        newNotes = '[COST REVIEW NEEDED] Cost price not found in spreadsheet — please verify manually. ' + (newNotes || '');
      }
    }

    // Update sell price from billing items if available and current is 0 or wrong
    if (sellPrice && sellPrice > 0) {
      if (Math.abs(currentRevenue - sellPrice) / Math.max(sellPrice, 0.01) > 0.05) {
        newRevenue = sellPrice;
        revenueChanged = true;
        sellUpdated++;
      }
    }

    if (costChanged || revenueChanged || needsReview) {
      updates.push({
        id: s.id,
        externalId: s.externalId,
        oldCost: currentCost,
        newCost,
        oldRevenue: currentRevenue,
        newRevenue,
        costChanged,
        revenueChanged,
        needsReview,
        newNotes,
        source: priceEntry ? priceEntry.source : 'none'
      });
    } else {
      alreadyCorrect++;
    }
  }

  console.log('\nSummary:');
  console.log('  Buy cost corrections: ' + buyUpdated);
  console.log('  Sell price updates (from billing): ' + sellUpdated);
  console.log('  Flagged for review (no match): ' + flagged);
  console.log('  Already correct: ' + alreadyCorrect);
  
  if (noMatchServices.length) {
    console.log('\nServices flagged for manual review (cost set to $0):');
    noMatchServices.forEach(s => console.log('  ' + s));
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN - run with --commit to apply changes');
    // Show a sample of the updates
    console.log('\nSample updates (first 10):');
    updates.slice(0, 10).forEach(u => {
      const parts = [];
      if (u.costChanged) parts.push('cost: $' + u.oldCost + ' -> $' + u.newCost + ' ex GST [' + u.source + ']');
      if (u.revenueChanged) parts.push('revenue: $' + u.oldRevenue + ' -> $' + u.newRevenue + ' ex GST');
      if (u.needsReview) parts.push('FLAGGED FOR REVIEW');
      console.log('  ' + u.externalId + ': ' + parts.join(' | '));
    });
    await conn.end();
    return;
  }

  // ── Apply updates ──────────────────────────────────────────────────────────
  console.log('\nApplying ' + updates.length + ' updates...');
  let applied = 0;
  for (const u of updates) {
    await conn.execute(
      'UPDATE services SET monthlyCost = ?, monthlyRevenue = ?, discoveryNotes = ? WHERE id = ?',
      [u.newCost, u.newRevenue, u.newNotes, u.id]
    );
    applied++;
  }

  // Recalculate all customer totals
  await conn.execute(`
    UPDATE customers c
    SET 
      totalMonthlyCost = (
        SELECT COALESCE(SUM(s.monthlyCost), 0)
        FROM services s
        WHERE s.customerId = c.id AND s.status NOT IN ('terminated', 'inactive')
      ),
      totalMonthlyRevenue = (
        SELECT COALESCE(SUM(s.monthlyRevenue), 0)
        FROM services s
        WHERE s.customerId = c.id AND s.status NOT IN ('terminated', 'inactive')
      )
  `);

  console.log('Applied ' + applied + ' service updates');
  console.log('Customer totals recalculated');
  console.log('Done!');

  await conn.end();
}

main().catch(console.error);
