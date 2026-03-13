/**
 * Unassign all SM Import (Ella) services from RVC ICT Consulting.
 * These SIMs were previously bulk-assigned to RVC but should be unmatched
 * until each is individually verified and linked to the correct customer.
 * 
 * Also: attempt customer name matching from SM.xlsx to set a suggested customer
 * (stored in discoveryNotes) without actually assigning.
 */

import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import XLSX from 'xlsx';
dotenv.config();

function normalisePhone(raw: string | number | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).replace(/[^0-9]/g, '');
  if (s.startsWith('61') && s.length === 11) s = '0' + s.slice(2);
  return s;
}

function normaliseSIM(raw: string | number | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/[^0-9]/g, '').trim();
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // Load SM.xlsx to build phone→customerName and sim→customerName maps
  const wb = XLSX.readFile('/home/ubuntu/billing-tool/SM.xlsx');
  const ws = wb.Sheets['Sheet1'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  
  const smPhoneToCustomer = new Map<string, string>();
  const smSimToCustomer = new Map<string, string>();
  const smPhoneToService = new Map<string, string>();
  const smSimToService = new Map<string, string>();
  const smPhoneToProvider = new Map<string, string>();
  const smSimToProvider = new Map<string, string>();
  
  const PROVIDER_MAP: Record<string, string> = {
    'ABB': 'ABB', 'TIAB': 'TIAB', 'Vocus (Optus)': 'Vocus', 'Vocus': 'Vocus', 'Telstra': 'Telstra',
  };
  
  for (const r of raw.slice(1)) {
    const custName = r[0] ? String(r[0]).trim() : '';
    const svcType = r[1] ? String(r[1]).trim() : '';
    const provider = PROVIDER_MAP[r[2] ? String(r[2]).trim() : ''] || r[2] || '';
    const phone = normalisePhone(r[4]);
    const sim = normaliseSIM(r[3]);
    
    if (phone && phone.length >= 8) {
      smPhoneToCustomer.set(phone, custName);
      smPhoneToService.set(phone, svcType);
      smPhoneToProvider.set(phone, provider);
    }
    if (sim && sim.length >= 10) {
      smSimToCustomer.set(sim, custName);
      smSimToService.set(sim, svcType);
      smSimToProvider.set(sim, provider);
    }
  }
  
  console.log(`SM lookup: ${smPhoneToCustomer.size} phones, ${smSimToCustomer.size} SIMs`);

  // ── 1. Get all RVC services that came from SM Import ──────────────────────
  const [rvcSvcs] = await conn.execute(`
    SELECT externalId, planName, serviceType, provider, phoneNumber, simSerialNumber, 
           customerExternalId, customerName, status, dataSource, discoveryNotes
    FROM services
    WHERE customerExternalId = 'C0207'
      AND status != 'terminated'
  `) as any[];
  
  console.log(`\nRVC services to unassign: ${(rvcSvcs as any[]).length}`);

  // ── 2. Unassign each service and add discovery note with SM customer name ──
  let unassigned = 0;
  let noteAdded = 0;
  
  for (const svc of rvcSvcs as any[]) {
    const phone = normalisePhone(svc.phoneNumber);
    const sim = normaliseSIM(svc.simSerialNumber);
    
    // Find the SM customer name for this service
    let smCustomer = '';
    let smService = '';
    if (sim && smSimToCustomer.has(sim)) {
      smCustomer = smSimToCustomer.get(sim)!;
      smService = smSimToService.get(sim)!;
    } else if (phone && smPhoneToCustomer.has(phone)) {
      smCustomer = smPhoneToCustomer.get(phone)!;
      smService = smPhoneToService.get(phone)!;
    }
    
    // Build discovery note
    const existingNotes = svc.discoveryNotes || '';
    const smNote = smCustomer 
      ? `[SM Import] Ella's SM upload suggests customer: "${smCustomer}" (service: ${smService}). Unassigned from RVC pending verification.`
      : `[SM Import] Ella's SM upload: unassigned from RVC pending verification.`;
    
    const newNotes = existingNotes 
      ? existingNotes + '\n' + smNote 
      : smNote;
    
    await conn.execute(`
      UPDATE services 
      SET customerExternalId = NULL,
          customerName = NULL,
          status = 'unmatched',
          discoveryNotes = ?,
          updatedAt = NOW()
      WHERE externalId = ?
    `, [newNotes, svc.externalId]);
    
    unassigned++;
    if (smCustomer) noteAdded++;
  }
  
  console.log(`Unassigned: ${unassigned} services`);
  console.log(`Discovery notes added (with SM customer suggestion): ${noteAdded}`);
  
  // ── 3. Recalculate RVC customer stats ─────────────────────────────────────
  await conn.execute(`
    UPDATE customers c SET
      serviceCount = (SELECT COUNT(*) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'),
      matchedCount = (SELECT COUNT(*) FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'active'),
      unmatchedCount = (SELECT COUNT(*) FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'unmatched'),
      monthlyCost = (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'),
      monthlyRevenue = (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'),
      updatedAt = NOW()
    WHERE externalId = 'C0207'
  `);
  console.log('RVC customer stats recalculated');
  
  // ── 4. Verify RVC new state ────────────────────────────────────────────────
  const [rvcAfter] = await conn.execute(`
    SELECT externalId, name, serviceCount, matchedCount, unmatchedCount, monthlyCost, monthlyRevenue
    FROM customers WHERE externalId = 'C0207'
  `) as any[];
  console.log('\nRVC after update:', rvcAfter);
  
  // ── 5. Show sample of newly unmatched services with their SM suggestions ──
  const [sample] = await conn.execute(`
    SELECT externalId, planName, provider, phoneNumber, simSerialNumber, discoveryNotes
    FROM services
    WHERE dataSource = 'SM Import (Ella)' AND status = 'unmatched'
    LIMIT 10
  `) as any[];
  
  console.log('\nSample unmatched SM services with discovery notes:');
  for (const s of sample as any[]) {
    const note = (s.discoveryNotes || '').substring(0, 100);
    console.log(`  ${s.externalId} | ${(s.planName||'').substring(0,25).padEnd(25)} | ${s.provider} | phone=${s.phoneNumber||''} | note=${note}`);
  }
  
  // ── 6. Summary of all SM-imported services ────────────────────────────────
  const [smSummary] = await conn.execute(`
    SELECT status, provider, COUNT(*) as cnt
    FROM services
    WHERE dataSource = 'SM Import (Ella)'
    GROUP BY status, provider
    ORDER BY status, cnt DESC
  `) as any[];
  
  console.log('\nAll SM Import (Ella) services by status and provider:');
  for (const r of smSummary as any[]) {
    console.log(`  ${(r.status||'').padEnd(12)} | ${(r.provider||'').padEnd(12)} | ${r.cnt}`);
  }
  
  await conn.end();
  console.log('\n=== DONE ===');
}

main().catch(console.error);
