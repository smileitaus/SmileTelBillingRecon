import mysql2 from 'mysql2/promise';

const url = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql2.createConnection(url);

  // Get retail prices from Xero billing items for SasBoss-related descriptions
  const [bi] = await conn.execute(`
    SELECT description, AVG(unitAmount) as avgPrice, COUNT(*) as cnt, MIN(unitAmount) as minPrice, MAX(unitAmount) as maxPrice
    FROM billing_items
    WHERE billingPlatform LIKE '%SasBoss%' AND unitAmount > 0
    GROUP BY description
    ORDER BY cnt DESC
    LIMIT 80
  `);
  console.log('SasBoss Xero retail prices:');
  for (const r of bi) {
    const avg = parseFloat(r.avgPrice).toFixed(2);
    const min = parseFloat(r.minPrice).toFixed(2);
    const max = parseFloat(r.maxPrice).toFixed(2);
    const range = min === max ? avg : `${min}-${max} avg:${avg}`;
    console.log(`  ${r.cnt}x | ${(r.description || '').substring(0, 55).padEnd(55)} | $${range}`);
  }

  // Get supplier_product_cost_map for SasBoss
  const [pcm] = await conn.execute(`
    SELECT productName, defaultRetailPrice, wholesaleCost, rrp
    FROM supplier_product_cost_map
    WHERE supplier = 'SasBoss' OR supplier LIKE '%Access4%'
    ORDER BY productName
    LIMIT 60
  `);
  console.log('\nSasBoss product cost map (retail prices):');
  for (const r of pcm) {
    console.log(`  ${(r.productName || '').substring(0, 55).padEnd(55)} | retail: $${r.defaultRetailPrice} | wholesale: $${r.wholesaleCost}`);
  }

  await conn.end();
}

main().catch(e => console.error(e.message));
