import { getDb } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('no db'); process.exit(1); }

  // How many services have cost == revenue (the symptom of the bug)
  const same = await db.execute(sql`SELECT COUNT(*) as cnt FROM services WHERE monthlyRevenue > 0 AND ABS(monthlyCost - monthlyRevenue) < 0.01`);
  const diff = await db.execute(sql`SELECT COUNT(*) as cnt FROM services WHERE monthlyRevenue > 0 AND ABS(monthlyCost - monthlyRevenue) >= 0.01`);
  const zeroCost = await db.execute(sql`SELECT COUNT(*) as cnt FROM services WHERE monthlyCost = 0 AND monthlyRevenue > 0`);
  const sample = await db.execute(sql`SELECT externalId, planName, monthlyCost, monthlyRevenue, provider FROM services WHERE monthlyRevenue > 0 LIMIT 10`);
  
  // Check a known service that should have a real cost (ABB service)
  const abbSample = await db.execute(sql`SELECT externalId, planName, monthlyCost, monthlyRevenue, provider FROM services WHERE provider = 'ABB' AND monthlyRevenue > 0 LIMIT 5`);
  
  // Check billing items for a service where cost == revenue to understand what happened
  const badService = await db.execute(sql`SELECT externalId, planName, monthlyCost, monthlyRevenue FROM services WHERE monthlyRevenue > 0 AND ABS(monthlyCost - monthlyRevenue) < 0.01 LIMIT 3`);
  
  console.log('cost == revenue (bad):', JSON.stringify((same as any[])[0]));
  console.log('cost != revenue (good):', JSON.stringify((diff as any[])[0]));
  console.log('cost=0 but revenue>0:', JSON.stringify((zeroCost as any[])[0]));
  console.log('\nSample services with revenue:');
  (sample as any[]).forEach((s: any) => console.log(` ${s.externalId} ${s.planName}: cost=${s.monthlyCost} rev=${s.monthlyRevenue} provider=${s.provider}`));
  console.log('\nABB services with revenue:');
  (abbSample as any[]).forEach((s: any) => console.log(` ${s.externalId} ${s.planName}: cost=${s.monthlyCost} rev=${s.monthlyRevenue}`));
  console.log('\nBad services (cost==rev):');
  (badService as any[]).forEach((s: any) => console.log(` ${s.externalId} ${s.planName}: cost=${s.monthlyCost} rev=${s.monthlyRevenue}`));
  
  // Check billing items for one bad service
  if ((badService as any[]).length > 0) {
    const svcId = (badService as any[])[0].externalId;
    const items = await db.execute(sql`SELECT contactName, description, lineAmount, matchStatus FROM billing_items WHERE serviceExternalId = ${svcId} LIMIT 5`);
    console.log(`\nBilling items for ${svcId}:`);
    (items as any[]).forEach((i: any) => console.log(` ${i.contactName}: ${i.description} = $${i.lineAmount} [${i.matchStatus}]`));
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
