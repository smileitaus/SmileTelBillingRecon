import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // ─── 1. Find the remaining Unknown SmileTel services ──────────────────────
  console.log('=== Remaining Unknown services that should be SmileTel ===');
  const [unknownSmileTel] = await conn.execute(`
    SELECT externalId, planName, provider, supplierName, monthlyCost, monthlyRevenue, 
           customerName, dataSource, status
    FROM services
    WHERE provider = 'Unknown' AND monthlyCost < 0
    ORDER BY monthlyCost ASC
  `) as any[];
  
  for (const r of unknownSmileTel as any[]) {
    console.log(`  ${r.externalId} | ${(r.planName||'').substring(0,40)} | provider=${r.provider} | supplierName=${r.supplierName||''} | cost=$${parseFloat(r.monthlyCost||0).toFixed(2)} | rev=$${parseFloat(r.monthlyRevenue||0).toFixed(2)} | customer=${r.customerName||''}`);
  }
  
  // Fix: the goodwill adjustment with SmileTel supplierName
  const [smitelFix] = await conn.execute(`
    UPDATE services 
    SET provider = 'SmileTel', updatedAt = NOW()
    WHERE supplierName = 'SmileTel' AND provider = 'Unknown'
  `) as any[];
  console.log(`Fixed ${smitelFix.affectedRows} SmileTel services`);
  
  // ─── 2. Investigate ChannelHaus revenue = $0 ──────────────────────────────
  console.log('\n=== ChannelHaus Services — Revenue Investigation ===');
  const [chServices] = await conn.execute(`
    SELECT externalId, planName, monthlyCost, monthlyRevenue, customerName, 
           customerExternalId, dataSource, status, billingItemId
    FROM services
    WHERE provider = 'ChannelHaus'
    ORDER BY monthlyCost DESC
  `) as any[];
  
  const withRev = (chServices as any[]).filter(r => parseFloat(r.monthlyRevenue) > 0);
  const noRev = (chServices as any[]).filter(r => parseFloat(r.monthlyRevenue) === 0);
  const noCust = (chServices as any[]).filter(r => !r.customerExternalId || r.customerExternalId === '');
  
  console.log(`Total ChannelHaus: ${(chServices as any[]).length} | With revenue: ${withRev.length} | No revenue: ${noRev.length} | No customer: ${noCust.length}`);
  console.log(`Total cost: $${(chServices as any[]).reduce((s: number, r: any) => s + parseFloat(r.monthlyCost||0), 0).toFixed(2)}`);
  
  // Check if any ChannelHaus customers have billing items
  console.log('\nChannelHaus customers and their billing item status:');
  for (const r of (chServices as any[]).slice(0, 20)) {
    const custStr = (r.customerName || 'NO CUSTOMER').substring(0, 35).padEnd(35);
    const hasBillingItem = r.billingItemId && r.billingItemId !== '';
    console.log(`  $${parseFloat(r.monthlyCost||0).toFixed(2).padStart(8)} | ${custStr} | ${(r.planName||'').substring(0,30).padEnd(30)} | billingItem=${hasBillingItem ? r.billingItemId : 'NONE'}`);
  }
  
  // Check if ChannelHaus customers have any billing items in the billing_items table
  const chCustomerIds = (chServices as any[])
    .filter(r => r.customerExternalId && r.customerExternalId !== '')
    .map(r => r.customerExternalId);
  
  if (chCustomerIds.length > 0) {
    const placeholders = chCustomerIds.map(() => '?').join(',');
    const [billingItems] = await conn.execute(`
      SELECT bi.contactName, bi.description, bi.lineAmount, bi.matchStatus, bi.serviceExternalId
      FROM billing_items bi
      WHERE bi.customerExternalId IN (${placeholders})
      ORDER BY bi.lineAmount DESC
      LIMIT 20
    `, chCustomerIds) as any[];
    
    console.log(`\nBilling items for ChannelHaus customers: ${(billingItems as any[]).length}`);
    for (const r of billingItems as any[]) {
      console.log(`  ${(r.contactName||'').substring(0,35).padEnd(35)} | $${parseFloat(r.lineAmount||0).toFixed(2)} | ${(r.description||'').substring(0,40)} | match=${r.matchStatus}`);
    }
  }
  
  // ─── 3. Final provider breakdown ──────────────────────────────────────────
  console.log('\n=== Final Provider Breakdown ===');
  const [final] = await conn.execute(`
    SELECT provider, COUNT(*) as cnt, SUM(monthlyCost) as cost, SUM(monthlyRevenue) as rev
    FROM services
    WHERE status != 'terminated'
    GROUP BY provider
    ORDER BY ABS(SUM(monthlyCost)) DESC
  `) as any[];
  
  let totalCost = 0, totalRev = 0;
  for (const r of final as any[]) {
    console.log(`  ${(r.provider||'NULL').padEnd(20)} | ${String(r.cnt).padStart(5)} | cost=$${parseFloat(r.cost||0).toFixed(2).padStart(10)} | rev=$${parseFloat(r.rev||0).toFixed(2)}`);
    totalCost += parseFloat(r.cost || 0);
    totalRev += parseFloat(r.rev || 0);
  }
  console.log(`  ${'TOTAL'.padEnd(20)} |       | cost=$${totalCost.toFixed(2).padStart(10)} | rev=$${totalRev.toFixed(2)}`);
  
  await conn.end();
}

main().catch(console.error);
