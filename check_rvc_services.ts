import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  const [svcs] = await conn.execute(`
    SELECT externalId, planName, serviceType, provider, supplierName, phoneNumber, simSerialNumber,
           monthlyCost, monthlyRevenue, status, dataSource
    FROM services
    WHERE customerExternalId = 'C0207' AND status != 'terminated'
    ORDER BY serviceType, provider
  `) as any[];
  
  console.log(`RVC ICT Consulting has ${(svcs as any[]).length} active services:`);
  
  // Group by serviceType
  const byType: Record<string, any[]> = {};
  for (const s of svcs as any[]) {
    const t = s.serviceType || 'Unknown';
    if (!byType[t]) byType[t] = [];
    byType[t].push(s);
  }
  
  for (const [type, list] of Object.entries(byType)) {
    console.log(`\n  ${type}: ${list.length} services`);
    for (const s of list) {
      console.log(`    ${s.externalId} | ${(s.planName||'').substring(0,35).padEnd(35)} | provider=${(s.provider||'').padEnd(10)} | phone=${(s.phoneNumber||'').padEnd(12)} | sim=${(s.simSerialNumber||'').substring(0,15)} | src=${(s.dataSource||'').substring(0,25)}`);
    }
  }
  
  // Check which of these are in the SM.xlsx (by phone or SIM)
  // Load SM data
  const XLSX = require('xlsx');
  const wb = XLSX.readFile('/home/ubuntu/billing-tool/SM.xlsx');
  const ws = wb.Sheets['Sheet1'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  const smPhones = new Set<string>();
  const smSims = new Set<string>();
  for (const r of raw.slice(1)) {
    if (r[4]) {
      const p = String(r[4]).replace(/[^0-9]/g, '');
      const norm = p.startsWith('61') && p.length === 11 ? '0' + p.slice(2) : p;
      if (norm.length >= 8) smPhones.add(norm);
    }
    if (r[3]) {
      const s = String(r[3]).replace(/[^0-9]/g, '');
      if (s.length >= 10) smSims.add(s);
    }
  }
  
  console.log(`\nSM.xlsx has ${smPhones.size} unique phones, ${smSims.size} unique SIMs`);
  
  // Check RVC services against SM
  let inSM = 0;
  let notInSM = 0;
  for (const s of svcs as any[]) {
    const phone = s.phoneNumber ? s.phoneNumber.replace(/[^0-9]/g, '') : '';
    const sim = s.simSerialNumber ? s.simSerialNumber.replace(/[^0-9]/g, '') : '';
    const phoneNorm = phone.startsWith('61') && phone.length === 11 ? '0' + phone.slice(2) : phone;
    
    if ((phoneNorm && smPhones.has(phoneNorm)) || (sim && smSims.has(sim))) {
      inSM++;
    } else {
      notInSM++;
    }
  }
  console.log(`RVC services in SM.xlsx: ${inSM} | Not in SM.xlsx: ${notInSM}`);
  
  // Show services NOT in SM.xlsx (these are the ones that may need to stay with RVC or be unassigned)
  console.log('\nRVC services NOT in SM.xlsx (first 30):');
  let count = 0;
  for (const s of svcs as any[]) {
    const phone = s.phoneNumber ? s.phoneNumber.replace(/[^0-9]/g, '') : '';
    const sim = s.simSerialNumber ? s.simSerialNumber.replace(/[^0-9]/g, '') : '';
    const phoneNorm = phone.startsWith('61') && phone.length === 11 ? '0' + phone.slice(2) : phone;
    
    if (!((phoneNorm && smPhones.has(phoneNorm)) || (sim && smSims.has(sim)))) {
      console.log(`  ${s.externalId} | ${(s.planName||'').substring(0,35).padEnd(35)} | ${(s.serviceType||'').padEnd(10)} | provider=${s.provider||''} | phone=${s.phoneNumber||''} | src=${(s.dataSource||'').substring(0,25)}`);
      count++;
      if (count >= 30) { console.log('  ...'); break; }
    }
  }
  
  await conn.end();
}

main().catch(console.error);
