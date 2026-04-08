import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const MIGRATIONS = [
  '0002_numerous_mad_thinker.sql',
  '0003_calm_ronan.sql',
  '0004_lyrical_lady_vermin.sql',
  '0005_loving_arclight.sql',
  '0006_abnormal_the_hood.sql',
  '0007_youthful_leper_queen.sql',
  '0010_chief_kang.sql',
  '0012_large_overlord.sql',
  '0020_lazy_wong.sql',
  '0021_dry_hardball.sql',
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
  
  // Replace inline --> statement-breakpoint with newline, then split on semicolons
  const cleaned = sql.replace(/--> statement-breakpoint/g, '');
  const statements = cleaned
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && s.length > 5);
  
  let fileSuccess = 0;
  let fileErrors = 0;
  
  for (const stmt of statements) {
    if (!stmt) continue;
    try {
      await conn.query(stmt);
      fileSuccess++;
    } catch (err) {
      // Ignore "already exists" / "duplicate column" errors
      if (err.code === 'ER_TABLE_EXISTS_ERROR' || 
          err.code === 'ER_DUP_FIELDNAME' ||
          err.code === 'ER_DUP_KEYNAME' ||
          err.message.includes('already exists') ||
          err.message.includes('Duplicate column') ||
          err.message.includes('Duplicate key name')) {
        fileSuccess++;
      } else {
        fileErrors++;
        console.error(`  ERROR in ${migFile}: [${err.code}] ${err.message.substring(0, 150)}`);
        console.error(`  Statement: ${stmt.substring(0, 100)}`);
      }
    }
  }
  
  console.log(`${migFile}: ${fileSuccess} ok, ${fileErrors} errors`);
  totalSuccess += fileSuccess;
  totalErrors += fileErrors;
}

console.log(`\nTotal: ${totalSuccess} statements ok, ${totalErrors} errors`);

// Show final table list with column counts
const [tables] = await conn.query('SHOW TABLES');
console.log(`\nTables in database (${tables.length}):`);
for (const t of tables) {
  const tName = Object.values(t)[0];
  const [cols] = await conn.query(`SHOW COLUMNS FROM \`${tName}\``);
  console.log(` - ${tName}: ${cols.length} columns`);
}

await conn.end();
