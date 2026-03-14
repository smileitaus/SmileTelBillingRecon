/**
 * Apply SM v2 updates in bulk using CASE WHEN statements
 * Much faster than 427 individual UPDATE queries
 */
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

interface ServiceUpdate {
  externalId: string;
  provider?: string;
  supplierName?: string;
  dataSource?: string;
  serviceActivationDate?: string;
  planName?: string;
  serviceType?: string;
  discoveryNotes?: string;
  customerExternalId?: string;
  customerName?: string;
  status?: string;
}

async function main() {
  const updates: ServiceUpdate[] = JSON.parse(fs.readFileSync('/tmp/sm_updates_v2.json', 'utf-8'));
  console.log(`Applying ${updates.length} updates in batch...`);
  
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  const ids = updates.map(u => u.externalId);
  const idPlaceholders = ids.map(() => '?').join(',');
  
  // Build CASE WHEN for each field
  const buildCase = (field: keyof ServiceUpdate, fallback: string = `${field}`) => {
    const cases = updates
      .filter(u => u[field] !== undefined)
      .map(u => `WHEN externalId = '${u.externalId.replace(/'/g, "''")}' THEN ?`);
    const vals = updates
      .filter(u => u[field] !== undefined)
      .map(u => u[field]);
    if (cases.length === 0) return null;
    return { sql: `CASE ${cases.join(' ')} ELSE ${fallback} END`, vals };
  };
  
  // Split into assigned (with customer) and notes-only
  const assigned = updates.filter(u => u.customerExternalId);
  const notesOnly = updates.filter(u => !u.customerExternalId);
  
  console.log(`  Assigned: ${assigned.length}, Notes/provider only: ${notesOnly.length}`);
  
  // Process in chunks of 100
  const chunkSize = 100;
  let totalUpdated = 0;
  
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const chunkIds = chunk.map(u => u.externalId);
    
    // Build individual updates for this chunk using a single transaction
    const queries: [string, any[]][] = [];
    
    for (const u of chunk) {
      const sets: string[] = [];
      const vals: any[] = [];
      
      if (u.provider !== undefined) { sets.push('provider = ?'); vals.push(u.provider); }
      if (u.supplierName !== undefined) { sets.push('supplierName = ?'); vals.push(u.supplierName); }
      if (u.dataSource !== undefined) { sets.push('dataSource = ?'); vals.push(u.dataSource); }
      if (u.planName !== undefined) { sets.push('planName = ?'); vals.push(u.planName); }
      if (u.serviceType !== undefined) { sets.push('serviceType = ?'); vals.push(u.serviceType); }
      if (u.discoveryNotes !== undefined) { sets.push('discoveryNotes = ?'); vals.push(u.discoveryNotes); }
      if (u.serviceActivationDate !== undefined) { sets.push('serviceActivationDate = ?'); vals.push(u.serviceActivationDate); }
      if (u.customerExternalId !== undefined) {
        sets.push('customerExternalId = ?'); vals.push(u.customerExternalId);
        sets.push('customerName = ?'); vals.push(u.customerName);
        sets.push('status = ?'); vals.push(u.status || 'active');
      }
      
      if (sets.length > 0) {
        vals.push(u.externalId);
        queries.push([`UPDATE services SET ${sets.join(', ')} WHERE externalId = ?`, vals]);
      }
    }
    
    // Execute all queries in this chunk
    await conn.beginTransaction();
    try {
      for (const [sql, vals] of queries) {
        await conn.execute(sql, vals);
      }
      await conn.commit();
      totalUpdated += queries.length;
    } catch (err) {
      await conn.rollback();
      throw err;
    }
    
    process.stdout.write(`\r  Progress: ${Math.min(i + chunkSize, updates.length)}/${updates.length}`);
  }
  
  console.log(`\n  Total updated: ${totalUpdated}`);
  
  // Update customer stats for all affected customers
  const assignedCustomerIds = [...new Set(
    assigned.map(u => u.customerExternalId!).filter(Boolean)
  )];
  
  console.log(`\nUpdating stats for ${assignedCustomerIds.length} customers...`);
  
  if (assignedCustomerIds.length > 0) {
    // Bulk update customer stats using correlated subqueries
    const idList = assignedCustomerIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    
    await conn.execute(`
      UPDATE customers c
      SET 
        serviceCount = (
          SELECT COUNT(*) FROM services s 
          WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'
        ),
        monthlyCost = (
          SELECT COALESCE(SUM(s.monthlyCost), 0) FROM services s 
          WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'
        ),
        monthlyRevenue = (
          SELECT COALESCE(SUM(s.monthlyRevenue), 0) FROM services s 
          WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'
        ),
        marginPercent = (
          SELECT 
            CASE 
              WHEN SUM(s.monthlyCost) > 0 AND SUM(s.monthlyRevenue) > 0
              THEN ROUND((SUM(s.monthlyRevenue) - SUM(s.monthlyCost)) / SUM(s.monthlyRevenue) * 100, 2)
              ELSE NULL
            END
          FROM services s 
          WHERE s.customerExternalId = c.externalId AND s.status != 'terminated'
        )
      WHERE c.externalId IN (${idList})
    `);
    
    console.log(`  Customer stats updated.`);
  }
  
  await conn.end();
  console.log('\nDone!');
  
  // Summary
  console.log(`\n=== SUMMARY ===`);
  console.log(`  Services updated: ${totalUpdated}`);
  console.log(`  Customers assigned: ${assigned.length}`);
  console.log(`  Notes/provider only: ${notesOnly.length}`);
  console.log(`  Customer stats refreshed: ${assignedCustomerIds.length}`);
}

main().catch(console.error);
