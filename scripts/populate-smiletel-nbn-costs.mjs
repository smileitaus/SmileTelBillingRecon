/**
 * Populate missing costs for SmileTel NBN bundle services and other gaps.
 * Uses Carbon API wholesale costs derived from the plan name / speed tier.
 *
 * NBN wholesale costs (from Carbon API actuals):
 *   25/10  → $51.71
 *   50/20  → $73.69
 *   100/40 → $84.70
 *   250/25 → $85.80  (closest match: 250Mbps)
 *   500/50 → $104.51
 *   1000   → $124.31
 *   EE 250 HiCos → $328.90
 *   EE 500 → $438.90
 */

import mysql2 from 'mysql2/promise';

const url = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql2.createConnection(url);
  let totalUpdated = 0;

  // ── Helper ───────────────────────────────────────────────────────────────────
  async function update(label, sql, params = []) {
    const [r] = await conn.execute(sql, params);
    console.log(`${label}: updated ${r.affectedRows}`);
    totalUpdated += r.affectedRows;
    return r.affectedRows;
  }

  // ── SmileTel NBN bundles — assign cost by speed tier in plan name ────────────
  const nbnTiers = [
    { match: '%25/10%',  cost: 51.71,  label: 'SmileTel NBN 25/10' },
    { match: '%50/20%',  cost: 73.69,  label: 'SmileTel NBN 50/20' },
    { match: '%100/40%', cost: 84.70,  label: 'SmileTel NBN 100/40' },
    { match: '%250/25%', cost: 85.80,  label: 'SmileTel NBN 250/25' },
    { match: '%500/50%', cost: 104.51, label: 'SmileTel NBN 500/50' },
    { match: '%1000%',   cost: 124.31, label: 'SmileTel NBN 1000' },
  ];

  for (const tier of nbnTiers) {
    await update(
      tier.label,
      `UPDATE services SET monthlyCost = ?, costSource = 'carbon_nbn_estimate', updatedAt = NOW()
       WHERE provider = 'SmileTel' AND planName LIKE ? AND monthlyCost = 0
         AND status NOT IN ('terminated','archived')`,
      [tier.cost, tier.match]
    );
  }

  // SmileTel NBN bundles with "NBN voice and internet bundle" (generic, no speed) → 100/40 default
  await update(
    'SmileTel NBN bundle (generic, default 100/40)',
    `UPDATE services SET monthlyCost = 84.70, costSource = 'carbon_nbn_estimate', updatedAt = NOW()
     WHERE provider = 'SmileTel' AND monthlyCost = 0
       AND (planName LIKE '%NBN voice and internet bundle%' OR planName LIKE '%NBN%internet%')
       AND planName NOT LIKE '%25/10%' AND planName NOT LIKE '%50/20%'
       AND planName NOT LIKE '%100/40%' AND planName NOT LIKE '%250%'
       AND planName NOT LIKE '%500%' AND planName NOT LIKE '%1000%'
       AND status NOT IN ('terminated','archived')`
  );

  // SmileTel EE (Enterprise Ethernet) plans
  await update(
    'SmileTel EE 250 HiCos',
    `UPDATE services SET monthlyCost = 328.90, costSource = 'carbon_nbn_estimate', updatedAt = NOW()
     WHERE provider = 'SmileTel' AND planName LIKE '%EE-250%' AND monthlyCost = 0
       AND status NOT IN ('terminated','archived')`
  );
  await update(
    'SmileTel EE 500',
    `UPDATE services SET monthlyCost = 438.90, costSource = 'carbon_nbn_estimate', updatedAt = NOW()
     WHERE provider = 'SmileTel' AND planName LIKE '%EE-500%' AND monthlyCost = 0
       AND status NOT IN ('terminated','archived')`
  );

  // SmileTel mobile broadband (4G SIM) → use Carbon 4G cost $9
  await update(
    'SmileTel mobile broadband (4G)',
    `UPDATE services SET monthlyCost = 9.00, costSource = 'carbon_nbn_estimate', updatedAt = NOW()
     WHERE provider = 'SmileTel' AND monthlyCost = 0
       AND (planName LIKE '%mobile broadband%' OR planName LIKE '%4G SIM%' OR planName LIKE '%4G Back%')
       AND status NOT IN ('terminated','archived')`
  );

  // SmileTel BSIP (SIP trunk) → $14.40 (3 channel SIP from pricebook)
  await update(
    'SmileTel BSIP SIP trunk',
    `UPDATE services SET monthlyCost = 14.40, costSource = 'access4_diamond_pricebook_excel', updatedAt = NOW()
     WHERE provider = 'SmileTel' AND planName LIKE '%BSIP%' AND monthlyCost = 0
       AND status NOT IN ('terminated','archived')`
  );

  // SmileTel Number Rental (ST-1-Number-Rental) → DID Australia (1) = $0.20
  await update(
    'SmileTel Number Rental',
    `UPDATE services SET monthlyCost = 0.20, costSource = 'access4_diamond_pricebook_excel', updatedAt = NOW()
     WHERE provider = 'SmileTel' AND (planName LIKE '%Number-Rental%' OR planName LIKE '%Number Rental%') AND monthlyCost = 0
       AND status NOT IN ('terminated','archived')`
  );

  // ── Unknown provider NBN services — assign by speed tier ────────────────────
  const unkTiers = [
    { match: '%100/40%', cost: 84.70,  label: 'Unknown NBN 100/40' },
    { match: '%50/20%',  cost: 73.69,  label: 'Unknown NBN 50/20' },
    { match: '%25/10%',  cost: 51.71,  label: 'Unknown NBN 25/10' },
    { match: '%75%',     cost: 73.69,  label: 'Unknown NBN 75/20' },
    { match: '%500%',    cost: 104.51, label: 'Unknown NBN 500' },
  ];
  for (const tier of unkTiers) {
    await update(
      tier.label,
      `UPDATE services SET monthlyCost = ?, costSource = 'carbon_nbn_estimate', updatedAt = NOW()
       WHERE (provider IS NULL OR provider = '' OR provider = 'Unknown')
         AND serviceType IN ('Internet','VoIP','Other')
         AND planName LIKE ? AND monthlyCost = 0
         AND status NOT IN ('terminated','archived')`,
      [tier.cost, tier.match]
    );
  }

  // ── Recalculate customer stats ───────────────────────────────────────────────
  const [r] = await conn.execute(`
    UPDATE customers c
    SET
      monthlyCost    = (SELECT COALESCE(SUM(s.monthlyCost), 0)    FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated','archived')),
      monthlyRevenue = (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated','archived')),
      marginPercent  = CASE
        WHEN (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated','archived')) > 0
          AND (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated','archived')) > 0
        THEN ROUND(
          ((SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated','archived'))
           - (SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated','archived')))
          / (SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s WHERE s.customerExternalId = c.externalId AND s.status NOT IN ('terminated','archived'))
          * 100, 2)
        ELSE NULL
      END,
      updatedAt = NOW()
  `);
  console.log(`\nCustomers recalculated: ${r.affectedRows}`);
  console.log(`Total services updated: ${totalUpdated}`);

  await conn.end();
}

main().catch(e => console.error('ERROR:', e.message));
