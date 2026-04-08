import mysql2 from 'mysql2/promise';

const url = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql2.createConnection(url);

  // === 1. Little Cha Erina Fair (C0142) ===
  // S0280 and S0289 are identical NBN Internet Service (Telstra, $93, same phone)
  // S0002 'Core Internet' Telstra $93 same phone — same physical service, older import name
  // Keep S0280; remove S0289 (exact dup) and S0002 (older dup with different name)
  const [r1] = await conn.execute(`DELETE FROM services WHERE externalId IN ('S0289', 'S0002')`);
  console.log('Removed Little Cha duplicates:', r1.affectedRows, 'rows (S0289, S0002)');

  // === 2. TIAB 4G Data Backup duplicates from SM Import (Ella) ===
  // Higher-numbered IDs are the second import (duplicates)
  const tiabDups = ['S7130', 'S7123', 'S7143', 'S7122', 'S7139', 'S7145'];
  const placeholders = tiabDups.map(() => '?').join(',');
  const [r2] = await conn.execute(`DELETE FROM services WHERE externalId IN (${placeholders})`, tiabDups);
  console.log('Removed TIAB 4G duplicates:', r2.affectedRows, 'rows');

  // === 3. Merge Graphene C0107 into C0106 ===
  // Move S0739 (ABB 1000/400 AVC000231763463) from C0107 to C0106
  const [r3] = await conn.execute(`UPDATE services SET customerExternalId = 'C0106' WHERE customerExternalId = 'C0107'`);
  console.log('Moved C0107 services to C0106:', r3.affectedRows, 'rows');
  // Archive C0107
  const [r4] = await conn.execute(`UPDATE customers SET status = 'archived', updatedAt = NOW() WHERE externalId = 'C0107'`);
  console.log('Archived C0107:', r4.affectedRows, 'rows');

  // === 4. Recalculate affected customers ===
  const affectedCustomers = ['C0142', 'C0310', 'C0140', 'C0171', 'C0115', 'C0355', 'C0296', 'C0106'];
  for (const custId of affectedCustomers) {
    await conn.execute(`
      UPDATE customers c SET
        monthlyCost    = (SELECT COALESCE(SUM(s.monthlyCost), 0)    FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')),
        monthlyRevenue = (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')),
        serviceCount   = (SELECT COUNT(*) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')),
        marginPercent  = CASE
          WHEN (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')) > 0
            AND (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')) > 0
          THEN ROUND(
            ((SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived'))
             - (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived')))
            / (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = ? AND s.status NOT IN ('terminated','archived'))
            * 100, 2)
          ELSE NULL
        END,
        updatedAt = NOW()
      WHERE externalId = ?
    `, [custId, custId, custId, custId, custId, custId, custId, custId, custId]);
  }
  console.log('Recalculated', affectedCustomers.length, 'customers');

  // Show final states
  const [gfinal] = await conn.execute(`
    SELECT externalId, name, monthlyCost, monthlyRevenue, marginPercent, serviceCount FROM customers WHERE externalId = 'C0106'
  `);
  console.log('\nGraphene C0106 final:', JSON.stringify(gfinal[0]));

  const [lcfinal] = await conn.execute(`
    SELECT externalId, name, monthlyCost, monthlyRevenue, marginPercent, serviceCount FROM customers WHERE externalId = 'C0142'
  `);
  console.log('Little Cha C0142 final:', JSON.stringify(lcfinal[0]));

  await conn.end();
}

main().catch(e => console.error(e.message));
