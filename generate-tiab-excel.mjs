/**
 * Generate comprehensive TIAB Services Excel spreadsheet
 * Includes: Zambrero services (as individual customers), non-Zambrero Octane accounts,
 * TIAB supplier invoices, match status, plan costs, and all available data.
 */

import mysql from 'mysql2/promise';
import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file
const envPath = join(__dirname, '.env');
let DATABASE_URL;
try {
  const envContent = readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL=(.+)/);
  if (match) DATABASE_URL = match[1].trim();
} catch {}
if (!DATABASE_URL) DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not found'); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);
console.log('Connected to database');

// ─── Fetch all data ───────────────────────────────────────────────────────────

// 1. Zambrero services from tiab_services (join with tiab_customers and tiab_plans)
const [zambreroServices] = await conn.execute(`
  SELECT 
    ts.id,
    ts.tiabServiceId,
    ts.tiabCustomerId,
    ts.msisdn,
    ts.planName,
    ts.status,
    ts.serviceType,
    ts.dataPoolId,
    ts.activationDate,
    ts.cessationDate,
    ts.simSerial,
    JSON_UNQUOTE(JSON_EXTRACT(ts.rawJson, '$.name')) AS serviceName,
    JSON_UNQUOTE(JSON_EXTRACT(ts.rawJson, '$.added')) AS addedDate,
    JSON_UNQUOTE(JSON_EXTRACT(ts.rawJson, '$.released')) AS releasedDate,
    tc.companyName AS octaneCompanyName,
    tc.firstName AS octaneFirstName,
    tc.lastName AS octaneLastName,
    tc.email AS octaneEmail,
    COALESCE(tc.phone, tc.mobile) AS octanePhone,
    tc.abn AS octaneABN,
    tc.address AS octaneAddress,
    tc.suburb AS octaneCity,
    tc.state AS octaneState,
    tc.postcode AS octanePostcode,
    NULL AS octaneBalance,
    tp.baseCharge AS wholesaleBaseCharge,
    tp.dataAllowanceGb,
    tp.planType
  FROM tiab_services ts
  LEFT JOIN tiab_customers tc ON ts.tiabCustomerId = tc.tiabCustomerId
  LEFT JOIN tiab_plans tp ON (
    (ts.planName = 'Retail Data Plan' AND tp.tiabPlanId = 'TW-DATA-12GB') OR
    (ts.planName = 'ST Data Pool 60GB' AND tp.tiabPlanId = 'TW-POOL-60GB')
  )
  ORDER BY JSON_UNQUOTE(JSON_EXTRACT(ts.rawJson, '$.name'))
`);

// 2. Octane customer links with match info
const [octaneLinks] = await conn.execute(`
  SELECT 
    ocl.id,
    ocl.octaneCustomerId,
    ocl.octaneCustomerName,
    ocl.octaneServiceName,
    ocl.isZambreroService,
    ocl.internalCustomerExternalId,
    ocl.internalCustomerName,
    ocl.matchType,
    ocl.matchConfidence,
    ocl.matchNotes,
    ocl.confirmedBy,
    ocl.confirmedAt,
    c.billingPlatforms,
    c.contactEmail,
    c.contactPhone,
    c.businessName,
    c.siteAddress,
    c.xeroAccountNumber,
    c.monthlyRevenue,
    c.monthlyCost AS customerMonthlyCost
  FROM octane_customer_links ocl
  LEFT JOIN customers c ON ocl.internalCustomerExternalId = c.externalId
  ORDER BY ocl.isZambreroService DESC, ocl.octaneServiceName
`);

// 3. TIAB supplier invoices
const [invoices] = await conn.execute(`
  SELECT 
    si.id,
    si.invoiceNumber,
    si.invoiceDate,
    si.billingMonth,
    si.paymentDueDate,
    si.totalExGst,
    si.totalGst,
    si.totalIncGst,
    si.supplierName,
    si.billedToName,
    GROUP_CONCAT(
      CONCAT(sil.description, ': Ex GST $', FORMAT(sil.gstExclusive, 2), ' | Inc GST $', FORMAT(sil.amountGstIncl, 2))
      SEPARATOR ' | '
    ) AS lineItems
  FROM tiab_supplier_invoices si
  LEFT JOIN tiab_supplier_invoice_line_items sil ON si.id = sil.invoiceId
  GROUP BY si.id
  ORDER BY si.invoiceDate
`);

