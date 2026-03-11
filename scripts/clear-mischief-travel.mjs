/**
 * Final Mischief Travel Clearance Script
 * 
 * Reassignment plan based on supplier account analysis:
 * 
 * Account 586992900 (167 svcs):
 *   - simOwner = "RVC V&D" or "RVC Consulting" → RVC ICT Consulting (C0207)
 *   - simOwner = "Extranet - Smile IT" → Smile IT (C2441)
 *   - simOwner = blank (137 svcs) → RVC ICT Consulting (C0207) 
 *     (account 586992900 is primarily RVC's account; other customers using it are single-service outliers)
 * 
 * Account 192549800 (31 svcs):
 *   - "Dot Voice And Broadband Backup" plan, no address → unassigned (Zambrero account but no way to match individual sites)
 * 
 * Account 2000719405571 (4 svcs):
 *   - Core Internet, no address → unassigned (Zambrero account but no site data)
 * 
 * Account 2000703916450 (1 svc - S0306):
 *   - 19 ALEXANDRA ST, BARDON QLD → unassigned (no matching customer)
 * 
 * No account (8 svcs):
 *   - S0703 alias "NBN: CASH CENTRE 449 NEPEAN HWY FRANKSTON" → unassigned (no customer)
 *   - S0726 alias "Scott Chapman's Residence" → unassigned
 *   - S0728 alias "BT Lawyers (HAMILTON)" → unassigned (no customer record)
 *   - S0734 alias "Accountant Ready Services" → unassigned
 *   - S0737 alias "Nicki's Professional Security Screens & Blinds" → unassigned
 *   - S0024/S0025/S0026 "Upfront Internet Plan Essential" → unassigned
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const MISCHIEF_ID = 'C2654';
const RVC_ID = 'C0207';
const SMILE_IT_ID = 'C2441';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('=== FINAL MISCHIEF TRAVEL CLEARANCE ===');
  
  let totalReassigned = 0;
  let totalUnassigned = 0;
  
  // ─── 1. Account 586992900: RVC V&D / RVC Consulting → RVC ICT (C0207) ───
  const [rvcOwned] = await conn.execute(
    `SELECT externalId FROM services 
     WHERE customerExternalId = ? AND supplierAccount = '586992900'
     AND (simOwner LIKE '%RVC%' OR simOwner = '' OR simOwner IS NULL)`,
    [MISCHIEF_ID]
  );
  if (rvcOwned.length > 0) {
    const ids = rvcOwned.map(s => s.externalId);
    await conn.execute(
      `UPDATE services SET customerExternalId = ? WHERE externalId IN (${ids.map(() => '?').join(',')})`,
      [RVC_ID, ...ids]
    );
    console.log(`Reassigned ${ids.length} services (account 586992900, RVC/blank) → RVC ICT Consulting (${RVC_ID})`);
    totalReassigned += ids.length;
  }
  
  // ─── 2. Account 586992900: Smile IT simOwner → Smile IT (C2441) ───
  const [smileOwned] = await conn.execute(
    `SELECT externalId FROM services 
     WHERE customerExternalId = ? AND supplierAccount = '586992900'
     AND simOwner LIKE '%Smile IT%'`,
    [MISCHIEF_ID]
  );
  if (smileOwned.length > 0) {
    const ids = smileOwned.map(s => s.externalId);
    await conn.execute(
      `UPDATE services SET customerExternalId = ? WHERE externalId IN (${ids.map(() => '?').join(',')})`,
      [SMILE_IT_ID, ...ids]
    );
    console.log(`Reassigned ${ids.length} services (account 586992900, Smile IT simOwner) → Smile IT (${SMILE_IT_ID})`);
    totalReassigned += ids.length;
  }
  
  // ─── 3. All remaining Mischief Travel services → unassigned (NULL) ───
  const [remaining] = await conn.execute(
    'SELECT externalId FROM services WHERE customerExternalId = ?',
    [MISCHIEF_ID]
  );
  if (remaining.length > 0) {
    const ids = remaining.map(s => s.externalId);
    await conn.execute(
      `UPDATE services SET customerExternalId = NULL, customerName = 'Unassigned' WHERE externalId IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    console.log(`Unassigned ${ids.length} services (no confident match) → customerExternalId = NULL`);
    totalUnassigned += ids.length;
  }
  
  // ─── 4. Update service counts ───
  const affectedCustomers = [MISCHIEF_ID, RVC_ID, SMILE_IT_ID];
  for (const custId of affectedCustomers) {
    const [cnt] = await conn.execute(
      'SELECT COUNT(*) as c FROM services WHERE customerExternalId = ?',
      [custId]
    );
    await conn.execute(
      'UPDATE customers SET serviceCount = ? WHERE externalId = ?',
      [cnt[0].c, custId]
    );
  }
  
  // ─── 5. Final verification ───
  const [mtFinal] = await conn.execute(
    'SELECT COUNT(*) as c FROM services WHERE customerExternalId = ?',
    [MISCHIEF_ID]
  );
  const [rvcFinal] = await conn.execute(
    'SELECT COUNT(*) as c FROM services WHERE customerExternalId = ?',
    [RVC_ID]
  );
  const [smileFinal] = await conn.execute(
    'SELECT COUNT(*) as c FROM services WHERE customerExternalId = ?',
    [SMILE_IT_ID]
  );
  const [unassigned] = await conn.execute(
    'SELECT COUNT(*) as c FROM services WHERE customerExternalId IS NULL'
  );
  
  console.log('');
  console.log('=== FINAL STATE ===');
  console.log(`Mischief Travel (${MISCHIEF_ID}): ${mtFinal[0].c} services`);
  console.log(`RVC ICT Consulting (${RVC_ID}): ${rvcFinal[0].c} services`);
  console.log(`Smile IT (${SMILE_IT_ID}): ${smileFinal[0].c} services`);
  console.log(`Total unassigned (NULL): ${unassigned[0].c} services`);
  console.log('');
  console.log(`Total reassigned to customers: ${totalReassigned}`);
  console.log(`Total moved to unassigned: ${totalUnassigned}`);
  
  await conn.end();
}

main().catch(console.error);
