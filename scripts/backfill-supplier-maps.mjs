/**
 * Backfill supplier_enterprise_map and supplier_product_map from the March SasBoss import.
 *
 * Sources:
 * - supplier_workbook_line_items: has enterpriseName, matchedCustomerExternalId, matchedCustomerName, productName, productType
 * - We extract all rows where matchStatus = 'matched' or 'partial' to build the enterprise map
 * - We extract all distinct productName+productType combos to build the product map
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('Connected to database');

// ── Step 1: Backfill enterprise map ─────────────────────────────────────────
console.log('\n=== Backfilling supplier_enterprise_map ===');

const [lineItems] = await conn.execute(`
  SELECT DISTINCT
    li.enterpriseName,
    li.matchedCustomerExternalId,
    li.matchedCustomerName,
    c.id as customerId
  FROM supplier_workbook_line_items li
  JOIN supplier_workbook_uploads u ON li.uploadId = u.id
  LEFT JOIN customers c ON c.externalId = li.matchedCustomerExternalId
  WHERE li.matchStatus IN ('matched', 'partial')
    AND li.matchedCustomerExternalId != ''
    AND li.matchedCustomerExternalId IS NOT NULL
    AND u.supplier = 'SasBoss'
`);

console.log(`Found ${lineItems.length} distinct enterprise→customer mappings`);

let enterpriseInserted = 0;
let enterpriseSkipped = 0;

for (const row of lineItems) {
  if (!row.customerId) {
    console.log(`  SKIP: ${row.enterpriseName} → ${row.matchedCustomerExternalId} (customer not found in DB)`);
    enterpriseSkipped++;
    continue;
  }

  // Check if mapping already exists
  const [existing] = await conn.execute(
    `SELECT id FROM supplier_enterprise_map WHERE supplierName = 'SasBoss' AND enterpriseName = ?`,
    [row.enterpriseName]
  );

  if (existing.length > 0) {
    enterpriseSkipped++;
    continue;
  }

  await conn.execute(
    `INSERT INTO supplier_enterprise_map (supplierName, enterpriseName, customerId, customerExternalId, customerName, confirmedBy)
     VALUES ('SasBoss', ?, ?, ?, ?, 'backfill')`,
    [row.enterpriseName, row.customerId, row.matchedCustomerExternalId, row.matchedCustomerName]
  );
  enterpriseInserted++;
}

console.log(`Enterprise map: ${enterpriseInserted} inserted, ${enterpriseSkipped} skipped`);

// ── Step 2: Backfill product map ─────────────────────────────────────────────
console.log('\n=== Backfilling supplier_product_map ===');

const [products] = await conn.execute(`
  SELECT DISTINCT productName, productType
  FROM supplier_workbook_line_items li
  JOIN supplier_workbook_uploads u ON li.uploadId = u.id
  WHERE u.supplier = 'SasBoss'
    AND productName != ''
    AND productName IS NOT NULL
  ORDER BY productType, productName
`);

console.log(`Found ${products.length} distinct product name+type combos`);

// Classify products into internal service types
function classifyProduct(productName, productType) {
  const pn = productName.toLowerCase();
  const pt = productType.toLowerCase();

  if (pt.includes('did') || pn.includes('did number') || pn.includes('direct inward')) {
    return { internalServiceType: 'DID', billingLabel: productName };
  }
  if (pt.includes('call-pack') || pt.includes('call pack') || pn.includes('call pack') || pn.includes('calls')) {
    return { internalServiceType: 'CallPack', billingLabel: productName };
  }
  if (pt.includes('service-pack') || pt.includes('service pack')) {
    if (pn.includes('user') || pn.includes('license') || pn.includes('licence') || pn.includes('seat')) {
      return { internalServiceType: 'VoiceUser', billingLabel: productName };
    }
    if (pn.includes('fax') || pn.includes('analog')) {
      return { internalServiceType: 'Fax', billingLabel: productName };
    }
    if (pn.includes('sip') || pn.includes('trunk')) {
      return { internalServiceType: 'SIPTrunk', billingLabel: productName };
    }
    return { internalServiceType: 'Voice', billingLabel: productName };
  }
  if (pn.includes('internet') || pn.includes('broadband') || pn.includes('nbn') || pn.includes('fibre')) {
    return { internalServiceType: 'Internet', billingLabel: productName };
  }
  if (pn.includes('mobile') || pn.includes('sim') || pn.includes('data plan')) {
    return { internalServiceType: 'Mobile', billingLabel: productName };
  }
  return { internalServiceType: 'Voice', billingLabel: productName };
}

let productInserted = 0;
let productSkipped = 0;

for (const row of products) {
  const [existing] = await conn.execute(
    `SELECT id FROM supplier_product_map WHERE supplierName = 'SasBoss' AND productName = ? AND productType = ?`,
    [row.productName, row.productType]
  );

  if (existing.length > 0) {
    productSkipped++;
    continue;
  }

  const { internalServiceType, billingLabel } = classifyProduct(row.productName, row.productType);

  await conn.execute(
    `INSERT INTO supplier_product_map (supplierName, productName, productType, internalServiceType, billingLabel, confirmedBy)
     VALUES ('SasBoss', ?, ?, ?, ?, 'backfill')`,
    [row.productName, row.productType, internalServiceType, billingLabel]
  );
  productInserted++;
}

console.log(`Product map: ${productInserted} inserted, ${productSkipped} skipped`);

// ── Step 3: Show summary ─────────────────────────────────────────────────────
console.log('\n=== Summary ===');

const [entCount] = await conn.execute(`SELECT COUNT(*) as cnt FROM supplier_enterprise_map WHERE supplierName = 'SasBoss'`);
const [prodCount] = await conn.execute(`SELECT COUNT(*) as cnt FROM supplier_product_map WHERE supplierName = 'SasBoss'`);

console.log(`supplier_enterprise_map: ${entCount[0].cnt} SasBoss entries`);
console.log(`supplier_product_map: ${prodCount[0].cnt} SasBoss entries`);

// Show product type breakdown
const [byType] = await conn.execute(`
  SELECT internalServiceType, COUNT(*) as cnt
  FROM supplier_product_map
  WHERE supplierName = 'SasBoss'
  GROUP BY internalServiceType
  ORDER BY cnt DESC
`);
console.log('\nProduct type breakdown:');
for (const r of byType) {
  console.log(`  ${r.internalServiceType}: ${r.cnt} products`);
}

// Show unmapped enterprises (line items where no customer was found)
const [unmapped] = await conn.execute(`
  SELECT DISTINCT li.enterpriseName, COUNT(*) as lineItems, SUM(li.amountExGst) as totalExGst
  FROM supplier_workbook_line_items li
  JOIN supplier_workbook_uploads u ON li.uploadId = u.id
  WHERE u.supplier = 'SasBoss'
    AND li.matchStatus = 'unmatched'
  GROUP BY li.enterpriseName
  ORDER BY totalExGst DESC
`);
console.log(`\nUnmapped enterprises (${unmapped.length}):`);
for (const r of unmapped) {
  console.log(`  "${r.enterpriseName}": ${r.lineItems} items, $${parseFloat(r.totalExGst).toFixed(2)} ex-GST`);
}

await conn.end();
console.log('\nDone.');
