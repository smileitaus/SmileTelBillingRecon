import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // These services have Carbon API data (carbonServiceId set) but supplierName=Telstra
  // They are ABB-resold NBN services — provider should be ABB, supplierName should be ABB
  const [result] = await conn.execute(`
    UPDATE services 
    SET provider = 'ABB', supplierName = 'ABB', updatedAt = NOW()
    WHERE supplierName = 'Telstra' 
      AND dataSource = 'Carbon API'
      AND carbonServiceId IS NOT NULL AND carbonServiceId != ''
  `) as any[];
  console.log('Reverted ABB-Carbon services back to provider=ABB:', result.affectedRows);
  
  // Also check: are there any ABB services that still have supplierName=Telstra (non-Carbon)?
  const [remaining] = await conn.execute(`
    SELECT externalId, planName, provider, supplierName, monthlyCost, dataSource, carbonServiceId
    FROM services
    WHERE supplierName = 'Telstra' AND provider = 'Telstra'
      AND dataSource = 'Carbon API'
    LIMIT 5
  `) as any[];
  console.log('Remaining Carbon API services with Telstra supplierName:', remaining.length);
  for (const r of remaining as any[]) {
    console.log(`  ${r.externalId} | ${(r.planName||'').substring(0,35)} | carbonId=${r.carbonServiceId||''}`);
  }
  
  // Final provider breakdown
  const [check] = await conn.execute(`
    SELECT provider, COUNT(*) as cnt, SUM(monthlyCost) as cost, SUM(monthlyRevenue) as rev
    FROM services
    WHERE status != 'terminated'
    GROUP BY provider
    ORDER BY cnt DESC
  `) as any[];
  
  console.log('\nFinal provider breakdown:');
  let totalCost = 0, totalRev = 0;
  for (const r of check as any[]) {
    console.log(`  ${(r.provider||'').padEnd(20)} | ${String(r.cnt).padStart(5)} | cost=$${parseFloat(r.cost||0).toFixed(2).padStart(10)} | rev=$${parseFloat(r.rev||0).toFixed(2)}`);
    totalCost += parseFloat(r.cost || 0);
    totalRev += parseFloat(r.rev || 0);
  }
  console.log(`  ${'TOTAL'.padEnd(20)} | ${' '.padStart(5)} | cost=$${totalCost.toFixed(2).padStart(10)} | rev=$${totalRev.toFixed(2)}`);
  
  await conn.end();
}

main().catch(console.error);
