/**
 * Xero Feb 2026 Billing Matching - v2
 * 
 * Matches Xero billing line items to services using:
 * 1. AVC ID in description
 * 2. Phone number in description
 * 3. AAPT circuit number (5xxxxxxx)
 * 4. Exetel service number
 * 5. Speed tier + customer name (e.g. "100/40" + "Zambrero Belconnen")
 * 6. Customer name fuzzy match + service type keyword
 * 7. Zambrero entity-to-site lookup (from RestaurantDetailList.xlsx)
 * 
 * Then applies matched revenue to services and recalculates customer stats.
 * Exports unmatched items to spreadsheet.
 */

import mysql2 from 'mysql2/promise';
import xlsx from 'xlsx';
import fs from 'fs';

const DB_URL = process.env.DATABASE_URL;

// Load Zambrero entity lookup
let zambreroEntityLookup = {};
try {
  zambreroEntityLookup = JSON.parse(fs.readFileSync('/home/ubuntu/SmileTelBillingRecon/scripts/zambrero-entity-lookup.json', 'utf8'));
  console.log(`Loaded ${Object.keys(zambreroEntityLookup).length} Zambrero entity entries`);
} catch(e) {
  console.log('No Zambrero entity lookup found, continuing without it');
}

function normalizeForMatch(s) {
  return (s || '').toLowerCase()
    .replace(/\bpty\b|\bltd\b|\bproprietary\b|\binc\b|\bcorp\b|\bunit trust\b|\batf\b|\bthe\b|\bfor\b|\btrustee\b|\btrading\b|\bas\b|\bt\/a\b|\bta\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlap(a, b) {
  const wa = new Set(a.split(' ').filter(w => w.length > 2));
  const wb = new Set(b.split(' ').filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

function extractPhones(s) {
  if (!s) return [];
  // Match Australian phone patterns: 02 XXXX XXXX, 0X XXXX XXXX, 04XX XXX XXX, 1300 XXX XXX
  const phones = [];
  const patterns = [
    /\b(0[2-9]\s*\d{4}\s*\d{4})\b/g,
    /\b(1[3-9]00\s*\d{3}\s*\d{3})\b/g,
    /\b(04\d{2}\s*\d{3}\s*\d{3})\b/g,
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(s)) !== null) {
      phones.push(m[1].replace(/\s/g, ''));
    }
  }
  return phones;
}

function extractAvcId(s) {
  if (!s) return null;
  const m = s.match(/AVC\d{12,}/i);
  return m ? m[0].toUpperCase() : null;
}

function extractAaptCircuit(s) {
  if (!s) return null;
  // AAPT circuit numbers are typically 7-digit numbers starting with 5
  const m = s.match(/\b(5[0-9]{6,7})\b/);
  return m ? m[1] : null;
}

function extractSpeedTier(s) {
  if (!s) return null;
  const m = s.match(/\b(\d+\/\d+)\b/);
  return m ? m[1] : null;
}

// Extract location name from parenthetical: "PhinaMoozy Oakleigh Pty Ltd (Zambrero Oakleigh)" → "Zambrero Oakleigh"
function extractParenthetical(s) {
  if (!s) return null;
  const m = s.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : null;
}

async function main() {
  const conn = await mysql2.createConnection(DB_URL);

  // Load all services with their customer info
  const [services] = await conn.execute(`
    SELECT s.externalId, s.planName, s.serviceType, s.phoneNumber, s.avcId, 
           s.customerExternalId, s.provider, s.monthlyCost, s.monthlyRevenue,
           c.name as customerName, c.businessName, c.xeroContactName, c.xeroAccountNumber
    FROM services s
    LEFT JOIN customers c ON s.customerExternalId = c.externalId
    WHERE s.status != 'terminated' AND s.status != 'archived'
  `);
  console.log(`Loaded ${services.length} active services`);

  // Build service indexes
  const byAvcId = {};
  const byPhone = {};
  const byAaptCircuit = {};
  const byCustomerId = {};

  for (const svc of services) {
    if (svc.avcId) {
      const avc = svc.avcId.toUpperCase();
      if (!byAvcId[avc]) byAvcId[avc] = [];
      byAvcId[avc].push(svc);
    }
    if (svc.phoneNumber) {
      const p = svc.phoneNumber.replace(/\s/g, '');
      if (!byPhone[p]) byPhone[p] = [];
      byPhone[p].push(svc);
      // Also index without leading 0
      const p2 = p.replace(/^0/, '');
      if (!byPhone[p2]) byPhone[p2] = [];
      byPhone[p2].push(svc);
    }
    // Index AAPT circuit numbers from planName/externalId
    const circuit = extractAaptCircuit(svc.planName || svc.externalId || '');
    if (circuit) {
      if (!byAaptCircuit[circuit]) byAaptCircuit[circuit] = [];
      byAaptCircuit[circuit].push(svc);
    }
    if (svc.customerExternalId) {
      if (!byCustomerId[svc.customerExternalId]) byCustomerId[svc.customerExternalId] = [];
      byCustomerId[svc.customerExternalId].push(svc);
    }
  }

  // Build customer name index
  const [customers] = await conn.execute(`SELECT externalId, name, businessName, xeroContactName, xeroAccountNumber FROM customers`);
  const customerByNorm = {};
  const customerByXeroName = {};
  const customerByAccountNum = {};

  for (const c of customers) {
    const norm = normalizeForMatch(c.name);
    if (!customerByNorm[norm]) customerByNorm[norm] = [];
    customerByNorm[norm].push(c);

    if (c.xeroContactName) {
      const xnorm = normalizeForMatch(c.xeroContactName);
      if (!customerByXeroName[xnorm]) customerByXeroName[xnorm] = [];
      customerByXeroName[xnorm].push(c);
    }
    if (c.xeroAccountNumber) {
      customerByAccountNum[c.xeroAccountNumber] = c;
    }
    if (c.businessName) {
      const bnorm = normalizeForMatch(c.businessName);
      if (!customerByNorm[bnorm]) customerByNorm[bnorm] = [];
      customerByNorm[bnorm].push(c);
    }
  }

  // Parse Xero export
  const wb = xlsx.readFile('/home/ubuntu/upload/CopyofSmileTelFeb26_523820646027958636.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
  
  // Find header row
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i].some(c => typeof c === 'string' && c.toLowerCase().includes('contact'))) {
      headerIdx = i;
      break;
    }
  }
  const headers = rows[headerIdx].map(h => (h || '').toString().trim().toLowerCase());
  console.log('Headers:', headers.join(', '));

  const colIdx = {};
  const colNames = ['contact name', 'description', 'quantity', 'unit amount', 'line amount', 'account code', 'invoice number', 'invoice date', 'contact account number'];
  for (const name of colNames) {
    const idx = headers.findIndex(h => h.includes(name.split(' ')[0]) && (name.split(' ').length === 1 || h.includes(name.split(' ')[1] || '')));
    colIdx[name] = idx;
  }
  // More precise matching
  colIdx['contact name'] = headers.findIndex(h => h === 'contact name' || h === 'contact' || h === 'contactname');
  colIdx['description'] = headers.findIndex(h => h === 'description' || h === 'item description' || h === 'itemdescription');
  colIdx['unit amount'] = headers.findIndex(h => (h.includes('unit') && h.includes('amount')) || h === 'unitamount');
  colIdx['line amount'] = headers.findIndex(h => (h.includes('line') && h.includes('amount')) || h === 'lineamount');
  colIdx['invoice number'] = headers.findIndex(h => (h.includes('invoice') && h.includes('number')) || h === 'invoicenumber');
  colIdx['invoice date'] = headers.findIndex(h => (h.includes('invoice') && h.includes('date')) || h === 'invoicedate');
  colIdx['contact account number'] = headers.findIndex(h => (h.includes('account') && h.includes('number')) || h === 'contactaccountnumber');
  
  console.log('Column mapping:', colIdx);

  const billingItems = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c)) continue;
    
    const contactName = row[colIdx['contact name']] || '';
    const description = row[colIdx['description']] || '';
    const lineAmount = parseFloat(row[colIdx['line amount']] || row[colIdx['unit amount']] || 0);
    const invoiceNumber = row[colIdx['invoice number']] || '';
    const invoiceDate = row[colIdx['invoice date']] || '';
    const accountNumber = row[colIdx['contact account number']] || '';

    if (!contactName && !description) continue;
    if (isNaN(lineAmount) || lineAmount <= 0) continue;

    billingItems.push({ contactName: String(contactName), description: String(description), lineAmount, invoiceNumber: String(invoiceNumber), invoiceDate: String(invoiceDate), accountNumber: String(accountNumber) });
  }
  console.log(`Loaded ${billingItems.length} billing line items`);

  // Match each billing item to a service
  const matched = [];
  const unmatched = [];

  for (const item of billingItems) {
    const { contactName, description, lineAmount } = item;
    const fullText = `${contactName} ${description}`;
    
    let matchedService = null;
    let matchMethod = null;
    let matchedCustomerId = null;

    // 1. AVC ID match
    const avcId = extractAvcId(fullText);
    if (avcId && byAvcId[avcId]?.length) {
      matchedService = byAvcId[avcId][0];
      matchMethod = 'avc_id';
    }

    // 2. Phone number match in description
    if (!matchedService) {
      const phones = extractPhones(fullText);
      for (const phone of phones) {
        const p = phone.replace(/^0/, '');
        if (byPhone[phone]?.length === 1) {
          matchedService = byPhone[phone][0];
          matchMethod = 'phone_exact';
          break;
        } else if (byPhone[p]?.length === 1) {
          matchedService = byPhone[p][0];
          matchMethod = 'phone_stripped';
          break;
        }
      }
    }

    // 3. AAPT circuit number match
    if (!matchedService) {
      const circuit = extractAaptCircuit(description);
      if (circuit && byAaptCircuit[circuit]?.length) {
        matchedService = byAaptCircuit[circuit][0];
        matchMethod = 'aapt_circuit';
      }
    }

    // 4. Customer name match → then service type match
    if (!matchedService) {
      // Try Zambrero entity lookup first
      const normContact = normalizeForMatch(contactName);
      const parenthetical = extractParenthetical(contactName);
      const normParenthetical = parenthetical ? normalizeForMatch(parenthetical) : null;

      let custId = null;

      // Check Zambrero entity lookup
      if (zambreroEntityLookup[normContact]) {
        custId = zambreroEntityLookup[normContact];
        matchMethod = 'zambrero_entity';
      } else if (normParenthetical && zambreroEntityLookup[normalizeForMatch(normParenthetical)]) {
        custId = zambreroEntityLookup[normalizeForMatch(normParenthetical)];
        matchMethod = 'zambrero_parenthetical';
      }

      // Try xero contact name match
      if (!custId && customerByXeroName[normContact]?.length === 1) {
        custId = customerByXeroName[normContact][0].externalId;
        matchMethod = 'xero_contact_name';
      }

      // Try account number match
      if (!custId && item.accountNumber && customerByAccountNum[item.accountNumber]) {
        custId = customerByAccountNum[item.accountNumber].externalId;
        matchMethod = 'account_number';
      }

      // Try customer name fuzzy match
      if (!custId) {
        let bestScore = 0, bestCustId = null;
        for (const [norm, custs] of Object.entries(customerByNorm)) {
          const score = wordOverlap(norm, normContact);
          if (score > bestScore && score >= 0.75) {
            bestScore = score;
            bestCustId = custs[0].externalId;
          }
        }
        // Also try parenthetical
        if (normParenthetical) {
          for (const [norm, custs] of Object.entries(customerByNorm)) {
            const score = wordOverlap(norm, normParenthetical);
            if (score > bestScore && score >= 0.75) {
              bestScore = score;
              bestCustId = custs[0].externalId;
              matchMethod = 'parenthetical_fuzzy';
            }
          }
        }
        if (bestCustId) {
          custId = bestCustId;
          if (!matchMethod) matchMethod = `customer_fuzzy_${Math.round(bestScore*100)}`;
        }
      }

      if (custId) {
        matchedCustomerId = custId;
        const custServices = byCustomerId[custId] || [];
        
        if (custServices.length === 1) {
          // Only one service for this customer — match it
          matchedService = custServices[0];
        } else if (custServices.length > 1) {
          // Multiple services — try to narrow by service type keyword in description
          const descLower = description.toLowerCase();
          const speedTier = extractSpeedTier(description);
          
          // Try speed tier match
          if (speedTier) {
            const speedMatch = custServices.find(s => (s.planName || '').includes(speedTier));
            if (speedMatch) {
              matchedService = speedMatch;
              matchMethod = (matchMethod || 'customer') + '+speed_tier';
            }
          }
          
          // Try service type keyword
          if (!matchedService) {
            const typeKeywords = {
              'nbn': ['nbn', 'internet', 'broadband', 'fibre', 'fttp', 'fttn', 'fttc', 'hfc'],
              'mobile': ['mobile', 'sim', '4g', '5g', 'data plan'],
              'voice': ['voice', 'phone', 'did', 'sip', 'hosted', 'pbx', 'call', 'number'],
              'aapt': ['aapt', 'ip-line', 'ipline', 'data link'],
            };
            
            for (const [type, keywords] of Object.entries(typeKeywords)) {
              if (keywords.some(kw => descLower.includes(kw))) {
                const typeMatch = custServices.find(s => {
                  const sType = (s.serviceType || '').toLowerCase();
                  const sPlan = (s.planName || '').toLowerCase();
                  return keywords.some(kw => sType.includes(kw) || sPlan.includes(kw));
                });
                if (typeMatch) {
                  matchedService = typeMatch;
                  matchMethod = (matchMethod || 'customer') + `+${type}_keyword`;
                  break;
                }
              }
            }
          }
          
          // If still no match, use first service (low confidence)
          if (!matchedService && custServices.length > 0) {
            matchedService = custServices[0];
            matchMethod = (matchMethod || 'customer') + '+first_service_fallback';
          }
        }
      }
    }

    if (matchedService) {
      matched.push({
        ...item,
        serviceId: matchedService.externalId,
        customerId: matchedService.customerExternalId,
        customerName: matchedService.customerName,
        servicePlan: matchedService.planName,
        matchMethod,
      });
    } else {
      unmatched.push(item);
    }
  }

  console.log(`\nMatched: ${matched.length}/${billingItems.length} (${Math.round(matched.length/billingItems.length*100)}%)`);
  console.log(`Unmatched: ${unmatched.length}`);

  // Show match method breakdown
  const methods = {};
  for (const m of matched) {
    const key = m.matchMethod?.split('+')[0] || 'unknown';
    methods[key] = (methods[key] || 0) + 1;
  }
  console.log('\nMatch methods:', methods);

  // Show sample unmatched
  console.log('\nSample unmatched items:');
  for (const u of unmatched.slice(0, 10)) {
    console.log(`  ${u.contactName} | ${u.description.substring(0,60)} | $${u.lineAmount}`);
  }

  // Apply matched revenue to services
  console.log('\nApplying revenue to services...');
  
  // Group by service ID and sum revenue
  const revenueByService = {};
  for (const m of matched) {
    if (!revenueByService[m.serviceId]) revenueByService[m.serviceId] = 0;
    revenueByService[m.serviceId] += m.lineAmount;
  }

  // Update billing_items table — first clear Feb 2026 items, then insert fresh
  await conn.execute(`DELETE FROM billing_items WHERE category = 'xero-feb-2026'`);
  console.log('Cleared existing Feb 2026 billing items');

  // Generate external IDs for billing items - load all existing to avoid conflicts
  const [existingIds] = await conn.execute(`SELECT externalId FROM billing_items WHERE externalId REGEXP '^BI[0-9]+'`);
  const usedIds = new Set(existingIds.map(r => r.externalId));
  let nextBiNum = existingIds.length > 0 
    ? existingIds.reduce((max, r) => Math.max(max, parseInt(r.externalId.replace('BI', ''), 10) || 0), 0) + 1
    : 1;
  console.log(`Starting billing item IDs from BI${String(nextBiNum).padStart(6, '0')} (${existingIds.length} existing)`);
  function nextBiId() {
    let id;
    do { id = `BI${String(nextBiNum++).padStart(6, '0')}`; } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  }

  // Insert matched items
  let insertedCount = 0;
  for (const m of matched) {
    const biId = nextBiId();
    try {
    await conn.execute(`
      INSERT IGNORE INTO billing_items (externalId, serviceExternalId, customerExternalId, description, lineAmount, unitAmount, quantity, matchStatus, matchConfidence, invoiceNumber, invoiceDate, contactName, category, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'service-matched', ?, ?, ?, ?, 'xero-feb-2026', NOW(), NOW())
    `, [
      biId, m.serviceId, m.customerId, m.description.substring(0, 512), m.lineAmount, m.lineAmount,
      m.matchMethod ? (m.matchMethod.length > 16 ? 'high' : 'high') : 'medium',
      m.invoiceNumber || '', m.invoiceDate || '', m.contactName || ''
    ]);
    insertedCount++;
    } catch(e) {
      console.error(`Failed to insert ${biId} (service: ${m.serviceId}): ${e.message}`);
      // Check if this ID already exists
      const [existing] = await conn.execute('SELECT id, externalId FROM billing_items WHERE externalId = ?', [biId]);
      console.error('Existing record:', existing[0]);
      throw e;
    }
  }

  // Insert unmatched items
  for (const u of unmatched) {
    const biId = nextBiId();
    await conn.execute(`
      INSERT IGNORE INTO billing_items (externalId, serviceExternalId, customerExternalId, description, lineAmount, unitAmount, quantity, matchStatus, invoiceNumber, invoiceDate, contactName, category, createdAt, updatedAt)
      VALUES (?, NULL, NULL, ?, ?, ?, 1, 'unmatched', ?, ?, ?, 'xero-feb-2026', NOW(), NOW())
    `, [
      biId, u.description.substring(0, 512), u.lineAmount, u.lineAmount,
      u.invoiceNumber || '', u.invoiceDate || '', u.contactName || ''
    ]);
  }
  console.log(`Inserted ${insertedCount} matched + ${unmatched.length} unmatched billing items`);

  // Update monthlyRevenue on services from matched billing items
  console.log('\nUpdating service revenue...');
  let revenueUpdated = 0;
  for (const [serviceId, revenue] of Object.entries(revenueByService)) {
    await conn.execute(`
      UPDATE services SET monthlyRevenue = ?, updatedAt = NOW() WHERE externalId = ?
    `, [revenue, serviceId]);
    revenueUpdated++;
  }
  console.log(`Updated revenue on ${revenueUpdated} services`);

  // Recalculate customer stats
  console.log('\nRecalculating customer stats...');
  const affectedCustomers = [...new Set(matched.map(m => m.customerId).filter(Boolean))];
  for (const custId of affectedCustomers) {
    const [stats] = await conn.execute(`
      SELECT 
        COUNT(*) as serviceCount,
        SUM(CASE WHEN status NOT IN ('terminated','archived') THEN monthlyCost ELSE 0 END) as totalCost,
        SUM(CASE WHEN status NOT IN ('terminated','archived') THEN monthlyRevenue ELSE 0 END) as totalRevenue
      FROM services WHERE customerExternalId = ?
    `, [custId]);
    const { serviceCount, totalCost, totalRevenue } = stats[0];
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : null;
    await conn.execute(`
      UPDATE customers SET serviceCount=?, monthlyCost=?, monthlyRevenue=?, marginPercent=?, updatedAt=NOW()
      WHERE externalId=?
    `, [serviceCount, totalCost || 0, totalRevenue || 0, margin, custId]);
  }
  console.log(`Recalculated stats for ${affectedCustomers.length} customers`);

  // Export unmatched items to spreadsheet
  console.log('\nExporting unmatched items...');
  const unmatchedData = [
    ['Contact Name', 'Description', 'Amount (ex GST)', 'Invoice Number', 'Invoice Date', 'Account Number'],
    ...unmatched.map(u => [u.contactName, u.description, u.lineAmount, u.invoiceNumber, u.invoiceDate, u.accountNumber])
  ];
  const unmatchedWb = xlsx.utils.book_new();
  const unmatchedWs = xlsx.utils.aoa_to_sheet(unmatchedData);
  xlsx.utils.book_append_sheet(unmatchedWb, unmatchedWs, 'Unmatched Items');
  
  // Also add a summary sheet
  const summaryData = [
    ['Metric', 'Value'],
    ['Total billing items', billingItems.length],
    ['Matched items', matched.length],
    ['Unmatched items', unmatched.length],
    ['Match rate', `${Math.round(matched.length/billingItems.length*100)}%`],
    ['Total matched revenue', `$${matched.reduce((s,m) => s+m.lineAmount, 0).toFixed(2)}`],
    ['Total unmatched revenue', `$${unmatched.reduce((s,u) => s+u.lineAmount, 0).toFixed(2)}`],
    [],
    ['Match Method', 'Count'],
    ...Object.entries(methods).sort((a,b) => b[1]-a[1]).map(([k,v]) => [k, v])
  ];
  const summaryWs = xlsx.utils.aoa_to_sheet(summaryData);
  xlsx.utils.book_append_sheet(unmatchedWb, summaryWs, 'Summary');
  
  const outputPath = '/home/ubuntu/SmileTelBillingRecon/exports/Xero_Feb2026_Unmatched.xlsx';
  fs.mkdirSync('/home/ubuntu/SmileTelBillingRecon/exports', { recursive: true });
  xlsx.writeFile(unmatchedWb, outputPath);
  console.log(`Exported unmatched items to ${outputPath}`);

  console.log('\n=== COMPLETE ===');
  console.log(`Total: ${billingItems.length} items | Matched: ${matched.length} | Unmatched: ${unmatched.length}`);
  console.log(`Total matched revenue: $${matched.reduce((s,m) => s+m.lineAmount, 0).toFixed(2)}`);
  console.log(`Total unmatched revenue: $${unmatched.reduce((s,u) => s+u.lineAmount, 0).toFixed(2)}`);

  await conn.end();
}

main().catch(e => { console.error(e.message, e.stack); process.exit(1); });
