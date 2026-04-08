import mysql2 from 'mysql2/promise';

const url = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql2.createConnection(url);

  // ── 1. Build pricebook map for SasBoss ──────────────────────────────────────
  const [pricebook] = await conn.execute(
    'SELECT productName, wholesaleCost FROM supplier_product_cost_map WHERE supplier = "SasBoss"'
  );
  const priceMap = {};
  for (const p of pricebook) {
    priceMap[p.productName.toLowerCase().trim()] = parseFloat(p.wholesaleCost);
  }

  // ── 2. Get all SasBoss $0 cost active services ───────────────────────────────
  const [services] = await conn.execute(`
    SELECT externalId, planName, monthlyCost, monthlyRevenue, costSource
    FROM services
    WHERE provider = 'SasBoss' AND monthlyCost = 0
      AND status NOT IN ('terminated','archived')
      AND customerExternalId IS NOT NULL AND customerExternalId != ''
  `);

  // ── 3. Match and group ───────────────────────────────────────────────────────
  const grouped = new Map();
  for (const s of services) {
    const key = s.planName.toLowerCase().trim();
    const cost = priceMap[key];
    if (cost !== undefined && cost > 0) {
      if (!grouped.has(s.planName)) grouped.set(s.planName, { cost, ids: [] });
      grouped.get(s.planName).ids.push(s.externalId);
    }
  }

  console.log('Non-zero pricebook matches:', [...grouped.values()].reduce((a, g) => a + g.ids.length, 0));
  for (const [plan, g] of grouped.entries()) {
    console.log(`  ${g.ids.length}x "${plan}" @ $${g.cost}`);
  }

  // ── 4. Apply costs ───────────────────────────────────────────────────────────
  let updated = 0;
  for (const [plan, g] of grouped.entries()) {
    const placeholders = g.ids.map(() => '?').join(',');
    const [result] = await conn.execute(
      `UPDATE services SET monthlyCost = ?, costSource = 'access4_diamond_pricebook_excel', updatedAt = NOW()
       WHERE externalId IN (${placeholders})`,
      [g.cost, ...g.ids]
    );
    updated += result.affectedRows;
  }
  console.log(`\nUpdated ${updated} SasBoss services with pricebook costs.`);

  // ── 5. Apply Teams Voice SIP DID costs from DID pricebook ───────────────────
  // DID Australia (1) = $0.20, (10) = $2.00, (100) = $20.00
  const teamsCases = [
    { pattern: '%Teams Voice SIP DID%100 Range%', cost: 20.00, label: '100 Range' },
    { pattern: '%Teams Voice SIP DID%10 Range%',  cost: 2.00,  label: '10 Range' },
  ];

  for (const tc of teamsCases) {
    const [r] = await conn.execute(
      `UPDATE services SET monthlyCost = ?, costSource = 'access4_diamond_pricebook_excel', updatedAt = NOW()
       WHERE planName LIKE ? AND provider = 'SasBoss' AND monthlyCost = 0
         AND status NOT IN ('terminated','archived')`,
      [tc.cost, tc.pattern]
    );
    console.log(`Teams Voice SIP DID ${tc.label}: updated ${r.affectedRows} services @ $${tc.cost}`);
  }

  // Single DID (not 10 or 100 range) — $0.20 each
  const [r1] = await conn.execute(
    `UPDATE services SET monthlyCost = 0.20, costSource = 'access4_diamond_pricebook_excel', updatedAt = NOW()
     WHERE planName LIKE '%Teams Voice SIP DID%'
       AND planName NOT LIKE '%100 Range%'
       AND planName NOT LIKE '%10 Range%'
       AND provider = 'SasBoss' AND monthlyCost = 0
       AND status NOT IN ('terminated','archived')`
  );
  console.log(`Teams Voice SIP DID single: updated ${r1.affectedRows} services @ $0.20`);

  // ── 6. SmileTel Hosted Number Single — cost $0.20 (same as DID Australia (1)) ──
  const [rSmile] = await conn.execute(
    `UPDATE services SET monthlyCost = 0.20, costSource = 'access4_diamond_pricebook_excel', updatedAt = NOW()
     WHERE provider = 'SmileTel'
       AND (planName LIKE '%Hosted Number Single%' OR planName LIKE '%Smile It SmileTel Hosted Number%')
       AND monthlyCost = 0
       AND status NOT IN ('terminated','archived')`
  );
  console.log(`SmileTel Hosted Number Single: updated ${rSmile.affectedRows} services @ $0.20`);

  await conn.end();
}

main().catch(e => console.error('ERROR:', e.message));
