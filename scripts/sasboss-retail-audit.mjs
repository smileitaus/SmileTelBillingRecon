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
  console.log('SasBoss billing_items retail prices (from Xero):');
  for (const r of bi) {
    const avg = parseFloat(r.avgPrice).toFixed(2);
    const min = parseFloat(r.minPrice).toFixed(2);
    const max = parseFloat(r.maxPrice).toFixed(2);
    const range = min === max ? `$${avg}` : `$${min}-$${max} (avg $${avg})`;
    console.log(`  ${r.cnt}x | ${(r.description || '').substring(0, 55).padEnd(55)} | ${range}`);
  }

  // Also check pricebook for SasBoss retail prices
  const [pb] = await conn.execute(`
    SELECT planName, retailPrice, wholesalePrice, provider
    FROM pricebook
    WHERE provider = 'SasBoss' OR provider LIKE '%Access4%'
    ORDER BY planName
  `);
  console.log('\nSasBoss pricebook entries:');
  for (const r of pb) {
    console.log(`  ${(r.planName || '').substring(0, 55).padEnd(55)} | retail: $${r.retailPrice} | wholesale: $${r.wholesalePrice}`);
  }

  await conn.end();
}

main().catch(e => console.error(e.message));
