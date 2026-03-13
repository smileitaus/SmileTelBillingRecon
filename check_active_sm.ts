import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  const [rows] = await conn.execute(`
    SELECT externalId, planName, provider, phoneNumber, simSerialNumber, 
           customerExternalId, customerName, status
    FROM services
    WHERE dataSource = 'SM Import (Ella)' AND status IN ('active', 'flagged_for_termination')
    ORDER BY provider, customerName
  `) as any[];
  
  console.log(`Active/flagged SM services assigned to customers (${(rows as any[]).length}):`);
  for (const r of rows as any[]) {
    console.log(`  ${r.externalId} | ${(r.planName||'').substring(0,25).padEnd(25)} | ${(r.provider||'').padEnd(8)} | customer=${(r.customerName||'').substring(0,35)} [${r.customerExternalId}] | status=${r.status}`);
  }
  
  // Check if any are assigned to RVC
  const rvcActive = (rows as any[]).filter(r => r.customerExternalId === 'C0207');
  console.log(`\nStill assigned to RVC: ${rvcActive.length}`);
  
  await conn.end();
}

main().catch(console.error);
