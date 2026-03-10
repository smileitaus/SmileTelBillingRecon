import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ---- 1. Login to Carbon API ----
const username = 'smiletel.api';
const password = 'HK#v3X44dUE\x24X%(Xj}';
const baseUrl = 'https://api.carbon.aussiebroadband.com.au';

console.log('Logging in to Carbon API...');
const loginRes = await fetch(`${baseUrl}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password }),
});

if (loginRes.status !== 200) {
  console.error('Login failed:', loginRes.status, await loginRes.text());
  process.exit(1);
}

const cookies = loginRes.headers.get('set-cookie');
const cookieStr = (cookies || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
console.log('Login successful!');

// ---- 2. Fetch all services ----
let allCarbonServices = [];
let page = 1;
let hasMore = true;

while (hasMore) {
  const res = await fetch(`${baseUrl}/carbon/services?page=${page}`, {
    headers: { 'Accept': 'application/json', 'cookie': cookieStr },
  });
  const data = await res.json();
  allCarbonServices.push(...(data.data || []));
  console.log(`Page ${page}: ${(data.data || []).length} services (total: ${allCarbonServices.length})`);
  hasMore = !!data.next_page_url;
  page++;
}

console.log(`\nTotal Carbon services: ${allCarbonServices.length}`);

// ---- 3. Fetch detailed info for each service ----
console.log('\nFetching detailed service info...');
const detailedServices = [];
let fetchCount = 0;

for (const svc of allCarbonServices) {
  try {
    const res = await fetch(`${baseUrl}/carbon/services/${svc.id}`, {
      headers: { 'Accept': 'application/json', 'cookie': cookieStr },
    });
    if (res.status === 200) {
      const detail = await res.json();
      detailedServices.push({ ...svc, detail });
    } else {
      detailedServices.push(svc);
    }
  } catch (err) {
    detailedServices.push(svc);
  }
  fetchCount++;
  if (fetchCount % 50 === 0) console.log(`  Fetched ${fetchCount}/${allCarbonServices.length} details`);
}
console.log(`Fetched ${fetchCount} service details`);

// ---- 4. Get existing services for matching ----
const [existingServices] = await conn.execute(
  'SELECT id, externalId, serviceType, planName, locationAddress, phoneNumber, connectionId, avcId, locId, customerName, customerExternalId, carbonServiceId FROM services'
);
console.log(`\nExisting services in DB: ${existingServices.length}`);

// Build lookup maps
const byAvc = new Map();
const byAddress = new Map();
const byAlias = new Map();
const byLocId = new Map();

for (const svc of existingServices) {
  if (svc.connectionId) byAvc.set(svc.connectionId.toUpperCase(), svc);
  if (svc.avcId) byAvc.set(svc.avcId.toUpperCase(), svc);
  if (svc.locationAddress) {
    const normAddr = normalizeAddress(svc.locationAddress);
    if (!byAddress.has(normAddr)) byAddress.set(normAddr, []);
    byAddress.get(normAddr).push(svc);
  }
  if (svc.customerName) {
    const normName = svc.customerName.toLowerCase().trim();
    if (!byAlias.has(normName)) byAlias.set(normName, []);
    byAlias.get(normName).push(svc);
  }
  if (svc.locId) byLocId.set(svc.locId.toUpperCase(), svc);
}

function normalizeAddress(addr) {
  return (addr || '')
    .toLowerCase()
    .replace(/[,.\-\/\\]/g, ' ')
    .replace(/\b(unit|shop|suite|level|lot|ste|apt)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractStreetFromAddress(addr) {
  const norm = normalizeAddress(addr);
  // Try to extract street name (skip numbers and unit prefixes)
  const parts = norm.split(' ').filter(p => p.length > 2 && !/^\d+$/.test(p));
  return parts.slice(0, 3).join(' ');
}

// ---- 5. Match and enrich ----
let matched = 0;
let created = 0;
let alreadyLinked = 0;
let matchDetails = [];

for (const carbonSvc of detailedServices) {
  const serviceIdentifier = carbonSvc.service_identifier || carbonSvc.circuit_id || '';
  const locationId = carbonSvc.location_id || '';
  const alias = carbonSvc.alias || '';
  const address = carbonSvc.address || '';
  const carbonId = String(carbonSvc.id);
  
  // Extract speed tier from plan
  const planName = carbonSvc.plan?.name || '';
  const speedMatch = planName.match(/(\d+Mbps\/\d+Mbps)/);
  const speedTier = speedMatch ? speedMatch[1] : (carbonSvc.download_speed && carbonSvc.upload_speed ? `${Math.round(carbonSvc.download_speed/1000)}Mbps/${Math.round(carbonSvc.upload_speed/1000)}Mbps` : '');
  
  // Get IPs
  const ips = (carbonSvc.network?.ips || []).map(ip => ip.ip).join(', ');
  
  // Get CPE info
  const cpes = (carbonSvc.cpes || []).map(c => `${c.make || ''} ${c.model || ''} (S/N: ${c.serial_number || 'N/A'})`).join('; ');
  
  // Get contract info
  const contract = carbonSvc.contract;
  const contractEnd = contract?.end_date || '';
  
  // Technology type
  const tech = carbonSvc.technology || carbonSvc.interface_type || '';
  
  // Enrichment data
  const enrichData = {
    carbonServiceId: carbonId,
    carbonServiceType: carbonSvc.type || '',
    carbonStatus: carbonSvc.status || '',
    avcId: serviceIdentifier,
    technology: tech,
    speedTier: speedTier,
    nbnSla: carbonSvc.nbn_sla || '',
    supportPack: carbonSvc.support_pack || '',
    poiName: carbonSvc.poi_name || '',
    zone: carbonSvc.zone || '',
    openDate: carbonSvc.open_date || '',
    carbonMonthlyCost: carbonSvc.monthly_cost_cents ? (carbonSvc.monthly_cost_cents / 100).toFixed(2) : null,
    carbonPlanName: planName,
    carbonAlias: alias,
    provider: 'ABB',
    locId: locationId,
    ipAddress: ips || undefined,
  };

  // Try matching
  let matchedSvc = null;
  let matchMethod = '';

  // 1. Already linked by carbonServiceId
  const [alreadyLinkedRows] = await conn.execute('SELECT id FROM services WHERE carbonServiceId = ?', [carbonId]);
  if (alreadyLinkedRows.length > 0) {
    alreadyLinked++;
    // Still update with latest data
    const updateFields = [];
    const updateValues = [];
    for (const [key, val] of Object.entries(enrichData)) {
      if (val !== undefined && val !== null && val !== '') {
        updateFields.push(`${key} = ?`);
        updateValues.push(val);
      }
    }
    if (cpes) { updateFields.push('hardwareType = ?'); updateValues.push(cpes); }
    if (contractEnd) { updateFields.push('contractEndDate = ?'); updateValues.push(contractEnd); }
    if (updateFields.length > 0) {
      updateValues.push(alreadyLinkedRows[0].id);
      await conn.execute(`UPDATE services SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    }
    continue;
  }

  // 2. Match by AVC/OVC/circuit ID
  if (serviceIdentifier) {
    matchedSvc = byAvc.get(serviceIdentifier.toUpperCase());
    if (matchedSvc) matchMethod = 'AVC/Service ID';
  }

  // 3. Match by location ID
  if (!matchedSvc && locationId) {
    matchedSvc = byLocId.get(locationId.toUpperCase());
    if (matchedSvc) matchMethod = 'Location ID';
  }

  // 4. Match by alias (customer name)
  if (!matchedSvc && alias) {
    // Extract customer name from alias (e.g., "Zambrero South Yarra" -> look up)
    const normAlias = alias.toLowerCase().trim();
    // Try exact match
    const aliasMatches = byAlias.get(normAlias);
    if (aliasMatches && aliasMatches.length > 0) {
      // Prefer internet services for NBN matches
      const internetMatch = aliasMatches.find(s => s.serviceType === 'Internet');
      matchedSvc = internetMatch || aliasMatches[0];
      matchMethod = 'Customer alias';
    }
    
    // Try partial alias match (remove "NBN: " prefix, etc.)
    if (!matchedSvc) {
      const cleanAlias = normAlias.replace(/^(nbn|nbnee|managed):\s*/i, '').trim();
      for (const [name, svcs] of byAlias.entries()) {
        if (name.includes(cleanAlias) || cleanAlias.includes(name)) {
          const internetMatch = svcs.find(s => s.serviceType === 'Internet');
          matchedSvc = internetMatch || svcs[0];
          matchMethod = 'Partial alias';
          break;
        }
      }
    }
  }

  // 5. Match by address
  if (!matchedSvc && address) {
    const normAddr = normalizeAddress(address);
    const addrMatches = byAddress.get(normAddr);
    if (addrMatches && addrMatches.length > 0) {
      const internetMatch = addrMatches.find(s => s.serviceType === 'Internet');
      matchedSvc = internetMatch || addrMatches[0];
      matchMethod = 'Address (exact)';
    }
    
    // Try street-level match
    if (!matchedSvc) {
      const street = extractStreetFromAddress(address);
      if (street.length > 5) {
        for (const [addr, svcs] of byAddress.entries()) {
          if (addr.includes(street)) {
            const internetMatch = svcs.find(s => s.serviceType === 'Internet');
            matchedSvc = internetMatch || svcs[0];
            matchMethod = 'Address (street)';
            break;
          }
        }
      }
    }
  }

  if (matchedSvc) {
    // Enrich existing service
    const updateFields = [];
    const updateValues = [];
    for (const [key, val] of Object.entries(enrichData)) {
      if (val !== undefined && val !== null && val !== '') {
        updateFields.push(`${key} = ?`);
        updateValues.push(val);
      }
    }
    if (cpes) { updateFields.push('hardwareType = ?'); updateValues.push(cpes); }
    if (contractEnd) { updateFields.push('contractEndDate = ?'); updateValues.push(contractEnd); }
    if (address && !matchedSvc.locationAddress) { updateFields.push('locationAddress = ?'); updateValues.push(address); }
    
    // Build notes about the Carbon match
    const noteText = `[Carbon API Match] Matched by ${matchMethod}. Carbon ID: ${carbonId}, Type: ${carbonSvc.type}, Status: ${carbonSvc.status}, Plan: ${planName}, Cost: $${(carbonSvc.monthly_cost_cents/100).toFixed(2)}/mo`;
    updateFields.push("dataSource = CASE WHEN dataSource = '' OR dataSource IS NULL THEN ? ELSE CONCAT(dataSource, '; ', ?) END");
    updateValues.push('Carbon API', 'Carbon API');
    
    if (updateFields.length > 0) {
      updateValues.push(matchedSvc.id);
      await conn.execute(`UPDATE services SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    }
    
    matched++;
    matchDetails.push({ carbonId, alias: alias || address, matchedTo: matchedSvc.externalId, method: matchMethod });
  } else {
    // Create new service
    const newExternalId = `S${String(700 + created).padStart(4, '0')}`;
    
    // Determine service type
    let serviceType = 'Internet';
    if (carbonSvc.type === 'phonemobile') serviceType = 'Mobile';
    else if (carbonSvc.type === 'nbnee') serviceType = 'Internet';
    else if (carbonSvc.type === 'managed') serviceType = 'Internet';
    
    const insertData = {
      externalId: newExternalId,
      serviceType: serviceType,
      serviceTypeDetail: carbonSvc.type === 'nbnee' ? 'NBN Enterprise Ethernet' : (carbonSvc.type === 'managed' ? 'Managed Fibre' : tech),
      planName: planName,
      status: 'unmatched',
      locationAddress: address,
      connectionId: serviceIdentifier,
      locId: locationId,
      ipAddress: ips,
      customerName: alias.replace(/^(NBN|NBNEE|MANAGED):\s*/i, '').split(' - ')[0].trim() || '',
      monthlyCost: carbonSvc.monthly_cost_cents ? (carbonSvc.monthly_cost_cents / 100).toFixed(2) : '0.00',
      dataSource: 'Carbon API',
      provider: 'ABB',
      hardwareType: cpes || '',
      contractEndDate: contractEnd,
      ...enrichData,
    };
    
    const cols = Object.keys(insertData);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map(c => insertData[c] ?? '');
    
    await conn.execute(`INSERT INTO services (${cols.join(', ')}) VALUES (${placeholders})`, values);
    created++;
    matchDetails.push({ carbonId, alias: alias || address, matchedTo: 'NEW: ' + newExternalId, method: 'Created' });
  }
}

console.log(`\n=== Import Summary ===`);
console.log(`Already linked: ${alreadyLinked}`);
console.log(`Matched & enriched: ${matched}`);
console.log(`New services created: ${created}`);
console.log(`Total Carbon services: ${allCarbonServices.length}`);

// Show match details
console.log('\n=== Match Details ===');
const byMethod = {};
for (const d of matchDetails) {
  byMethod[d.method] = (byMethod[d.method] || 0) + 1;
  if (matchDetails.length <= 50 || d.method === 'Created') {
    console.log(`  ${d.alias.substring(0, 50).padEnd(50)} -> ${d.matchedTo} (${d.method})`);
  }
}
console.log('\nMatch methods:');
for (const [method, count] of Object.entries(byMethod).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${method}: ${count}`);
}

// Verify final counts
const [finalCount] = await conn.execute('SELECT COUNT(*) as cnt FROM services');
const [providerCount] = await conn.execute('SELECT provider, COUNT(*) as cnt FROM services GROUP BY provider ORDER BY cnt DESC');
console.log(`\nFinal service count: ${finalCount[0].cnt}`);
console.log('Provider distribution:');
for (const row of providerCount) {
  console.log(`  ${row.provider}: ${row.cnt}`);
}

await conn.end();
