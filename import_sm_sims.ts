/**
 * SM.xlsx SIM Import — Ella's SIM upload
 * 
 * Logic:
 * 1. Parse SM.xlsx (428 rows)
 * 2. Normalise phone numbers (MSN) and SIM serial numbers for matching
 * 3. Match against existing services by:
 *    a. SIM serial number (simSerialNumber field) — highest confidence
 *    b. Phone number (phoneNumber field) — high confidence
 * 4. For matched services:
 *    - Update provider to match SM.xlsx value
 *    - Update supplierName to match SM.xlsx value
 *    - Update serviceType if not already set
 *    - Update activationDate if provided
 *    - Update dataSource = 'SM Import (Ella)'
 *    - If currently assigned to RVC ICT Consulting → unassign (set status='unmatched', customerExternalId=null)
 * 5. For unmatched services:
 *    - Create new service record with status='unmatched'
 *    - Apply all available data from SM.xlsx
 * 6. Report: matched, updated, RVC-unassigned, new created
 */

import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import XLSX from 'xlsx';

dotenv.config();

// Provider name normalisation
const PROVIDER_MAP: Record<string, string> = {
  'ABB': 'ABB',
  'TIAB': 'TIAB',
  'Vocus (Optus)': 'Vocus',
  'Vocus': 'Vocus',
  'Optus': 'Vocus',
  'Telstra': 'Telstra',
};

// Normalise a phone number to digits only, strip country code
function normalisePhone(raw: string | number | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).replace(/[^0-9]/g, '');
  // Strip leading 61 (Australia country code) → 0...
  if (s.startsWith('61') && s.length === 11) s = '0' + s.slice(2);
  // Strip leading +61
  if (s.startsWith('610') && s.length === 12) s = '0' + s.slice(3);
  return s;
}

// Normalise SIM serial (digits only, trim)
function normaliseSIM(raw: string | number | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/[^0-9]/g, '').trim();
}

