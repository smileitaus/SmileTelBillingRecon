/**
 * Comprehensive Supplier Invoice Cost Audit
 * Uses the actual schema: services table has provider, monthlyCost, supplierName, dataSource
 * No separate supplier_invoice_items table — costs are stored directly on services.
 */

import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set');
  
  const conn = await mysql.createConnection(DATABASE_URL);

  console.log('=== SUPPLIER INVOICE COST AUDIT ===\n');
  console.log(`Audit Date: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}\n`);

  // ─── 1. Overall cost summary by provider ───────────────────────────────────
  console.log('━━━ 1. Services with Known Costs — By Provider ━━━\n');
  const [costByProvider] = await conn.execute(`
    SELECT 
      COALESCE(provider, 'Unknown') as provider,
      COUNT(*) as total_services,
      SUM(CASE WHEN monthlyCost > 0 THEN 1 ELSE 0 END) as with_cost,
      SUM(CASE WHEN monthlyCost = 0 THEN 1 ELSE 0 END) as no_cost,
      ROUND(SUM(CASE WHEN monthlyCost > 0 THEN monthlyCost ELSE 0 END), 2) as total_cost,
      ROUND(AVG(CASE WHEN monthlyCost > 0 THEN monthlyCost END), 2) as avg_cost,
      SUM(CASE WHEN monthlyRevenue > 0 THEN 1 ELSE 0 END) as with_revenue,
      ROUND(SUM(monthlyRevenue), 2) as total_revenue
    FROM services
    WHERE status != 'terminated'
    GROUP BY provider
    ORDER BY total_cost DESC
  `) as any[];

  let grandCost = 0, grandRevenue = 0;
  console.log(`${'Provider'.padEnd(20)} | ${'Total'.padStart(6)} | ${'w/Cost'.padStart(6)} | ${'No Cost'.padStart(7)} | ${'Total Cost'.padStart(12)} | ${'Avg Cost'.padStart(9)} | ${'w/Rev'.padStart(6)} | ${'Total Revenue'.padStart(14)}`);
  console.log('─'.repeat(110));
  for (const r of costByProvider as any[]) {
    console.log(`${r.provider.padEnd(20)} | ${String(r.total_services).padStart(6)} | ${String(r.with_cost).padStart(6)} | ${String(r.no_cost).padStart(7)} | ${('$'+parseFloat(r.total_cost||0).toFixed(2)).padStart(12)} | ${('$'+parseFloat(r.avg_cost||0).toFixed(2)).padStart(9)} | ${String(r.with_revenue).padStart(6)} | ${('$'+parseFloat(r.total_revenue||0).toFixed(2)).padStart(14)}`);
    grandCost += parseFloat(r.total_cost || 0);
    grandRevenue += parseFloat(r.total_revenue || 0);
  }
  console.log('─'.repeat(110));
  console.log(`TOTAL KNOWN COST: $${grandCost.toFixed(2)}/mo | TOTAL REVENUE: $${grandRevenue.toFixed(2)}/mo\n`);

  // ─── 2. Supplier accounts table ────────────────────────────────────────────
  console.log('━━━ 2. Supplier Accounts Table ━━━\n');
  const [supplierAccts] = await conn.execute(`
    SELECT supplierName, accountNumber, serviceCount, monthlyCost, updatedAt
    FROM supplier_accounts
    ORDER BY monthlyCost DESC
  `) as any[];
  
  for (const r of supplierAccts as any[]) {
    console.log(`  ${(r.supplierName||'').padEnd(20)} | Account: ${(r.accountNumber||'').padEnd(25)} | Services: ${String(r.serviceCount||0).padStart(4)} | Cost: $${parseFloat(r.monthlyCost||0).toFixed(2)} | Updated: ${r.updatedAt?.toISOString?.()?.substring(0,10) || ''}`);
  }

  // ─── 3. Telstra deep dive ──────────────────────────────────────────────────
  console.log('\n━━━ 3. Telstra Services ━━━\n');
  const [telstraServices] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.serviceType, s.monthlyCost, s.monthlyRevenue,
      s.phoneNumber, s.locationAddress as address, s.connectionId, s.supplierAccount, s.dataSource,
      s.customerExternalId, s.customerName, s.status,
      c.name as cust_name
    FROM services s
    LEFT JOIN customers c ON c.externalId = s.customerExternalId
    WHERE s.provider = 'Telstra' AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
  `) as any[];

  const telstraCostSet = (telstraServices as any[]).filter(r => parseFloat(r.monthlyCost) > 0);
  const telstraNoCost = (telstraServices as any[]).filter(r => parseFloat(r.monthlyCost) === 0);
  const telstraNoCustomer = (telstraServices as any[]).filter(r => !r.customerExternalId);
  
  console.log(`Total Telstra services (active): ${(telstraServices as any[]).length}`);
  console.log(`  With cost: ${telstraCostSet.length} | No cost: ${telstraNoCost.length} | No customer: ${telstraNoCustomer.length}`);
  console.log(`  Total monthly cost: $${telstraCostSet.reduce((s: number, r: any) => s + parseFloat(r.monthlyCost), 0).toFixed(2)}`);
  console.log(`  Total monthly revenue: $${(telstraServices as any[]).reduce((s: number, r: any) => s + parseFloat(r.monthlyRevenue||0), 0).toFixed(2)}`);
  
  // Show services with cost — verify cost amounts are reasonable
  console.log(`\n  Services WITH cost (${telstraCostSet.length}):`);
  for (const r of telstraCostSet) {
    const margin = parseFloat(r.monthlyRevenue) > 0 ? ((parseFloat(r.monthlyRevenue) - parseFloat(r.monthlyCost)) / parseFloat(r.monthlyRevenue) * 100).toFixed(1) : 'n/a';
    console.log(`    ${(r.customerName || r.cust_name || 'NO CUSTOMER').substring(0,35).padEnd(35)} | ${(r.name||r.planName||'').substring(0,30).padEnd(30)} | Cost: $${parseFloat(r.monthlyCost).toFixed(2)} | Rev: $${parseFloat(r.monthlyRevenue||0).toFixed(2)} | Margin: ${margin}%`);
  }
  
  // Show services WITHOUT cost — these need supplier invoice matching
  if (telstraNoCost.length > 0) {
    console.log(`\n  Services WITHOUT cost — need Telstra invoice matching (${telstraNoCost.length}):`);
    for (const r of telstraNoCost.slice(0, 20)) {
      console.log(`    ${(r.customerName || r.cust_name || 'NO CUSTOMER').substring(0,35).padEnd(35)} | ${(r.name||r.planName||'').substring(0,30).padEnd(30)} | Rev: $${parseFloat(r.monthlyRevenue||0).toFixed(2)} | Phone: ${r.phoneNumber||''} | AVC: ${r.connectionId||''}`);
    }
    if (telstraNoCost.length > 20) console.log(`    ... and ${telstraNoCost.length - 20} more`);
  }

  // ─── 4. ABB deep dive ─────────────────────────────────────────────────────
  console.log('\n━━━ 4. ABB / Aussie Broadband Services ━━━\n');
  const [abbServices] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.serviceType, s.monthlyCost, s.monthlyRevenue,
      s.connectionId, s.supplierAccount, s.dataSource, s.carbonAlias,
      s.customerExternalId, s.customerName, s.status,
      c.name as cust_name
    FROM services s
    LEFT JOIN customers c ON c.externalId = s.customerExternalId
    WHERE s.provider = 'ABB' AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
  `) as any[];

  const abbCostSet = (abbServices as any[]).filter(r => parseFloat(r.monthlyCost) > 0);
  const abbNoCost = (abbServices as any[]).filter(r => parseFloat(r.monthlyCost) === 0);
  
  console.log(`Total ABB services (active): ${(abbServices as any[]).length}`);
  console.log(`  With cost: ${abbCostSet.length} | No cost: ${abbNoCost.length}`);
  console.log(`  Total monthly cost: $${abbCostSet.reduce((s: number, r: any) => s + parseFloat(r.monthlyCost), 0).toFixed(2)}`);
  console.log(`  Total monthly revenue: $${(abbServices as any[]).reduce((s: number, r: any) => s + parseFloat(r.monthlyRevenue||0), 0).toFixed(2)}`);
  
  // Cost distribution
  const abbCostBuckets: Record<string, number> = { '<$50': 0, '$50-$70': 0, '$70-$90': 0, '$90-$110': 0, '>$110': 0 };
  for (const r of abbCostSet) {
    const c = parseFloat(r.monthlyCost);
    if (c < 50) abbCostBuckets['<$50']++;
    else if (c < 70) abbCostBuckets['$50-$70']++;
    else if (c < 90) abbCostBuckets['$70-$90']++;
    else if (c < 110) abbCostBuckets['$90-$110']++;
    else abbCostBuckets['>$110']++;
  }
  console.log(`  Cost distribution: ${Object.entries(abbCostBuckets).map(([k,v]) => `${k}: ${v}`).join(' | ')}`);
  
  if (abbNoCost.length > 0) {
    console.log(`\n  ABB services WITHOUT cost (${abbNoCost.length}) — need ABB API cost fetch:`);
    for (const r of (abbNoCost as any[]).slice(0, 15)) {
      console.log(`    ${(r.customerName || r.cust_name || 'NO CUSTOMER').substring(0,35).padEnd(35)} | AVC: ${(r.connectionId||'').padEnd(25)} | Rev: $${parseFloat(r.monthlyRevenue||0).toFixed(2)}`);
    }
    if (abbNoCost.length > 15) console.log(`    ... and ${abbNoCost.length - 15} more`);
  }

  // ─── 5. ChannelHaus deep dive ──────────────────────────────────────────────
  console.log('\n━━━ 5. ChannelHaus Services ━━━\n');
  const [chServices] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.serviceType, s.monthlyCost, s.monthlyRevenue,
      s.phoneNumber, s.locationAddress as address, s.supplierAccount, s.dataSource,
      s.customerExternalId, s.customerName, s.status,
      c.name as cust_name
    FROM services s
    LEFT JOIN customers c ON c.externalId = s.customerExternalId
    WHERE s.provider = 'ChannelHaus' AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
  `) as any[];

  console.log(`Total ChannelHaus services (active): ${(chServices as any[]).length}`);
  const chWithCost = (chServices as any[]).filter(r => parseFloat(r.monthlyCost) > 0);
  const chNoCost = (chServices as any[]).filter(r => parseFloat(r.monthlyCost) === 0);
  const chNoCustomer = (chServices as any[]).filter(r => !r.customerExternalId);
  console.log(`  With cost: ${chWithCost.length} | No cost: ${chNoCost.length} | No customer: ${chNoCustomer.length}`);
  console.log(`  Total monthly cost: $${chWithCost.reduce((s: number, r: any) => s + parseFloat(r.monthlyCost), 0).toFixed(2)}`);
  
  for (const r of chServices as any[]) {
    const costStr = parseFloat(r.monthlyCost) > 0 ? `$${parseFloat(r.monthlyCost).toFixed(2)}` : 'NO COST';
    const custStr = r.customerName || r.cust_name || 'NO CUSTOMER';
    console.log(`  ${costStr.padStart(10)} | ${custStr.substring(0,35).padEnd(35)} | ${(r.name||r.planName||'').substring(0,30).padEnd(30)} | Rev: $${parseFloat(r.monthlyRevenue||0).toFixed(2)} | ${r.status}`);
  }

  // ─── 6. Legion deep dive ──────────────────────────────────────────────────
  console.log('\n━━━ 6. Legion Services ━━━\n');
  const [legionServices] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.serviceType, s.monthlyCost, s.monthlyRevenue,
      s.phoneNumber, s.locationAddress as address, s.supplierAccount, s.dataSource,
      s.customerExternalId, s.customerName, s.status,
      c.name as cust_name
    FROM services s
    LEFT JOIN customers c ON c.externalId = s.customerExternalId
    WHERE (s.provider = 'Legion' OR s.supplierName = 'Legion') AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
  `) as any[];

  console.log(`Total Legion services (active): ${(legionServices as any[]).length}`);
  const legWithCost = (legionServices as any[]).filter(r => parseFloat(r.monthlyCost) > 0);
  const legNoCost = (legionServices as any[]).filter(r => parseFloat(r.monthlyCost) === 0);
  console.log(`  With cost: ${legWithCost.length} | No cost: ${legNoCost.length}`);
  console.log(`  Total monthly cost: $${legWithCost.reduce((s: number, r: any) => s + parseFloat(r.monthlyCost), 0).toFixed(2)}`);
  
  for (const r of legionServices as any[]) {
    const costStr = parseFloat(r.monthlyCost) > 0 ? `$${parseFloat(r.monthlyCost).toFixed(2)}` : 'NO COST';
    const custStr = r.customerName || r.cust_name || 'NO CUSTOMER';
    console.log(`  ${costStr.padStart(10)} | ${custStr.substring(0,35).padEnd(35)} | ${(r.name||r.planName||'').substring(0,30).padEnd(30)} | ${r.status}`);
  }

  // ─── 7. Tech-e deep dive ──────────────────────────────────────────────────
  console.log('\n━━━ 7. Tech-e Services ━━━\n');
  const [teServices] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.serviceType, s.monthlyCost, s.monthlyRevenue,
      s.phoneNumber, s.locationAddress as address, s.supplierAccount, s.dataSource,
      s.customerExternalId, s.customerName, s.status,
      c.name as cust_name
    FROM services s
    LEFT JOIN customers c ON c.externalId = s.customerExternalId
    WHERE (s.provider = 'Tech-e' OR s.supplierName = 'Tech-e') AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
  `) as any[];

  console.log(`Total Tech-e services (active): ${(teServices as any[]).length}`);
  const teWithCost = (teServices as any[]).filter(r => parseFloat(r.monthlyCost) > 0);
  const teNoCost = (teServices as any[]).filter(r => parseFloat(r.monthlyCost) === 0);
  console.log(`  With cost: ${teWithCost.length} | No cost: ${teNoCost.length}`);
  console.log(`  Total monthly cost: $${teWithCost.reduce((s: number, r: any) => s + parseFloat(r.monthlyCost), 0).toFixed(2)}`);
  
  for (const r of teServices as any[]) {
    const costStr = parseFloat(r.monthlyCost) > 0 ? `$${parseFloat(r.monthlyCost).toFixed(2)}` : 'NO COST';
    const custStr = r.customerName || r.cust_name || 'NO CUSTOMER';
    console.log(`  ${costStr.padStart(10)} | ${custStr.substring(0,35).padEnd(35)} | ${(r.name||r.planName||'').substring(0,30).padEnd(30)} | ${r.status}`);
  }

  // ─── 8. Blitznet deep dive ────────────────────────────────────────────────
  console.log('\n━━━ 8. Blitznet Services ━━━\n');
  const [blitzServices] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.serviceType, s.monthlyCost, s.monthlyRevenue,
      s.phoneNumber, s.locationAddress as address, s.supplierAccount, s.dataSource,
      s.customerExternalId, s.customerName, s.status,
      c.name as cust_name
    FROM services s
    LEFT JOIN customers c ON c.externalId = s.customerExternalId
    WHERE (s.provider = 'Blitznet' OR s.supplierName = 'Blitznet') AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
  `) as any[];

  console.log(`Total Blitznet services (active): ${(blitzServices as any[]).length}`);
  const blitzWithCost = (blitzServices as any[]).filter(r => parseFloat(r.monthlyCost) > 0);
  const blitzNoCost = (blitzServices as any[]).filter(r => parseFloat(r.monthlyCost) === 0);
  console.log(`  With cost: ${blitzWithCost.length} | No cost: ${blitzNoCost.length}`);
  console.log(`  Total monthly cost: $${blitzWithCost.reduce((s: number, r: any) => s + parseFloat(r.monthlyCost), 0).toFixed(2)}`);
  
  for (const r of blitzServices as any[]) {
    const costStr = parseFloat(r.monthlyCost) > 0 ? `$${parseFloat(r.monthlyCost).toFixed(2)}` : 'NO COST';
    const custStr = r.customerName || r.cust_name || 'NO CUSTOMER';
    console.log(`  ${costStr.padStart(10)} | ${custStr.substring(0,35).padEnd(35)} | ${(r.name||r.planName||'').substring(0,30).padEnd(30)} | ${r.status}`);
  }

  // ─── 9. Vine Direct / VineDirect deep dive ────────────────────────────────
  console.log('\n━━━ 9. Vine Direct Services ━━━\n');
  const [vineServices] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.serviceType, s.monthlyCost, s.monthlyRevenue,
      s.phoneNumber, s.locationAddress as address, s.supplierAccount, s.dataSource,
      s.customerExternalId, s.customerName, s.status,
      c.name as cust_name
    FROM services s
    LEFT JOIN customers c ON c.externalId = s.customerExternalId
    WHERE (s.provider LIKE '%Vine%' OR s.supplierName LIKE '%Vine%') AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
  `) as any[];

  console.log(`Total Vine Direct services (active): ${(vineServices as any[]).length}`);
  const vineWithCost = (vineServices as any[]).filter(r => parseFloat(r.monthlyCost) > 0);
  const vineNoCost = (vineServices as any[]).filter(r => parseFloat(r.monthlyCost) === 0);
  console.log(`  With cost: ${vineWithCost.length} | No cost: ${vineNoCost.length}`);
  console.log(`  Total monthly cost: $${vineWithCost.reduce((s: number, r: any) => s + parseFloat(r.monthlyCost), 0).toFixed(2)}`);
  
  for (const r of vineServices as any[]) {
    const costStr = parseFloat(r.monthlyCost) > 0 ? `$${parseFloat(r.monthlyCost).toFixed(2)}` : 'NO COST';
    const custStr = r.customerName || r.cust_name || 'NO CUSTOMER';
    console.log(`  ${costStr.padStart(10)} | ${custStr.substring(0,35).padEnd(35)} | ${(r.name||r.planName||'').substring(0,30).padEnd(30)} | ${r.status}`);
  }

  // ─── 10. Infinet deep dive ────────────────────────────────────────────────
  console.log('\n━━━ 10. Infinet Services ━━━\n');
  const [infinetServices] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.serviceType, s.monthlyCost, s.monthlyRevenue,
      s.phoneNumber, s.locationAddress as address, s.supplierAccount, s.dataSource,
      s.customerExternalId, s.customerName, s.status,
      c.name as cust_name
    FROM services s
    LEFT JOIN customers c ON c.externalId = s.customerExternalId
    WHERE (s.provider LIKE '%Infinet%' OR s.supplierName LIKE '%Infinet%') AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
  `) as any[];

  console.log(`Total Infinet services (active): ${(infinetServices as any[]).length}`);
  for (const r of infinetServices as any[]) {
    const costStr = parseFloat(r.monthlyCost) > 0 ? `$${parseFloat(r.monthlyCost).toFixed(2)}` : 'NO COST';
    const custStr = r.customerName || r.cust_name || 'NO CUSTOMER';
    console.log(`  ${costStr.padStart(10)} | ${custStr.substring(0,35).padEnd(35)} | ${(r.name||r.planName||'').substring(0,30).padEnd(30)} | ${r.status}`);
  }

  // ─── 11. Exetel deep dive ─────────────────────────────────────────────────
  console.log('\n━━━ 11. Exetel Services ━━━\n');
  const [exetelServices] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.serviceType, s.monthlyCost, s.monthlyRevenue,
      s.phoneNumber, s.locationAddress as address, s.supplierAccount, s.dataSource,
      s.customerExternalId, s.customerName, s.status,
      c.name as cust_name
    FROM services s
    LEFT JOIN customers c ON c.externalId = s.customerExternalId
    WHERE s.provider = 'Exetel' AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
  `) as any[];

  console.log(`Total Exetel services (active): ${(exetelServices as any[]).length}`);
  const exetelWithCost = (exetelServices as any[]).filter(r => parseFloat(r.monthlyCost) > 0);
  const exetelNoCost = (exetelServices as any[]).filter(r => parseFloat(r.monthlyCost) === 0);
  console.log(`  With cost: ${exetelWithCost.length} | No cost: ${exetelNoCost.length}`);
  console.log(`  Total monthly cost: $${exetelWithCost.reduce((s: number, r: any) => s + parseFloat(r.monthlyCost), 0).toFixed(2)}`);
  
  for (const r of exetelServices as any[]) {
    const costStr = parseFloat(r.monthlyCost) > 0 ? `$${parseFloat(r.monthlyCost).toFixed(2)}` : 'NO COST';
    const custStr = r.customerName || r.cust_name || 'NO CUSTOMER';
    console.log(`  ${costStr.padStart(10)} | ${custStr.substring(0,35).padEnd(35)} | ${(r.name||r.planName||'').substring(0,30).padEnd(30)} | ${r.status}`);
  }

  // ─── 12. Services with costs but no customer ──────────────────────────────
  console.log('\n━━━ 12. Services with Costs but No Customer Assignment ━━━\n');
  const [orphanedCostServices] = await conn.execute(`
    SELECT 
      s.externalId, s.planName, s.provider, s.monthlyCost, s.monthlyRevenue,
      s.phoneNumber, s.locationAddress as address, s.supplierAccount, s.dataSource, s.status
    FROM services s
    WHERE s.monthlyCost > 0
      AND (s.customerExternalId IS NULL OR s.customerExternalId = '')
      AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
  `) as any[];
  
  console.log(`Services with cost but no customer: ${(orphanedCostServices as any[]).length}`);
  for (const r of orphanedCostServices as any[]) {
    console.log(`  ${r.provider?.padEnd(15)} | $${parseFloat(r.monthlyCost).toFixed(2).padStart(8)} | ${(r.name||r.planName||'').substring(0,35).padEnd(35)} | Phone: ${r.phoneNumber||''} | ${(r.address||'').substring(0,30)}`);
  }

  // ─── 13. Revenue vs Cost coverage summary ─────────────────────────────────
  console.log('\n━━━ 13. Revenue & Cost Coverage Summary ━━━\n');
  const [coverage] = await conn.execute(`
    SELECT
      COUNT(*) as total_active,
      SUM(CASE WHEN monthlyCost > 0 AND monthlyRevenue > 0 THEN 1 ELSE 0 END) as both_known,
      SUM(CASE WHEN monthlyCost > 0 AND monthlyRevenue = 0 THEN 1 ELSE 0 END) as cost_only,
      SUM(CASE WHEN monthlyCost = 0 AND monthlyRevenue > 0 THEN 1 ELSE 0 END) as revenue_only,
      SUM(CASE WHEN monthlyCost = 0 AND monthlyRevenue = 0 THEN 1 ELSE 0 END) as neither,
      ROUND(SUM(CASE WHEN monthlyCost > 0 AND monthlyRevenue > 0 THEN monthlyCost ELSE 0 END), 2) as matched_cost,
      ROUND(SUM(CASE WHEN monthlyCost > 0 AND monthlyRevenue > 0 THEN monthlyRevenue ELSE 0 END), 2) as matched_revenue,
      ROUND(SUM(CASE WHEN monthlyCost > 0 THEN monthlyCost ELSE 0 END), 2) as total_known_cost,
      ROUND(SUM(monthlyRevenue), 2) as total_revenue
    FROM services
    WHERE status != 'terminated'
  `) as any[];
  
  const cov = (coverage as any[])[0];
  console.log(`Total active services:  ${cov.total_active}`);
  console.log(`Both cost & revenue:    ${cov.both_known} services → Cost: $${cov.matched_cost}/mo, Revenue: $${cov.matched_revenue}/mo`);
  console.log(`Cost only (no revenue): ${cov.cost_only} services`);
  console.log(`Revenue only (no cost): ${cov.revenue_only} services ← these need supplier invoice matching`);
  console.log(`Neither known:          ${cov.neither} services`);
  console.log(`\nTotal known cost:   $${cov.total_known_cost}/mo`);
  console.log(`Total revenue:      $${cov.total_revenue}/mo`);
  
  const matchedMargin = parseFloat(cov.matched_cost) > 0 && parseFloat(cov.matched_revenue) > 0
    ? ((parseFloat(cov.matched_revenue) - parseFloat(cov.matched_cost)) / parseFloat(cov.matched_revenue) * 100).toFixed(1)
    : 'n/a';
  console.log(`Margin (where both known): ${matchedMargin}%`);

  // ─── 14. Distinct provider values in services table ───────────────────────
  console.log('\n━━━ 14. All Provider Values in Services Table ━━━\n');
  const [allProviders] = await conn.execute(`
    SELECT 
      COALESCE(provider, 'NULL') as provider,
      COUNT(*) as cnt,
      SUM(monthlyCost) as total_cost,
      SUM(monthlyRevenue) as total_revenue
    FROM services
    WHERE status != 'terminated'
    GROUP BY provider
    ORDER BY cnt DESC
  `) as any[];
  
  for (const r of allProviders as any[]) {
    console.log(`  ${(r.provider||'').padEnd(25)} | ${String(r.cnt).padStart(5)} services | Cost: $${parseFloat(r.total_cost||0).toFixed(2).padStart(10)} | Revenue: $${parseFloat(r.total_revenue||0).toFixed(2)}`);
  }

  // ─── 15. Services with suspiciously identical cost and revenue ─────────────
  console.log('\n━━━ 15. Sanity Check: Services where Cost == Revenue (possible data error) ━━━\n');
  const [costEqRevenue] = await conn.execute(`
    SELECT 
      s.externalId, s.provider, s.monthlyCost, s.monthlyRevenue, s.dataSource,
      s.customerName, s.status
    FROM services s
    WHERE s.monthlyCost > 0 
      AND s.monthlyRevenue > 0
      AND ABS(s.monthlyCost - s.monthlyRevenue) < 0.01
      AND s.status != 'terminated'
    ORDER BY s.monthlyCost DESC
    LIMIT 20
  `) as any[];
  
  console.log(`Services where cost exactly equals revenue: ${(costEqRevenue as any[]).length}`);
  for (const r of costEqRevenue as any[]) {
    console.log(`  ${r.provider?.padEnd(15)} | $${parseFloat(r.monthlyCost).toFixed(2)} | ${(r.customerName||'').substring(0,35).padEnd(35)} | ${(r.name||'').substring(0,30)} | Source: ${(r.dataSource||'').substring(0,30)}`);
  }

  await conn.end();
  console.log('\n=== AUDIT COMPLETE ===');
}

main().catch(console.error);
