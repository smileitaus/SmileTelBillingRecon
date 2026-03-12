/**
 * create-services-from-billing-items.mjs
 *
 * Creates service records from unlinked Xero billing items across all customers.
 *
 * Account code → service type mapping:
 *   2374 = SmileTel (Internet/Voice bundle - already mostly linked, handle remainders)
 *   2376 = Voice (resold / 3rd party)
 *   2378 = Internet / Data
 *   2380 = Hardware
 *   2382 = Other / Managed Services
 *
 * Strategy:
 *   - For each customer, group unlinked billing items by (accountCode + description)
 *   - Create ONE service record per unique (accountCode + description) combination per customer
 *   - Link all matching billing items to that service
 *   - Service status = "unmatched" (no supplier data yet)
 *   - dataSource = "Xero Feb 2026 Invoice"
 *
 * This is idempotent: re-running will skip items already linked to a service.
 */

import { createConnection } from 'mysql2/promise';

const ACCOUNT_CODE_MAP = {
  '2374': { serviceType: 'Internet', supplierName: 'SmileTel' },
  '2376': { serviceType: 'Voice', supplierName: 'Unknown' },
  '2378': { serviceType: 'Internet', supplierName: 'Unknown' },
  '2380': { serviceType: 'Other', supplierName: 'Unknown' },
  '2382': { serviceType: 'Other', supplierName: 'Unknown' },
};

// Map description keywords to more specific service types
function refineServiceType(description, accountCode) {
  const d = (description || '').toLowerCase();
  if (accountCode === '2376') {
    if (d.includes('mobile') || d.includes('sim') || d.includes('4g') || d.includes('5g')) return 'Mobile';
    if (d.includes('voip') || d.includes('sip') || d.includes('trunk')) return 'VoIP';
    return 'Voice';
  }
  if (accountCode === '2378') {
    if (d.includes('mobile') || d.includes('4g') || d.includes('5g') || d.includes('sim')) return 'Mobile';
    return 'Internet';
  }
  if (accountCode === '2374') {
    if (d.includes('mobile') || d.includes('sim')) return 'Mobile';
    if (d.includes('voice') || d.includes('voip') || d.includes('sip')) return 'VoIP';
    return 'Internet';
  }
  return 'Other';
}

// Truncate description to use as serviceTypeDetail
function makeServiceTypeDetail(description) {
  if (!description) return '';
  // Strip leading/trailing quotes and whitespace
  const clean = description.replace(/^['"\s]+|['"\s]+$/g, '').trim();
  return clean.substring(0, 255);
}

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);

  // Get max service externalId to start numbering from
  const [[maxRow]] = await conn.execute("SELECT MAX(CAST(SUBSTRING(externalId, 2) AS UNSIGNED)) as maxNum FROM services WHERE externalId REGEXP '^S[0-9]+'");
  let nextIdNum = (maxRow.maxNum || 743) + 1;

  // Get all unlinked billing items that have a customer assigned
  const [items] = await conn.execute(`
    SELECT bi.id, bi.externalId, bi.contactName, bi.description, bi.accountCode, 
           bi.lineAmount, bi.customerExternalId, bi.invoiceDate,
           c.name as customerName, c.siteAddress as customerAddress
    FROM billing_items bi
    JOIN customers c ON bi.customerExternalId = c.externalId
    WHERE (bi.serviceExternalId = '' OR bi.serviceExternalId IS NULL)
    AND bi.customerExternalId != ''
    AND bi.accountCode IN ('2374', '2376', '2378', '2380', '2382')
    ORDER BY bi.customerExternalId, bi.accountCode, bi.description
  `);

  console.log(`Found ${items.length} unlinked billing items across customers`);

  // Group by customer + accountCode + description (normalised)
  const groups = new Map();
  for (const item of items) {
    const key = `${item.customerExternalId}||${item.accountCode}||${item.description}`;
    if (!groups.has(key)) {
      groups.set(key, { ...item, billingItems: [] });
    }
    groups.get(key).billingItems.push(item.externalId);
  }

  console.log(`Grouped into ${groups.size} unique service buckets`);

  let created = 0;
  let skipped = 0;

  for (const [, group] of groups) {
    const { customerExternalId, customerName, customerAddress, accountCode, description, billingItems: biIds } = group;

    // Check if a service already exists for this customer+accountCode+description combo
    // (idempotency: check by dataSource tag + description + customer)
    const [[existing]] = await conn.execute(
      `SELECT externalId FROM services 
       WHERE customerExternalId = ? 
       AND serviceTypeDetail = ?
       AND dataSource LIKE '%Xero Feb 2026%'
       LIMIT 1`,
      [customerExternalId, makeServiceTypeDetail(description)]
    );

    let serviceExternalId;
    if (existing) {
      serviceExternalId = existing.externalId;
      skipped++;
    } else {
      // Create new service
      serviceExternalId = `S${String(nextIdNum).padStart(4, '0')}`;
      nextIdNum++;

      const serviceType = refineServiceType(description, accountCode);
      const { supplierName } = ACCOUNT_CODE_MAP[accountCode] || { supplierName: 'Unknown' };
      const serviceTypeDetail = makeServiceTypeDetail(description);

      // Calculate total monthly cost from all linked billing items
      const totalCost = biIds.length > 0
        ? (await conn.execute(
            `SELECT SUM(lineAmount) as total FROM billing_items WHERE externalId IN (${biIds.map(() => '?').join(',')})`,
            biIds
          ))[0][0].total || 0
        : 0;

      await conn.execute(
        `INSERT INTO services 
         (externalId, serviceType, serviceTypeDetail, planName, status, 
          customerExternalId, customerName, locationAddress,
          supplierName, monthlyCost, dataSource, provider, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'unmatched', ?, ?, ?, ?, ?, 'Xero Feb 2026 Invoice', ?, NOW(), NOW())`,
        [
          serviceExternalId,
          serviceType,
          serviceTypeDetail,
          serviceTypeDetail.substring(0, 128),
          customerExternalId,
          customerName,
          customerAddress || '',
          supplierName,
          totalCost,
          supplierName,
        ]
      );

      created++;
    }

    // Link all billing items to this service
    for (const biExternalId of biIds) {
      await conn.execute(
        `UPDATE billing_items SET serviceExternalId = ?, matchStatus = 'customer-matched', updatedAt = NOW() WHERE externalId = ?`,
        [serviceExternalId, biExternalId]
      );
    }
  }

  // Recalculate customer service counts and revenue
  console.log('\nRecalculating customer stats...');
  const [customers] = await conn.execute(
    `SELECT DISTINCT customerExternalId FROM services WHERE dataSource LIKE '%Xero Feb 2026%'`
  );
  for (const { customerExternalId } of customers) {
    const [[rev]] = await conn.execute(
      `SELECT SUM(lineAmount) as total FROM billing_items WHERE customerExternalId = ?`,
      [customerExternalId]
    );
    await conn.execute(
      `UPDATE customers SET monthlyRevenue = ?, updatedAt = NOW() WHERE externalId = ?`,
      [rev.total || 0, customerExternalId]
    );
  }

  await conn.end();

  console.log('\n=== RESULTS ===');
  console.log(`Services created: ${created}`);
  console.log(`Services reused (idempotent): ${skipped}`);
  console.log(`Billing items linked: ${items.length}`);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
