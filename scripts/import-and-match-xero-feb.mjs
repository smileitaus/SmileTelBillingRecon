/**
 * February 2026 Xero Billing Import & Re-Matcher
 * 
 * Steps:
 * 1. Load all rows from the Xero export
 * 2. For each row, check if it already exists in billing_items (by invoiceNumber + description + lineAmount)
 * 3. Insert new rows, update existing ones
 * 4. Re-match ALL Feb 2026 billing items using improved logic:
 *    a. AVC ID in description → exact match
 *    b. AAPT IP-Line number in description → exact match
 *    c. Phone number in description → match to service with same phone
 *    d. Customer name (fuzzy) + speed tier → match to NBN/Internet service
 *    e. Customer name (fuzzy) + service type keyword → match to best service
 *    f. Customer name (fuzzy) + amount similarity → last resort
 * 5. Update monthlyRevenue on matched services
 * 6. Export unmatched items to spreadsheet
 */

import mysql2 from 'mysql2/promise';
import xlsx from 'xlsx';
import fs from 'fs';

const DB_URL = process.env.DATABASE_URL;

function normalize(s) {
  let str = s || '';
  // Extract content from parentheses if present (e.g. "PhinaMoozy Oakleigh (Zambrero Oakleigh)" → "Zambrero Oakleigh")
  const parenMatch = str.match(/\(([^)]+)\)/);
  if (parenMatch) str = parenMatch[1]; // prefer the parenthetical
  // Also handle "X for Y" patterns (e.g. "Mexi Cuisine for Zambrero Darwin" → "Zambrero Darwin")
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
  const matches = raw.match(/0[2-9]\d{8}/g) || [];
  return [...new Set(matches)];
}

function extractAvcIds(s) {
  return (s.match(/AVC\d{10,}/gi) || []).map(m => m.toUpperCase());
}

function extractAaptLineNumbers(s) {
  // AAPT line numbers are 7-digit numbers starting with 5-9
  return (s.match(/\b[5-9]\d{6}\b/g) || []);
}

