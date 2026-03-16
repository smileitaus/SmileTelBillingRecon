/**
 * Blitz Report Import - March 2026
 * Source: Export_BLITZ-2.0-MARCH-Summary.xlsx (Telstra Blitz Summary)
 *
 * This script:
 * 1. Matches 221 Blitz services to existing DB records by phone number
 * 2. Updates matched services with authoritative Telstra data (cost, device, usage, contract)
 * 3. Creates new service records for Blitz services not yet in DB
 * 4. Flags services with no usage in 6 months as flagged_for_termination
 * 5. Adds detailed termination notes for agent review
 */

import mysql from 'mysql2/promise';
import XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLITZ_FILE = '/home/ubuntu/upload/Export_BLITZ-2.0-MARCH-Summary.xlsx';
const IMPORT_DATE = '2026-03-16';
const REPORT_NAME = 'March 2026 Blitz Summary';

// Connect to DB
const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('Connected to database');

// ─── Load Blitz data ──────────────────────────────────────────────────────────
const wb = XLSX.readFile(BLITZ_FILE);
const ws = wb.Sheets['Blitz Summary'];
const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: null });
console.log(`Loaded ${rows.length} rows from Blitz Summary`);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/\s+/g, '').replace(/\.0$/, '');
  // Remove decimal if float
  if (s.includes('.')) s = s.split('.')[0];
  if (!s.startsWith('0')) s = '0' + s;
  return s;
}

function safeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function safeFloat(v) {
  if (v === null || v === undefined || v === '') return null;
  const f = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(f) ? null : f;
}

function safeDate(v) {
  if (!v || v === '31/12/2999' || String(v).includes('2999')) return '';
  try {
    // Excel serial date or string
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v);
      return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    }
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch { return ''; }
}

function formatMB(mb) {
  if (!mb || mb === '0' || mb === 0) return '0 MB';
  const n = parseFloat(mb);
  if (n >= 1024) return `${(n/1024).toFixed(1)} GB`;
  return `${Math.round(n)} MB`;
}

// ─── Load existing Telstra Mobile services from DB ────────────────────────────
const [dbRows] = await conn.execute(
  `SELECT id, serviceId, phoneNumber, simSerialNumber, monthlyCost, status, customerExternalId 
   FROM services WHERE provider = 'Telstra' AND serviceType = 'Mobile'`
);

// Build lookup maps
const dbByPhone = new Map();
for (const row of dbRows) {
  const p = safeStr(row.phoneNumber).replace(/\s+/g, '');
  if (p) dbByPhone.set(p, row);
}
console.log(`DB Telstra Mobile services: ${dbRows.length}, with phone: ${dbByPhone.size}`);

// ─── Process each Blitz row ───────────────────────────────────────────────────
let updatedCount = 0;
let createdCount = 0;
let flaggedCount = 0;
let mroFlaggedCount = 0;
const terminationList = [];
const newServices = [];

