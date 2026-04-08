/**
 * Direct pricebook seed script — bypasses auth, calls parser directly.
 * Usage: node scripts/seed-pricebook.mjs
 */
import { readFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

// ─── Helpers ─────────────────────────────────────────────────────────────────
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object' && v !== null && 'result' in v) {
    const r = v.result;
    if (r === null || r === undefined) return null;
    const n = typeof r === 'number' ? r : parseFloat(String(r));
    return isNaN(n) ? null : n;
  }
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}
function str(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null && 'result' in v) {
    const r = v.result;
    return r === null || r === undefined ? '' : String(r).trim();
  }
  return String(v).trim();
}

const CARBON_PLAN_MAP = {
  '12/1':           'Wholesale NBN 25Mbps/10Mbps',
  '25/10':          'Wholesale NBN 25Mbps/10Mbps',
  '50/20':          'Wholesale NBN 50Mbps/20Mbps ',
  '100/40':         'Wholesale NBN 100Mbps/40Mbps',
  '100/20':         'Wholesale NBN 100Mbps/40Mbps',
  '250/25':         'Wholesale NBN 250Mbps/100Mbps',
  '250/100':        'Wholesale NBN 250Mbps/100Mbps',
  '500/200':        'Wholesale NBN 500Mbps/200Mbps',
  '500/50':         'Wholesale NBN 500Mbps/50Mbps',
  '750/50':         'Wholesale NBN 750Mbps/50Mbps',
  '1000/400':       'Wholesale NBN 1000Mbps/400Mbps',
  '500-1000/50':    'Wholesale NBN 750Mbps/50Mbps',
  '2000/200':       'Wholesale NBN 1000Mbps/400Mbps',
  '2000/500':       'Wholesale NBN 1000Mbps/400Mbps',
  'fw_plus':        'Wholesale NBN Fixed Wireless Plus ',
  'fw_ent_plus':    'Wholesale NBN FW Home Fast 250Mbps/20Mbps',
  'ee':             'NBN Enterprise Ethernet',
};

const WARN_THRESHOLD = 0.20;
const CRIT_THRESHOLD = 0.10;

function lowMarginFlag(margin) {
  if (margin < CRIT_THRESHOLD) return 2;
  if (margin < WARN_THRESHOLD) return 1;
  return 0;
}

function makeRow(versionId, speedTier, serviceType, supportTier, contractTerm, wholesaleCost, sellPrice, productCode, dattoProductName, supportNote, zone = 'all', carbonKey) {
  const gp = sellPrice - wholesaleCost;
  const margin = sellPrice > 0 ? gp / sellPrice : 0;
  const carbonPlanName = CARBON_PLAN_MAP[carbonKey ?? speedTier.split(' ')[0]] ?? '';
  return {
    versionId,
    productCode,
    speedTier,
    serviceType,
    supportTier,
    contractTerm,
    zone,
    supportNote,
    dattoProductName,
    wholesaleCost: wholesaleCost.toFixed(4),
    sellPrice: sellPrice.toFixed(4),
    grossProfit: gp.toFixed(4),
    marginPercent: margin.toFixed(6),
    carbonPlanName,
    lowMarginFlag: lowMarginFlag(margin),
  };
}

// ─── Parse TC4 sheet ──────────────────────────────────────────────────────────
function parseTc4Sheet(ws, versionId) {
  const rows = [];
  for (let rowNum = 6; rowNum <= 22; rowNum++) {
    const row = ws.getRow(rowNum);
    const speedLabel = str(row.getCell(1).value);
    if (!speedLabel) continue;
    const abbCost = num(row.getCell(2).value);
    if (abbCost === null) continue;

    const supportNote = str(row.getCell(4).value);
    const productCode = str(row.getCell(8).value);
    const dattoStdRaw = str(row.getCell(10).value);
    const dattoPremRaw = str(row.getCell(16).value);
    const dattoStdLines = dattoStdRaw.split('\n').map(s => s.trim()).filter(Boolean);
    const dattoPremLines = dattoPremRaw.split('\n').map(s => s.trim()).filter(Boolean);

    const stdM2M = num(row.getCell(11).value);
    const std12m = num(row.getCell(12).value);
    const std24m = num(row.getCell(13).value);
    const std36m = num(row.getCell(14).value);
    const premM2M = num(row.getCell(17).value);
    const prem12m = num(row.getCell(18).value);
    const prem24m = num(row.getCell(19).value);
    const prem36m = num(row.getCell(20).value);

    const speedKey = speedLabel.replace(' Unmetered','').replace(' (Bronze)','').replace(' (Gold)','').replace(' (Home Ultra Fast)','').replace(' Mbps (HFC & FTTP)','').trim();
    const isFwPlus = speedLabel.includes('Fixed Wireless Plus');
    const isFwEnt = speedLabel.includes('Enterprise');
    const carbonKey = isFwPlus ? 'fw_plus' : isFwEnt ? 'fw_ent_plus' : speedKey;

    let serviceType = 'tc4';
    if (isFwPlus) serviceType = 'fw_plus';
    else if (isFwEnt) serviceType = 'fw_ent_plus';
    else if (speedLabel.includes('Home Ultra Fast')) serviceType = 'tc4_home_ultrafast';
    else if (supportNote.includes('Gold')) serviceType = 'tc4_gold';
    else if (supportNote.includes('Bronze')) serviceType = 'tc4_bronze';

    const contracts = [
      { term: 'm2m', stdSell: stdM2M, premSell: premM2M, dattoStd: dattoStdLines[0] ?? '', dattoPrem: dattoPremLines[0] ?? '' },
      { term: '12m', stdSell: std12m, premSell: prem12m, dattoStd: dattoStdLines[1] ?? '', dattoPrem: dattoPremLines[1] ?? '' },
      { term: '24m', stdSell: std24m, premSell: prem24m, dattoStd: dattoStdLines[2] ?? '', dattoPrem: dattoPremLines[2] ?? '' },
      { term: '36m', stdSell: std36m, premSell: prem36m, dattoStd: dattoStdLines[3] ?? '', dattoPrem: dattoPremLines[3] ?? '' },
    ];

    for (const c of contracts) {
      if (c.stdSell !== null) {
        rows.push(makeRow(versionId, speedLabel, serviceType, 'standard', c.term, abbCost, c.stdSell, productCode, c.dattoStd, supportNote, 'all', carbonKey));
      }
      if (c.premSell !== null) {
        rows.push(makeRow(versionId, speedLabel, serviceType, 'premium', c.term, abbCost, c.premSell, productCode, c.dattoPrem, supportNote, 'all', carbonKey));
      }
    }
  }
  return rows;
}