// 4. TIAB plans
const [plans] = await conn.execute(`
  SELECT tiabPlanId, planName, planType, dataAllowanceGb, baseCharge, description
  FROM tiab_plans
  ORDER BY planType, baseCharge
`);

// 5. All Octane customers
const [octaneCustomers] = await conn.execute(`
  SELECT *
  FROM tiab_customers
  ORDER BY companyName
`);

await conn.end();

console.log(`Fetched: ${zambreroServices.length} Zambrero services, ${octaneLinks.length} Octane links, ${invoices.length} invoices, ${plans.length} plans, ${octaneCustomers.length} Octane customers`);

// ─── Build a lookup map from octaneLinks for Zambrero services ────────────────
const zambreroLinkByServiceName = {};
const zambreroLinkByMsisdn = {};
for (const link of octaneLinks) {
  if (link.isZambreroService && link.octaneServiceName) {
    zambreroLinkByServiceName[link.octaneServiceName] = link;
  }
}
// Also build a link map by octane customer ID for non-Zambrero
const nonZambreroLinks = octaneLinks.filter(l => !l.isZambreroService);

// ─── Build Excel workbook ─────────────────────────────────────────────────────
const workbook = new ExcelJS.Workbook();
workbook.creator = 'SmileTel Billing Recon';
workbook.created = new Date();

// ─── Helper functions ─────────────────────────────────────────────────────────
function styleHeaderRow(row, bgColor = '1F4E79') {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };
  });
  row.height = 30;
}

function styleDataRow(row, isEven, highlightColor = null) {
  const bgColor = highlightColor || (isEven ? 'FFF5F5F5' : 'FFFFFFFF');
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    cell.font = { size: 9 };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFEEEEEE' } },
      left: { style: 'thin', color: { argb: 'FFEEEEEE' } },
      bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } },
      right: { style: 'thin', color: { argb: 'FFEEEEEE' } }
    };
    cell.alignment = { vertical: 'middle' };
  });
}

function addTitleRow(sheet, colCount, text, bgColor) {
  sheet.mergeCells(`A1:${String.fromCharCode(64 + colCount)}1`);
  const cell = sheet.getCell('A1');
  cell.value = text;
  cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;
}

// ─── Sheet 1: Summary ─────────────────────────────────────────────────────────
const sheetSummary = workbook.addWorksheet('Summary');
sheetSummary.getColumn(1).width = 40;
sheetSummary.getColumn(2).width = 25;
sheetSummary.getColumn(3).width = 30;

sheetSummary.mergeCells('A1:C1');
const mainTitle = sheetSummary.getCell('A1');
mainTitle.value = 'SmileTel — TIAB Mobile Services Report';
mainTitle.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
mainTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
mainTitle.alignment = { horizontal: 'center', vertical: 'middle' };
sheetSummary.getRow(1).height = 32;

const addSummaryRow = (label, value, format, bgColor) => {
  const row = sheetSummary.addRow([label, value]);
  if (bgColor) {
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
    row.getCell(1).font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    sheetSummary.mergeCells(`A${row.number}:C${row.number}`);
  } else {
    row.getCell(1).font = { size: 10 };
    row.getCell(2).font = { bold: true, size: 10 };
    if (format === 'currency') row.getCell(2).numFmt = '"$"#,##0.00';
  }
  return row;
};

sheetSummary.addRow(['Generated', new Date().toLocaleString('en-AU')]);
sheetSummary.addRow(['Data Source', 'Octane Portal (TIAB) + Supplier Invoices + TIAB Rate Card Jan 2025']);
sheetSummary.addRow([]);