for (const row of rows) {
  const phone = normalizePhone(row['Mobile Number']);
  if (!phone) continue;

  // Extract all relevant fields
  const simSerial = safeStr(row['SIM Serial Number']);
  const imei = safeStr(row['IMEI'])?.replace(/\.0$/, '').split('.')[0] || '';
  const imsi = safeStr(row['IMSI'])?.replace(/\.0$/, '').split('.')[0] || '';
  const accountNumber = safeStr(row['Account Number']);
  const userName = safeStr(row['User Name']);
  const deviceName = safeStr(row['Device Name']);
  const deviceType = safeStr(row['Device Type']);
  const deviceCategory = safeStr(row['Device Category']);
  const make = safeStr(row['Make']);
  const model = safeStr(row['Model']);
  const flexiplanCode = safeStr(row['Flexiplan']);
  const flexiplanName = safeStr(row['Flexiplan Name']);
  const flexiplanType = safeStr(row['Flexiplan Type']);
  const activationDate = safeDate(row['Service Activation Date']);
  const serviceEndDate = safeDate(row['Service End Date']);

  // Cost
  const billMar26 = safeFloat(row['Bill Total Mar 2026']) ?? 0;
  const billFeb26 = safeFloat(row['Bill Total Feb 2026']) ?? 0;
  const billJan26 = safeFloat(row['Bill Total Jan 2026']) ?? 0;
  const avg3mBill = safeFloat(row['Average 3 Month Bill']) ?? 0;
  const isZeroCost = billMar26 === 0;

  // Usage flags
  const noUse3m = row['No Usage In Last 3 Months'] === 'Y' ? 1 : 0;
  const noUse6m = row['No Usage In Last 6 Months'] === 'Y' ? 1 : 0;
  const noNetActivity6m = row['No Network Activity In Last 6 Months'] === 'Y' ? 1 : 0;
  const lastUsedDate = safeDate(row['Last Used Network Date']);
  const postcode = row['Last 3 Months Most Used Postcode'] ? String(row['Last 3 Months Most Used Postcode']).split('.')[0] : '';
  const deviceAgeMths = row['Device Age - Service Level (Months)'] ? parseInt(row['Device Age - Service Level (Months)']) : null;

  // MRO contract
  const mroContract = safeStr(row['MRO Contract']);
  const mroEndDate = safeDate(row['MRO Contract End Date']);
  const mroEtc = safeFloat(row['MRO Contract ETC']);
  const mroDeviceName = safeStr(row['MRO Contract Device name']);

  // Average usage
  const avg3mDataMb = safeFloat(row['Average 3 Month Domestic Data (MB)']);
  const avg6mDataMb = safeFloat(row['Average 6 Month Domestic Data (MB)']);
  const avg3mVoiceMins = safeFloat(row['Average 3 Month Domestic Voice Minutes of Use']);
  const avg6mVoiceMins = safeFloat(row['Average 6 Month Domestic Voice Minutes of Use']);

  // Build 12-month usage history JSON
  const usageHistory = {};
  const months = ['Mar 2026','Feb 2026','Jan 2026','Dec 2025','Nov 2025','Oct 2025','Sep 2025','Aug 2025','Jul 2025','Jun 2025','May 2025','Apr 2025'];
  for (const m of months) {
    const dataMb = safeFloat(row[`${m} Domestic Data Usage (MB)`]) ?? 0;
    const voiceCalls = safeFloat(row[`${m} Domestic Voice Calls`]) ?? 0;
    const voiceMins = safeFloat(row[`${m} Domestic Voice Minutes Of Use`]) ?? 0;
    const sms = safeFloat(row[`${m} Domestic SMS`]) ?? 0;
    const spend = safeFloat(row[`Bill Total ${m}`]) ?? 0;
    usageHistory[m] = { dataMb, voiceCalls, voiceMins, sms, spend };
  }

  // ─── Build termination note if no usage in 6 months ─────────────────────
  let terminationNote = null;
  const shouldFlag = noUse6m === 1;

  if (shouldFlag) {
    const lastUsedStr = lastUsedDate || 'Never recorded';
    const costNote = isZeroCost
      ? `⚠️ NOTE: This service has $0 monthly cost (${flexiplanName}) — no direct financial saving from termination, but it may free up resources or indicate an unused backup service.`
      : `💰 Monthly cost: $${billMar26.toFixed(2)} (3-month avg: $${avg3mBill.toFixed(2)})`;

    const mroNote = mroContract
      ? `\n⚠️ MRO CONTRACT ACTIVE: Device "${mroDeviceName}" under contract ${mroContract}. Contract ends: ${mroEndDate}. Early Termination Charge (ETC): $${mroEtc?.toFixed(2) ?? 'unknown'}. DO NOT terminate without reviewing ETC.`
      : '';

    const usageNote = `Last network activity: ${lastUsedStr}. No usage recorded for 6+ months (prior to March 2026).`;
    const dataNote = avg6mDataMb !== null ? `6-month avg data: ${formatMB(avg6mDataMb)}. 3-month avg data: ${formatMB(avg3mDataMb)}.` : '';
    const voiceNote = avg6mVoiceMins !== null && avg6mVoiceMins > 0 ? `6-month avg voice: ${avg6mVoiceMins} mins.` : '';

    terminationNote = [
      `🔴 FLAGGED FOR TERMINATION — March 2026 Blitz Review`,
      `Reason: No usage recorded in the 6 months prior to March 2026.`,
      usageNote,
      dataNote,
      voiceNote,
      costNote,
      `Service: ${phone} | SIM: ${simSerial} | IMEI: ${imei}`,
      `Plan: ${flexiplanName} (${flexiplanCode}) | Account: ${accountNumber}`,
      `Device: ${deviceName} (${make} ${model}) | Type: ${deviceType}`,
      deviceAgeMths ? `Device age: ${deviceAgeMths} months.` : '',
      postcode ? `Last used location postcode: ${postcode}.` : '',
      mroNote,
      `\nAction required: Review and submit termination request to Telstra. Verify no active use before proceeding.`,
      `Imported from: ${REPORT_NAME} on ${IMPORT_DATE}.`
    ].filter(Boolean).join('\n');

    flaggedCount++;
    if (mroContract) mroFlaggedCount++;

    terminationList.push({
      phone,
      simSerial,
      imei,
      accountNumber,
      userName: userName || '(no name)',
      flexiplanName,
      billMar26,
      isZeroCost,
      lastUsedDate: lastUsedStr,
      mroContract: mroContract || '',
      mroEndDate: mroEndDate || '',
      mroEtc: mroEtc || 0,
      mroDeviceName: mroDeviceName || '',
      deviceName,
      make,
      model,
      postcode,
      avg3mBill,
      noUse3m,
      noUse6m,
    });
  }

  // ─── Match to existing DB service ────────────────────────────────────────
  const dbSvc = dbByPhone.get(phone);

  if (dbSvc) {
    // Update existing service with authoritative Blitz data
    const newStatus = shouldFlag ? 'flagged_for_termination' : dbSvc.status;

    // Build discovery note addition
    const discoveryAddition = [
      `[${IMPORT_DATE}] Updated from ${REPORT_NAME}.`,
      userName ? `Telstra User Name: ${userName}.` : '',
      deviceAgeMths ? `Device age: ${deviceAgeMths} months.` : '',
      postcode ? `Last 3-month most-used postcode: ${postcode}.` : '',
      lastUsedDate ? `Last network activity: ${lastUsedDate}.` : '',
      avg3mDataMb !== null ? `3-month avg data: ${formatMB(avg3mDataMb)}, 6-month avg: ${formatMB(avg6mDataMb)}.` : '',
      avg3mVoiceMins !== null && avg3mVoiceMins > 0 ? `3-month avg voice: ${avg3mVoiceMins} mins.` : '',
    ].filter(Boolean).join(' ');

    await conn.execute(`
      UPDATE services SET
        provider = 'Telstra',
        serviceType = 'Mobile',
        monthlyCost = ?,
        costSource = 'blitz_report',
        simSerialNumber = ?,
        imei = ?,
        imsi = ?,
        deviceName = ?,
        deviceType = ?,
        deviceCategory = ?,
        userName = ?,
        flexiplanCode = ?,
        flexiplanName = ?,
        serviceActivationDate = ?,
        serviceEndDate = ?,
        noDataUse = ?,
        status = ?,
        blitzImportDate = ?,
        blitzReportName = ?,
        blitzAccountNumber = ?,
        blitzNoUse3m = ?,
        blitzNoUse6m = ?,
        blitzNoNetActivity6m = ?,
        blitzLastUsedDate = ?,
        blitzPostcode = ?,
        blitzDeviceAgeMths = ?,
        blitzMroContract = ?,
        blitzMroEndDate = ?,
        blitzMroEtc = ?,
        blitzMroDeviceName = ?,
        blitzAvg3mDataMb = ?,
        blitzAvg6mDataMb = ?,
        blitzAvg3mVoiceMins = ?,
        blitzAvg6mVoiceMins = ?,
        blitzAvg3mBill = ?,
        blitzBillMar26 = ?,
        blitzBillFeb26 = ?,
        blitzBillJan26 = ?,
        blitzUsageHistory = ?,
        terminationNote = ?,
        discoveryNotes = CASE 
          WHEN discoveryNotes IS NULL OR discoveryNotes = '' THEN ?
          ELSE CONCAT(discoveryNotes, '\n\n', ?)
        END,
        updatedAt = NOW()
      WHERE id = ?
    `, [
      billMar26,
      simSerial, imei, imsi,
      deviceName, deviceType, deviceCategory,
      userName,
      flexiplanCode, flexiplanName,
      activationDate, serviceEndDate,
      noUse6m,
      newStatus,
      IMPORT_DATE, REPORT_NAME, accountNumber,
      noUse3m, noUse6m, noNetActivity6m,
      lastUsedDate, postcode,
      deviceAgeMths,
      mroContract, mroEndDate, mroEtc, mroDeviceName,
      avg3mDataMb, avg6mDataMb,
      avg3mVoiceMins, avg6mVoiceMins,
      avg3mBill,
      billMar26, billFeb26, billJan26,
      JSON.stringify(usageHistory),
      terminationNote,
      discoveryAddition, discoveryAddition,
      dbSvc.id
    ]);

    updatedCount++;
  } else {
    // Create new service record
    // Generate a new externalId
    const [maxIdRows] = await conn.execute('SELECT MAX(id) as maxId FROM services');
    const nextId = (maxIdRows[0].maxId || 0) + 1 + newServices.length;
    const externalId = `BLITZ-${phone.replace(/\s/g, '')}`;

    const newSvc = {
      externalId,
      serviceId: phone,
      serviceType: 'Mobile',
      planName: flexiplanName,
      status: shouldFlag ? 'flagged_for_termination' : 'active',
      phoneNumber: phone,
      provider: 'Telstra',
      supplierName: 'Telstra',
      supplierAccount: accountNumber,
      monthlyCost: billMar26,
      costSource: 'blitz_report',
      simSerialNumber: simSerial,
      imei,
      imsi,
      deviceName,
      deviceType,
      deviceCategory,
      userName,
      flexiplanCode,
      flexiplanName,
      serviceActivationDate: activationDate,
      serviceEndDate,
      noDataUse: noUse6m,
      blitzImportDate: IMPORT_DATE,
      blitzReportName: REPORT_NAME,
      blitzAccountNumber: accountNumber,
      blitzNoUse3m: noUse3m,
      blitzNoUse6m: noUse6m,
      blitzNoNetActivity6m: noNetActivity6m,
      blitzLastUsedDate: lastUsedDate,
      blitzPostcode: postcode,
      blitzDeviceAgeMths: deviceAgeMths,
      blitzMroContract: mroContract,
      blitzMroEndDate: mroEndDate,
      blitzMroEtc: mroEtc,
      blitzMroDeviceName: mroDeviceName,
      blitzAvg3mDataMb: avg3mDataMb,
      blitzAvg6mDataMb: avg6mDataMb,
      blitzAvg3mVoiceMins: avg3mVoiceMins,
      blitzAvg6mVoiceMins: avg6mVoiceMins,
      blitzAvg3mBill: avg3mBill,
      blitzBillMar26: billMar26,
      blitzBillFeb26: billFeb26,
      blitzBillJan26: billJan26,
      blitzUsageHistory: JSON.stringify(usageHistory),
      terminationNote,
      discoveryNotes: [
        `[${IMPORT_DATE}] Created from ${REPORT_NAME}.`,
        userName ? `Telstra User Name: ${userName}.` : '',
        `Account: ${accountNumber}.`,
        deviceAgeMths ? `Device age: ${deviceAgeMths} months.` : '',
        postcode ? `Last 3-month most-used postcode: ${postcode}.` : '',
        lastUsedDate ? `Last network activity: ${lastUsedDate}.` : '',
      ].filter(Boolean).join(' '),
    };

    newServices.push(newSvc);
    createdCount++;
  }
}

