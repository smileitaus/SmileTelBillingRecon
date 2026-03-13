/**
 * Fix provider field mismatches:
 * - ChannelHaus services: supplierName='ChannelHaus' but provider='Unknown' → fix to 'ChannelHaus'
 * - Legion services: supplierName='Legion' but provider='Unknown' → fix to 'Legion'
 * - Tech-e services: supplierName='Tech-e' but provider='Unknown' → fix to 'Tech-e'
 * - SmileTel services: supplierName='SmileTel' but provider='Unknown' → fix to 'SmileTel'
 * - Blitznet services: dataSource='2025 Blitz Report' and provider='Telstra' is correct (Blitz IS Telstra)
 *   BUT services with supplierName='Blitznet' should be fixed
 * 
 * Also sync: where supplierName is set but provider='Unknown', copy supplierName → provider
 */

import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  console.log('=== FIXING PROVIDER FIELD MISMATCHES ===\n');

  // 1. Check current state
  const [before] = await conn.execute(`
    SELECT provider, supplierName, COUNT(*) as cnt, SUM(monthlyCost) as total_cost
    FROM services
    WHERE status != 'terminated'
    GROUP BY provider, supplierName
    ORDER BY cnt DESC
  `) as any[];
  
  console.log('BEFORE - provider vs supplierName breakdown:');
  for (const r of before as any[]) {
    if (r.provider !== r.supplierName && r.supplierName && r.supplierName !== 'Unknown') {
      console.log(`  *** MISMATCH: provider="${r.provider}" | supplierName="${r.supplierName}" | count=${r.cnt} | cost=$${parseFloat(r.total_cost||0).toFixed(2)}`);
    } else {
      console.log(`  OK: provider="${r.provider}" | supplierName="${r.supplierName||''}" | count=${r.cnt} | cost=$${parseFloat(r.total_cost||0).toFixed(2)}`);
    }
  }

  // 2. Fix: where supplierName is a known provider name but provider='Unknown' or doesn't match
  const providerMappings = [
    { supplierName: 'ChannelHaus', provider: 'ChannelHaus' },
    { supplierName: 'Legion', provider: 'Legion' },
    { supplierName: 'Tech-e', provider: 'Tech-e' },
    { supplierName: 'SmileTel', provider: 'SmileTel' },
    { supplierName: 'Blitznet', provider: 'Blitznet' },
    { supplierName: 'VineDirect', provider: 'VineDirect' },
    { supplierName: 'Vine Direct', provider: 'VineDirect' },
    { supplierName: 'Infinet', provider: 'Infinet' },
    { supplierName: 'ABB', provider: 'ABB' },
    { supplierName: 'Exetel', provider: 'Exetel' },
    { supplierName: 'Telstra', provider: 'Telstra' },
  ];

  let totalFixed = 0;
  for (const mapping of providerMappings) {
    const [result] = await conn.execute(`
      UPDATE services 
      SET provider = ?, updatedAt = NOW()
      WHERE supplierName = ? AND (provider != ? OR provider = 'Unknown')
        AND status != 'terminated'
    `, [mapping.provider, mapping.supplierName, mapping.provider]) as any[];
    
    if (result.affectedRows > 0) {
      console.log(`\nFixed ${result.affectedRows} services: supplierName="${mapping.supplierName}" → provider="${mapping.provider}"`);
      totalFixed += result.affectedRows;
    }
  }
  
  // 3. Also fix the SmileTel negative cost goodwill adjustment — it should be SmileTel
  const [smitelFix] = await conn.execute(`
    UPDATE services 
    SET provider = 'SmileTel', updatedAt = NOW()
    WHERE (planName LIKE '%SmileTel%' OR planName LIKE '%Goodwill%') 
      AND provider = 'Unknown'
      AND status != 'terminated'
  `) as any[];
  if ((smitelFix as any).affectedRows > 0) {
    console.log(`Fixed ${(smitelFix as any).affectedRows} SmileTel services by plan name`);
    totalFixed += (smitelFix as any).affectedRows;
  }
  
  console.log(`\nTotal services fixed: ${totalFixed}`);

  // 4. Check after
  const [after] = await conn.execute(`
    SELECT provider, COUNT(*) as cnt, SUM(monthlyCost) as total_cost, SUM(monthlyRevenue) as total_rev
    FROM services
    WHERE status != 'terminated'
    GROUP BY provider
    ORDER BY cnt DESC
  `) as any[];
  
  console.log('\nAFTER - provider breakdown:');
  for (const r of after as any[]) {
    console.log(`  ${(r.provider||'NULL').padEnd(20)} | ${String(r.cnt).padStart(5)} services | cost=$${parseFloat(r.total_cost||0).toFixed(2).padStart(10)} | rev=$${parseFloat(r.total_rev||0).toFixed(2)}`);
  }
  
  // 5. Check if there are still Unknown services with a known supplierName
  const [stillMismatch] = await conn.execute(`
    SELECT provider, supplierName, COUNT(*) as cnt
    FROM services
    WHERE provider = 'Unknown' AND supplierName IS NOT NULL AND supplierName != '' AND supplierName != 'Unknown'
      AND status != 'terminated'
    GROUP BY provider, supplierName
    ORDER BY cnt DESC
  `) as any[];
  
  if ((stillMismatch as any[]).length > 0) {
    console.log('\nStill mismatched (Unknown provider with known supplierName):');
    for (const r of stillMismatch as any[]) {
      console.log(`  provider="${r.provider}" | supplierName="${r.supplierName}" | count=${r.cnt}`);
    }
  } else {
    console.log('\n✓ No more provider/supplierName mismatches');
  }
  
  await conn.end();
  console.log('\n=== DONE ===');
}

main().catch(console.error);