const activeZambrero = zambreroServices.filter(s => s.status === 'Active' || s.status === 'OK').length;
const inactiveZambrero = zambreroServices.filter(s => s.status !== 'Active' && s.status !== 'OK').length;
const totalBaseWholesale = zambreroServices.reduce((sum, s) => sum + (parseFloat(s.wholesaleBaseCharge) || 0), 0);
const matchedLinks = octaneLinks.filter(l => l.matchType && l.matchType !== 'unmatched').length;
const unmatchedLinks = octaneLinks.filter(l => !l.matchType || l.matchType === 'unmatched').length;
const totalInvoicedExGst = invoices.reduce((sum, i) => sum + (parseFloat(i.totalExGst) || 0), 0);
const totalInvoicedIncGst = invoices.reduce((sum, i) => sum + (parseFloat(i.totalIncGst) || 0), 0);

addSummaryRow('ZAMBRERO MOBILE SERVICES', null, null, '1F4E79');
addSummaryRow('Total Services (Active + Disconnected)', zambreroServices.length);
addSummaryRow('Active Services', activeZambrero);
addSummaryRow('Disconnected Services', inactiveZambrero);
addSummaryRow('Total Wholesale Base Cost/mo (Ex GST)', totalBaseWholesale, 'currency');
addSummaryRow('Cost Basis', 'Base charge only — pool usage & overages charged separately per CDR');
sheetSummary.addRow([]);

addSummaryRow('OCTANE CUSTOMER MATCHING', null, null, '2E7D32');
addSummaryRow('Total Octane Links', octaneLinks.length);
addSummaryRow('Matched to SmileTel Customer', matchedLinks);
addSummaryRow('Unmatched', unmatchedLinks);
addSummaryRow('Match Rate', (matchedLinks / octaneLinks.length * 100).toFixed(1) + '%');
addSummaryRow('Unmatched Records', 'Orphan Services, SmileTel, JOSHELLEY PTY LTD, Bels Resto, Infinitea Trading (x5), Mother Duck Childcare');
sheetSummary.addRow([]);

addSummaryRow('TIAB SUPPLIER INVOICES (Account 100998)', null, null, 'C62828');
addSummaryRow('Invoice Count', invoices.length);
addSummaryRow('Total Invoiced Ex GST (Nov 2025 – Feb 2026)', totalInvoicedExGst, 'currency');
addSummaryRow('Total Invoiced Inc GST', totalInvoicedIncGst, 'currency');
for (const inv of invoices) {
  addSummaryRow(`  ${inv.invoiceNumber} (${inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-AU') : ''})`, parseFloat(inv.totalExGst), 'currency');
}
if (invoices.length >= 2) {
  const growth = ((parseFloat(invoices[invoices.length-1].totalExGst) / parseFloat(invoices[0].totalExGst) - 1) * 100).toFixed(0);
  addSummaryRow('Cost Growth Nov 2025 → Feb 2026', growth + '%');
}
sheetSummary.addRow([]);

addSummaryRow('TIAB RATE CARD (Jan 2025)', null, null, 'E65100');
addSummaryRow('Total Plans Available', plans.length);
addSummaryRow('Retail Data Plan → TW Data Only 12GB (base)', '$16.01/mo Ex GST');
addSummaryRow('ST Data Pool 60GB → TW 5G Mobile Pool 60GB (base)', '$49.91/mo Ex GST');
addSummaryRow('SIM Card Cost', '$3.50/SIM Ex GST');

// ─── Sheet 2: Zambrero Services ───────────────────────────────────────────────
const sheet1 = workbook.addWorksheet('Zambrero Services', {
  views: [{ state: 'frozen', ySplit: 2 }]
});

addTitleRow(sheet1, 22, 'TIAB / Octane — Zambrero Mobile Services (Each Service = Individual Customer Entity)', '1F4E79');

const headers1 = [
  'MSISDN', 'Service Name (Location)', 'Octane Customer',
  'Plan Name', 'Wholesale Plan', 'Data (GB)', 'Base Cost/mo (Ex GST)',
  'Status', 'Data Pool ID', 'Added Date', 'Released Date',
  'SIM Serial', 'Activation Date', 'Cessation Date',
  'SmileTel Customer Match', 'Internal Customer ID',
  'Match Type', 'Match Confidence', 'Match Notes',
  'Billing Platforms', 'Xero Account #', 'Site Address'
];
const headerRow1 = sheet1.addRow(headers1);
styleHeaderRow(headerRow1);