// ─── Parse EE sheet ───────────────────────────────────────────────────────────
function parseEeSheet(ws, versionId) {
  const rows = [];
  for (let rowNum = 8; rowNum <= 48; rowNum++) {
    const row = ws.getRow(rowNum);
    const speed = num(row.getCell(1).value);
    if (speed === null || speed <= 0) continue;

    const ws12cbd = num(row.getCell(2).value);
    const ws12z13 = num(row.getCell(3).value);
    const ws24cbd = num(row.getCell(4).value);
    const ws24z13 = num(row.getCell(5).value);
    const ws36cbd = num(row.getCell(6).value);
    const ws36z13 = num(row.getCell(7).value);
    const sell36cbd = num(row.getCell(10).value);
    const sell36z13 = num(row.getCell(11).value);

    if (sell36cbd === null && sell36z13 === null) continue;

    const contracts = [
      { term: '12m', cbdCost: ws12cbd, z13Cost: ws12z13 },
      { term: '24m', cbdCost: ws24cbd, z13Cost: ws24z13 },
      { term: '36m', cbdCost: ws36cbd, z13Cost: ws36z13 },
    ];

    for (const c of contracts) {
      if (c.cbdCost !== null && sell36cbd !== null) {
        rows.push(makeRow(versionId, `EE ${speed}Mbps`, 'ee', 'standard', c.term, c.cbdCost, sell36cbd, '', '', '', 'cbd', 'ee'));
      }
      if (c.z13Cost !== null && sell36z13 !== null) {
        rows.push(makeRow(versionId, `EE ${speed}Mbps`, 'ee', 'standard', c.term, c.z13Cost, sell36z13, '', '', '', 'z1-z3', 'ee'));
      }
    }
  }
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const conn = await createConnection(process.env.DATABASE_URL);

const filePath = '/home/ubuntu/upload/ABBEEandTC4InternetCustomerPricing-IssueMay-25.xlsx';
const buffer = readFileSync(filePath);

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);

// Insert version
const label = 'ABB TC4 + EE May 2025';
const effectiveDate = '2025-05-01';
const sourceFile = 'ABBEEandTC4InternetCustomerPricing-IssueMay-25.xlsx';
const importedBy = 'system-reimport';

const [versionResult] = await conn.execute(
  'INSERT INTO internet_pricebook_versions (label, sourceFile, effectiveDate, importedBy) VALUES (?, ?, ?, ?)',
  [label, sourceFile, effectiveDate, importedBy]
);
const versionId = versionResult.insertId;
console.log('Created version:', versionId);

// Parse sheets
const tc4Sheet = workbook.getWorksheet('ABB TC4 Pricing');
const eeSheet = workbook.getWorksheet('Aussie BB EE Pricing');

const allRows = [];
if (tc4Sheet) allRows.push(...parseTc4Sheet(tc4Sheet, versionId));
if (eeSheet) allRows.push(...parseEeSheet(eeSheet, versionId));

console.log('Total rows to insert:', allRows.length);
console.log('  TC4:', allRows.filter(r => r.serviceType !== 'ee').length);
console.log('  EE:', allRows.filter(r => r.serviceType === 'ee').length);

// Bulk insert in batches of 50
const batchSize = 50;
let inserted = 0;
for (let i = 0; i < allRows.length; i += batchSize) {
  const batch = allRows.slice(i, i + batchSize);
  const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
  const values = [];
  for (const r of batch) {
    values.push(r.versionId, r.productCode, r.speedTier, r.serviceType, r.supportTier,
      r.contractTerm, r.zone, r.supportNote, r.dattoProductName,
      r.wholesaleCost, r.sellPrice, r.grossProfit, r.marginPercent,
      r.carbonPlanName, r.lowMarginFlag, 20.00);
  }
  await conn.execute(
    `INSERT INTO internet_pricebook_items (versionId, productCode, speedTier, serviceType, supportTier, contractTerm, zone, supportNote, dattoProductName, wholesaleCost, sellPrice, grossProfit, marginPercent, carbonPlanName, lowMarginFlag, lowMarginThreshold) VALUES ${placeholders}`,
    values
  );
  inserted += batch.length;
}

console.log('Inserted:', inserted, 'rows');
await conn.end();
console.log('Done!');
