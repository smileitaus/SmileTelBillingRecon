/**
 * ECN / ChannelHaus SIP Service Auto-Match & Cost Correction (v3)
 * 
 * Correct CSV column mapping (DETAIL rows):
 * col[0]  = Row type (DETAIL:)
 * col[1]  = FriendlyName — full account name e.g. "bsip_AlbnyFmDocIN"  ← MATCHING KEY
 * col[2]  = ServiceTypeID (numeric)
 * col[4]  = Name (product category)
 * col[5]  = ServiceID
 * col[7]  = Description (full line description)
 * col[8]  = Username (truncated lowercase, e.g. "bsip_albnyfmdocin")
 * col[9]  = Quantity
 * col[10] = Inc (included qty)
 * col[11] = Unit Cost
 * col[12] = Description (short label)
 * col[13] = Ex (amount ex GST)  ← COST
 * 
 * Product types:
 * - "Business SIP Channel (Qty: N)" = INBOUND @ $5.50/ch
 * - "Business SIP Channel with Local National and Mobile Calls Included (Qty: N)" = OUTBOUND @ $35/ch
 * - "Business SIP Bundle with Local National and Mobile Included (Qty: N)" = BIDIRECTIONAL @ $35/ch
 * - "Single Number Rental" = DID @ $1.20/number
 * - Usage lines = variable, NOT recurring cost
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// ── 1. Parse ECN CSV ──────────────────────────────────────────────────────────
const csvRaw = fs.readFileSync('/home/ubuntu/upload/C0280943.csv', 'utf-8');
const rows = parse(csvRaw, { relax_column_count: true, skip_empty_lines: true });

const ecnAccounts = {};

for (const row of rows) {
  if (row[0] !== 'DETAIL:') continue;
  const friendlyName = (row[1] || '').trim();  // col[1] = FriendlyName — the full name
  const description = (row[7] || '').trim();   // col[7] = Description
  const qty = parseInt(row[9]) || 0;           // col[9] = Quantity
  const exGst = parseFloat(row[13]) || 0;      // col[13] = Ex GST amount

  // Skip header row and non-account rows
  if (!friendlyName || friendlyName === 'FriendlyName' || friendlyName === '280943') continue;
  // Skip rows that are clearly not SIP accounts
  if (!friendlyName.startsWith('bsip_') && !friendlyName.startsWith('ipvm_') && !friendlyName.startsWith('pbx_')) continue;

  if (!ecnAccounts[friendlyName]) {
    const fLower = friendlyName.toLowerCase();
    const direction = fLower.endsWith('in') ? 'INBOUND'
      : fLower.endsWith('out') ? 'OUTBOUND'
      : 'BIDIRECTIONAL';
    ecnAccounts[friendlyName] = {
      friendlyName,
      direction,
      channels: 0,
      channelCostEx: 0,
      didCostEx: 0,
      usageCostEx: 0,
      totalEx: 0,
      productType: '',
    };
  }

  ecnAccounts[friendlyName].totalEx += exGst;

  const desc = description.toLowerCase();

  if (desc.includes('business sip') && desc.includes('starting')) {
    // Extract channel count from description e.g. "(Qty: 4)"
    const qtyMatch = description.match(/Qty:\s*(\d+)/i);
    if (qtyMatch) ecnAccounts[friendlyName].channels = parseInt(qtyMatch[1]);
    ecnAccounts[friendlyName].channelCostEx += exGst;

    if (desc.includes('bundle')) {
      ecnAccounts[friendlyName].productType = 'BUNDLE_ALL_INCLUSIVE';
      ecnAccounts[friendlyName].direction = 'BIDIRECTIONAL';
    } else if (desc.includes('local') && desc.includes('national')) {
      ecnAccounts[friendlyName].productType = 'OUTBOUND_ALL_CALLS';
    } else {
      ecnAccounts[friendlyName].productType = 'INBOUND_PAYG';
    }
  } else if (desc.includes('number rental')) {
    ecnAccounts[friendlyName].didCostEx += exGst;
  } else if (
    desc.includes('local calls') || desc.includes('national calls') ||
    desc.includes('mobile calls') || desc.includes('miscellaneous calls') ||
    desc.includes('1800 calls') || desc.includes('13/1300') || desc.includes('usage')
  ) {
    ecnAccounts[friendlyName].usageCostEx += exGst;
  }
}

console.log(`Parsed ${Object.keys(ecnAccounts).length} ECN accounts from CSV`);
console.log('\nECN accounts with channel cost:');
Object.values(ecnAccounts).filter(a => a.channelCostEx > 0).forEach(a => {
  console.log(`  ${a.friendlyName} | ${a.direction} | ${a.channels}ch | channel:$${a.channelCostEx.toFixed(2)} | DID:$${a.didCostEx.toFixed(2)} | usage:$${a.usageCostEx.toFixed(2)}`);
});

// ── 2. Get all ChannelHaus services from DB ───────────────────────────────────
const [dbServices] = await db.execute(
  `SELECT s.externalId, s.planName, s.serviceId, s.monthlyCost, s.monthlyRevenue, 
          s.status, s.discoveryNotes, c.name as customerName, c.externalId as custId
   FROM services s 
   JOIN customers c ON s.customerExternalId = c.externalId
   WHERE s.provider = 'ChannelHaus' AND s.status != 'terminated'`
);
console.log(`\nFound ${dbServices.length} active ChannelHaus services in DB`);

// ── 3. Build lookup from ECN accounts ────────────────────────────────────────
// Key = normalised planName (strip bsip_/ipvm_/pbx_ prefix, lowercase, no spaces/underscores)
const ecnByNorm = {};
for (const acct of Object.values(ecnAccounts)) {
  const norm = acct.friendlyName.toLowerCase()
    .replace(/^(bsip_|ipvm_|pbx_)/, '')
    .replace(/[_\s]/g, '');
  ecnByNorm[norm] = acct;
  // Also store with full friendly name (lowercase)
  ecnByNorm[acct.friendlyName.toLowerCase()] = acct;
}

// ── 4. Match and update ───────────────────────────────────────────────────────
let matched = 0, costUpdated = 0, noMatch = 0, alreadyCorrect = 0;
const unmatchedDb = [];
const matchLog = [];

for (const svc of dbServices) {
  const planRaw = (svc.planName || '').trim();
  const planNorm = planRaw.toLowerCase()
    .replace(/^(bsip_|ipvm_|pbx_)/, '')
    .replace(/[_\s]/g, '');

  // Try exact normalised match first
  let ecnMatch = ecnByNorm[planRaw.toLowerCase()] || ecnByNorm[planNorm];

  // Try partial match as fallback (for slight name variations)
  if (!ecnMatch && planNorm.length >= 6) {
    for (const [norm, acct] of Object.entries(ecnByNorm)) {
      const normClean = norm.replace(/^(bsip_|ipvm_|pbx_)/, '');
      if (normClean.length >= 6 && (normClean.includes(planNorm) || planNorm.includes(normClean))) {
        ecnMatch = acct;
        break;
      }
    }
  }

  if (!ecnMatch) {
    noMatch++;
    unmatchedDb.push({ externalId: svc.externalId, planName: planRaw, customer: svc.customerName, cost: svc.monthlyCost });
    continue;
  }

  matched++;

  // Correct monthly cost = channel rental + DID rental (both recurring)
  const correctCost = parseFloat((ecnMatch.channelCostEx + ecnMatch.didCostEx).toFixed(2));
  const currentCost = parseFloat(svc.monthlyCost || 0);

  const directionLabel = ecnMatch.direction === 'INBOUND' ? 'Inbound SIP trunk (PAYG $5.50/ch/mo)'
    : ecnMatch.direction === 'OUTBOUND' ? 'Outbound SIP trunk (All calls incl. $35/ch/mo)'
    : 'Bidirectional SIP Bundle (All calls incl. $35/ch/mo)';

  const productLabel = ecnMatch.productType === 'BUNDLE_ALL_INCLUSIVE' ? 'Business SIP Bundle (all-inclusive)'
    : ecnMatch.productType === 'OUTBOUND_ALL_CALLS' ? 'Business SIP Channel with Local/National/Mobile Included'
    : ecnMatch.productType === 'INBOUND_PAYG' ? 'Business SIP Channel (PAYG inbound)'
    : 'SIP Service';

  const newNotes = [
    `ECN account: ${ecnMatch.friendlyName}`,
    `Direction: ${ecnMatch.direction} — ${directionLabel}`,
    `Product: ${productLabel}`,
    `Channels: ${ecnMatch.channels || 'see invoice'}`,
    `ECN channel cost ex GST: $${ecnMatch.channelCostEx.toFixed(2)}/mo`,
    `ECN DID rental ex GST: $${ecnMatch.didCostEx.toFixed(2)}/mo`,
    `ECN usage charges (variable, not in recurring cost): $${ecnMatch.usageCostEx.toFixed(2)}`,
    `Infrastructure: ECN | Billing: ChannelHaus | Invoice: C0280943 Mar 2026`,
    `Light Source Computing MSP — end customer is a downstream reseller client`,
  ].join('\n');

  const updates = { serviceId: ecnMatch.friendlyName, discoveryNotes: newNotes };

  if (correctCost > 0 && Math.abs(currentCost - correctCost) > 0.05) {
    updates.monthlyCost = correctCost;
    costUpdated++;
  } else if (correctCost === 0) {
    // Don't zero out — keep existing cost, just annotate
    updates.discoveryNotes += '\nNOTE: No channel rental line in this invoice period — cost preserved from prior data. Verify with ECN portal.';
    alreadyCorrect++;
  } else {
    alreadyCorrect++;
  }

  const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
  const values = [...Object.values(updates), svc.externalId];
  await db.execute(`UPDATE services SET ${setClauses} WHERE externalId = ?`, values);

  matchLog.push({
    externalId: svc.externalId,
    customer: svc.customerName,
    planName: planRaw,
    ecnAccount: ecnMatch.friendlyName,
    direction: ecnMatch.direction,
    channels: ecnMatch.channels,
    oldCost: currentCost,
    newCost: correctCost > 0 ? correctCost : currentCost,
    costChanged: correctCost > 0 && Math.abs(currentCost - correctCost) > 0.05,
  });
}

// ── 5. Flag unmatched DB services ─────────────────────────────────────────────
for (const u of unmatchedDb) {
  await db.execute(
    `UPDATE services SET discoveryNotes = CONCAT(COALESCE(discoveryNotes,''), '\nNo ECN match found in Mar 2026 invoice (C0280943) — review for possible cancellation or re-mapping') WHERE externalId = ?`,
    [u.externalId]
  );
}

// ── 6. Update ChannelHaus supplier notes ──────────────────────────────────────
const [chSupplier] = await db.execute(`SELECT id FROM supplier_registry WHERE name = 'ChannelHaus'`);
if (chSupplier.length > 0) {
  await db.execute(
    `UPDATE supplier_registry SET notes = ? WHERE name = 'ChannelHaus'`,
    ['ECN (Hosted Voice) is the infrastructure/provisioning supplier. ChannelHaus is the billing platform for all ECN SIP services — they are the same supplier viewed from two angles. Invoice reference: C0280943 (Smile IT Pty Ltd, Client 13877, Mar 2026). Pricing: Inbound PAYG $5.50/ch/mo | Outbound all-calls $35/ch/mo | Bundle all-inclusive $35/ch/mo | DID $1.20/number/mo. All SIP services for Light Source Computing (medical/doctors) are provisioned via ECN and billed through ChannelHaus.']
  );
  console.log('\nUpdated ChannelHaus supplier notes with ECN relationship.');
}

// ── 7. Check for ECN accounts NOT in DB ───────────────────────────────────────
const dbPlanNorms = new Set(dbServices.map(s =>
  (s.planName || '').toLowerCase().replace(/^(bsip_|ipvm_|pbx_)/, '').replace(/[_\s]/g, '')
));

const ecnNotInDb = [];
for (const acct of Object.values(ecnAccounts)) {
  const norm = acct.friendlyName.toLowerCase().replace(/^(bsip_|ipvm_|pbx_)/, '').replace(/[_\s]/g, '');
  const found = [...dbPlanNorms].some(p => p === norm || (p.length >= 6 && (p.includes(norm) || norm.includes(p))));
  if (!found && acct.channelCostEx > 0) ecnNotInDb.push(acct);
}

// ── 8. Summary ────────────────────────────────────────────────────────────────
console.log('\n=== ECN AUTO-MATCH RESULTS ===');
console.log(`Matched: ${matched} / ${dbServices.length} DB services`);
console.log(`Cost updated: ${costUpdated}`);
console.log(`Already correct / preserved: ${alreadyCorrect}`);
console.log(`No ECN match (DB services): ${noMatch}`);
console.log(`ECN accounts not in DB (with channel cost): ${ecnNotInDb.length}`);

console.log('\n=== COST CORRECTIONS ===');
matchLog.filter(m => m.costChanged).forEach(m => {
  const diff = m.newCost - m.oldCost;
  const sign = diff > 0 ? '+' : '';
  console.log(`${m.externalId} | ${m.customer.substring(0,28)} | ${m.planName} | ${m.direction} | ${m.channels}ch | $${m.oldCost} → $${m.newCost} (${sign}$${diff.toFixed(2)})`);
});

console.log('\n=== UNMATCHED DB SERVICES ===');
unmatchedDb.forEach(u => console.log(`${u.externalId} | ${u.customer} | planName:"${u.planName}" | cost:$${u.cost}`));

console.log('\n=== ECN ACCOUNTS NOT IN DB (missing services) ===');
ecnNotInDb.forEach(a => console.log(`${a.friendlyName} | ${a.direction} | ${a.channels}ch | channel:$${a.channelCostEx.toFixed(2)} | total:$${a.totalEx.toFixed(2)}`));

await db.end();
console.log('\nDone.');