const colWidths1 = [18, 35, 30, 22, 28, 10, 20, 10, 14, 14, 14, 22, 14, 14, 38, 18, 16, 16, 45, 20, 16, 40];
colWidths1.forEach((w, i) => { sheet1.getColumn(i + 1).width = w; });

let rowIdx1 = 0;
for (const svc of zambreroServices) {
  const link = zambreroLinkByServiceName[svc.serviceName] || {};
  const isActive = svc.status === 'Active' || svc.status === 'OK';
  const matchConf = link.matchConfidence ? parseFloat(link.matchConfidence).toFixed(1) + '%' : '';

  const row = sheet1.addRow([
    svc.msisdn || '',
    svc.serviceName || '',
    svc.octaneCompanyName || '',
    svc.planName || '',
    svc.planName === 'Retail Data Plan' ? 'TW Data Only 12GB' : (svc.planName === 'ST Data Pool 60GB' ? 'TW 5G Mobile Pool 60GB' : ''),
    svc.dataAllowanceGb ? parseFloat(svc.dataAllowanceGb) : '',
    svc.wholesaleBaseCharge ? parseFloat(svc.wholesaleBaseCharge) : 0,
    svc.status || '',
    svc.dataPoolId || '',
    svc.addedDate || '',
    svc.releasedDate || '',
    svc.simSerial || '',
    svc.activationDate || '',
    svc.cessationDate && svc.cessationDate !== 'NULL' ? svc.cessationDate : '',
    link.internalCustomerName || 'UNMATCHED',
    link.internalCustomerExternalId || '',
    link.matchType || '',
    matchConf,
    link.matchNotes || '',
    link.billingPlatforms || '',
    link.xeroAccountNumber || '',
    link.siteAddress || ''
  ]);

  let highlightColor = null;
  if (!isActive) highlightColor = 'FFFFF0F0';
  else if (!link.internalCustomerName) highlightColor = 'FFFFF8E1';

  styleDataRow(row, rowIdx1 % 2 === 0, highlightColor);
  row.getCell(7).numFmt = '"$"#,##0.00';
  rowIdx1++;
}

// Summary row
sheet1.addRow([]);
const sumRow1 = sheet1.addRow([
  `TOTAL: ${zambreroServices.length} services`,
  `Active: ${activeZambrero} | Disconnected: ${inactiveZambrero}`,
  '', '', '', '',
  { formula: `SUM(G3:G${rowIdx1 + 2})` },
  '', '', '', '', '', '', '',
  `Matched: ${Object.keys(zambreroLinkByServiceName).filter(k => zambreroLinkByServiceName[k].internalCustomerName).length}`,
  '', '', '', '', '', '', ''
]);
sumRow1.font = { bold: true };
sumRow1.getCell(7).numFmt = '"$"#,##0.00';
sheet1.autoFilter = { from: 'A2', to: `V2` };

// ─── Sheet 3: All Octane Customer Links ───────────────────────────────────────
const sheet2 = workbook.addWorksheet('Octane Customer Links', {
  views: [{ state: 'frozen', ySplit: 2 }]
});

addTitleRow(sheet2, 15, `TIAB / Octane — All Customer Links (${octaneLinks.length} records: Zambrero services + Octane accounts)`, '2E7D32');

const headers2 = [
  'Octane Customer ID', 'Octane Customer Name', 'Octane Service Name',
  'Is Zambrero Service', 'SmileTel Customer Match', 'Internal Customer ID',
  'Match Type', 'Match Confidence', 'Match Notes',
  'Confirmed By', 'Confirmed At',
  'Billing Platforms', 'Xero Account #', 'Monthly Revenue', 'Site Address'
];
const headerRow2 = sheet2.addRow(headers2);
styleHeaderRow(headerRow2, '2E7D32');

