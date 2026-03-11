import * as XLSX from '/home/ubuntu/billing-tool/node_modules/xlsx/xlsx.mjs';
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Read Feb billing file
const buf = readFileSync('/home/ubuntu/upload/SmileTelFeb26.xlsx');
const wb = XLSX.read(buf);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: null });

console.log(`Feb billing rows loaded: ${data.length}\n`);

// One-off keywords to exclude
const oneOffKeywords = [
  'hardware', 'install', 'one-time', 'one time', 'one-off', 'one off',
  'sim card', 'porting', 'setup', 'pre install'
];

function isOneOff(desc) {
  const lower = desc.toLowerCase();
  return oneOffKeywords.some(kw => lower.includes(kw));
}

function categorize(desc, accountCode) {
  const lower = desc.toLowerCase();
  if (isOneOff(desc)) return 'one-off';
  if (lower.includes('recurring') || lower.includes('site bundle')) return 'bundle';
  if (lower.includes('nbn') && (lower.includes('voice') || lower.includes('internet') || lower.includes('bundle'))) return 'nbn-bundle';
  if (lower.includes('smiletel supplied nbn')) return 'nbn-service';
  if (lower.includes('sip') || lower.includes('trunk')) return 'sip';
  if (lower.includes('number-rental') || lower.includes('number rental') || lower.includes('did') || lower.includes('direct in dial')) return 'number-rental';
  if (lower.includes('mobile') || lower.includes('mbb')) return 'mobile';
  if (lower.includes('voice') || lower.includes('phone') || lower.includes('call')) return 'voice';
  if (lower.includes('nbn') || lower.includes('internet') || lower.includes('data') || lower.includes('fibre') || lower.includes('fiber')) return 'internet';
  if (lower.includes('starlink')) return 'starlink';
  if (lower.includes('3cx') || lower.includes('hosted')) return 'hosted-pbx';
  if (lower.includes('maintenance')) return 'maintenance';
  if (lower.includes('telstra')) return 'telstra-passthrough';
  if (lower.includes('abb') || lower.includes('aussie broadband')) return 'abb-passthrough';
  if (accountCode === '2376') return 'voice';
  if (accountCode === '2378') return 'internet';
  if (accountCode === '2374') return 'bundle';
  if (accountCode === '2380') return 'hardware-lease';
  if (accountCode === '2382') return 'other';
  return 'other';
}

// Get existing customers for matching
const [existingCustomers] = await conn.query('SELECT id, externalId, name, xeroContactName FROM customers');

