/**
 * Exetel Invoice Import Script
 * 
 * Parses the three Exetel CSV invoices, matches services to existing customers,
 * creates new customers/services where needed, and updates all cost touchpoints
 * using the most recent (March 2026) invoice as the source of truth for recurring costs.
 * 
 * All prices in the CSVs are inc-GST. We store ex-GST (divide by 1.1).
 * Invoice numbers and supplier account data are also stored.
 */

import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { randomBytes } from 'crypto';

dotenv.config();

function randomId(prefix) {
  return prefix + randomBytes(3).toString('hex').toUpperCase();
}

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function exGst(incGst) {
  // Remove $ and commas, parse, divide by 1.1
  const val = parseFloat(String(incGst).replace(/[$,]/g, ''));
  if (isNaN(val)) return 0;
  return Math.round((val / 1.1) * 100) / 100;
}

function parseExetelCsv(filepath) {
  const content = readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  
  // Find header row
  let headerIdx = null;
  let invoiceNum = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Invoice #:')) {
      invoiceNum = lines[i].split('Invoice #:')[1].trim();
    }
    if (lines[i].includes('Item ID') && lines[i].includes('Reference No')) {
      headerIdx = i;
      break;
    }
  }
  
  if (headerIdx === null) throw new Error('Could not find header row in ' + filepath);
  
  const headers = lines[headerIdx].split(',').map(h => h.trim());
  const rows = [];
  
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('Subtotal') || line.startsWith('Freight') || 
        line.startsWith('GST') || line.startsWith('Total') || 
        line.startsWith('Payment') || line.startsWith('Bank')) break;
    
    // Use csv-parse for proper quoted field handling
    try {
      const parsed = parse(line, { relax_quotes: true, skip_empty_lines: true });
      if (!parsed || !parsed[0]) continue;
      const fields = parsed[0];
      if (!fields[0] || !fields[0].toString().match(/^\d+$/)) continue;
      
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = (fields[idx] || '').toString().trim();
      });
      rows.push(row);
    } catch (e) {
      // skip malformed rows
    }
  }
  
  return { rows, invoiceNum };
}

// ── Customer / Service Matching Map ──────────────────────────────────────────
// Maps Exetel service number → existing customer externalId (or null = new)
const CUSTOMER_MAP = {
  '0701561050': null,           // Broadband NBN - no existing customer match
  '0403182994': 'C0015',        // ASG Tomago → ASG Hail Pty Ltd
  '0731731992': 'C2661',        // Spicers HO → Spicers Retreats Hotels and Lodges
  '0749850000': 'C0157',        // MMC Mine → Mammoth Underground Mine Management
  '0734334112': null,           // Air Restore NBN EE 100MB - new customer (cancelled in Mar)
  '0734334114': 'C2659',        // Spicers Clovelly → Spicers Clovelly Estate
  '0755045018': null,           // Makris GC 100mbps - new customer
  '0755045019': 'C2664',        // Spicers Vineyards → Spicers Vineyards
  '0755045020': 'C2486',        // Smile Tingalpa → UN 5, 40 CONTAINER ST, TINGALPA QLD
  '0730541945': 'C0168',        // Niclin → Niclin Constructions Pty Ltd
  '0755045021': null,           // GWCP 100/100 - new customer
  '0755045022': 'C0037',        // BGC Engineering → BGC Engineering
  '0755045023': 'C0037',        // BCG Engineering backup → BGC Engineering (same)
};

// New customers to create for unmatched services
const NEW_CUSTOMERS = {
  '0701561050': { name: 'Exetel NBN Service (0701561050)', serviceNum: '0701561050' },
  '0734334112': { name: 'Air Restore', serviceNum: '0734334112' },
  '0755045018': { name: 'Makris Gold Coast', serviceNum: '0755045018' },
  '0755045021': { name: 'GWCP 100/100', serviceNum: '0755045021' },
};

