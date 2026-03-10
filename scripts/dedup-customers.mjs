import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find all duplicate name groups
const [dupes] = await conn.query(`
  SELECT name, COUNT(*) as cnt, 
         GROUP_CONCAT(externalId ORDER BY externalId SEPARATOR ',') as ids
  FROM customers 
  GROUP BY name 
  HAVING COUNT(*) > 1
  ORDER BY cnt DESC, name
`);

console.log(`Found ${dupes.length} duplicate name groups (${dupes.reduce((s,d) => s + d.cnt, 0)} total records, ${dupes.reduce((s,d) => s + d.cnt - 1, 0)} to remove)\n`);

let merged = 0;
let deleted = 0;

for (const dupe of dupes) {
  const ids = dupe.ids.split(',');
  
  // Fetch full records for all duplicates
  const placeholders = ids.map(() => '?').join(',');
  const [records] = await conn.query(
    `SELECT * FROM customers WHERE externalId IN (${placeholders}) ORDER BY externalId`,
    ids
  );
  
  // Check which ones have services assigned
  const [svcCounts] = await conn.query(
    `SELECT customerExternalId, COUNT(*) as cnt FROM services WHERE customerExternalId IN (${placeholders}) GROUP BY customerExternalId`,
    ids
  );
  const svcMap = Object.fromEntries(svcCounts.map(s => [s.customerExternalId, s.cnt]));
  
  // Pick the primary record: prefer the one with most services, then lowest ID
  let primary = records[0];
  let primarySvcs = svcMap[primary.externalId] || 0;
  
  for (const rec of records.slice(1)) {
    const recSvcs = svcMap[rec.externalId] || 0;
    if (recSvcs > primarySvcs) {
      primary = rec;
      primarySvcs = recSvcs;
    }
  }
  
  const duplicateIds = ids.filter(id => id !== primary.externalId);
  
  console.log(`[${dupe.name}] Primary: ${primary.externalId} (${primarySvcs} svcs), removing: ${duplicateIds.join(', ')}`);
  
  // Merge data from duplicates into primary (fill in blanks)
  const mergeFields = ['businessName', 'contactName', 'contactEmail', 'contactPhone', 'ownershipType', 'siteAddress', 'notes'];
  const updates = {};
  
  for (const field of mergeFields) {
    if (!primary[field] || primary[field] === '' || primary[field] === null) {
      for (const rec of records) {
        if (rec.externalId !== primary.externalId && rec[field] && rec[field] !== '' && rec[field] !== null) {
          updates[field] = rec[field];
          break;
        }
      }
    }
  }
  
  // Merge billing platforms
  const allPlatforms = new Set();
  for (const rec of records) {
    try {
      const platforms = JSON.parse(rec.billingPlatforms || '[]');
      platforms.forEach(p => allPlatforms.add(p));
    } catch {}
  }
  const mergedPlatforms = JSON.stringify([...allPlatforms]);
  if (mergedPlatforms !== (primary.billingPlatforms || '[]')) {
    updates.billingPlatforms = mergedPlatforms;
  }
  
  // Merge monthly cost (take the higher one)
  let maxCost = parseFloat(primary.monthlyCost) || 0;
  for (const rec of records) {
    const cost = parseFloat(rec.monthlyCost) || 0;
    if (cost > maxCost) {
      maxCost = cost;
      updates.monthlyCost = cost;
    }
  }
  
  // Apply updates to primary
  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    await conn.query(
      `UPDATE customers SET ${setClauses} WHERE externalId = ?`,
      [...values, primary.externalId]
    );
    console.log(`  Updated primary with: ${Object.keys(updates).join(', ')}`);
  }
  
  // Reassign any services from duplicate IDs to primary
  for (const dupId of duplicateIds) {
    if (svcMap[dupId]) {
      await conn.query(
        `UPDATE services SET customerExternalId = ? WHERE customerExternalId = ?`,
        [primary.externalId, dupId]
      );
      console.log(`  Reassigned ${svcMap[dupId]} services from ${dupId} to ${primary.externalId}`);
    }
  }
  
  // Delete duplicate records
  const delPlaceholders = duplicateIds.map(() => '?').join(',');
  await conn.query(
    `DELETE FROM customers WHERE externalId IN (${delPlaceholders})`,
    duplicateIds
  );
  deleted += duplicateIds.length;
  merged++;
}

// Recount services for all affected customers
console.log('\nRecounting service totals for all customers...');
await conn.query(`
  UPDATE customers c
  SET serviceCount = (
    SELECT COUNT(*) FROM services s WHERE s.customerExternalId = c.externalId
  )
`);

// Get final counts
const [finalCount] = await conn.query(`SELECT COUNT(*) as cnt FROM customers`);
const [svcCheck] = await conn.query(`SELECT COUNT(*) as cnt FROM services WHERE customerExternalId NOT IN (SELECT externalId FROM customers) AND customerExternalId IS NOT NULL AND customerExternalId != ''`);

console.log(`\n=== DEDUP COMPLETE ===`);
console.log(`Merged ${merged} duplicate groups`);
console.log(`Deleted ${deleted} duplicate records`);
console.log(`Remaining customers: ${finalCount[0].cnt}`);
console.log(`Orphaned services: ${svcCheck[0].cnt}`);

await conn.end();