interface SMRow {
  customerName: string | null;
  serviceType: string | null;
  provider: string | null;
  simSerial: string;
  phoneNumber: string;
  activationDate: string | null;
  portOutCid: string | null;
  notes: string | null;
  rawPhone: string;
  rawSim: string;
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // ── 1. Parse SM.xlsx ──────────────────────────────────────────────────────
  const wb = XLSX.readFile('/home/ubuntu/billing-tool/SM.xlsx');
  const ws = wb.Sheets['Sheet1'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  const headers = raw[0] as string[];
  const dataRows = raw.slice(1).filter(r => r.some((c: any) => c !== null && c !== undefined && String(c).trim() !== ''));

  const smRows: SMRow[] = dataRows.map(r => ({
    customerName: r[0] ? String(r[0]).trim() : null,
    serviceType: r[1] ? String(r[1]).trim() : null,
    provider: r[2] ? String(r[2]).trim() : null,
    rawSim: r[3] ? String(r[3]).trim() : '',
    rawPhone: r[4] ? String(r[4]).trim() : '',
    simSerial: normaliseSIM(r[3]),
    phoneNumber: normalisePhone(r[4]),
    activationDate: r[5] ? String(r[5]).trim() : null,
    portOutCid: r[6] ? String(r[6]).trim() : null,
    notes: r[7] ? String(r[7]).trim() : null,
  }));

  console.log(`Parsed ${smRows.length} SM rows`);

  // Provider breakdown
  const providerCounts: Record<string, number> = {};
  for (const r of smRows) {
    const p = r.provider || 'Unknown';
    providerCounts[p] = (providerCounts[p] || 0) + 1;
  }
  console.log('Providers:', providerCounts);

  // ── 2. Load existing services from DB ─────────────────────────────────────
  const [existingServices] = await conn.execute(`
    SELECT externalId, phoneNumber, simSerialNumber, customerExternalId, customerName,
           provider, supplierName, serviceType, planName, status, dataSource, serviceActivationDate
    FROM services
    WHERE status != 'terminated'
      AND (serviceType IN ('Mobile', 'Data') 
           OR planName LIKE '%SIM%' OR planName LIKE '%Mobile%' OR planName LIKE '%Data%'
           OR planName LIKE '%Broadband%' OR planName LIKE '%4G%' OR planName LIKE '%Backup%'
           OR serviceType IS NULL)
  `) as any[];

  console.log(`Loaded ${(existingServices as any[]).length} existing mobile/data services from DB`);

  // Build lookup maps
  const bySimSerial = new Map<string, any>();
  const byPhone = new Map<string, any>();
  for (const svc of existingServices as any[]) {
    if (svc.simSerialNumber) {
      const key = normaliseSIM(svc.simSerialNumber);
      if (key) bySimSerial.set(key, svc);
    }
    if (svc.phoneNumber) {
      const key = normalisePhone(svc.phoneNumber);
      if (key && key.length >= 8) byPhone.set(key, svc);
    }
  }

  console.log(`SIM lookup: ${bySimSerial.size} entries, Phone lookup: ${byPhone.size} entries`);

  // ── 3. Match and process ──────────────────────────────────────────────────
  let matched = 0;
  let rvcUnassigned = 0;
  let providerUpdated = 0;
  let newCreated = 0;
  let skipped = 0;

  const results: any[] = [];

  for (const row of smRows) {
    const mappedProvider = PROVIDER_MAP[row.provider || ''] || row.provider || 'Unknown';

    // Try SIM serial match first
    let existingSvc: any = null;
    let matchMethod = '';

    if (row.simSerial && row.simSerial.length >= 10) {
      existingSvc = bySimSerial.get(row.simSerial);
      if (existingSvc) matchMethod = 'SIM serial';
    }

    // Fall back to phone number match
    if (!existingSvc && row.phoneNumber && row.phoneNumber.length >= 8) {
      existingSvc = byPhone.get(row.phoneNumber);
      if (existingSvc) matchMethod = 'phone number';
    }

    if (existingSvc) {
      matched++;

      // Check if currently assigned to RVC ICT Consulting
      const isRVC = existingSvc.customerName && 
        (existingSvc.customerName.toLowerCase().includes('rvc') || 
         existingSvc.customerExternalId === 'C0001' ||
         existingSvc.customerName.toLowerCase().includes('rvc ict'));

      const updates: Record<string, any> = {
        provider: mappedProvider,
        supplierName: mappedProvider,
        dataSource: 'SM Import (Ella)',
        updatedAt: new Date(),
      };

      // Update serviceType if not set or is generic
      if (row.serviceType) {
        if (row.serviceType.toLowerCase().includes('mobile') || row.serviceType.toLowerCase().includes('voice')) {
          updates.serviceType = 'Mobile';
        } else if (row.serviceType.toLowerCase().includes('data') || row.serviceType.toLowerCase().includes('broadband') || row.serviceType.toLowerCase().includes('backup')) {
          updates.serviceType = 'Data';
        }
      }

      // Update plan name from SM if not already set
      if (row.serviceType && (!existingSvc.planName || existingSvc.planName === '')) {
        updates.planName = row.serviceType;
      }

      // Update activation date if provided and not already set
      if (row.activationDate && !existingSvc.serviceActivationDate) {
        updates.serviceActivationDate = row.activationDate;
      }

      // If assigned to RVC → unassign
      if (isRVC) {
        updates.customerExternalId = null;
        updates.customerName = null;
        updates.status = 'unmatched';
        rvcUnassigned++;
      }

      // Build update SQL
      const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
      const values = [...Object.values(updates), existingSvc.externalId];
      await conn.execute(`UPDATE services SET ${setClauses} WHERE externalId = ?`, values);

      providerUpdated++;
      results.push({
        action: isRVC ? 'UPDATED+RVC_UNASSIGNED' : 'UPDATED',
        matchMethod,
        externalId: existingSvc.externalId,
        smCustomer: row.customerName,
        dbCustomer: existingSvc.customerName,
        provider: mappedProvider,
        phone: row.phoneNumber,
        sim: row.simSerial,
      });

    } else {
      // No match — create new unmatched service
      newCreated++;

      // Generate a new external ID
      const [maxId] = await conn.execute(`
        SELECT MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED)) as maxId 
        FROM services WHERE externalId LIKE 'S%'
      `) as any[];
      const nextNum = ((maxId as any[])[0]?.maxId || 0) + 1;
      const newExternalId = `S${String(nextNum).padStart(4, '0')}`;

      // Determine service type
      let serviceType = 'Mobile';
      if (row.serviceType) {
        if (row.serviceType.toLowerCase().includes('data') || row.serviceType.toLowerCase().includes('broadband') || row.serviceType.toLowerCase().includes('backup')) {
          serviceType = 'Data';
        }
      }

      await conn.execute(`
        INSERT INTO services (
          externalId, planName, serviceType, provider, supplierName,
          phoneNumber, simSerialNumber, serviceActivationDate,
          status, customerExternalId, customerName,
          monthlyCost, monthlyRevenue, dataSource, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unmatched', NULL, NULL, 0, 0, ?, NOW(), NOW())
      `, [
        newExternalId,
        row.serviceType || 'SIM Service',
        serviceType,
        mappedProvider,
        mappedProvider,
        row.phoneNumber || null,
        row.simSerial || null,
        row.activationDate || null,

        'SM Import (Ella)',
      ]);

      results.push({
        action: 'CREATED',
        matchMethod: 'none',
        externalId: newExternalId,
        smCustomer: row.customerName,
        dbCustomer: null,
        provider: mappedProvider,
        phone: row.phoneNumber,
        sim: row.simSerial,
      });
    }
  }

  // ── 4. Recalculate RVC customer stats if any were unassigned ──────────────
  if (rvcUnassigned > 0) {
    // Find RVC customer external IDs
    const [rvcCustomers] = await conn.execute(`
      SELECT externalId FROM customers 
      WHERE name LIKE '%RVC%' OR name LIKE '%rvc%'
    `) as any[];
    
    for (const rvc of rvcCustomers as any[]) {
      await conn.execute(`
        UPDATE customers c SET
          serviceCount = (SELECT COUNT(*) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'),
          matchedCount = (SELECT COUNT(*) FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'active'),
          unmatchedCount = (SELECT COUNT(*) FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'unmatched'),
          monthlyCost = (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'),
          monthlyRevenue = (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'),
          updatedAt = NOW()
        WHERE externalId = ?
      `, [rvc.externalId]);
    }
    console.log(`Recalculated stats for ${(rvcCustomers as any[]).length} RVC customers`);
  }

  // ── 5. Summary ─────────────────────────────────────────────────────────────
  console.log('\n=== IMPORT SUMMARY ===');
  console.log(`Total SM rows processed: ${smRows.length}`);
  console.log(`Matched to existing services: ${matched}`);
  console.log(`  - Provider/data updated: ${providerUpdated}`);
  console.log(`  - RVC unassigned: ${rvcUnassigned}`);
  console.log(`New services created (unmatched): ${newCreated}`);

  // Breakdown by action
  const byAction: Record<string, number> = {};
  for (const r of results) {
    byAction[r.action] = (byAction[r.action] || 0) + 1;
  }
  console.log('\nBy action:', byAction);

  // RVC unassigned details
  const rvcRows = results.filter(r => r.action === 'UPDATED+RVC_UNASSIGNED');
  if (rvcRows.length > 0) {
    console.log(`\nRVC-unassigned services (${rvcRows.length}):`);
    for (const r of rvcRows.slice(0, 20)) {
      console.log(`  ${r.externalId} | ${r.provider} | phone=${r.phone} | sim=${r.sim} | smCustomer=${r.smCustomer}`);
    }
    if (rvcRows.length > 20) console.log(`  ... and ${rvcRows.length - 20} more`);
  }

  // New services created
  const newRows = results.filter(r => r.action === 'CREATED');
  if (newRows.length > 0) {
    console.log(`\nNew services created (${newRows.length}):`);
    for (const r of newRows.slice(0, 20)) {
      console.log(`  ${r.externalId} | ${r.provider} | phone=${r.phone} | sim=${r.sim} | smCustomer=${r.smCustomer}`);
    }
    if (newRows.length > 20) console.log(`  ... and ${newRows.length - 20} more`);
  }

  // Match method breakdown
  const byMethod: Record<string, number> = {};
  for (const r of results) {
    const key = r.matchMethod || 'none';
    byMethod[key] = (byMethod[key] || 0) + 1;
  }
  console.log('\nMatch methods:', byMethod);

  await conn.end();
  console.log('\n=== DONE ===');
}

main().catch(console.error);