async function run() {
  const conn = await createConnection(process.env.DATABASE_URL);
  
  console.log('Parsing Exetel invoices...');
  const jan = parseExetelCsv('/home/ubuntu/billing-tool/INV-2026-01-01-E0082384405.csv');
  const feb = parseExetelCsv('/home/ubuntu/billing-tool/INV-2026-02-01-E0083030747.csv');
  const mar = parseExetelCsv('/home/ubuntu/billing-tool/INV-2026-03-01-E0083669786.csv');
  
  console.log(`Jan: ${jan.rows.length} rows (${jan.invoiceNum})`);
  console.log(`Feb: ${feb.rows.length} rows (${feb.invoiceNum})`);
  console.log(`Mar: ${mar.rows.length} rows (${mar.invoiceNum})`);
  
  // Build a map of service number → most recent recurring cost (from Mar invoice)
  // Only include recurring charges with cost > 0
  const recurringCosts = {};
  for (const row of mar.rows) {
    const svcNum = row['Service Number'] || row[' Service Number'] || '';
    const chargeType = row['Charge Type'] || '';
    const totalIncGst = row['Total (inc-GST)'] || '';
    const idTag = row['ID Tag'] || '';
    const category = row['Category'] || '';
    const desc = row[' Item Description'] || row['Item Description'] || '';
    const avcId = row[' AVC Id'] || row['AVC Id'] || '';
    const billStart = row['Bill Start Date'] || '';
    const billEnd = row['Bill End Date'] || '';
    
    if (chargeType.toLowerCase().includes('recurring') && svcNum && CUSTOMER_MAP.hasOwnProperty(svcNum)) {
      const cost = exGst(totalIncGst);
      // Aggregate costs per service (some have multiple recurring lines)
      if (!recurringCosts[svcNum]) {
        recurringCosts[svcNum] = {
          totalExGst: 0,
          idTag,
          category,
          desc,
          avcId: avcId !== '-' ? avcId : '',
          billStart,
          billEnd,
          lines: [],
        };
      }
      recurringCosts[svcNum].totalExGst += cost;
      recurringCosts[svcNum].lines.push({ desc: desc.substring(0, 80), cost, chargeType });
    }
  }
  
  console.log('\nRecurring costs from Mar 2026:');
  for (const [svcNum, data] of Object.entries(recurringCosts)) {
    console.log(`  ${svcNum} | ${data.idTag} | ex-GST: $${data.totalExGst.toFixed(2)}`);
  }
  
  // ── Step 1: Create new customers for unmatched services ───────────────────
  const createdCustomers = {};
  for (const [svcNum, custData] of Object.entries(NEW_CUSTOMERS)) {
    const extId = 'C' + randomId('').substring(0, 4);
    await conn.execute(
      `INSERT INTO customers (externalId, name, businessName, status, serviceCount, createdAt, updatedAt)
       VALUES (?, ?, '', 'active', 0, ?, ?)`,
      [extId, custData.name, nowIso(), nowIso()]
    );
    createdCustomers[svcNum] = extId;
    console.log(`\nCreated customer: ${extId} | ${custData.name}`);
  }
  
  // ── Step 2: For each recurring Exetel service, create or update service record ──
  const results = { created: [], updated: [], skipped: [] };
  
  for (const [svcNum, costData] of Object.entries(recurringCosts)) {
    const customerExtId = CUSTOMER_MAP[svcNum] || createdCustomers[svcNum];
    if (!customerExtId) {
      results.skipped.push(svcNum);
      continue;
    }
    
    const costExGst = costData.totalExGst;
    const idTag = costData.idTag;
    const avcId = costData.avcId;
    
    // Determine service type from category
    let serviceType = 'Internet';
    if (costData.category === 'Hosting') serviceType = 'Other';
    
    // Check if a service already exists for this customer with this phone/service number
    const [existing] = await conn.execute(
      "SELECT externalId, monthlyCost, provider, status FROM services WHERE phoneNumber = ? LIMIT 1",
      [svcNum]
    );
    
    if (existing.length > 0) {
      // Update existing service
      const svc = existing[0];
      await conn.execute(
        `UPDATE services SET 
          monthlyCost = ?,
          provider = 'Exetel',
          supplierName = 'Exetel',
          supplierAccount = ?,
          avcId = CASE WHEN ? != '' THEN ? ELSE avcId END,
          carbonAlias = ?,
          status = CASE WHEN status = 'terminated' THEN 'terminated' ELSE 'active' END,
          updatedAt = ?
         WHERE externalId = ?`,
        [costExGst, mar.invoiceNum, avcId, avcId, idTag, nowIso(), svc.externalId]
      );
      results.updated.push({ svcNum, serviceExtId: svc.externalId, customerExtId, cost: costExGst, idTag });
      console.log(`Updated service ${svc.externalId} for ${customerExtId}: ${idTag} = $${costExGst}/mth (ex-GST)`);
    } else {
      // Create new service record
      const newSvcId = 'S' + randomId('').substring(0, 4);
      const now = nowIso();
      
      // Check if service is cancelled in Mar (Air Restore had cancellation credit)
      const isCancelled = svcNum === '0734334112';
      const status = isCancelled ? 'terminated' : 'active';
      
      await conn.execute(
        `INSERT INTO services (
          externalId, serviceType, serviceTypeDetail, planName, status,
          customerExternalId, customerName, phoneNumber, provider, supplierName,
          supplierAccount, avcId, carbonAlias, monthlyCost,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Exetel', 'Exetel', ?, ?, ?, ?, ?, ?)`,
        [
          newSvcId, serviceType, costData.category,
          costData.desc.substring(0, 100), status,
          customerExtId,
          idTag, // customerName field
          svcNum, // phoneNumber used as service number
          mar.invoiceNum, // supplierAccount = invoice number
          avcId,
          idTag, // carbonAlias = friendly name
          costExGst,
          now, now
        ]
      );
      results.created.push({ svcNum, serviceExtId: newSvcId, customerExtId, cost: costExGst, idTag });
      console.log(`Created service ${newSvcId} for ${customerExtId}: ${idTag} = $${costExGst}/mth (ex-GST)`);
      
      // Update customer service count
      await conn.execute(
        "UPDATE customers SET serviceCount = serviceCount + 1, status = 'active', updatedAt = ? WHERE externalId = ?",
        [nowIso(), customerExtId]
      );
    }
  }
  
  // ── Step 3: Store invoice records ─────────────────────────────────────────
  // Check if invoices table exists
  const [tables] = await conn.execute("SHOW TABLES LIKE 'supplier_invoices'");
  if (tables.length === 0) {
    console.log('\nNote: supplier_invoices table does not exist - skipping invoice storage');
  }
  
  // ── Step 4: Handle cancelled service (Air Restore - 0734334112) ───────────
  // It had a cancellation credit in March, so mark as terminated
  const [airRestoreSvc] = await conn.execute(
    "SELECT externalId FROM services WHERE phoneNumber = '0734334112' LIMIT 1"
  );
  if (airRestoreSvc.length > 0) {
    await conn.execute(
      "UPDATE services SET status = 'terminated', updatedAt = ? WHERE externalId = ?",
      [nowIso(), airRestoreSvc[0].externalId]
    );
    console.log(`\nMarked Air Restore service ${airRestoreSvc[0].externalId} as terminated (cancellation in Mar 2026)`);
  }
  
  // ── Step 5: Recalculate service counts for affected customers ─────────────
  const affectedCustomers = new Set([
    ...Object.values(CUSTOMER_MAP).filter(Boolean),
    ...Object.values(createdCustomers),
  ]);
  
  for (const custId of affectedCustomers) {
    const [countResult] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM services WHERE customerExternalId = ? AND status NOT IN ('terminated')",
      [custId]
    );
    const cnt = countResult[0].cnt;
    const newStatus = cnt > 0 ? 'active' : 'inactive';
    await conn.execute(
      "UPDATE customers SET serviceCount = ?, status = ?, updatedAt = ? WHERE externalId = ?",
      [cnt, newStatus, nowIso(), custId]
    );
  }
  
  console.log('\n=== IMPORT COMPLETE ===');
  console.log(`Created: ${results.created.length} services`);
  console.log(`Updated: ${results.updated.length} services`);
  console.log(`Skipped: ${results.skipped.length}`);
  console.log('\nCreated services:');
  for (const r of results.created) {
    console.log(`  ${r.serviceExtId} | ${r.idTag} | Customer: ${r.customerExtId} | $${r.cost}/mth ex-GST`);
  }
  console.log('\nUpdated services:');
  for (const r of results.updated) {
    console.log(`  ${r.serviceExtId} | ${r.idTag} | Customer: ${r.customerExtId} | $${r.cost}/mth ex-GST`);
  }
  
  await conn.end();
}

run().catch(console.error);