// Build lookup maps
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[''`\u2019]/g, "'")
    .replace(/pty\.?\s*ltd\.?/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const custByXeroName = new Map();
const custByNormName = new Map();
const custByExact = new Map();

for (const c of existingCustomers) {
  custByExact.set(c.name.toLowerCase().trim(), c);
  const norm = normalizeName(c.name);
  if (norm) {
    if (!custByNormName.has(norm)) custByNormName.set(norm, []);
    custByNormName.get(norm).push(c);
  }
  if (c.xeroContactName) {
    custByXeroName.set(c.xeroContactName.toLowerCase().trim(), c);
    const xeroNorm = normalizeName(c.xeroContactName);
    if (xeroNorm) {
      if (!custByNormName.has(xeroNorm)) custByNormName.set(xeroNorm, []);
      custByNormName.get(xeroNorm).push(c);
    }
  }
}

function findCustomer(contactName) {
  if (!contactName) return null;
  const lower = contactName.toLowerCase().trim();
  
  // 1. Exact match on xeroContactName
  if (custByXeroName.has(lower)) return custByXeroName.get(lower);
  
  // 2. Exact match on customer name
  if (custByExact.has(lower)) return custByExact.get(lower);
  
  // 3. Normalized name match
  const norm = normalizeName(contactName);
  if (norm && custByNormName.has(norm)) return custByNormName.get(norm)[0];
  
  // 4. Check parenthetical name
  const parenMatch = contactName.match(/\((.+?)\)/);
  if (parenMatch) {
    const parenName = parenMatch[1].trim();
    const parenNorm = normalizeName(parenName);
    if (parenNorm && custByNormName.has(parenNorm)) return custByNormName.get(parenNorm)[0];
    
    // Zambrero pattern in parens
    const zamMatch = parenName.match(/zambrero\s+(.+)/i);
    if (zamMatch) {
      const siteName = zamMatch[1].trim().toLowerCase();
      for (const c of existingCustomers) {
        if (c.name.toLowerCase().includes('zambrero') && c.name.toLowerCase().includes(siteName)) {
          return c;
        }
      }
    }
  }
  
  // 5. Zambrero pattern in main name
  const zamMatch = contactName.match(/zambrero\s+(.+?)(?:\s*\(|$)/i);
  if (zamMatch) {
    const siteName = zamMatch[1].trim().toLowerCase();
    for (const c of existingCustomers) {
      if (c.name.toLowerCase().includes('zambrero') && c.name.toLowerCase().includes(siteName)) {
        return c;
      }
    }
  }
  
  return null;
}

// Process billing items
let imported = 0;
let excluded = 0;
let customerMatched = 0;
let customerUnmatched = 0;
let idCounter = 1;

// Clear existing billing items
await conn.query('DELETE FROM billing_items');

const batchValues = [];

for (const row of data) {
  if (!row['InvoiceDate']) continue;
  
  const desc = String(row['Description'] || '');
  const accountCode = String(row['AccountCode'] || '');
  const category = categorize(desc, accountCode);
  
  // Exclude one-off items
  if (category === 'one-off') {
    excluded++;
    continue;
  }
  
  const contactName = row['ContactName'] || '';
  const invoiceDate = row['InvoiceDate'] ? 
    (typeof row['InvoiceDate'] === 'number' ? 
      new Date((row['InvoiceDate'] - 25569) * 86400 * 1000).toISOString().split('T')[0] : 
      String(row['InvoiceDate'])) : '';
  
  const lineAmount = parseFloat(row['LineAmount']) || 0;
  const taxAmount = parseFloat(row['TaxAmount']) || 0;
  const unitAmount = parseFloat(row['UnitAmount']) || 0;
  const quantity = parseFloat(row['Quantity']) || 1;
  const discount = parseFloat(row['Discount']) || 0;
  
  // Match to customer
  const customer = findCustomer(contactName);
  const custExtId = customer ? customer.externalId : '';
  
  if (customer) customerMatched++;
  else customerUnmatched++;
  
  const extId = `BI${String(idCounter++).padStart(5, '0')}`;
  
  batchValues.push([
    extId, invoiceDate, row['InvoiceNumber'] || '', contactName, desc,
    quantity, unitAmount, discount, lineAmount, taxAmount,
    accountCode, category, custExtId, '', 
    customer ? 'customer-matched' : 'unmatched', ''
  ]);
}

// Batch insert
const BATCH_SIZE = 100;
for (let i = 0; i < batchValues.length; i += BATCH_SIZE) {
  const batch = batchValues.slice(i, i + BATCH_SIZE);
  const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const flatValues = batch.flat();
  await conn.query(
    `INSERT INTO billing_items (externalId, invoiceDate, invoiceNumber, contactName, description, quantity, unitAmount, discount, lineAmount, taxAmount, accountCode, category, customerExternalId, serviceExternalId, matchStatus, matchConfidence) VALUES ${placeholders}`,
    flatValues
  );
}

console.log(`=== FEB BILLING IMPORT RESULTS ===`);
console.log(`Total rows: ${data.length}`);
console.log(`Excluded (one-off): ${excluded}`);
console.log(`Imported (recurring): ${imported + batchValues.length}`);
console.log(`  Customer matched: ${customerMatched}`);
console.log(`  Customer unmatched: ${customerUnmatched}`);

// Category breakdown
const catCounts = {};
for (const v of batchValues) {
  const cat = v[11];
  if (!catCounts[cat]) catCounts[cat] = { count: 0, total: 0 };
  catCounts[cat].count++;
  catCounts[cat].total += parseFloat(v[8]);
}
console.log(`\nCategory breakdown:`);
for (const [cat, info] of Object.entries(catCounts).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${cat}: ${info.count} items, $${info.total.toFixed(2)}`);
}

// Show unmatched contacts
const unmatchedContacts = new Set();
for (const v of batchValues) {
  if (v[14] === 'unmatched') unmatchedContacts.add(v[3]);
}
console.log(`\nUnmatched billing contacts: ${unmatchedContacts.size}`);
let showCount = 0;
for (const name of unmatchedContacts) {
  if (showCount++ < 15) console.log(`  ${name}`);
}

await conn.end();
