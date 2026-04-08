import mysql from 'mysql2/promise';
import { createWriteStream } from 'fs';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL not set');

const conn = await mysql.createConnection(dbUrl);

const [rows] = await conn.execute(`
  SELECT 
    externalId, serviceType, serviceTypeDetail, planName, status,
    phoneNumber, avcId, connectionId, locationAddress,
    customerName, customerExternalId,
    monthlyCost, monthlyRevenue,
    provider, supplierAccount, supplierName,
    blitzImportDate, blitzReportName, blitzAccountNumber,
    blitzBillMar26, blitzBillFeb26, blitzBillJan26,
    serviceActivationDate, serviceEndDate, contractEndDate,
    deviceName, deviceType, imei, simSerialNumber,
    dataSource, costSource, serviceCategory, billingPeriod, invoiceMonth,
    createdAt, updatedAt
  FROM services
  WHERE billingPeriod = 'archived'
  ORDER BY externalId
`);

await conn.end();

console.log(`Found ${rows.length} archived services`);

if (rows.length === 0) {
  console.log('No archived services found');
  process.exit(0);
}

// Build CSV
const headers = Object.keys(rows[0]);
const escape = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const lines = [
  headers.join(','),
  ...rows.map(row => headers.map(h => escape(row[h])).join(','))
];

const outputPath = '/home/ubuntu/archived_telstra_services_march2026.csv';
const ws = createWriteStream(outputPath);
ws.write(lines.join('\n') + '\n');
ws.end();

console.log(`Exported to ${outputPath}`);
