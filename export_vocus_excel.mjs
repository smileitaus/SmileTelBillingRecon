import mysql from 'mysql2/promise';
import * as XLSX from 'xlsx';

// Use DATABASE_URL from environment
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL environment variable not set');

const conn = await mysql.createConnection(dbUrl);

// ─── NBN Services ─────────────────────────────────────────────────────────────
// Actual columns: id, vocusServiceId, serviceStatus, planId, realm, username,
//   avcId, locId, technology, speedTier, address, suburb, state, postcode,
//   customerName, contactPhone, contactEmail, label, anniversaryDay, ipAddress,
//   poiName, activationDate, internalServiceExternalId, internalCustomerExternalId,
//   matchType, matchConfidence, rawJson, lastSyncedAt, createdAt, updatedAt
const [nbnRows] = await conn.execute(`
  SELECT
    n.vocusServiceId              AS "Vocus Service ID",
    n.serviceStatus               AS "Status",
    n.username                    AS "Username (Vocus Login)",
    n.realm                       AS "Realm",
    n.avcId                       AS "AVC ID",
    n.locId                       AS "NBN Location ID",
    n.technology                  AS "Technology",
    n.speedTier                   AS "Speed Tier",
    n.planId                      AS "Plan ID",
    n.address                     AS "Full Address",
    n.suburb                      AS "Suburb",
    n.state                       AS "State",
    n.postcode                    AS "Postcode",
    n.customerName                AS "Customer Name (Vocus)",
    n.contactPhone                AS "Contact Phone (Vocus)",
    n.contactEmail                AS "Contact Email (Vocus)",
    n.label                       AS "Service Label",
    n.ipAddress                   AS "IP Address",
    n.poiName                     AS "POI Name",
    n.anniversaryDay              AS "Anniversary Day",
    n.activationDate              AS "Activation Date",
    n.internalServiceExternalId   AS "Matched Service ID",
    n.internalCustomerExternalId  AS "Matched Customer ID",
    n.matchType                   AS "Match Type",
    n.matchConfidence             AS "Match Confidence",
    s.customerName                AS "Matched Service Name",
    s.phoneNumber                 AS "Matched Service Phone",
    s.locationAddress             AS "Matched Service Address",
    s.supplierName                AS "Matched Service Provider",
    s.connectionId                AS "Matched Service AVC/Connection ID",
    c.name                        AS "Matched Customer Name",
    c.businessName                AS "Matched Customer Business",
    c.contactEmail                AS "Matched Customer Email",
    c.contactPhone                AS "Matched Customer Phone",
    n.lastSyncedAt                AS "Last Synced",
    n.createdAt                   AS "Record Created"
  FROM vocus_nbn_services n
  LEFT JOIN services s ON s.externalId = n.internalServiceExternalId
  LEFT JOIN customers c ON c.externalId = n.internalCustomerExternalId
  ORDER BY n.serviceStatus ASC, n.username ASC
`);

