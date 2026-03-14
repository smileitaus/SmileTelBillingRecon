/**
 * Run the SasBoss Dispatch Charges import directly via db.ts functions.
 * This validates matching logic before the UI is used.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import XLSX from 'xlsx';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env') });

// ── Parse the workbook ─────────────────────────────────────────────────────────
const filePath = resolve('/home/ubuntu/upload/SasbossDispatchcharges(March).xlsx');
const buffer = readFileSync(filePath);
const wb = XLSX.read(buffer, { type: 'buffer' });

// Parse Pivot tab
const pivotSheet = wb.Sheets['Pivot'];
const pivotRaw = XLSX.utils.sheet_to_json(pivotSheet, { header: 1, defval: null });

const colEnterprise = 0, colProduct = 1, colProductType = 2, colServiceRef = 3;
const colIncGst = 7, colExGst = 8;

const pivotRows = [];
let lastEnterprise = '';

for (let i = 2; i < pivotRaw.length; i++) {
  const row = pivotRaw[i];
  if (!row || row.every(c => c === null)) continue;

  const enterprise = row[colEnterprise] ? String(row[colEnterprise]).trim() : lastEnterprise;
  if (enterprise) lastEnterprise = enterprise;

  const product = row[colProduct] ? String(row[colProduct]).trim() : null;
  const productType = row[colProductType] ? String(row[colProductType]).trim() : null;

  if (!product || !productType) continue;
  if (product.toLowerCase().includes('total') || productType.toLowerCase().includes('total')) continue;
  if (enterprise.toLowerCase().includes('total') || enterprise.toLowerCase().includes('grand')) continue;

  const exGst = typeof row[colExGst] === 'number' ? row[colExGst] : parseFloat(String(row[colExGst] ?? '0')) || 0;
  const incGst = typeof row[colIncGst] === 'number' ? row[colIncGst] : parseFloat(String(row[colIncGst] ?? '0')) || 0;

  pivotRows.push({
    enterprise_name: enterprise,
    product_name: product,
    product_type: productType,
    service_ref_id: row[colServiceRef] ? String(row[colServiceRef]).trim() : undefined,
    sum_ex_gst: exGst,
    sum_inc_gst: incGst,
  });
}

// Parse Sheet1 call usage
const sheet1 = wb.Sheets['Sheet1'];
const sheet1Raw = XLSX.utils.sheet_to_json(sheet1, { defval: null });

const callUsageByEnterprise = new Map();
for (const row of sheet1Raw) {
  const productName = row['Product Name'];
  if (productName !== null && productName !== undefined && String(productName).trim() !== '') continue;
  const enterprise = row['Enterprise Name'] ? String(row['Enterprise Name']).trim() : null;
  if (!enterprise) continue;
  const cost = typeof row['Total (EX-GST)'] === 'number' ? row['Total (EX-GST)'] : parseFloat(String(row['Total (EX-GST)'] ?? '0')) || 0;
  callUsageByEnterprise.set(enterprise, (callUsageByEnterprise.get(enterprise) ?? 0) + cost);
}

const callUsageRows = Array.from(callUsageByEnterprise.entries())
  .filter(([, v]) => v > 0)
  .map(([enterprise_name, call_usage_ex_gst]) => ({ enterprise_name, call_usage_ex_gst }));

console.log(`Parsed: ${pivotRows.length} pivot rows, ${callUsageRows.length} call usage summaries`);
console.log(`Pivot total ex-GST: $${pivotRows.reduce((s, r) => s + r.sum_ex_gst, 0).toFixed(2)}`);
console.log(`Call usage total ex-GST: $${callUsageRows.reduce((s, r) => s + r.call_usage_ex_gst, 0).toFixed(2)}`);

// ── Run the import ─────────────────────────────────────────────────────────────
// Dynamic import to use the compiled db functions
const { importSasBossDispatch } = await import('../server/db.ts');

console.log('\nRunning import...');
const result = await importSasBossDispatch(
  'SasbossDispatchcharges(March)',
  '2026-03',
  '',
  pivotRows,
  callUsageRows,
  'System (Script)'
);

console.log('\n=== IMPORT RESULTS ===');
console.log(`Upload ID: ${result.uploadId}`);
console.log(`Matched: ${result.matchedCount}`);
console.log(`Unmatched: ${result.unmatchedCount}`);
console.log(`Call usage matched: ${result.callUsageMatchedCount} / ${result.callUsageCount}`);
console.log(`Total ex-GST: $${result.totalExGst.toFixed(2)}`);

console.log('\n=== UNMATCHED ITEMS (first 20) ===');
result.unmatchedItems.slice(0, 20).forEach(item => {
  console.log(`  ${item.enterpriseName} | ${item.productName} | $${item.amountExGst.toFixed(2)} | ${item.reason}`);
});

if (result.unmatchedItems.length > 20) {
  console.log(`  ... and ${result.unmatchedItems.length - 20} more unmatched items`);
}

console.log('\n=== MATCH SUMMARY ===');
const matchStats = { matched: 0, partial: 0, unmatched: 0 };
result.details.forEach(d => matchStats[d.matchStatus]++);
console.log(`  Full match: ${matchStats.matched}`);
console.log(`  Partial (customer found, new service): ${matchStats.partial}`);
console.log(`  No match: ${matchStats.unmatched}`);

process.exit(0);
