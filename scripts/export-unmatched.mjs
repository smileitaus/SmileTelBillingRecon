import mysql2 from 'mysql2/promise';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const conn = await mysql2.createConnection(process.env.DATABASE_URL);

  // Get all unmatched items from Feb 2026
  const [unmatched] = await conn.execute(`
    SELECT 
      bi.contactName as 'Xero Contact Name',
      bi.description as 'Description',
      bi.lineAmount as 'Amount (Ex GST)',
      bi.invoiceNumber as 'Invoice Number',
      bi.invoiceDate as 'Invoice Date',
      'Unmatched - No service found in database' as 'Reason'
    FROM billing_items bi
    WHERE bi.category = 'xero-feb-2026' AND bi.matchStatus = 'unmatched'
    ORDER BY bi.lineAmount DESC
  `);

  // Also get low-confidence matches that may need review
  const [lowConf] = await conn.execute(`
    SELECT 
      bi.contactName as 'Xero Contact Name',
      bi.description as 'Description',
      bi.lineAmount as 'Amount (Ex GST)',
      bi.invoiceNumber as 'Invoice Number',
      bi.invoiceDate as 'Invoice Date',
      s.externalId as 'Matched Service ID',
      s.planName as 'Matched Service Name',
      c.name as 'Matched Customer',
      bi.matchConfidence as 'Confidence',
      'Low confidence match - review recommended' as 'Reason'
    FROM billing_items bi
    JOIN services s ON s.externalId = bi.serviceExternalId
    JOIN customers c ON c.externalId = bi.customerExternalId
    WHERE bi.category = 'xero-feb-2026' 
      AND bi.matchStatus = 'service-matched'
      AND bi.matchConfidence = 'low'
    ORDER BY bi.lineAmount DESC
  `);

  console.log(`Unmatched items: ${unmatched.length}`);
  console.log(`Low confidence matches: ${lowConf.length}`);

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Sheet 1: Unmatched items
  const ws1 = XLSX.utils.json_to_sheet(unmatched);
  ws1['!cols'] = [
    { wch: 45 }, // Contact Name
    { wch: 70 }, // Description
    { wch: 18 }, // Amount
    { wch: 18 }, // Invoice Number
    { wch: 15 }, // Invoice Date
    { wch: 45 }, // Reason
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Unmatched Items');

  // Sheet 2: Low confidence matches
  if (lowConf.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(lowConf);
    ws2['!cols'] = [
      { wch: 45 }, { wch: 70 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
      { wch: 15 }, { wch: 35 }, { wch: 35 }, { wch: 12 }, { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Low Confidence Matches');
  }

  // Sheet 3: Summary stats
  const [summary] = await conn.execute(`
    SELECT 
      COUNT(*) as total_items,
      SUM(lineAmount) as total_revenue,
      SUM(CASE WHEN matchStatus = 'service-matched' THEN 1 ELSE 0 END) as matched,
      SUM(CASE WHEN matchStatus = 'unmatched' THEN 1 ELSE 0 END) as unmatched,
      SUM(CASE WHEN matchStatus = 'service-matched' THEN lineAmount ELSE 0 END) as matched_revenue,
      SUM(CASE WHEN matchStatus = 'unmatched' THEN lineAmount ELSE 0 END) as unmatched_revenue
    FROM billing_items WHERE category = 'xero-feb-2026'
  `);

  const summaryData = [
    { 'Metric': 'Total Billing Items', 'Value': summary[0].total_items },
    { 'Metric': 'Matched to Services', 'Value': summary[0].matched },
    { 'Metric': 'Unmatched', 'Value': summary[0].unmatched },
    { 'Metric': 'Match Rate', 'Value': `${((summary[0].matched / summary[0].total_items) * 100).toFixed(1)}%` },
    { 'Metric': 'Total Revenue (Ex GST)', 'Value': `$${parseFloat(summary[0].total_revenue).toFixed(2)}` },
    { 'Metric': 'Matched Revenue', 'Value': `$${parseFloat(summary[0].matched_revenue).toFixed(2)}` },
    { 'Metric': 'Unmatched Revenue', 'Value': `$${parseFloat(summary[0].unmatched_revenue).toFixed(2)}` },
  ];
  const ws3 = XLSX.utils.json_to_sheet(summaryData);
  ws3['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Summary');

  const outputPath = path.join(__dirname, '../exports/xero-feb-2026-unmatched.xlsx');
  
  // Ensure exports dir exists
  const fs = await import('fs');
  if (!fs.existsSync(path.join(__dirname, '../exports'))) {
    fs.mkdirSync(path.join(__dirname, '../exports'), { recursive: true });
  }

  XLSX.writeFile(wb, outputPath);
  console.log(`Exported to: ${outputPath}`);
  
  // Print unmatched items for review
  console.log('\nUnmatched items:');
  for (const item of unmatched) {
    console.log(`  ${item['Xero Contact Name']} | ${item['Description'].substring(0, 60)} | $${item['Amount (Ex GST)']}`);
  }

  await conn.end();
}

main().catch(e => console.error(e.message));