// ─── Mobile SIM Services ──────────────────────────────────────────────────────
// Actual columns: id, vocusServiceId, serviceScope, serviceStatus, planId, realm,
//   sim, simType, msn, puk, customerName, anniversaryDay, bucketId, label,
//   locationReference, voiceBarring, roaming, gprs, smsIn, smsOut,
//   voiceDivertAlways, voiceDivertBusy, voiceDivertNoAnswer, voiceDivertUnreachable,
//   orderType, portOutReference, billingProviderId, activationDate,
//   internalServiceExternalId, internalCustomerExternalId, matchType, matchConfidence,
//   rawJson, lastSyncedAt, createdAt, updatedAt
const [mobileRows] = await conn.execute(`
  SELECT
    m.vocusServiceId              AS "Vocus Service ID",
    m.serviceStatus               AS "Status",
    m.serviceScope                AS "Service Scope (Product Type)",
    m.realm                       AS "Realm / Bucket Domain",
    m.msn                         AS "Mobile Number (MSN)",
    m.sim                         AS "SIM Card Number",
    m.simType                     AS "SIM Type",
    m.puk                         AS "PUK Code",
    m.planId                      AS "Plan ID",
    m.customerName                AS "Customer Name (Vocus)",
    m.locationReference           AS "Location Reference / Address",
    m.label                       AS "Service Label",
    m.bucketId                    AS "Bucket ID",
    m.anniversaryDay              AS "Anniversary Day",
    m.activationDate              AS "Activation Date",
    m.roaming                     AS "Roaming Enabled",
    m.gprs                        AS "GPRS / Data Enabled",
    m.smsIn                       AS "SMS Inbound",
    m.smsOut                      AS "SMS Outbound",
    m.voiceBarring                AS "Voice Barring",
    m.voiceDivertAlways           AS "Divert Always",
    m.voiceDivertBusy             AS "Divert Busy",
    m.voiceDivertNoAnswer         AS "Divert No Answer",
    m.voiceDivertUnreachable      AS "Divert Unreachable",
    m.orderType                   AS "Order Type",
    m.portOutReference            AS "Port Out Reference",
    m.billingProviderId           AS "Billing Provider ID",
    m.internalServiceExternalId   AS "Matched Service ID",
    m.internalCustomerExternalId  AS "Matched Customer ID",
    m.matchType                   AS "Match Type",
    m.matchConfidence             AS "Match Confidence",
    s.customerName                AS "Matched Service Name",
    s.phoneNumber                 AS "Matched Service Phone",
    s.locationAddress             AS "Matched Service Address",
    s.supplierName                AS "Matched Service Provider",
    c.name                        AS "Matched Customer Name",
    c.businessName                AS "Matched Customer Business",
    c.contactEmail                AS "Matched Customer Email",
    c.contactPhone                AS "Matched Customer Phone",
    m.lastSyncedAt                AS "Last Synced",
    m.createdAt                   AS "Record Created"
  FROM vocus_mobile_services m
  LEFT JOIN services s ON s.externalId = m.internalServiceExternalId
  LEFT JOIN customers c ON c.externalId = m.internalCustomerExternalId
  ORDER BY m.serviceStatus ASC, m.realm ASC, m.customerName ASC
`);

// ─── Bucket Quota Snapshot ────────────────────────────────────────────────────
// Actual columns: id, bucketId, bucketType, realm, planId, serviceStatus,
//   dataQuotaMb, dataUsedMb, voiceQuotaMin, voiceUsedMin, smsQuota, smsUsed,
//   isOverQuota, overageDataMb, simCount, snapshotDate, rawJson, lastSyncedAt
const [bucketRows] = await conn.execute(`
  SELECT
    bucketId                              AS "Bucket ID",
    bucketType                            AS "Bucket Type",
    realm                                 AS "Realm / Domain",
    planId                                AS "Plan ID",
    serviceStatus                         AS "Status",
    simCount                              AS "SIM Count",
    dataUsedMb                            AS "Data Used (MB)",
    ROUND(dataUsedMb / 1024, 2)           AS "Data Used (GB)",
    dataQuotaMb                           AS "Data Quota (MB)",
    ROUND(dataQuotaMb / 1024, 2)          AS "Data Quota (GB)",
    ROUND(dataUsedMb / dataQuotaMb * 100, 1) AS "Data Usage %",
    isOverQuota                           AS "Over Quota",
    overageDataMb                         AS "Overage Data (MB)",
    ROUND(overageDataMb / 1024, 2)        AS "Overage Data (GB)",
    voiceUsedMin                          AS "Voice Used (Min)",
    voiceQuotaMin                         AS "Voice Quota (Min)",
    smsUsed                               AS "SMS Used",
    smsQuota                              AS "SMS Quota",
    snapshotDate                          AS "Snapshot Date",
    lastSyncedAt                          AS "Last Synced"
  FROM vocus_buckets
  ORDER BY snapshotDate DESC
`);

