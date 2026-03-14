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
  console.log(`Applying ${updates.length} updates...`);
  
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  let assigned = 0;
  let notesOnly = 0;
  let errors = 0;
  
  for (const u of updates) {
    try {
      // Build SET clause dynamically
      const sets: string[] = [];
      const vals: any[] = [];
      
      if (u.provider !== undefined) { sets.push('provider = ?'); vals.push(u.provider); }
      if (u.supplierName !== undefined) { sets.push('supplierName = ?'); vals.push(u.supplierName); }
      if (u.dataSource !== undefined) { sets.push('dataSource = ?'); vals.push(u.dataSource); }
      if (u.planName !== undefined) { sets.push('planName = ?'); vals.push(u.planName); }
      if (u.serviceType !== undefined) { sets.push('serviceType = ?'); vals.push(u.serviceType); }
      if (u.discoveryNotes !== undefined) { sets.push('discoveryNotes = ?'); vals.push(u.discoveryNotes); }
      if (u.serviceActivationDate !== undefined) { sets.push('serviceActivationDate = ?'); vals.push(u.serviceActivationDate); }
      
      // Only assign customer if explicitly set
      if (u.customerExternalId !== undefined) {
        sets.push('customerExternalId = ?'); vals.push(u.customerExternalId);
        sets.push('customerName = ?'); vals.push(u.customerName);
        sets.push('status = ?'); vals.push(u.status || 'active');
        assigned++;
      } else {
        notesOnly++;
      }
      
      if (sets.length === 0) continue;
      
      vals.push(u.externalId);
      await conn.execute(
        `UPDATE services SET ${sets.join(', ')} WHERE externalId = ?`,
        vals
      );
    } catch (err: any) {
      console.error(`Error updating ${u.externalId}: ${err.message}`);
      errors++;
    }
  }
  
  console.log(`\nResults:`);
  console.log(`  Customer assigned: ${assigned}`);
  console.log(`  Notes/provider updated only: ${notesOnly}`);
  console.log(`  Errors: ${errors}`);
  
  // Now update customer stats for all affected customers
  const assignedCustomerIds = updates
    .filter(u => u.customerExternalId)
    .map(u => u.customerExternalId!)
    .filter((v, i, a) => a.indexOf(v) === i);
  
  console.log(`\nUpdating stats for ${assignedCustomerIds.length} customers...`);
  
  for (const custId of assignedCustomerIds) {
    // Count services and sum costs/revenue for this customer
    const [svcRows] = await conn.execute(`
      SELECT 
        COUNT(*) as serviceCount,
        SUM(CASE WHEN status != 'terminated' THEN 1 ELSE 0 END) as activeCount,
        SUM(CASE WHEN status != 'terminated' THEN monthlyCost ELSE 0 END) as totalCost,
        SUM(CASE WHEN status != 'terminated' THEN monthlyRevenue ELSE 0 END) as totalRevenue
      FROM services WHERE customerExternalId = ?
    `, [custId]) as any[];
    
    const stats = (svcRows as any[])[0];
    const totalCost = parseFloat(stats.totalCost || 0);
    const totalRevenue = parseFloat(stats.totalRevenue || 0);
    const marginPercent = (totalCost > 0 && totalRevenue > 0)
      ? Math.round((totalRevenue - totalCost) / totalRevenue * 100 * 100) / 100
      : null;
    
    await conn.execute(`
      UPDATE customers SET 
        serviceCount = ?,
        totalMonthlyCost = ?,
        totalMonthlyRevenue = ?,
        marginPercent = ?
      WHERE externalId = ?
    `, [stats.activeCount || 0, totalCost, totalRevenue, marginPercent, custId]);
  }
  
  console.log(`Customer stats updated.`);
  await conn.end();
}

main().catch(console.error);
