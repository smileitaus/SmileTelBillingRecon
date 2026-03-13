import { getDb } from './server/db';
import { sql } from 'drizzle-orm';
import { services, billingItems } from './drizzle/schema';
import { eq, and, gt } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('no db'); process.exit(1); }

  // Use drizzle ORM (not raw execute) to get proper column mapping
  const badServices = await db.select({
    externalId: services.externalId,
    planName: services.planName,
    monthlyCost: services.monthlyCost,
    monthlyRevenue: services.monthlyRevenue,
    provider: services.provider,
    customerName: services.customerName,
  }).from(services)
    .where(sql`monthlyRevenue > 0 AND ABS(monthlyCost - monthlyRevenue) < 0.01`)
    .limit(5);
  
  const goodServices = await db.select({
    externalId: services.externalId,
    planName: services.planName,
    monthlyCost: services.monthlyCost,
    monthlyRevenue: services.monthlyRevenue,
    provider: services.provider,
  }).from(services)
    .where(sql`monthlyRevenue > 0 AND ABS(monthlyCost - monthlyRevenue) >= 0.01`)
    .limit(5);

  console.log('=== BAD: cost == revenue (first 5) ===');
  badServices.forEach(s => console.log(` ${s.externalId} [${s.provider}] ${s.planName}: cost=${s.monthlyCost} rev=${s.monthlyRevenue} cust=${s.customerName}`));
  
  console.log('\n=== GOOD: cost != revenue (first 5) ===');
  goodServices.forEach(s => console.log(` ${s.externalId} [${s.provider}] ${s.planName}: cost=${s.monthlyCost} rev=${s.monthlyRevenue}`));
  
  // Check billing items for a bad service
  if (badServices.length > 0) {
    const svcId = badServices[0].externalId;
    const items = await db.select({
      contactName: billingItems.contactName,
      description: billingItems.description,
      lineAmount: billingItems.lineAmount,
      matchStatus: billingItems.matchStatus,
    }).from(billingItems)
      .where(eq(billingItems.serviceExternalId, svcId))
      .limit(5);
    console.log(`\nBilling items for ${svcId} (${badServices[0].planName}):`);
    items.forEach(i => console.log(` ${i.contactName}: ${i.description} = $${i.lineAmount} [${i.matchStatus}]`));
  }
  
  // Count by provider for bad services
  const byProvider = await db.execute(sql`
    SELECT provider, COUNT(*) as cnt, SUM(monthlyCost) as totalCost, SUM(monthlyRevenue) as totalRev
    FROM services 
    WHERE monthlyRevenue > 0 AND ABS(monthlyCost - monthlyRevenue) < 0.01
    GROUP BY provider
    ORDER BY cnt DESC
  `);
  console.log('\n=== Bad services by provider ===');
  (byProvider as any[]).forEach((r: any) => console.log(` ${r.provider}: ${r.cnt} services, cost=${r.totalCost}, rev=${r.totalRev}`));
  
  // Check if the issue is that monthlyCost was always 0 (not overwritten)
  const wasAlwaysZero = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM services 
    WHERE monthlyRevenue > 0 AND monthlyCost = 0
  `);
  const wasNonZeroSame = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM services 
    WHERE monthlyRevenue > 0 AND monthlyCost > 0 AND ABS(monthlyCost - monthlyRevenue) < 0.01
  `);
  console.log('\n=== Cost breakdown for bad services ===');
  console.log('cost was always 0:', JSON.stringify((wasAlwaysZero as any[])[0]));
  console.log('cost non-zero but == revenue:', JSON.stringify((wasNonZeroSame as any[])[0]));
  
  process.exit(0);
}

main().catch(e => { console.error(e.message, e.stack); process.exit(1); });