// ─── Insert new services ──────────────────────────────────────────────────────
if (newServices.length > 0) {
  console.log(`Inserting ${newServices.length} new services...`);
  for (const svc of newServices) {
    try {
      await conn.execute(`
        INSERT INTO services (
          externalId, serviceId, serviceType, planName, status,
          phoneNumber, provider, supplierName, supplierAccount,
          monthlyCost, costSource, simSerialNumber, imei, imsi,
          deviceName, deviceType, deviceCategory, userName,
          flexiplanCode, flexiplanName, serviceActivationDate, serviceEndDate,
          noDataUse, discoveryNotes, terminationNote,
          blitzImportDate, blitzReportName, blitzAccountNumber,
          blitzNoUse3m, blitzNoUse6m, blitzNoNetActivity6m,
          blitzLastUsedDate, blitzPostcode, blitzDeviceAgeMths,
          blitzMroContract, blitzMroEndDate, blitzMroEtc, blitzMroDeviceName,
          blitzAvg3mDataMb, blitzAvg6mDataMb, blitzAvg3mVoiceMins, blitzAvg6mVoiceMins,
          blitzAvg3mBill, blitzBillMar26, blitzBillFeb26, blitzBillJan26,
          blitzUsageHistory,
          createdAt, updatedAt
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?,
          NOW(), NOW()
        )
      `, [
        svc.externalId, svc.serviceId, svc.serviceType, svc.planName, svc.status,
        svc.phoneNumber, svc.provider, svc.supplierName, svc.supplierAccount,
        svc.monthlyCost, svc.costSource, svc.simSerialNumber, svc.imei, svc.imsi,
        svc.deviceName, svc.deviceType, svc.deviceCategory, svc.userName,
        svc.flexiplanCode, svc.flexiplanName, svc.serviceActivationDate, svc.serviceEndDate,
        svc.noDataUse, svc.discoveryNotes, svc.terminationNote,
        svc.blitzImportDate, svc.blitzReportName, svc.blitzAccountNumber,
        svc.blitzNoUse3m, svc.blitzNoUse6m, svc.blitzNoNetActivity6m,
        svc.blitzLastUsedDate, svc.blitzPostcode, svc.blitzDeviceAgeMths,
        svc.blitzMroContract, svc.blitzMroEndDate, svc.blitzMroEtc, svc.blitzMroDeviceName,
        svc.blitzAvg3mDataMb, svc.blitzAvg6mDataMb, svc.blitzAvg3mVoiceMins, svc.blitzAvg6mVoiceMins,
        svc.blitzAvg3mBill, svc.blitzBillMar26, svc.blitzBillFeb26, svc.blitzBillJan26,
        svc.blitzUsageHistory,
      ]);
    } catch (err) {
      console.error(`Failed to insert ${svc.phoneNumber}:`, err.message);
    }
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');
console.log('  BLITZ IMPORT COMPLETE — March 2026');
console.log('═══════════════════════════════════════════════════');
console.log(`  Total Blitz services:      ${rows.length}`);
console.log(`  Updated existing:          ${updatedCount}`);
console.log(`  Created new:               ${createdCount}`);
console.log(`  Flagged for termination:   ${flaggedCount}`);
console.log(`    - With MRO contract:     ${mroFlaggedCount}`);
console.log(`    - Zero cost ($0):        ${terminationList.filter(t => t.isZeroCost).length}`);
console.log(`    - Paid services:         ${terminationList.filter(t => !t.isZeroCost).length}`);
console.log('═══════════════════════════════════════════════════');

// Export termination list to JSON for report generation
import { writeFileSync } from 'fs';
writeFileSync('/tmp/blitz-termination-list.json', JSON.stringify(terminationList, null, 2));
console.log('\nTermination list saved to /tmp/blitz-termination-list.json');

await conn.end();
