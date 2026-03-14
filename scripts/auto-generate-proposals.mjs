import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Find all unmatched services with SM Customer: names
const [rows] = await conn.execute(`
  SELECT externalId, discoveryNotes
  FROM services
  WHERE status = 'unmatched'
    AND discoveryNotes LIKE '%SM Customer:%'
`);

// 2. Group by customer name
const groups = {};
for (const r of rows) {
  const m = r.discoveryNotes.match(/SM Customer:\s*([^\n\[|]+)/i);
  if (m) {
    const name = m[1].trim();
    if (!groups[name]) groups[name] = [];
    groups[name].push(r.externalId);
  }
}

console.log(`Found ${rows.length} services across ${Object.keys(groups).length} unique customer names:\n`);
for (const [name, ids] of Object.entries(groups)) {
  console.log(`  ${ids.length}x  ${name}`);
}

// 3. Check for existing pending proposals to avoid duplicates
const [existingProposals] = await conn.execute(`
  SELECT proposedName FROM customer_proposals WHERE status = 'pending'
`);
const existingNames = new Set(existingProposals.map(p => p.proposedName.trim().toLowerCase()));

// 4. Insert proposals for names that don't already have one
let created = 0;
let skipped = 0;
for (const [name, serviceIds] of Object.entries(groups)) {
  if (existingNames.has(name.toLowerCase())) {
    console.log(`\nSKIPPED (already exists): ${name}`);
    skipped++;
    continue;
  }
  // Check if this customer already exists
  const [existing] = await conn.execute(
    `SELECT externalId FROM customers WHERE name = ? LIMIT 1`,
    [name]
  );
  const notes = existing.length > 0
    ? `Auto-generated from SM Import data. Customer may already exist as "${existing[0].externalId}". ${serviceIds.length} service(s) pending assignment.`
    : `Auto-generated from SM Import data. ${serviceIds.length} service(s) pending assignment.`;

  await conn.execute(`
    INSERT INTO customer_proposals
      (proposedName, notes, serviceExternalIds, source, status, proposedBy, createPlatformCheck, createdAt, updatedAt)
    VALUES (?, ?, ?, 'SM Import Auto', 'pending', 'System (SM Import)', 0, NOW(), NOW())
  `, [name, notes, JSON.stringify(serviceIds)]);
  console.log(`\nCREATED proposal: ${name} (${serviceIds.length} service${serviceIds.length !== 1 ? 's' : ''})`);
  created++;
}

console.log(`\n--- Done: ${created} proposals created, ${skipped} skipped (already pending) ---`);
await conn.end();
