import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const tables = [
  'users',
  'customers',
  'locations',
  'services',
  'billing_items',
  'supplier_accounts',
  'supplier_registry',
  'supplier_product_cost_map',
  'supplier_service_map',
  'supplier_enterprise_map',
  'supplier_product_map',
  'supplier_invoice_uploads',
  'supplier_workbook_uploads',
  'supplier_workbook_line_items',
  'service_billing_assignments',
  'service_billing_match_log',
  'unbillable_services',
  'escalated_services',
  'review_items',
  'billing_platform_checks',
  'service_edit_history',
  'service_cost_history',
  'customer_proposals',
  'customer_usage_summaries',
];

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  // String escape
  const str = String(val);
  return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  let sql = `-- SmileTel Billing Reconciliation - Full Data Export\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- This file restores all data to the new Manus account database.\n`;
  sql += `-- Run AFTER pnpm db:push to ensure all tables exist first.\n\n`;
  sql += `SET FOREIGN_KEY_CHECKS=0;\n\n`;

  let totalRows = 0;

  for (const table of tables) {
    try {
      // Get columns
      const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
      const colNames = cols.map(c => c.Field);
      
      // Get rows
      const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
      
      sql += `-- Table: ${table} (${rows.length} rows)\n`;
      sql += `TRUNCATE TABLE \`${table}\`;\n`;
      
      if (rows.length > 0) {
        const colList = colNames.map(c => `\`${c}\``).join(', ');
        
        // Batch inserts in chunks of 100
        const chunkSize = 100;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const valueRows = chunk.map(row => {
            const vals = colNames.map(col => escapeValue(row[col]));
            return `(${vals.join(', ')})`;
          });
          sql += `INSERT INTO \`${table}\` (${colList}) VALUES\n${valueRows.join(',\n')};\n`;
        }
      }
      
      sql += `\n`;
      totalRows += rows.length;
      console.log(`✓ ${table}: ${rows.length} rows`);
    } catch (e) {
      console.log(`✗ ${table}: ${e.message}`);
      sql += `-- SKIPPED: ${table} (${e.message})\n\n`;
    }
  }

  sql += `SET FOREIGN_KEY_CHECKS=1;\n`;
  sql += `\n-- Export complete. Total rows: ${totalRows}\n`;

  const outPath = '/home/ubuntu/smiletel-db-seed.sql';
  fs.writeFileSync(outPath, sql, 'utf8');
  
  const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nExport complete: ${outPath} (${sizeMb} MB, ${totalRows} total rows)`);
  
  await conn.end();
}

main().catch(console.error);
