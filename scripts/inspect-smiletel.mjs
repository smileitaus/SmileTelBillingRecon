import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import path from 'path';

const files = [
  '/home/ubuntu/upload/SmileTelFeb26.xlsx',
  '/home/ubuntu/upload/SM.xlsx',
  '/home/ubuntu/billing-tool/SM.xlsx',
  '/home/ubuntu/smiletel.xlsx',
];

for (const filePath of files) {
  try {
    console.log('\n=== ' + filePath + ' ===');
    const wb = XLSX.readFile(filePath);
    for (const sheetName of wb.SheetNames.slice(0, 3)) {
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length === 0) continue;
      console.log('Sheet: ' + sheetName + ' (' + data.length + ' rows)');
      // Show header row
      console.log('Headers (row 1):', JSON.stringify(data[0]));
      // Show first 3 data rows
      for (let i = 1; i <= Math.min(3, data.length - 1); i++) {
        console.log('Row ' + (i+1) + ':', JSON.stringify(data[i]));
      }
    }
  } catch (e) {
    console.log('Error reading ' + filePath + ':', e.message);
  }
}
