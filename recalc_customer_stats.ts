import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const db = drizzle(process.env.DATABASE_URL as string);
  
  console.log('Recalculating all customer stats...');
  
  // Recalculate all customer stats from services
  const [result] = await db.execute(sql`
    UPDATE customers c
    SET
      serviceCount   = (SELECT COUNT(*)                             FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'),
      matchedCount   = (SELECT COUNT(*)                             FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'active'),
      unmatchedCount = (SELECT COUNT(*)                             FROM services s WHERE s.customerExternalId = c.externalId AND s.status = 'unmatched'),
      monthlyCost    = (SELECT COALESCE(SUM(s.monthlyCost), 0)      FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'),
      monthlyRevenue = (SELECT COALESCE(SUM(s.monthlyRevenue), 0)   FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'),
      marginPercent  = CASE
        WHEN (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated') > 0
          AND (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated') > 0
        THEN ROUND(
          (
            (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated')
            - (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated')
          ) /
          (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status != 'terminated')
          * 100, 2
        )
        ELSE NULL
      END,
      updatedAt = NOW()
  `) as any;
  console.log('Updated customers:', result.affectedRows);
  
  // Check specific customers mentioned in the task
  const [affinage] = await db.execute(sql`
    SELECT name, monthlyCost, monthlyRevenue, marginPercent, serviceCount, matchedCount
    FROM customers WHERE name LIKE '%Affinage%' LIMIT 1
  `) as any;
  if (affinage[0]) {
    console.log('\nAffinage Professional:', JSON.stringify(affinage[0]));
  }
  
  const [accountant] = await db.execute(sql`
    SELECT name, monthlyCost, monthlyRevenue, marginPercent, serviceCount, matchedCount
    FROM customers WHERE name LIKE '%Accountant Ready%' LIMIT 1
  `) as any;
  if (accountant[0]) {
    console.log('Accountant Ready Services:', JSON.stringify(accountant[0]));
  }
  
  // Overall stats
  const [stats] = await db.execute(sql`
    SELECT 
      COUNT(*) as totalCustomers,
      SUM(CASE WHEN monthlyCost > 0 THEN 1 ELSE 0 END) as withCost,
      SUM(CASE WHEN monthlyRevenue > 0 THEN 1 ELSE 0 END) as withRevenue,
      SUM(monthlyCost) as totalCost,
      SUM(monthlyRevenue) as totalRevenue
    FROM customers
  `) as any;
  console.log('\nCustomer stats summary:', JSON.stringify(stats[0]));
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
