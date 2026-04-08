/**
 * Apply Feb 2026 Xero matches to the database:
 * 1. Upsert all billing items from the Xero export
 * 2. Update serviceExternalId and matchStatus on each billing item
 * 3. Recalculate monthlyRevenue on all affected services
 * 4. Recalculate customer stats
 * 5. Export unmatched items to Excel
 */

import mysql2 from 'mysql2/promise';
import xlsx from 'xlsx';
import fs from 'fs';

const DB_URL = process.env.DATABASE_URL;

function normalize(s) {
  let str = s || '';
  const parenMatch = str.match(/\(([^)]+)\)/);
  if (parenMatch) str = parenMatch[1];
  const forMatch = str.match(/\bfor\s+(.+)$/i);
  if (forMatch) str = forMatch[1];
  return str.toLowerCase()
    .replace(/\bpty\b|\bltd\b|\bproprietary\b|\binc\b|\bcorp\b|\bunit trust\b|\bthe trustee for\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPhones(s) {
  const raw = (s || '').replace(/\s/g, '');
  return [...new Set(raw.match(/0[2-9]\d{8}/g) || [])];
}

function extractAvcIds(s) {
  return (s.match(/AVC\d{10,}/gi) || []).map(m => m.toUpperCase());
}

function extractAaptLineNumbers(s) {
  return (s.match(/\b[5-9]\d{6}\b/g) || []);
}

function extractSpeedTier(s) {
  const direct = s.match(/\b(\d+)\/(\d+)\b/);
  if (direct) return `${direct[1]}/${direct[2]}`;
  const planCode = s.match(/(?:TFS|NBNEE|TMLL|NBN|SMB\s*NBN)\s*(\d+)/i);
  if (planCode) {
    const speed = parseInt(planCode[1]);
    if (speed >= 1000) return '1000/50';
    if (speed >= 500) return '500/200';
    if (speed >= 250) return '250/25';
    if (speed >= 100) return '100/40';
    if (speed >= 75) return '75/20';
    if (speed >= 50) return '50/20';
    if (speed >= 25) return '25/10';
    if (speed >= 12) return '12/1';
  }
  return null;
}

function wordOverlap(a, b) {
  const wa = new Set(a.split(' ').filter(w => w.length > 2));
  const wb = new Set(b.split(' ').filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

function detectServiceType(desc) {
  const d = desc.toLowerCase();
  if (d.includes('nbn') || d.includes('internet') || d.includes('broadband') || d.includes('fibre') || d.includes('bundle') || d.includes('connectivity') || d.match(/\d+\/\d+/)) return 'Internet';
  if (d.includes('mobile') || d.includes('sim') || d.includes('data plan')) return 'Mobile';
  if (d.includes('did') || d.includes('direct in dial') || d.includes('1300') || d.includes('1800') || d.includes('number hosting') || d.includes('voice') || d.includes('phone') || d.includes('hosted') || d.includes('ucxcel') || d.includes('smiletel') || d.includes('user license') || d.includes('trunk') || d.includes('call')) return 'Voice';
  return null;
}

function detectProviderHint(desc) {
  const d = desc.toLowerCase();
  if (d.includes('aapt') || d.includes('ip-line')) return 'AAPT';
  if (d.match(/\btfs\d+\b|\btmll\d+\b|\bnbnee\d+\b/)) return 'Exetel';
  if (d.includes('telstra')) return 'Telstra';
  if (d.includes('abb') || d.includes('aussie broadband')) return 'ABB';
  if (d.includes('vocus')) return 'Vocus';
  if (d.includes('sasboss') || d.includes('access4') || d.includes('ucxcel') || d.includes('smiletel')) return 'SasBoss';
  return null;
}

async function main() {
  const conn = await mysql2.createConnection(DB_URL);

  // Load all active services
  const [services] = await conn.execute(`
    SELECT s.externalId, s.planName, s.serviceType, s.provider, s.phoneNumber,
           s.avcId, s.customerExternalId, s.monthlyCost, s.monthlyRevenue, s.status,
           c.name as customerName
    FROM services s
    JOIN customers c ON s.customerExternalId = c.externalId
    WHERE s.status NOT IN ('terminated','archived')
  `);

  // Build indexes
  const byAvcId = {}, byPhone = {}, byAaptLine = {}, byCustomer = {};

  for (const svc of services) {
    if (svc.avcId) {
      const avc = svc.avcId.toUpperCase();
      if (!byAvcId[avc]) byAvcId[avc] = [];
      byAvcId[avc].push(svc);
    }
    if (svc.phoneNumber) {
      for (const p of extractPhones(svc.phoneNumber + ' ' + svc.phoneNumber.replace(/\s/g,''))) {
        if (!byPhone[p]) byPhone[p] = [];
        if (!byPhone[p].find(s => s.externalId === svc.externalId)) byPhone[p].push(svc);
      }
    }
    for (const ln of extractAaptLineNumbers(svc.planName || '')) {
      if (!byAaptLine[ln]) byAaptLine[ln] = [];
      byAaptLine[ln].push(svc);
    }
    if (svc.externalId?.startsWith('SVC')) {
      const svcNum = svc.externalId.replace('SVC', '');
      if (!byAaptLine[svcNum]) byAaptLine[svcNum] = [];
      byAaptLine[svcNum].push(svc);
    }
    const normName = normalize(svc.customerName);
    if (!byCustomer[normName]) byCustomer[normName] = [];
    byCustomer[normName].push(svc);
  }

  function matchService(contactName, description, lineAmount) {
    const desc = String(description || '');
    const contact = String(contactName || '');
    const normContact = normalize(contact);

    for (const avc of extractAvcIds(desc)) {
      if (byAvcId[avc]?.length) return { service: byAvcId[avc][0], method: 'avc_id', confidence: 100 };
    }

    if (desc.includes('IP-Line') || desc.includes('AAPT') || desc.match(/\b[5-9]\d{6}\b/)) {
      for (const ln of extractAaptLineNumbers(desc)) {
        if (byAaptLine[ln]?.length) {
          const candidates = byAaptLine[ln];
          const nameMatch = candidates.find(s => wordOverlap(normalize(s.customerName), normContact) > 0.2);
          return { service: nameMatch || candidates[0], method: 'aapt_line', confidence: 98 };
        }
      }
    }

    for (const phone of extractPhones(desc)) {
      if (byPhone[phone]?.length) {
        const candidates = byPhone[phone];
        const nameMatch = candidates.find(s => wordOverlap(normalize(s.customerName), normContact) > 0.2);
        return { service: nameMatch || candidates[0], method: 'phone', confidence: 95 };
      }
    }

    const speedTier = extractSpeedTier(desc);
    const svcType = detectServiceType(desc);
    const providerHint = detectProviderHint(desc);

    let bestScore = 0, bestSvcs = null;
    for (const [normName, svcs] of Object.entries(byCustomer)) {
      const score = wordOverlap(normName, normContact);
      if (score > bestScore) { bestScore = score; bestSvcs = svcs; }
    }

    if (bestScore < 0.25 || !bestSvcs) return null;

    if (speedTier) {
      const speedMatch = bestSvcs.find(s => (s.planName || '').includes(speedTier) || (s.avcId && s.serviceType === 'Internet'));
      if (speedMatch) return { service: speedMatch, method: 'customer_speed_tier', confidence: Math.round(bestScore * 90) };
    }

    if (providerHint) {
      const provMatch = bestSvcs.find(s => s.provider === providerHint);
      if (provMatch) {
        if (svcType && provMatch.serviceType === svcType) return { service: provMatch, method: 'customer_provider_type', confidence: Math.round(bestScore * 85) };
        return { service: provMatch, method: 'customer_provider', confidence: Math.round(bestScore * 75) };
      }
    }

    if (svcType) {
      const typeMatches = bestSvcs.filter(s => s.serviceType === svcType);
      if (typeMatches.length === 1) return { service: typeMatches[0], method: 'customer_type_exact', confidence: Math.round(bestScore * 80) };
      if (typeMatches.length > 1) {
        const amount = parseFloat(lineAmount) || 0;
        const closest = typeMatches.reduce((best, s) => {
          const diff = Math.abs((s.monthlyRevenue || s.monthlyCost || 0) - amount);
          const bestDiff = Math.abs((best.monthlyRevenue || best.monthlyCost || 0) - amount);
          return diff < bestDiff ? s : best;
        });
        return { service: closest, method: 'customer_type_amount', confidence: Math.round(bestScore * 70) };
      }
    }

    if (bestScore >= 0.4) return { service: bestSvcs[0], method: 'customer_fallback', confidence: Math.round(bestScore * 60) };
    return null;
  }

  // Load Xero export
  const wb = xlsx.readFile('/home/ubuntu/upload/CopyofSmileTelFeb26_523820646027958636.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = xlsx.utils.sheet_to_json(ws, { header: 1 });
  const dataRows = allRows.slice(1).filter(r => r[2]);
  console.log(`Processing ${dataRows.length} Xero rows...`);

  // Get existing billing item IDs for Feb 2026 to avoid duplicates
  const [existingItems] = await conn.execute(`
    SELECT externalId, invoiceNumber, description, lineAmount FROM billing_items
    WHERE invoiceDate >= '2026-02-01' AND invoiceDate < '2026-03-01'
  `);
  const existingSet = new Set(existingItems.map(r => `${r.invoiceNumber}|${(r.description||'').substring(0,50)}|${r.lineAmount}`));
  console.log(`Found ${existingItems.length} existing Feb 2026 billing items`);

  const matched = [], unmatched = [];
  let inserted = 0, updated = 0;
  const affectedServices = new Set();
  const affectedCustomers = new Set();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const [invoiceDate, invoiceNumber, contactName, description, quantity, unitAmount, discount, lineAmount, taxAmount, accountCode] = row;
    const amount = parseFloat(lineAmount) || 0;

    if (!contactName) continue;

    const rowKey = `${invoiceNumber}|${(description||'').substring(0,50)}|${amount}`;
    const match = amount > 0 ? matchService(contactName, description, amount) : null;

    if (amount <= 0) {
      unmatched.push({ invoiceDate, invoiceNumber, contactName, description, lineAmount: amount, reason: 'Credit/zero amount' });
      continue;
    }

    if (!match) {
      unmatched.push({ invoiceDate, invoiceNumber, contactName, description, lineAmount: amount, reason: 'No matching service found' });
    } else {
      matched.push({ invoiceDate, invoiceNumber, contactName, description, lineAmount: amount, ...match });
      affectedServices.add(match.service.externalId);
      affectedCustomers.add(match.service.customerExternalId);
    }

    // Upsert billing item
    const externalId = `BI-FEB26-${String(i).padStart(5,'0')}`;
    const svcId = match?.service?.externalId || null;
    const custId = match?.service?.customerExternalId || null;
    const matchStatus = match ? 'service-matched' : 'unmatched';
    const confidence = match?.confidence || 0;
    const category = detectServiceType(description || '') || 'Other';

    if (existingSet.has(rowKey)) {
      // Update existing item's match
      await conn.execute(`
        UPDATE billing_items SET 
          serviceExternalId = ?, customerExternalId = ?, matchStatus = ?, matchConfidence = ?, updatedAt = NOW()
        WHERE invoiceNumber = ? AND SUBSTRING(description, 1, 50) = ? AND lineAmount = ?
          AND invoiceDate >= '2026-02-01' AND invoiceDate < '2026-03-01'
      `, [svcId, custId, matchStatus, confidence, invoiceNumber, (description||'').substring(0,50), amount]);
      updated++;
    } else {
      // Insert new item
      await conn.execute(`
        INSERT INTO billing_items (externalId, invoiceDate, invoiceNumber, contactName, description, quantity, unitAmount, discount, lineAmount, taxAmount, accountCode, category, customerExternalId, serviceExternalId, matchStatus, matchConfidence, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [externalId, invoiceDate, invoiceNumber, contactName, description, quantity || 1, unitAmount || amount, discount || 0, amount, taxAmount || 0, accountCode, category, custId, svcId, matchStatus, confidence]);
      inserted++;
    }
  }

  console.log(`Inserted: ${inserted}, Updated: ${updated}`);
  console.log(`Matched: ${matched.length}, Unmatched: ${unmatched.length}`);

  // Recalculate monthlyRevenue for affected services
  console.log(`\nRecalculating ${affectedServices.size} services...`);
  for (const svcId of affectedServices) {
    await conn.execute(`
      UPDATE services SET
        monthlyRevenue = (
          SELECT COALESCE(SUM(lineAmount), 0) FROM billing_items
          WHERE serviceExternalId = ? AND matchStatus = 'service-matched' AND lineAmount > 0
            AND invoiceDate >= '2026-02-01' AND invoiceDate < '2026-03-01'
        ),
        updatedAt = NOW()
      WHERE externalId = ?
    `, [svcId, svcId]);
  }

  // Recalculate customer stats
  console.log(`Recalculating ${affectedCustomers.size} customers...`);
  for (const custId of affectedCustomers) {
    await conn.execute(`
      UPDATE customers SET
        monthlyRevenue = (SELECT COALESCE(SUM(s.monthlyRevenue),0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')),
        monthlyCost    = (SELECT COALESCE(SUM(s.monthlyCost),0)    FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')),
        marginPercent  = ROUND(
          ((SELECT COALESCE(SUM(s.monthlyRevenue),0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived'))
           - (SELECT COALESCE(SUM(s.monthlyCost),0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')))
          / NULLIF((SELECT COALESCE(SUM(s.monthlyRevenue),0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')),0)
          * 100, 2),
        updatedAt = NOW()
      WHERE externalId = ?
    `, [custId, custId, custId, custId, custId, custId]);
  }

  // Export unmatched items to Excel
  const unmatchedWb = xlsx.utils.book_new();
  const unmatchedData = [
    ['Invoice Date', 'Invoice Number', 'Contact Name', 'Description', 'Amount (Ex GST)', 'Reason'],
    ...unmatched.map(u => [u.invoiceDate, u.invoiceNumber, u.contactName, u.description, u.lineAmount, u.reason])
  ];
  const unmatchedWs = xlsx.utils.aoa_to_sheet(unmatchedData);
  unmatchedWs['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 70 }, { wch: 15 }, { wch: 30 }];
  xlsx.utils.book_append_sheet(unmatchedWb, unmatchedWs, 'Unmatched Items');
  
  // Also add a low-confidence sheet
  const lowConf = matched.filter(m => m.confidence < 60);
  const lowConfData = [
    ['Invoice Date', 'Invoice Number', 'Contact Name', 'Description', 'Amount', 'Matched Service', 'Provider', 'Match Method', 'Confidence %'],
    ...lowConf.map(m => [m.invoiceDate, m.invoiceNumber, m.contactName, m.description, m.lineAmount, m.service?.externalId, m.service?.provider, m.method, m.confidence])
  ];
  const lowConfWs = xlsx.utils.aoa_to_sheet(lowConfData);
  lowConfWs['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 60 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 25 }, { wch: 12 }];
  xlsx.utils.book_append_sheet(unmatchedWb, lowConfWs, 'Low Confidence Matches');

  const outPath = '/home/ubuntu/SmileTelBillingRecon/scripts/Feb2026-Unmatched-Items.xlsx';
  xlsx.writeFile(unmatchedWb, outPath);
  console.log(`\nExported unmatched items to: ${outPath}`);
  console.log('Done!');

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
