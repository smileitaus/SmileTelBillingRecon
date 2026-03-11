import mysql from 'mysql2/promise';
import 'dotenv/config';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find customers with zero services AND zero monthlyCost AND zero monthlyRevenue
const [candidates] = await conn.execute(`
  SELECT 
    c.externalId,
    c.name,
    c.status,
    c.serviceCount,
    c.monthlyCost,
    c.monthlyRevenue,
    COUNT(s.id) AS actualServiceCount,
    COUNT(bi.id) AS billingItemCount
  FROM customers c
  LEFT JOIN services s ON s.customerExternalId = c.externalId
  LEFT JOIN billing_items bi ON bi.customerExternalId = c.externalId
  WHERE c.status != 'inactive'
  GROUP BY c.externalId, c.name, c.status, c.serviceCount, c.monthlyCost, c.monthlyRevenue
  HAVING actualServiceCount = 0 AND billingItemCount = 0
  ORDER BY c.name
`);

console.log(`Found ${candidates.length} customers with zero services and zero billing items:`);
candidates.forEach(c => {
  console.log(`  ${c.externalId} | ${c.name} | status=${c.status} | cost=${c.monthlyCost} | rev=${c.monthlyRevenue}`);
});

if (candidates.length === 0) {
  console.log('Nothing to update.');
  await conn.end();
  process.exit(0);
}

// Bulk update to inactive
const ids = candidates.map(c => c.externalId);
const placeholders = ids.map(() => '?').join(',');
const [result] = await conn.execute(
  `UPDATE customers SET status = 'inactive', updatedAt = NOW() WHERE externalId IN (${placeholders})`,
  ids
);

console.log(`\nMarked ${result.affectedRows} customers as inactive.`);

// Verify
const [remaining] = await conn.execute(
  `SELECT COUNT(*) as c FROM customers WHERE status = 'active'`
);
console.log(`Active customers remaining: ${remaining[0].c}`);

await conn.end();
