import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // Check all distinct provider/supplierName combos
  const [allProviders] = await conn.execute(`
    SELECT DISTINCT provider, supplierName, dataSource, COUNT(*) as cnt, SUM(monthlyCost) as total_cost
    FROM services
    GROUP BY provider, supplierName, dataSource
    HAVING provider NOT IN ('Telstra','ABB','Exetel','Unknown','SmileTel') 
       AND provider IS NOT NULL AND provider != ''
    ORDER BY cnt DESC
  `) as any[];
  
  console.log('=== Non-standard providers in services table ===');
  for (const r of allProviders) {
    console.log(`  provider="${r.provider}" | supplierName="${r.supplierName||''}" | dataSource="${(r.dataSource||'').substring(0,50)}" | count=${r.cnt} | cost=$${parseFloat(r.total_cost||0).toFixed(2)}`);
  }
  
  // Check what supplierName values exist
  const [supplierNames] = await conn.execute(`
    SELECT DISTINCT supplierName, COUNT(*) as cnt, SUM(monthlyCost) as total_cost
    FROM services
    WHERE supplierName IS NOT NULL AND supplierName != '' AND supplierName != 'Telstra'
    GROUP BY supplierName
    ORDER BY cnt DESC
  `) as any[];
  
  console.log('\n=== All supplierName values ===');
  for (const r of supplierNames) {
    console.log(`  "${r.supplierName}" | count=${r.cnt} | cost=$${parseFloat(r.total_cost||0).toFixed(2)}`);
  }
  
  // Check dataSource values that might indicate ChannelHaus, Blitznet, etc.
  const [dataSources] = await conn.execute(`
    SELECT DISTINCT dataSource, COUNT(*) as cnt, SUM(monthlyCost) as total_cost
    FROM services
    WHERE dataSource LIKE '%Channel%' OR dataSource LIKE '%Blitz%' OR dataSource LIKE '%Vine%' 
       OR dataSource LIKE '%Legion%' OR dataSource LIKE '%Tech-e%' OR dataSource LIKE '%Infinet%'
    GROUP BY dataSource
    ORDER BY cnt DESC
  `) as any[];
  
  console.log('\n=== DataSource values for ChannelHaus/Blitznet/Vine/Legion/Tech-e/Infinet ===');
  for (const r of dataSources) {
    console.log(`  "${r.dataSource}" | count=${r.cnt} | cost=$${parseFloat(r.total_cost||0).toFixed(2)}`);
  }
  
  // Check the Unknown provider services — do any have notes/dataSource indicating these providers?
  const [unknownWithHints] = await conn.execute(`
    SELECT externalId, planName, monthlyCost, monthlyRevenue, dataSource, supplierName, customerName, status
    FROM services
    WHERE provider = 'Unknown' AND monthlyCost > 0
    ORDER BY monthlyCost DESC
    LIMIT 30
  `) as any[];
  
  console.log('\n=== Unknown provider services WITH costs (top 30) ===');
  for (const r of unknownWithHints) {
    console.log(`  $${parseFloat(r.monthlyCost).toFixed(2).padStart(8)} | ${(r.customerName||'NO CUST').substring(0,30).padEnd(30)} | ${(r.planName||'').substring(0,30).padEnd(30)} | src="${(r.dataSource||'').substring(0,40)}" | supplier="${r.supplierName||''}"`);
  }
  
  // Check the Legion service
  const [legionSvc] = await conn.execute(`
    SELECT * FROM services WHERE monthlyCost > 700 AND monthlyCost < 900
  `) as any[];
  
  console.log('\n=== Services with cost $700-$900 (Legion range) ===');
  for (const r of legionSvc) {
    console.log(`  ${r.externalId} | ${(r.planName||'').substring(0,40)} | provider="${r.provider}" | supplierName="${r.supplierName||''}" | cost=$${parseFloat(r.monthlyCost).toFixed(2)} | customer="${r.customerName||''}" | src="${(r.dataSource||'').substring(0,40)}"`);
  }
  
  // Check the Tech-e service
  const [techeSvc] = await conn.execute(`
    SELECT * FROM services WHERE monthlyCost > 200 AND monthlyCost < 300
  `) as any[];
  
  console.log('\n=== Services with cost $200-$300 (Tech-e range) ===');
  for (const r of techeSvc) {
    console.log(`  ${r.externalId} | ${(r.planName||'').substring(0,40)} | provider="${r.provider}" | supplierName="${r.supplierName||''}" | cost=$${parseFloat(r.monthlyCost).toFixed(2)} | customer="${r.customerName||''}" | src="${(r.dataSource||'').substring(0,40)}"`);
  }
  
  await conn.end();
}

main().catch(console.error);
