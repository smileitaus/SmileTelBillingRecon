import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const MIGRATIONS = [
  '0000_tiny_radioactive_man.sql',
  '0001_sleepy_human_robot.sql',
  '0002_numerous_mad_thinker.sql',
  '0003_calm_ronan.sql',
  '0004_lyrical_lady_vermin.sql',
  '0005_loving_arclight.sql',
  '0006_abnormal_the_hood.sql',
  '0007_youthful_leper_queen.sql',
  '0008_gigantic_namor.sql',
  '0009_flawless_captain_stacy.sql',
  '0010_chief_kang.sql',
  '0011_rich_killraven.sql',
  '0012_large_overlord.sql',
  '0013_light_wallow.sql',
  '0014_illegal_harpoon.sql',
  '0015_easy_monster_badoon.sql',
  '0016_lame_klaw.sql',
  '0017_superb_impossible_man.sql',
  '0018_lowly_texas_twister.sql',
  '0019_unusual_katie_power.sql',
  '0020_lazy_wong.sql',
  '0021_dry_hardball.sql',
  '0022_cooing_vance_astro.sql',
  '0023_service_categories.sql',
  '0024_nifty_zzzax.sql',
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected to database');

let totalSuccess = 0;
let totalErrors = 0;

for (const migFile of MIGRATIONS) {
  const filePath = path.resolve(`./drizzle/${migFile}`);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (not found): ${migFile}`);
    continue;
  }
  
  const sql = fs.readFileSync(filePath, 'utf8');
  // Split on --> breakpoint markers or semicolons at end of line
  const statements = sql
    .split(/\n--> statement-breakpoint\n/)
    .flatMap(block => block.split(/;\s*\n/))
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));
  
  let fileSuccess = 0;
  let fileErrors = 0;
  
  for (const stmt of statements) {
    if (!stmt) continue;
    try {
      await conn.query(stmt);
      fileSuccess++;
    } catch (err) {
      // Ignore "already exists" errors - idempotent
      if (err.code === 'ER_TABLE_EXISTS_ERROR' || 
          err.code === 'ER_DUP_FIELDNAME' ||
          err.code === 'ER_DUP_KEYNAME' ||
          err.message.includes('already exists') ||
          err.message.includes('Duplicate column')) {
        fileSuccess++; // treat as success
      } else {
        fileErrors++;
        console.error(`  ERROR in ${migFile}: ${err.message.substring(0, 120)}`);
      }
    }
  }
  
  console.log(`${migFile}: ${fileSuccess} ok, ${fileErrors} errors`);
  totalSuccess += fileSuccess;
  totalErrors += fileErrors;
}

console.log(`\nTotal: ${totalSuccess} statements ok, ${totalErrors} errors`);

// Show final table list
const [tables] = await conn.query('SHOW TABLES');
console.log(`\nTables in database (${tables.length}):`);
tables.forEach(t => console.log(' -', Object.values(t)[0]));

await conn.end();