const colWidths2 = [18, 35, 35, 16, 38, 20, 16, 16, 50, 16, 18, 20, 16, 16, 40];
colWidths2.forEach((w, i) => { sheet2.getColumn(i + 1).width = w; });

let rowIdx2 = 0;
for (const link of octaneLinks) {
  const isMatched = link.matchType && link.matchType !== 'unmatched';
  const row = sheet2.addRow([
    link.octaneCustomerId || '',
    link.octaneCustomerName || '',
    link.octaneServiceName || '',
    link.isZambreroService ? 'Yes' : 'No',
    link.internalCustomerName || 'UNMATCHED',
    link.internalCustomerExternalId || '',
    link.matchType || 'unmatched',
    link.matchConfidence ? parseFloat(link.matchConfidence).toFixed(1) + '%' : '0%',
    link.matchNotes || '',
    link.confirmedBy || '',
    link.confirmedAt ? new Date(link.confirmedAt).toLocaleDateString('en-AU') : '',
    link.billingPlatforms || '',
    link.xeroAccountNumber || '',
    link.monthlyRevenue ? parseFloat(link.monthlyRevenue) : 0,
    link.siteAddress || ''
  ]);

  let highlightColor = null;
  if (!isMatched) highlightColor = 'FFFFF8E1';
  else if (link.matchConfidence && parseFloat(link.matchConfidence) < 85) highlightColor = 'FFFFF3E0';

  styleDataRow(row, rowIdx2 % 2 === 0, highlightColor);
  row.getCell(14).numFmt = '"$"#,##0.00';
  rowIdx2++;
}
sheet2.autoFilter = { from: 'A2', to: 'O2' };

// ─── Sheet 4: Octane Customer Accounts ───────────────────────────────────────
const sheet3 = workbook.addWorksheet('Octane Accounts', {
  views: [{ state: 'frozen', ySplit: 2 }]
});

addTitleRow(sheet3, 16, `TIAB / Octane — Customer Accounts (${octaneCustomers.length} accounts)`, '6A1B9A');

const headers3 = [
  'Octane Customer ID', 'Company Name', 'First Name', 'Last Name',
  'Email', 'Phone', 'ABN',
  'Address', 'Suburb', 'State', 'Postcode',
  'Status', 'Match Type', 'Match Confidence',
  'Internal Customer ID', 'Notes'
];
const headerRow3 = sheet3.addRow(headers3);
styleHeaderRow(headerRow3, '6A1B9A');

const colWidths3 = [18, 38, 18, 18, 32, 16, 16, 38, 18, 8, 10, 14, 14, 16, 14, 40];
colWidths3.forEach((w, i) => { sheet3.getColumn(i + 1).width = w; });

let rowIdx3 = 0;
  for (const cust of octaneCustomers) {
  const row = sheet3.addRow([
    cust.tiabCustomerId || '',
    cust.companyName || '',
    cust.firstName || '',
    cust.lastName || '',
    cust.email || '',
    cust.phone || cust.mobile || '',
    cust.abn || '',
    cust.address || '',
    cust.suburb || '',
    cust.state || '',
    cust.postcode || '',
    cust.status || '',
    cust.matchType || '',
    cust.matchConfidence ? parseFloat(cust.matchConfidence).toFixed(1) + '%' : '',
    cust.internalCustomerExternalId || '',
    ''
  ]);
  styleDataRow(row, rowIdx3 % 2 === 0);
  rowIdx3++;
}
sheet3.autoFilter = { from: 'A2', to: 'P2' };

// ─── Sheet 5: TIAB Supplier Invoices ─────────────────────────────────────────
const sheet4 = workbook.addWorksheet('Supplier Invoices', {
  views: [{ state: 'frozen', ySplit: 2 }]
});

addTitleRow(sheet4, 10, 'TIAB Supplier Invoices — Account 100998 (SmileTel) — Nov 2025 to Feb 2026', 'C62828');

const headers4 = [
  'Invoice Number', 'Invoice Date', 'Billing Month', 'Payment Due Date',
  'Total Ex GST', 'GST Amount', 'Total Inc GST',
  'Supplier Name', 'Billed To', 'Line Items'
];
const headerRow4 = sheet4.addRow(headers4);
styleHeaderRow(headerRow4, 'C62828');

