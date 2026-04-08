/**
 * Re-import the Internet Pricebook spreadsheet.
 * Deletes any existing versions and re-seeds from the uploaded file.
 * Run: node scripts/reimport-pricebook.mjs
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

// Import the compiled server module via dynamic import
const { parseAndSeedInternetPricebook } = await import('../server/internet-pricebook-seed.ts');

const filePath = '/home/ubuntu/upload/ABBEEandTC4InternetCustomerPricing-IssueMay-25.xlsx';
const buffer = readFileSync(filePath);

console.log('Re-importing pricebook from:', filePath);
const result = await parseAndSeedInternetPricebook(
  buffer,
  'ABB TC4 + EE May 2025',
  '2025-05-01',
  'system-reimport',
  'ABBEEandTC4InternetCustomerPricing-IssueMay-25.xlsx'
);
console.log('Done! versionId:', result.versionId, '| itemCount:', result.itemCount);
