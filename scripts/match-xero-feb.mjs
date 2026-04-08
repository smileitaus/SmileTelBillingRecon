/**
 * February 2026 Xero Billing Export Matcher
 * 
 * Matching strategy (in priority order):
 * 1. AVC ID in description → match to service with same AVC ID
 * 2. Phone number in description → match to service with same phone number
 * 3. AAPT IP-Line number in description → match to AAPT service with same line number
 * 4. Exetel plan code (TFS/TMLL/NBNEE) + phone → match to Exetel service
 * 5. Customer name (fuzzy) + speed tier (100/40, 50/20 etc) → match to NBN service
 * 6. Customer name (fuzzy) + service type keyword → match to best service
 * 7. Customer name (fuzzy) + description keyword → best effort match
 */

import mysql2 from 'mysql2/promise';
import openpyxl from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;

// Normalize a string for fuzzy matching
function normalize(s) {
  return (s || '').toLowerCase()
    .replace(/\bpty\b|\bltd\b|\bpty ltd\b|\bproprietary\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract phone numbers from a string (Australian format)
function extractPhones(s) {
  const phones = [];
  // Match 10-digit numbers like 0412345678, 0261234567
  const matches = s.match(/\b0[2-9]\d{8}\b/g) || [];
  for (const m of matches) phones.push(m.replace(/\s/g, ''));
  // Match numbers with spaces like 02 6123 4567
  const spaced = s.match(/\b0[2-9]\s?\d{4}\s?\d{4}\b/g) || [];
  for (const m of spaced) phones.push(m.replace(/\s/g, ''));
  return [...new Set(phones)];
}

// Extract AVC IDs from description
function extractAvcIds(s) {
  const matches = s.match(/AVC\d{12,}/gi) || [];
  return matches.map(m => m.toUpperCase());
}

// Extract AAPT line numbers (7-digit numbers like 5751962)
function extractAaptLineNumbers(s) {
  const matches = s.match(/\b[5-9]\d{6}\b/g) || [];
  return matches;
}

// Extract speed tier from description (e.g. 100/40, 50/20, 25/10)
function extractSpeedTier(s) {
  const match = s.match(/\b(\d+)\/(\d+)\b/);
  if (match) return `${match[1]}/${match[2]}`;
  // Also check for plan names like "NBN100", "NBN50"
  const nbnMatch = s.match(/\bNBN\s*(\d+)\b/i);
  if (nbnMatch) {
    const speed = parseInt(nbnMatch[1]);
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

// Compute simple word overlap score between two normalized strings
function wordOverlap(a, b) {
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.max(wordsA.size, wordsB.size, 1);
}

async function main() {
  const conn = await mysql2.createConnection(url);

  // Load all active services with their key identifiers
  const [services] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.serviceType, s.provider, s.phoneNumber,
      s.avcId, s.customerExternalId, s.monthlyCost, s.monthlyRevenue,
      s.status, s.planName as plan,
      c.name as customerName
    FROM services s
    JOIN customers c ON s.customerExternalId = c.externalId
    WHERE s.status NOT IN ('terminated','archived')
  `);

  console.log(`Loaded ${services.length} active services`);

  // Build lookup indexes
  const byAvcId = {};
  const byPhone = {};
  const byAaptLine = {};
  const byCustomer = {}; // normalized customer name → [services]

  for (const svc of services) {
    // AVC ID index
    if (svc.avcId) {
      const avc = svc.avcId.toUpperCase();
      if (!byAvcId[avc]) byAvcId[avc] = [];
      byAvcId[avc].push(svc);
    }
    
    // Phone index
    if (svc.phoneNumber) {
      const phones = extractPhones(svc.phoneNumber);
      for (const p of phones) {
        if (!byPhone[p]) byPhone[p] = [];
        byPhone[p].push(svc);
      }
      // Also index the raw phone number cleaned
      const cleanPhone = svc.phoneNumber.replace(/\s/g, '');
      if (!byPhone[cleanPhone]) byPhone[cleanPhone] = [];
      if (!byPhone[cleanPhone].includes(svc)) byPhone[cleanPhone].push(svc);
    }

    // AAPT line number index (extract from planName like "AAPT IP-Line Link 5751962")
    if (svc.provider === 'AAPT' || svc.planName?.includes('IP-Line')) {
      const lineNums = extractAaptLineNumbers(svc.planName || '');
      for (const ln of lineNums) {
        if (!byAaptLine[ln]) byAaptLine[ln] = [];
        byAaptLine[ln].push(svc);
      }
    }

    // Customer name index
    const normName = normalize(svc.customerName);
    if (!byCustomer[normName]) byCustomer[normName] = [];
    byCustomer[normName].push(svc);
  }

  // Load the Xero export
  const workbook = openpyxl.readFile('/home/ubuntu/upload/CopyofSmileTelFeb26_523820646027958636.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = openpyxl.utils.sheet_to_json(sheet, { header: 1 });
  
  const headers = rows[0];
  console.log('Headers:', headers);
  
  const dataRows = rows.slice(1).filter(r => r[2]); // filter rows with ContactName

  console.log(`Processing ${dataRows.length} billing line items...`);

  const matched = [];
  const unmatched = [];
  const matchStats = { avc: 0, phone: 0, aapt_line: 0, speed_tier: 0, customer_type: 0, customer_fuzzy: 0, no_match: 0 };

  for (const row of dataRows) {
    const [invoiceDate, invoiceNumber, contactName, description, quantity, unitAmount, discount, lineAmount, taxAmount, accountCode] = row;
    
    if (!contactName || !lineAmount || parseFloat(lineAmount) <= 0) {
      unmatched.push({ invoiceDate, invoiceNumber, contactName, description, lineAmount, reason: 'Zero or negative amount' });
      continue;
    }

    const desc = String(description || '');
    const contact = String(contactName || '');
    const amount = parseFloat(lineAmount);
    const normContact = normalize(contact);

    let matchedService = null;
    let matchMethod = null;
    let matchConfidence = 0;

    // Strategy 1: AVC ID in description
    const avcIds = extractAvcIds(desc);
    for (const avc of avcIds) {
      if (byAvcId[avc] && byAvcId[avc].length > 0) {
        matchedService = byAvcId[avc][0];
        matchMethod = 'avc_id';
        matchConfidence = 100;
        matchStats.avc++;
        break;
      }
    }

    // Strategy 2: Phone number in description
    if (!matchedService) {
      const phones = extractPhones(desc);
      for (const phone of phones) {
        if (byPhone[phone] && byPhone[phone].length > 0) {
          // If multiple services match, prefer the one whose customer name matches
          const candidates = byPhone[phone];
          const nameMatch = candidates.find(s => wordOverlap(normalize(s.customerName), normContact) > 0.3);
          matchedService = nameMatch || candidates[0];
          matchMethod = 'phone_number';
          matchConfidence = nameMatch ? 95 : 80;
          matchStats.phone++;
          break;
        }
      }
    }

    // Strategy 3: AAPT IP-Line number in description
    if (!matchedService && (desc.includes('IP-Line') || desc.includes('AAPT'))) {
      const lineNums = extractAaptLineNumbers(desc);
      for (const ln of lineNums) {
        if (byAaptLine[ln] && byAaptLine[ln].length > 0) {
          matchedService = byAaptLine[ln][0];
          matchMethod = 'aapt_line_number';
          matchConfidence = 98;
          matchStats.aapt_line++;
          break;
        }
      }
    }

    // Strategy 4: Customer name + speed tier for NBN/Internet services
    if (!matchedService) {
      const speedTier = extractSpeedTier(desc);
      if (speedTier) {
        // Find customer services by name
        let bestScore = 0;
        let bestMatch = null;
        
        for (const [normName, svcs] of Object.entries(byCustomer)) {
          const score = wordOverlap(normName, normContact);
          if (score > 0.3 && score > bestScore) {
            // Find service with matching speed tier
            const speedMatch = svcs.find(s => 
              (s.planName || '').includes(speedTier) || 
              (s.avcId && s.serviceType === 'Internet')
            );
            if (speedMatch) {
              bestScore = score;
              bestMatch = speedMatch;
            }
          }
        }
        
        if (bestMatch) {
          matchedService = bestMatch;
          matchMethod = 'customer_speed_tier';
          matchConfidence = Math.round(bestScore * 90);
          matchStats.speed_tier++;
        }
      }
    }

    // Strategy 5: Customer name + service type keyword
    if (!matchedService) {
      let serviceTypeHint = null;
      if (desc.match(/\bDID\b|Direct In Dial/i)) serviceTypeHint = 'Voice';
      else if (desc.match(/\b1300\b|\b1800\b/)) serviceTypeHint = 'Voice';
      else if (desc.match(/\bMobile\b|mobile SIM/i)) serviceTypeHint = 'Mobile';
      else if (desc.match(/\bNBN\b|Internet|broadband/i)) serviceTypeHint = 'Internet';
      else if (desc.match(/\bVoice\b|Phone|Hosted|UCXcel|SmileTel/i)) serviceTypeHint = 'Voice';
      else if (desc.match(/\bBundle\b/i)) serviceTypeHint = 'Internet'; // Bundles are usually NBN

      let bestScore = 0;
      let bestMatch = null;

      for (const [normName, svcs] of Object.entries(byCustomer)) {
        const score = wordOverlap(normName, normContact);
        if (score > 0.4 && score > bestScore) {
          let candidate = null;
          if (serviceTypeHint) {
            candidate = svcs.find(s => s.serviceType === serviceTypeHint);
          }
          if (!candidate) candidate = svcs[0]; // fallback to first service
          if (candidate) {
            bestScore = score;
            bestMatch = candidate;
          }
        }
      }

      if (bestMatch) {
        matchedService = bestMatch;
        matchMethod = 'customer_type_keyword';
        matchConfidence = Math.round(bestScore * 80);
        matchStats.customer_type++;
      }
    }

    // Strategy 6: Pure customer name fuzzy match (last resort)
    if (!matchedService) {
      let bestScore = 0;
      let bestMatch = null;

      for (const [normName, svcs] of Object.entries(byCustomer)) {
        const score = wordOverlap(normName, normContact);
        if (score > 0.5 && score > bestScore) {
          bestScore = score;
          bestMatch = svcs[0];
        }
      }

      if (bestMatch) {
        matchedService = bestMatch;
        matchMethod = 'customer_fuzzy';
        matchConfidence = Math.round(bestScore * 70);
        matchStats.customer_fuzzy++;
      }
    }

    if (matchedService) {
      matched.push({
        invoiceDate, invoiceNumber, contactName, description, lineAmount: amount,
        serviceId: matchedService.externalId,
        servicePlan: matchedService.planName,
        serviceProvider: matchedService.provider,
        customerName: matchedService.customerName,
        customerExternalId: matchedService.customerExternalId,
        matchMethod,
        matchConfidence
      });
    } else {
      matchStats.no_match++;
      unmatched.push({ invoiceDate, invoiceNumber, contactName, description, lineAmount: amount, reason: 'No matching service found' });
    }
  }

  console.log('\nMatch statistics:', matchStats);
  console.log(`Matched: ${matched.length}, Unmatched: ${unmatched.length}`);

  // Save results to JSON for the next phase
  fs.writeFileSync('/home/ubuntu/SmileTelBillingRecon/scripts/xero-matched.json', JSON.stringify(matched, null, 2));
  fs.writeFileSync('/home/ubuntu/SmileTelBillingRecon/scripts/xero-unmatched.json', JSON.stringify(unmatched, null, 2));

  // Show sample of matches by method
  console.log('\nSample matches by method:');
  const byMethod = {};
  for (const m of matched) {
    if (!byMethod[m.matchMethod]) byMethod[m.matchMethod] = [];
    byMethod[m.matchMethod].push(m);
  }
  for (const [method, items] of Object.entries(byMethod)) {
    console.log(`\n  ${method} (${items.length} matches):`);
    for (const item of items.slice(0, 3)) {
      console.log(`    Contact: ${item.contactName.substring(0, 40)} | Desc: ${item.description.substring(0, 50)} | Service: ${item.serviceId} ${item.servicePlan?.substring(0, 30)} | Conf: ${item.matchConfidence}%`);
    }
  }

  console.log('\nSample unmatched:');
  for (const item of unmatched.slice(0, 10)) {
    console.log(`  ${item.contactName?.substring(0, 40)} | ${item.description?.substring(0, 60)} | $${item.lineAmount}`);
  }

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