const colWidths4 = [18, 14, 14, 16, 16, 14, 16, 30, 30, 90];
colWidths4.forEach((w, i) => { sheet4.getColumn(i + 1).width = w; });

let rowIdx4 = 0;
for (const inv of invoices) {
  const row = sheet4.addRow([
    inv.invoiceNumber || '',
    inv.invoiceDate || '',
    inv.billingMonth || '',
    inv.paymentDueDate || '',
    inv.totalExGst ? parseFloat(inv.totalExGst) : 0,
    inv.totalGst ? parseFloat(inv.totalGst) : 0,
    inv.totalIncGst ? parseFloat(inv.totalIncGst) : 0,
    inv.supplierName || '',
    inv.billedToName || '',
    inv.lineItems || ''
  ]);
  styleDataRow(row, rowIdx4 % 2 === 0);
  row.getCell(5).numFmt = '"$"#,##0.00';
  row.getCell(6).numFmt = '"$"#,##0.00';
  row.getCell(7).numFmt = '"$"#,##0.00';
  row.height = 45;
  row.getCell(10).alignment = { wrapText: true, vertical: 'top' };
  rowIdx4++;
}

// Totals
sheet4.addRow([]);
const sumRow4 = sheet4.addRow([
  'TOTALS', '', '', '',
  { formula: `SUM(E3:E${rowIdx4 + 2})` },
  { formula: `SUM(F3:F${rowIdx4 + 2})` },
  { formula: `SUM(G3:G${rowIdx4 + 2})` },
  '', '', ''
]);
sumRow4.font = { bold: true };
['E', 'F', 'G'].forEach(col => { sumRow4.getCell(col).numFmt = '"$"#,##0.00'; });
sheet4.autoFilter = { from: 'A2', to: 'J2' };

// ─── Sheet 6: TIAB Rate Card ──────────────────────────────────────────────────
const sheet5 = workbook.addWorksheet('TIAB Rate Card', {
  views: [{ state: 'frozen', ySplit: 2 }]
});

addTitleRow(sheet5, 6, 'TIAB MVNO Wholesale Pricebook — Jan 2025 (SmileIT) — All prices Ex GST', 'E65100');

const headers5 = [
  'Plan ID', 'Plan Name', 'Plan Type', 'Data Allowance (GB)', 'Base Charge (Ex GST)', 'Description'
];
const headerRow5 = sheet5.addRow(headers5);
styleHeaderRow(headerRow5, 'E65100');

const colWidths5 = [18, 45, 20, 18, 20, 60];
colWidths5.forEach((w, i) => { sheet5.getColumn(i + 1).width = w; });

let rowIdx5 = 0;
for (const plan of plans) {
  const row = sheet5.addRow([
    plan.tiabPlanId || '',
    plan.planName || '',
    plan.planType || '',
    plan.dataAllowanceGb ? parseFloat(plan.dataAllowanceGb) : '',
    plan.baseCharge ? parseFloat(plan.baseCharge) : 0,
    plan.description || ''
  ]);
  styleDataRow(row, rowIdx5 % 2 === 0);
  row.getCell(5).numFmt = '"$"#,##0.00';
  rowIdx5++;
}
sheet5.autoFilter = { from: 'A2', to: 'F2' };

// ─── Save workbook ────────────────────────────────────────────────────────────
const outputPath = '/home/ubuntu/TIAB_Services_Report.xlsx';
await workbook.xlsx.writeFile(outputPath);
console.log(`\n✅ Excel report saved to: ${outputPath}`);
console.log(`   Sheets:`);
console.log(`   1. Summary`);
console.log(`   2. Zambrero Services (${zambreroServices.length} rows)`);
console.log(`   3. Octane Customer Links (${octaneLinks.length} rows)`);
console.log(`   4. Octane Accounts (${octaneCustomers.length} rows)`);
console.log(`   5. Supplier Invoices (${invoices.length} rows)`);
console.log(`   6. TIAB Rate Card (${plans.length} rows)`);
