/**
 * Vocus Portal Data Seeder
 * Loads all extracted Vocus Wholesale Portal data into the SmileTel Billing Recon database.
 * 
 * Data sources:
 *   - /home/ubuntu/vocus_mobile_details.json     (93 active mobile SIM details)
 *   - /home/ubuntu/vocus_standard_mobile.json    (75 active Standard Mobile list)
 *   - /home/ubuntu/vocus_4g_backup_active.json   (18 active 4G Backup list)
 *   - /home/ubuntu/vocus_standard_mobile_inactive.json (inactive Standard Mobile)
 *   - /home/ubuntu/vocus_nbn_details.json        (137 NBN service details)
 *   - /home/ubuntu/vocus_nbn_active.json         (58 active NBN list)
 *   - /home/ubuntu/vocus_nbn_inactive.json       (89 inactive NBN list)
 */

import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Parse DATABASE_URL: mysql://user:pass@host:port/dbname
const url = new URL(DB_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
  multipleStatements: true,
});

console.log('Connected to database');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: safe JSON parse
// ─────────────────────────────────────────────────────────────────────────────
function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.warn(`Warning: Could not load ${path}: ${e.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Load all data files
// ─────────────────────────────────────────────────────────────────────────────
const mobileDetails = loadJson('/home/ubuntu/vocus_mobile_details.json');
const stdMobileList = loadJson('/home/ubuntu/vocus_standard_mobile.json');
const backup4gList = loadJson('/home/ubuntu/vocus_4g_backup_active.json');
const stdMobileInactive = loadJson('/home/ubuntu/vocus_standard_mobile_inactive.json');
const nbnDetails = loadJson('/home/ubuntu/vocus_nbn_details.json');
const nbnActive = loadJson('/home/ubuntu/vocus_nbn_active.json');
const nbnInactive = loadJson('/home/ubuntu/vocus_nbn_inactive.json');

console.log(`Loaded: ${mobileDetails.length} mobile details, ${nbnDetails.length} NBN details`);
console.log(`Mobile lists: ${stdMobileList.length} std active, ${backup4gList.length} 4G active, ${stdMobileInactive.length} inactive`);
console.log(`NBN lists: ${nbnActive.length} active, ${nbnInactive.length} inactive`);

// ─────────────────────────────────────────────────────────────────────────────
// Build lookup maps from list data
// ─────────────────────────────────────────────────────────────────────────────
const stdMobileMap = new Map(stdMobileList.map(r => [r.vocusServiceId, r]));
const backup4gMap = new Map(backup4gList.map(r => [r.vocusServiceId, r]));
const nbnActiveMap = new Map(nbnActive.map(r => [r.vocusServiceId, r]));
const nbnInactiveMap = new Map(nbnInactive.map(r => [r.vocusServiceId, r]));

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Upsert Mobile Services
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== Upserting Mobile Services ===');

let mobileCreated = 0, mobileUpdated = 0, mobileErrors = 0;
const now = new Date().toISOString().slice(0, 10);

// Build combined mobile records: active (with details) + inactive
const allMobileRecords = [];

// Active records with full detail
for (const detail of mobileDetails) {
  const id = detail.vocusServiceId;
  const isBackup = detail.serviceType === '4g_backup';
  const listRecord = isBackup ? backup4gMap.get(id) : stdMobileMap.get(id);
  
  allMobileRecords.push({
    vocusServiceId: id,
    serviceScope: isBackup ? 'DATA-HOSTED' : 'STANDARD-POSTPAID',
    serviceStatus: 'active',
    realm: isBackup ? 'data.smileit.com' : 'mobile.smileit.com',
    msn: detail['Service Number'] || listRecord?.msn || '',
    sim: detail['SIM Number'] || listRecord?.sim || '',
    simType: detail['SIM Type'] || 'PHYSICAL',
    customerName: detail['Customer Reference'] || detail['Contact Name'] || listRecord?.customerName || '',
    label: detail['Contact Name'] || '',
    planId: detail['Product Type'] || listRecord?.planId || '',
    activationDate: listRecord?.activationDate || '',
    rawJson: JSON.stringify({...detail, listData: listRecord}),
  });
}

// Inactive Standard Mobile records
for (const rec of stdMobileInactive) {
  allMobileRecords.push({
    vocusServiceId: rec.vocusServiceId,
    serviceScope: 'STANDARD-POSTPAID',
    serviceStatus: 'inactive',
    realm: 'mobile.smileit.com',
    msn: rec.msn || '',
    sim: rec.sim || '',
    simType: 'PHYSICAL',
    customerName: rec.customerName || '',
    label: '',
    planId: rec.planId || '',
    activationDate: rec.activationDate || '',
    rawJson: JSON.stringify(rec),
  });
}

for (const rec of allMobileRecords) {
  try {
    const [existing] = await conn.execute(
      'SELECT id FROM vocus_mobile_services WHERE vocusServiceId = ?',
      [rec.vocusServiceId]
    );
    
    if (existing.length > 0) {
      await conn.execute(`
        UPDATE vocus_mobile_services SET
          serviceScope = ?, serviceStatus = ?, realm = ?,
          msn = ?, sim = ?, simType = ?,
          customerName = ?, label = ?, planId = ?,
          activationDate = ?, rawJson = ?, lastSyncedAt = NOW(), updatedAt = NOW()
        WHERE vocusServiceId = ?
      `, [
        rec.serviceScope, rec.serviceStatus, rec.realm,
        rec.msn, rec.sim, rec.simType,
        rec.customerName, rec.label, rec.planId,
        rec.activationDate, rec.rawJson, rec.vocusServiceId
      ]);
      mobileUpdated++;
    } else {
      await conn.execute(`
        INSERT INTO vocus_mobile_services
          (vocusServiceId, serviceScope, serviceStatus, realm,
           msn, sim, simType, customerName, label, planId,
           activationDate, rawJson, lastSyncedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
      `, [
        rec.vocusServiceId, rec.serviceScope, rec.serviceStatus, rec.realm,
        rec.msn, rec.sim, rec.simType, rec.customerName, rec.label, rec.planId,
        rec.activationDate, rec.rawJson
      ]);
      mobileCreated++;
    }
  } catch (e) {
    console.error(`Mobile ${rec.vocusServiceId} error: ${e.message}`);
    mobileErrors++;
  }
}

console.log(`Mobile: ${mobileCreated} created, ${mobileUpdated} updated, ${mobileErrors} errors`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: Upsert NBN Services
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== Upserting NBN Services ===');

let nbnCreated = 0, nbnUpdated = 0, nbnErrors = 0;

// Build combined NBN records: detailed (active) + inactive list
const allNbnRecords = [];

for (const detail of nbnDetails) {
  const id = detail.vocusServiceId;
  const listRecord = nbnActiveMap.get(id) || nbnInactiveMap.get(id);
  const isActive = nbnActiveMap.has(id);
  
  // Parse address from detail fields
  const rawAddress = detail['Address'] || detail['address'] || '';
  
  // Extract AVC ID from various possible field names
  const avcId = detail['NBN AVC'] || detail['avcId'] || detail['AVC ID'] || '';
  const locId = detail['Carrier ID'] || detail['locId'] || detail['NBN Location ID'] || '';
  const technology = detail['Line Size'] || detail['technology'] || '';
  const speedTier = detail['Plan Type'] || detail['speedTier'] || '';
  const ipAddress = detail['IP Address'] || detail['ipAddress'] || '';
  const poiName = detail['NBN POI'] || detail['poiName'] || '';
  const username = detail['username'] || detail['Username'] || listRecord?.username || id;
  const customerRef = detail['Customer Reference'] || detail['customerName'] || listRecord?.customerName || '';
  
  allNbnRecords.push({
    vocusServiceId: id,
    serviceStatus: isActive ? 'active' : 'inactive',
    realm: 'wba.rvcict.com.au',
    username,
    avcId,
    locId,
    technology,
    speedTier,
    address: rawAddress,
    customerName: customerRef,
    ipAddress,
    poiName,
    activationDate: listRecord?.activationDate || '',
    rawJson: JSON.stringify({...detail, listData: listRecord}),
  });
}

// Add any inactive NBN services not in details (shouldn't happen but safety net)
for (const rec of nbnInactive) {
  if (!nbnDetails.find(d => d.vocusServiceId === rec.vocusServiceId)) {
    allNbnRecords.push({
      vocusServiceId: rec.vocusServiceId,
      serviceStatus: 'inactive',
      realm: 'wba.rvcict.com.au',
      username: rec.username || rec.vocusServiceId,
      avcId: '',
      locId: '',
      technology: '',
      speedTier: '',
      address: rec.address || '',
      customerName: rec.customerName || '',
      ipAddress: '',
      poiName: '',
      activationDate: rec.activationDate || '',
      rawJson: JSON.stringify(rec),
    });
  }
}

for (const rec of allNbnRecords) {
  try {
    const [existing] = await conn.execute(
      'SELECT id FROM vocus_nbn_services WHERE vocusServiceId = ?',
      [rec.vocusServiceId]
    );
    
    if (existing.length > 0) {
      await conn.execute(`
        UPDATE vocus_nbn_services SET
          serviceStatus = ?, realm = ?, username = ?,
          avcId = ?, locId = ?, technology = ?, speedTier = ?,
          address = ?, customerName = ?, ipAddress = ?, poiName = ?,
          activationDate = ?, rawJson = ?, lastSyncedAt = NOW(), updatedAt = NOW()
        WHERE vocusServiceId = ?
      `, [
        rec.serviceStatus, rec.realm, rec.username,
        rec.avcId, rec.locId, rec.technology, rec.speedTier,
        rec.address, rec.customerName, rec.ipAddress, rec.poiName,
        rec.activationDate, rec.rawJson, rec.vocusServiceId
      ]);
      nbnUpdated++;
    } else {
      await conn.execute(`
        INSERT INTO vocus_nbn_services
          (vocusServiceId, serviceStatus, realm, username,
           avcId, locId, technology, speedTier,
           address, customerName, ipAddress, poiName,
           activationDate, rawJson, lastSyncedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
      `, [
        rec.vocusServiceId, rec.serviceStatus, rec.realm, rec.username,
        rec.avcId, rec.locId, rec.technology, rec.speedTier,
        rec.address, rec.customerName, rec.ipAddress, rec.poiName,
        rec.activationDate, rec.rawJson
      ]);
      nbnCreated++;
    }
  } catch (e) {
    console.error(`NBN ${rec.vocusServiceId} error: ${e.message}`);
    nbnErrors++;
  }
}

console.log(`NBN: ${nbnCreated} created, ${nbnUpdated} updated, ${nbnErrors} errors`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Upsert Bucket Records
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== Upserting Bucket Records ===');

const buckets = [
  {
    bucketId: 'mobile.smileit.com-standard',
    bucketType: 'STANDARD-POSTPAID',
    realm: 'mobile.smileit.com',
    dataQuotaMb: 100 * 1024,          // 100 GB in MB
    dataUsedMb: 188.69 * 1024,        // 188.69 GB in MB
    voiceQuotaMin: 10000,
    voiceUsedMin: 0,
    smsQuota: 10000,
    smsUsed: 0,
    isOverQuota: true,
    overageDataMb: 88.69 * 1024,
    simCount: 75,
    snapshotDate: now,
    rawJson: JSON.stringify({source: 'portal_manual', snapshotDate: now, note: 'Captured 24 Mar 2026 - over quota'}),
  },
  {
    bucketId: 'data.smileit.com-4gbackup',
    bucketType: 'DATA-HOSTED',
    realm: 'data.smileit.com',
    dataQuotaMb: 100 * 1024,          // 100 GB in MB
    dataUsedMb: 187.38 * 1024,        // 187.38 GB in MB
    voiceQuotaMin: null,
    voiceUsedMin: null,
    smsQuota: null,
    smsUsed: null,
    isOverQuota: true,
    overageDataMb: 87.38 * 1024,
    simCount: 18,
    snapshotDate: now,
    rawJson: JSON.stringify({source: 'portal_manual', snapshotDate: now, note: 'Captured 24 Mar 2026 - over quota. +200GB increase pending.'}),
  }
];

let bucketCreated = 0, bucketUpdated = 0;
for (const b of buckets) {
  try {
    const [existing] = await conn.execute(
      'SELECT id FROM vocus_buckets WHERE bucketId = ?',
      [b.bucketId]
    );
    if (existing.length > 0) {
      await conn.execute(`
        UPDATE vocus_buckets SET
          bucketType = ?, realm = ?, dataQuotaMb = ?, dataUsedMb = ?,
          voiceQuotaMin = ?, voiceUsedMin = ?, smsQuota = ?, smsUsed = ?,
          isOverQuota = ?, overageDataMb = ?, simCount = ?,
          snapshotDate = ?, rawJson = ?, lastSyncedAt = NOW(), updatedAt = NOW()
        WHERE bucketId = ?
      `, [
        b.bucketType, b.realm, b.dataQuotaMb, b.dataUsedMb,
        b.voiceQuotaMin, b.voiceUsedMin, b.smsQuota, b.smsUsed,
        b.isOverQuota ? 1 : 0, b.overageDataMb, b.simCount,
        b.snapshotDate, b.rawJson, b.bucketId
      ]);
      bucketUpdated++;
    } else {
      await conn.execute(`
        INSERT INTO vocus_buckets
          (bucketId, bucketType, realm, dataQuotaMb, dataUsedMb,
           voiceQuotaMin, voiceUsedMin, smsQuota, smsUsed,
           isOverQuota, overageDataMb, simCount,
           snapshotDate, rawJson, lastSyncedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
      `, [
        b.bucketId, b.bucketType, b.realm, b.dataQuotaMb, b.dataUsedMb,
        b.voiceQuotaMin, b.voiceUsedMin, b.smsQuota, b.smsUsed,
        b.isOverQuota ? 1 : 0, b.overageDataMb, b.simCount,
        b.snapshotDate, b.rawJson
      ]);
      bucketCreated++;
    }
  } catch (e) {
    console.error(`Bucket ${b.bucketId} error: ${e.message}`);
  }
}
console.log(`Buckets: ${bucketCreated} created, ${bucketUpdated} updated`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Log the sync run
// ─────────────────────────────────────────────────────────────────────────────
const totalRecords = mobileCreated + mobileUpdated + nbnCreated + nbnUpdated;
await conn.execute(`
  INSERT INTO vocus_sync_log
    (syncType, status, recordsFetched, recordsCreated, recordsUpdated, recordsMatched,
     startedAt, completedAt, durationMs, triggeredBy)
  VALUES ('full', 'completed', ?, ?, ?, 0, NOW(), NOW(), 0, 'manual')
`, [
  totalRecords,
  mobileCreated + nbnCreated + bucketCreated,
  mobileUpdated + nbnUpdated + bucketUpdated
]);

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== SEEDING COMPLETE ===');
console.log(`Mobile services: ${mobileCreated + mobileUpdated} total (${mobileCreated} new, ${mobileUpdated} updated)`);
console.log(`NBN services: ${nbnCreated + nbnUpdated} total (${nbnCreated} new, ${nbnUpdated} updated)`);
console.log(`Buckets: ${bucketCreated + bucketUpdated} total`);
console.log(`Grand total: ${mobileCreated + mobileUpdated + nbnCreated + nbnUpdated} service records loaded`);

await conn.end();
