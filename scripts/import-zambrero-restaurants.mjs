/**
 * Zambrero Restaurant Detail Import
 * 
 * 1. Parse RestaurantDetailList.xlsx (310 sites)
 * 2. Match each site to existing DB customers by:
 *    a. Normalized Zam Name ("Zambrero - Belconnen" → "Zambrero Belconnen")
 *    b. Phone number
 *    c. Suburb + State
 * 3. Update matched customers with entity name, contact, address, email, phone
 * 4. Create new customer records for unmatched sites
 * 5. Build entity-to-site lookup table for Xero matching
 * 6. Re-run Xero Feb 2026 matching with enriched entity data
 * 7. Apply revenue and recalculate stats
 * 8. Export unmatched Xero items
 */

import mysql2 from 'mysql2/promise';
import xlsx from 'xlsx';
import fs from 'fs';

const DB_URL = process.env.DATABASE_URL;

function normalizeZamName(s) {
  return (s || '')
    .replace(/^Zambrero\s*[-–—]\s*/i, 'Zambrero ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForMatch(s) {
  return (s || '').toLowerCase()
    .replace(/\bpty\b|\bltd\b|\bproprietary\b|\binc\b|\bcorp\b|\bunit trust\b|\bthe trustee for\b|\batf\b/g, '')
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

function cleanPhone(s) {
  if (!s) return null;
  return s.replace(/\s|\(|\)|-/g, '').replace(/^0/, '').replace(/^61/, '');
}

async function main() {
  const conn = await mysql2.createConnection(DB_URL);

  // Load all existing customers
  const [customers] = await conn.execute(`
    SELECT externalId, name, businessName, contactPhone, siteAddress
    FROM customers
    WHERE name LIKE '%Zambrero%' OR name LIKE '%Zamvis%' OR businessName LIKE '%Zambrero%'
  `);
  console.log(`Found ${customers.length} existing Zambrero customers in DB`);

  // Build indexes
  const byNormName = {};
  const byPhone = {};
  const bySuburb = {};

  for (const c of customers) {
    const normName = normalizeForMatch(c.name);
    if (!byNormName[normName]) byNormName[normName] = [];
    byNormName[normName].push(c);

    if (c.contactPhone) {
      const p = cleanPhone(c.contactPhone);
      if (p) {
        if (!byPhone[p]) byPhone[p] = [];
        byPhone[p].push(c);
      }
    }

    // Extract suburb from siteAddress for indexing
    if (c.siteAddress) {
      const parts = c.siteAddress.split(',');
      if (parts.length >= 2) {
        const sub = parts[parts.length - 3]?.trim().toLowerCase() || parts[parts.length - 2]?.trim().toLowerCase();
        if (sub && sub.length > 2) {
          if (!bySuburb[sub]) bySuburb[sub] = [];
          bySuburb[sub].push(c);
        }
      }
    }
  }

  // Parse restaurant list
  const wb = xlsx.readFile('/home/ubuntu/upload/RestaurantDetailList.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
  const dataRows = rows.slice(1).filter(r => r[2]); // skip header, filter empty
  console.log(`Loaded ${dataRows.length} restaurant sites`);

  const matched = [];
  const unmatched = [];
  const entityToSite = {}; // franchisee entity name → customer externalId (for Xero matching)

  for (const row of dataRows) {
    const [statusId, franchisee, zamName, addr1, addr2, addr3, suburb, state, postcode, stdCode, phone, email, ownershipId, contactName] = row;

    const normalizedZamName = normalizeZamName(zamName);
    const normZam = normalizeForMatch(normalizedZamName);
    const normFranchisee = normalizeForMatch(franchisee || '');
    const cleanedPhone = cleanPhone(phone);

    // Build full address
    const addressParts = [addr1, addr2, addr3].filter(Boolean);
    const fullAddress = addressParts.join(', ') + (suburb ? ', ' + suburb : '') + (state ? ' ' + state : '') + (postcode ? ' ' + postcode : '');

    let matchedCustomer = null;
    let matchMethod = null;

    // 1. Exact normalized name match
    if (byNormName[normZam]?.length) {
      matchedCustomer = byNormName[normZam][0];
      matchMethod = 'name_exact';
    }

    // 2. Fuzzy name match (>= 0.7 overlap)
    if (!matchedCustomer) {
      let bestScore = 0, bestCust = null;
      for (const [normName, custs] of Object.entries(byNormName)) {
        const score = wordOverlap(normName, normZam);
        if (score > bestScore && score >= 0.7) {
          bestScore = score;
          bestCust = custs[0];
        }
      }
      if (bestCust) {
        matchedCustomer = bestCust;
        matchMethod = `name_fuzzy_${Math.round(bestScore*100)}`;
      }
    }

    // 3. Phone match
    if (!matchedCustomer && cleanedPhone) {
      const phoneMatches = byPhone[cleanedPhone];
      if (phoneMatches?.length) {
        matchedCustomer = phoneMatches[0];
        matchMethod = 'phone';
      }
    }

    // 4. Suburb match (only if single match)
    if (!matchedCustomer && suburb) {
      const suburbMatches = bySuburb[suburb.toLowerCase().trim()];
      if (suburbMatches?.length === 1) {
        matchedCustomer = suburbMatches[0];
        matchMethod = 'suburb';
      }
    }

    const siteData = {
      zamName: normalizedZamName,
      franchisee,
      address: fullAddress,
      suburb,
      state,
      postcode,
      phone: phone ? phone.replace(/\s/g, '') : null,
      email,
      contactName,
      statusId,
      ownershipId,
    };

    if (matchedCustomer) {
      matched.push({ ...siteData, customerId: matchedCustomer.externalId, matchMethod });
    } else {
      unmatched.push(siteData);
    }

    // Build entity lookup for Xero matching
    if (franchisee) {
      const custId = matchedCustomer?.externalId;
      if (custId) {
        entityToSite[normalizeForMatch(franchisee)] = custId;
        // Also add short forms
        const parts = franchisee.split(/\s+/);
        if (parts.length >= 2) {
          entityToSite[normalizeForMatch(parts.slice(0,2).join(' '))] = custId;
        }
      }
    }
  }

  console.log(`\nMatched: ${matched.length}, Unmatched: ${unmatched.length}`);

  // Update matched customers
  console.log('\nUpdating matched customers...');
  let updated = 0;
  for (const m of matched) {
    const n = v => v === undefined ? null : (v || null);
    await conn.execute(`
      UPDATE customers SET
        businessName = COALESCE(NULLIF(businessName,''), ?),
        contactName = COALESCE(NULLIF(contactName,''), ?),
        contactEmail = COALESCE(NULLIF(contactEmail,''), ?),
        contactPhone = COALESCE(NULLIF(contactPhone,''), ?),
        siteAddress = COALESCE(NULLIF(siteAddress,''), ?),
        ownershipType = COALESCE(NULLIF(ownershipType,''), ?),
        updatedAt = NOW()
      WHERE externalId = ?
    `, [
      n(m.franchisee), n(m.contactName), n(m.email), n(m.phone),
      n(m.address), n(m.ownershipId),
      m.customerId
    ]);
    updated++;
  }
  console.log(`Updated ${updated} customers`);

  // Create new customers for unmatched sites
  console.log('\nCreating new customers for unmatched sites...');
  let created = 0;
  const newCustomerIds = [];

  // Get max customer ID number
  const [maxId] = await conn.execute(`SELECT MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED)) as maxNum FROM customers WHERE externalId REGEXP '^C[0-9]+'`);
  let nextNum = (maxId[0].maxNum || 1500) + 1;

  for (const site of unmatched) {
    const externalId = `C${String(nextNum).padStart(4, '0')}`;
    nextNum++;

    const nn = v => v === undefined ? null : (v || null);
    await conn.execute(`
      INSERT INTO customers (externalId, name, businessName, contactName, contactEmail, contactPhone, siteAddress, ownershipType, serviceCount, monthlyRevenue, monthlyCost, marginPercent, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 'active', NOW(), NOW())
    `, [
      externalId, nn(site.zamName), nn(site.franchisee), nn(site.contactName), nn(site.email),
      nn(site.phone), nn(site.address), nn(site.ownershipId)
    ]);

    newCustomerIds.push({ externalId, zamName: site.zamName, franchisee: site.franchisee });
    
    // Add to entity lookup
    if (site.franchisee) {
      entityToSite[normalizeForMatch(site.franchisee)] = externalId;
    }
    created++;
  }
  console.log(`Created ${created} new customer records`);

  // Save entity-to-site lookup for Xero matching
  fs.writeFileSync('/home/ubuntu/SmileTelBillingRecon/scripts/zambrero-entity-lookup.json', JSON.stringify(entityToSite, null, 2));
  console.log(`\nSaved entity lookup with ${Object.keys(entityToSite).length} entries`);

  // Print summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total sites in list: ${dataRows.length}`);
  console.log(`Matched to existing customers: ${matched.length}`);
  console.log(`New customers created: ${created}`);
  console.log('\nMatch methods:');
  const methods = {};
  for (const m of matched) methods[m.matchMethod] = (methods[m.matchMethod] || 0) + 1;
  for (const [k, v] of Object.entries(methods)) console.log(`  ${k}: ${v}`);

  await conn.end();
}

main().catch(e => { console.error(e.message, e.stack); process.exit(1); });
