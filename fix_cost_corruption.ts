import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const db = drizzle(process.env.DATABASE_URL as string);
  
  // Show tables
  const [tables] = await db.execute(sql`SHOW TABLES`) as any;
  console.log('Tables:', tables.map((r: any) => Object.values(r)[0]).join(', '));
  
  // Services with cost by provider
  const [byProvider] = await db.execute(sql`
    SELECT provider, COUNT(*) as cnt, SUM(monthlyCost) as totalCost
    FROM services 
    WHERE monthlyCost > 0 AND status = 'active'
    GROUP BY provider ORDER BY cnt DESC
  `) as any;
  console.log('\nServices with cost by provider:');
  byProvider.forEach((r: any) => console.log(` ${r.provider}: ${r.cnt} services, total cost=${r.totalCost}`));
  
  // Count bad services (cost == revenue, indicating Xero-sourced cost)
  const [bad] = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM services 
    WHERE monthlyRevenue > 0 AND monthlyCost > 0 AND ABS(monthlyCost - monthlyRevenue) < 0.01
  `) as any;
  console.log('\nBad (cost==revenue):', bad[0].cnt);
  
  // Show sample of bad services
  const [badSample] = await db.execute(sql`
    SELECT externalId, planName, provider, monthlyCost, monthlyRevenue, dataSource
    FROM services 
    WHERE monthlyRevenue > 0 AND monthlyCost > 0 AND ABS(monthlyCost - monthlyRevenue) < 0.01
    LIMIT 10
  `) as any;
  console.log('\nSample bad services:');
  badSample.forEach((r: any) => console.log(` ${r.externalId} [${r.provider}] ${r.planName}: cost=${r.monthlyCost} rev=${r.monthlyRevenue} src=${r.dataSource}`));
  
  // Check if any bad services have a known supplier (Telstra, ABB, etc.)
  const [badByProvider] = await db.execute(sql`
    SELECT provider, COUNT(*) as cnt
    FROM services 
    WHERE monthlyRevenue > 0 AND monthlyCost > 0 AND ABS(monthlyCost - monthlyRevenue) < 0.01
    GROUP BY provider ORDER BY cnt DESC
  `) as any;
  console.log('\nBad services by provider:');
  badByProvider.forEach((r: any) => console.log(` ${r.provider}: ${r.cnt}`));
  
  // Check dataSource for bad services
  const [badBySource] = await db.execute(sql`
    SELECT dataSource, COUNT(*) as cnt
    FROM services 
    WHERE monthlyRevenue > 0 AND monthlyCost > 0 AND ABS(monthlyCost - monthlyRevenue) < 0.01
    GROUP BY dataSource ORDER BY cnt DESC
  `) as any;
  console.log('\nBad services by dataSource:');
  badBySource.forEach((r: any) => console.log(` ${r.dataSource}: ${r.cnt}`));
  
  // Check if there are any services with a real supplier cost (cost != revenue)
  // that have a known supplier provider
  const [goodByProvider] = await db.execute(sql`
    SELECT provider, COUNT(*) as cnt, SUM(monthlyCost) as totalCost, SUM(monthlyRevenue) as totalRev
    FROM services 
    WHERE status = 'active' AND monthlyCost > 0 AND ABS(monthlyCost - monthlyRevenue) > 0.01
    GROUP BY provider ORDER BY cnt DESC
  `) as any;
  console.log('\nGood services (cost != revenue) by provider:');
  goodByProvider.forEach((r: any) => console.log(` ${r.provider}: ${r.cnt} services, cost=${r.totalCost}, rev=${r.totalRev}`));
  
  // THE FIX: Reset monthlyCost to 0 for all services where cost==revenue
  // (these are Xero-sourced services where cost was incorrectly set to sell price)
  console.log('\n--- APPLYING FIX ---');
  console.log('Resetting monthlyCost to 0 for services where cost==revenue (Xero-sourced, no supplier cost data)...');
  
  const [fixResult] = await db.execute(sql`
    UPDATE services 
    SET monthlyCost = 0, marginPercent = NULL
    WHERE monthlyRevenue > 0 AND monthlyCost > 0 AND ABS(monthlyCost - monthlyRevenue) < 0.01
  `) as any;
  console.log('Fixed:', fixResult.affectedRows, 'services');
  
  // Also reset services where cost > 0 but revenue = 0 and provider = Unknown
  // (these might also be incorrectly set)
  const [zeroRevUnknown] = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM services 
    WHERE monthlyCost > 0 AND monthlyRevenue = 0 AND provider = 'Unknown'
  `) as any;
  console.log('\nUnknown provider with cost but no revenue:', zeroRevUnknown[0].cnt);
  
  // Recalculate marginPercent for services that have both cost and revenue
  const [marginFix] = await db.execute(sql`
    UPDATE services 
    SET marginPercent = CASE 
      WHEN monthlyRevenue > 0 AND monthlyCost > 0 
      THEN ((monthlyRevenue - monthlyCost) / monthlyRevenue * 100)
      ELSE NULL
    END
    WHERE status = 'active'
  `) as any;
  console.log('Recalculated margins for:', marginFix.affectedRows, 'services');
  
  // Final stats
  const [finalStats] = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN monthlyCost > 0 THEN 1 ELSE 0 END) as withCost,
      SUM(CASE WHEN monthlyRevenue > 0 THEN 1 ELSE 0 END) as withRevenue,
      SUM(CASE WHEN monthlyCost > 0 AND monthlyRevenue > 0 THEN 1 ELSE 0 END) as withBoth,
      SUM(monthlyCost) as totalCost,
      SUM(monthlyRevenue) as totalRevenue
    FROM services WHERE status = 'active'
  `) as any;
  console.log('\nFinal stats:');
  const s = finalStats[0];
  console.log(` Total active: ${s.total}`);
  console.log(` With cost: ${s.withCost}`);
  console.log(` With revenue: ${s.withRevenue}`);
  console.log(` With both: ${s.withBoth}`);
  console.log(` Total cost: $${s.totalCost}`);
  console.log(` Total revenue: $${s.totalRevenue}`);
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
