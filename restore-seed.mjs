import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const sqlFile = path.resolve('./smiletel-db-seed.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

console.log(`Read seed file: ${(sql.length / 1024).toFixed(1)} KB`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected to database');

// Split on semicolons followed by newline or end of string
// but handle multi-line INSERT statements properly
const statements = [];
let current = '';
const lines = sql.split('\n');

for (const line of lines) {
  const trimmed = line.trim();
  // Skip pure comment lines
  if (trimmed.startsWith('--') && !current.trim()) continue;
  
  current += line + '\n';
  
  if (trimmed.endsWith(';')) {
    const stmt = current.trim().replace(/;$/, '').trim();
    if (stmt && !stmt.startsWith('--')) {
      statements.push(stmt);
    }
    current = '';
  }
}

console.log(`Executing ${statements.length} statements...`);

let success = 0;
let errors = 0;

for (const stmt of statements) {
  try {
    await conn.query(stmt);
    success++;
    if (success % 5 === 0) process.stdout.write('.');
  } catch (err) {
    errors++;
    console.error(`\nError on statement (first 100 chars): ${stmt.substring(0, 100)}`);
    console.error(`Error: ${err.message}`);
  }
}

console.log(`\nDone. ${success} succeeded, ${errors} errors.`);
await conn.end();