function extractSpeedTier(s) {
  // Direct speed notation like 100/40, 50/20
  const direct = s.match(/\b(\d+)\/(\d+)\b/);
  if (direct) return `${direct[1]}/${direct[2]}`;
  // NBN plan codes like TFS100R1, NBNEE100, TMLL100
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
           c.name as customerName, c.externalId as custId
    FROM services s
    JOIN customers c ON s.customerExternalId = c.externalId
    WHERE s.status NOT IN ('terminated','archived')
  `);
  console.log(`Loaded ${services.length} active services`);

  // Build indexes
  const byAvcId = {};
  const byPhone = {};
  const byAaptLine = {};
  const byCustomer = {}; // normName → [services]

  for (const svc of services) {
    if (svc.avcId) {
      const avc = svc.avcId.toUpperCase();
      if (!byAvcId[avc]) byAvcId[avc] = [];
      byAvcId[avc].push(svc);
    }
    if (svc.phoneNumber) {
      const phones = extractPhones(svc.phoneNumber + ' ' + svc.phoneNumber.replace(/\s/g,''));
      for (const p of phones) {
        if (!byPhone[p]) byPhone[p] = [];
        if (!byPhone[p].find(s => s.externalId === svc.externalId)) byPhone[p].push(svc);
      }
    }
    // AAPT line numbers from planName
    const lineNums = extractAaptLineNumbers(svc.planName || '');
    for (const ln of lineNums) {
      if (!byAaptLine[ln]) byAaptLine[ln] = [];
      byAaptLine[ln].push(svc);
    }
    // Also index by externalId (service ID) for AAPT
    if (svc.externalId?.startsWith('SVC')) {
      const svcNum = svc.externalId.replace('SVC', '');
      if (!byAaptLine[svcNum]) byAaptLine[svcNum] = [];
      byAaptLine[svcNum].push(svc);
    }

    const normName = normalize(svc.customerName);
    if (!byCustomer[normName]) byCustomer[normName] = [];
    byCustomer[normName].push(svc);
  }

  // Load Xero export
  const wb = xlsx.readFile('/home/ubuntu/upload/CopyofSmileTelFeb26_523820646027958636.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = xlsx.utils.sheet_to_json(ws, { header: 1 });
  const dataRows = allRows.slice(1).filter(r => r[2]); // skip header, filter empty
  console.log(`Loaded ${dataRows.length} Xero rows`);

  // Match function
  function matchService(contactName, description, lineAmount) {
    const desc = String(description || '');
    const contact = String(contactName || '');
    const normContact = normalize(contact);

    // 1. AVC ID
    for (const avc of extractAvcIds(desc)) {
      if (byAvcId[avc]?.length) {
        return { service: byAvcId[avc][0], method: 'avc_id', confidence: 100 };
      }
    }

    // 2. AAPT IP-Line number
    if (desc.includes('IP-Line') || desc.includes('AAPT') || desc.match(/\b[5-9]\d{6}\b/)) {
      for (const ln of extractAaptLineNumbers(desc)) {
        if (byAaptLine[ln]?.length) {
          const candidates = byAaptLine[ln];
          const nameMatch = candidates.find(s => wordOverlap(normalize(s.customerName), normContact) > 0.2);
          return { service: nameMatch || candidates[0], method: 'aapt_line', confidence: 98 };
        }
      }
    }

    // 3. Phone number
    for (const phone of extractPhones(desc)) {
      if (byPhone[phone]?.length) {
        const candidates = byPhone[phone];
        const nameMatch = candidates.find(s => wordOverlap(normalize(s.customerName), normContact) > 0.2);
        return { service: nameMatch || candidates[0], method: 'phone', confidence: 95 };
      }
    }

    // 4. Customer name matching with service type + speed tier
    const speedTier = extractSpeedTier(desc);
    const svcType = detectServiceType(desc);
    const providerHint = detectProviderHint(desc);

    // Find best customer name match
    let bestCustomerScore = 0;
    let bestCustomerSvcs = null;
    for (const [normName, svcs] of Object.entries(byCustomer)) {
      const score = wordOverlap(normName, normContact);
      if (score > bestCustomerScore) {
        bestCustomerScore = score;
        bestCustomerSvcs = svcs;
      }
    }

    if (bestCustomerScore < 0.25 || !bestCustomerSvcs) {
      return null; // No customer match
    }

    // Among matched customer's services, find best service match
    const candidates = bestCustomerSvcs;
    
    // Priority: speed tier match
    if (speedTier) {
      const speedMatch = candidates.find(s => 
        (s.planName || '').includes(speedTier) ||
        (s.avcId && s.serviceType === 'Internet')
      );
      if (speedMatch) {
        return { service: speedMatch, method: 'customer_speed_tier', confidence: Math.round(bestCustomerScore * 90) };
      }
    }

    // Priority: provider hint match
    if (providerHint) {
      const provMatch = candidates.find(s => s.provider === providerHint);
      if (provMatch) {
        // Also check service type
        if (svcType && provMatch.serviceType === svcType) {
          return { service: provMatch, method: 'customer_provider_type', confidence: Math.round(bestCustomerScore * 85) };
        }
        return { service: provMatch, method: 'customer_provider', confidence: Math.round(bestCustomerScore * 75) };
      }
    }

    // Priority: service type match
    if (svcType) {
      const typeMatches = candidates.filter(s => s.serviceType === svcType);
      if (typeMatches.length === 1) {
        return { service: typeMatches[0], method: 'customer_type_exact', confidence: Math.round(bestCustomerScore * 80) };
      }
      if (typeMatches.length > 1) {
        // Multiple services of same type - pick the one with closest cost to lineAmount
        const amount = parseFloat(lineAmount) || 0;
        const closest = typeMatches.reduce((best, s) => {
          const diff = Math.abs((s.monthlyRevenue || s.monthlyCost || 0) - amount);
          const bestDiff = Math.abs((best.monthlyRevenue || best.monthlyCost || 0) - amount);
          return diff < bestDiff ? s : best;
        });
        return { service: closest, method: 'customer_type_amount', confidence: Math.round(bestCustomerScore * 70) };
      }
    }

    // Fallback: best customer match, first service
    if (bestCustomerScore >= 0.4) {
      return { service: candidates[0], method: 'customer_fallback', confidence: Math.round(bestCustomerScore * 60) };
    }

    return null;
  }

  // Process all rows
  const results = [];
  const unmatched = [];
  const stats = { avc_id: 0, aapt_line: 0, phone: 0, customer_speed_tier: 0, customer_provider_type: 0, customer_provider: 0, customer_type_exact: 0, customer_type_amount: 0, customer_fallback: 0, no_match: 0 };

  for (const row of dataRows) {
    const [invoiceDate, invoiceNumber, contactName, description, quantity, unitAmount, discount, lineAmount, taxAmount, accountCode] = row;
    const amount = parseFloat(lineAmount) || 0;

    if (!contactName || amount <= 0) {
      // Negative amounts (credits) and zero amounts go to unmatched
      unmatched.push({ invoiceDate, invoiceNumber, contactName, description, lineAmount: amount, reason: amount <= 0 ? 'Credit/zero amount' : 'No contact name' });
      continue;
    }

    const match = matchService(contactName, description, amount);

    if (match) {
      stats[match.method] = (stats[match.method] || 0) + 1;
      results.push({
        invoiceDate, invoiceNumber, contactName, description, lineAmount: amount,
        accountCode, taxAmount,
        serviceId: match.service.externalId,
        servicePlan: match.service.planName,
        serviceProvider: match.service.provider,
        serviceType: match.service.serviceType,
        customerName: match.service.customerName,
        customerExternalId: match.service.customerExternalId,
        matchMethod: match.method,
        matchConfidence: match.confidence
      });
    } else {
      stats.no_match++;
      unmatched.push({ invoiceDate, invoiceNumber, contactName, description, lineAmount: amount, reason: 'No matching service found' });
    }
  }

  console.log('\nMatch stats:', stats);
  console.log(`Matched: ${results.length}, Unmatched: ${unmatched.length}`);

  // Save results
  fs.writeFileSync('/home/ubuntu/SmileTelBillingRecon/scripts/xero-matched-v2.json', JSON.stringify(results, null, 2));
  fs.writeFileSync('/home/ubuntu/SmileTelBillingRecon/scripts/xero-unmatched-v2.json', JSON.stringify(unmatched, null, 2));

  // Show sample of problematic matches (low confidence)
  const lowConf = results.filter(r => r.matchConfidence < 50).slice(0, 15);
  console.log('\nLow confidence matches (< 50%):');
  for (const r of lowConf) {
    console.log(`  [${r.matchConfidence}%] ${r.contactName?.substring(0,35)} | ${r.description?.substring(0,45)} | $${r.lineAmount} → ${r.serviceId} ${r.servicePlan?.substring(0,25)} (${r.serviceProvider})`);
  }

  console.log('\nUnmatched items:');
  for (const u of unmatched) {
    console.log(`  ${u.contactName?.substring(0,35)} | ${u.description?.substring(0,55)} | $${u.lineAmount} | ${u.reason}`);
  }

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