// ─── Unmatched NBN (for manual review) ───────────────────────────────────────
const [unmatchedNbn] = await conn.execute(`
  SELECT
    n.vocusServiceId    AS "Vocus Service ID",
    n.serviceStatus     AS "Status",
    n.username          AS "Username (Vocus Login)",
    n.avcId             AS "AVC ID",
    n.locId             AS "NBN Location ID",
    n.technology        AS "Technology",
    n.speedTier         AS "Speed Tier",
    n.planId            AS "Plan ID",
    n.address           AS "Full Address",
    n.suburb            AS "Suburb",
    n.state             AS "State",
    n.postcode          AS "Postcode",
    n.customerName      AS "Customer Name (Vocus)",
    n.contactPhone      AS "Contact Phone",
    n.contactEmail      AS "Contact Email",
    n.ipAddress         AS "IP Address",
    n.poiName           AS "POI Name",
    n.activationDate    AS "Activation Date",
    ''                  AS "MANUAL: SmileTel Customer Name",
    ''                  AS "MANUAL: SmileTel Customer ID",
    ''                  AS "MANUAL: Notes"
  FROM vocus_nbn_services n
  WHERE n.internalCustomerExternalId IS NULL
  ORDER BY n.serviceStatus ASC, n.suburb ASC
`);

// ─── Unmatched Mobile (for manual review) ────────────────────────────────────
const [unmatchedMobile] = await conn.execute(`
  SELECT
    m.vocusServiceId    AS "Vocus Service ID",
    m.serviceStatus     AS "Status",
    m.serviceScope      AS "Product Type",
    m.realm             AS "Bucket Domain",
    m.msn               AS "Mobile Number (MSN)",
    m.sim               AS "SIM Card Number",
    m.planId            AS "Plan ID",
    m.customerName      AS "Customer Name (Vocus)",
    m.locationReference AS "Location Reference",
    m.activationDate    AS "Activation Date",
    ''                  AS "MANUAL: SmileTel Customer Name",
    ''                  AS "MANUAL: SmileTel Customer ID",
    ''                  AS "MANUAL: Notes"
  FROM vocus_mobile_services m
  WHERE m.internalCustomerExternalId IS NULL
  ORDER BY m.serviceStatus ASC, m.customerName ASC
`);

await conn.end();

// ─── Summary ──────────────────────────────────────────────────────────────────
const nbnActive    = nbnRows.filter(r => r['Status'] === 'active').length;
const nbnInactive  = nbnRows.filter(r => r['Status'] !== 'active').length;
const nbnMatched   = nbnRows.filter(r => r['Matched Customer ID']).length;
const nbnUnmatched = nbnRows.filter(r => !r['Matched Customer ID']).length;

const mobActive    = mobileRows.filter(r => r['Status'] === 'active').length;
const mobInactive  = mobileRows.filter(r => r['Status'] !== 'active').length;
const mobMatched   = mobileRows.filter(r => r['Matched Customer ID']).length;
const mobUnmatched = mobileRows.filter(r => !r['Matched Customer ID']).length;

const summaryRows = [
  { "Category": "=== NBN SERVICES ===" },
  { "Category": "Total NBN Services",                        "Count": nbnRows.length },
  { "Category": "  Active",                                  "Count": nbnActive },
  { "Category": "  Inactive / Cancelled",                    "Count": nbnInactive },
  { "Category": "  Matched to SmileTel Customer",            "Count": nbnMatched },
  { "Category": "  Unmatched (manual review required)",      "Count": nbnUnmatched },
  { "Category": "" },
  { "Category": "=== MOBILE SIMs ===" },
  { "Category": "Total Mobile SIMs",                         "Count": mobileRows.length },
  { "Category": "  Active",                                  "Count": mobActive },
  { "Category": "  Inactive / Cancelled",                    "Count": mobInactive },
  { "Category": "  Matched to SmileTel Customer",            "Count": mobMatched },
  { "Category": "  Unmatched (manual review required)",      "Count": mobUnmatched },
  { "Category": "" },
  { "Category": "=== BUCKET QUOTAS ===" },
  { "Category": "Standard Mobile Pool (mobile.smileit.com)", "Count": "188.9 GB / 100 GB — OVER QUOTA" },
  { "Category": "4G Backup Pool (data.smileit.com)",         "Count": "187.7 GB / 100 GB — OVER QUOTA" },
  { "Category": "Pending quota increase (both pools)",       "Count": "+200 GB — effective next billing month" },
  { "Category": "" },
  { "Category": "=== METADATA ===" },
  { "Category": "Data Extracted",  "Count": new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' }) },
  { "Category": "Source",          "Count": "Vocus Wholesale Portal — members.vocus.com.au" },
  { "Category": "Portal Account",  "Count": "portal@rvcict.com.au" },
  { "Category": "Realm (NBN)",     "Count": "wba.rvcict.com.au" },
  { "Category": "Realm (Mobile)",  "Count": "mobile.smileit.com / data.smileit.com" },
];

// ─── Build Workbook ───────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

// 1. Summary
const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
wsSummary['!cols'] = [{ wch: 50 }, { wch: 40 }];
XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

// 2. NBN Services (all)
const wsNbn = XLSX.utils.json_to_sheet(nbnRows);
wsNbn['!cols'] = [
  { wch: 18 }, { wch: 10 }, { wch: 38 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
  { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 40 }, { wch: 18 }, { wch: 8 },
  { wch: 10 }, { wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 16 },
  { wch: 20 }, { wch: 8 },  { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 14 },
  { wch: 10 }, { wch: 30 }, { wch: 18 }, { wch: 40 }, { wch: 12 }, { wch: 25 },
  { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 20 },
];
XLSX.utils.book_append_sheet(wb, wsNbn, 'NBN Services');

// 3. Mobile SIMs (all)
const wsMobile = XLSX.utils.json_to_sheet(mobileRows);
wsMobile['!cols'] = [
  { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 22 },
  { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 40 }, { wch: 20 },
  { wch: 14 }, { wch: 8 },  { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
  { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
  { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 14 },
  { wch: 10 }, { wch: 30 }, { wch: 18 }, { wch: 40 }, { wch: 12 }, { wch: 30 },
  { wch: 30 }, { wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 20 },
];
XLSX.utils.book_append_sheet(wb, wsMobile, 'Mobile SIMs');

// 4. Bucket Quotas
const wsBuckets = XLSX.utils.json_to_sheet(bucketRows);
wsBuckets['!cols'] = [
  { wch: 30 }, { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
  { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 22 },
];
XLSX.utils.book_append_sheet(wb, wsBuckets, 'Bucket Quotas');

// 5. Unmatched NBN (manual review)
const wsUnmatchedNbn = XLSX.utils.json_to_sheet(unmatchedNbn);
wsUnmatchedNbn['!cols'] = [
  { wch: 18 }, { wch: 10 }, { wch: 38 }, { wch: 18 }, { wch: 18 }, { wch: 12 },
  { wch: 14 }, { wch: 22 }, { wch: 40 }, { wch: 18 }, { wch: 8 }, { wch: 10 },
  { wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 18 },
  { wch: 35 }, { wch: 35 }, { wch: 35 },
];
XLSX.utils.book_append_sheet(wb, wsUnmatchedNbn, 'Unmatched NBN (Review)');

// 6. Unmatched Mobile (manual review)
const wsUnmatchedMobile = XLSX.utils.json_to_sheet(unmatchedMobile);
wsUnmatchedMobile['!cols'] = [
  { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 22 },
  { wch: 22 }, { wch: 30 }, { wch: 40 }, { wch: 18 },
  { wch: 35 }, { wch: 35 }, { wch: 35 },
];
XLSX.utils.book_append_sheet(wb, wsUnmatchedMobile, 'Unmatched Mobile (Review)');

const outPath = '/home/ubuntu/Vocus_Services_Export_' + new Date().toISOString().slice(0,10) + '.xlsx';
XLSX.writeFile(wb, outPath);
console.log('✅ Excel exported to:', outPath);
console.log(`   NBN rows: ${nbnRows.length} | Mobile rows: ${mobileRows.length} | Bucket rows: ${bucketRows.length}`);
console.log(`   Unmatched NBN: ${unmatchedNbn.length} | Unmatched Mobile: ${unmatchedMobile.length}`);
