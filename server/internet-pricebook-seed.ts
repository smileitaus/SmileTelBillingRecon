/**
 * Internet Pricebook Seeder
 * Parses ABBEEandTC4InternetCustomerPricing-IssueMay-25.xlsx and inserts
 * a versioned set of internet_pricebook_items rows.
 *
 * Exported function: parseInternetPricebook(buffer, label, effectiveDate)
 * Returns: { versionId, items[] }
 */

import ExcelJS from 'exceljs';
import { sql } from 'drizzle-orm';
import { getDb } from './db';

// ─── Carbon plan name mapping ────────────────────────────────────────────────
// Maps speed tier strings to the Carbon API plan name for live cost validation
const CARBON_PLAN_MAP: Record<string, string> = {
  '12/1':           'Wholesale NBN 25Mbps/10Mbps',   // closest available
  '25/10':          'Wholesale NBN 25Mbps/10Mbps',
  '50/20':          'Wholesale NBN 50Mbps/20Mbps ',   // note trailing space in API
  '100/40':         'Wholesale NBN 100Mbps/40Mbps',
  '100/20':         'Wholesale NBN 100Mbps/40Mbps',   // same tier in Carbon
  '250/25':         'Wholesale NBN 250Mbps/100Mbps',  // closest available
  '250/100':        'Wholesale NBN 250Mbps/100Mbps',
  '500/200':        'Wholesale NBN 500Mbps/200Mbps',
  '500/50':         'Wholesale NBN 500Mbps/50Mbps',
  '750/50':         'Wholesale NBN 750Mbps/50Mbps',
  '1000/400':       'Wholesale NBN 1000Mbps/400Mbps',
  '500-1000/50':    'Wholesale NBN 750Mbps/50Mbps',   // Home Ultra Fast
  '2000/200':       'Wholesale NBN 1000Mbps/400Mbps', // closest available
  '2000/500':       'Wholesale NBN 1000Mbps/400Mbps', // closest available
  'fw_plus':        'Wholesale NBN Fixed Wireless Plus ',
  'fw_ent_plus':    'Wholesale NBN FW Home Fast 250Mbps/20Mbps',
  'ee':             'NBN Enterprise Ethernet',
};

// ─── Low-margin thresholds ───────────────────────────────────────────────────
const WARN_THRESHOLD = 0.20;   // < 20% = warning flag (1)
const CRIT_THRESHOLD = 0.10;   // < 10% = critical flag (2)

function lowMarginFlag(margin: number): number {
  if (margin < CRIT_THRESHOLD) return 2;
  if (margin < WARN_THRESHOLD) return 1;
  return 0;
}

// ─── Helper: clean numeric cell value ────────────────────────────────────────
// ExcelJS returns formula cells as { formula: string, result: number } objects.
// We must extract .result to get the computed value.
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  // Handle ExcelJS formula cell objects: { formula, result }
  if (typeof v === 'object' && v !== null && 'result' in v) {
    const r = (v as { result: unknown }).result;
    if (r === null || r === undefined) return null;
    const n = typeof r === 'number' ? r : parseFloat(String(r));
    return isNaN(n) ? null : n;
  }
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  // Handle ExcelJS formula cell objects
  if (typeof v === 'object' && v !== null && 'result' in v) {
    const r = (v as { result: unknown }).result;
    return r === null || r === undefined ? '' : String(r).trim();
  }
  return String(v).trim();
}

// ─── Row builder ─────────────────────────────────────────────────────────────
interface PricebookRow {
  versionId: number;
  productCode: string;
  speedTier: string;
  serviceType: string;
  supportTier: string;
  contractTerm: string;
  zone: string;
  supportNote: string;
  dattoProductName: string;
  wholesaleCost: string;
  sellPrice: string;
  grossProfit: string;
  marginPercent: string;
  carbonPlanName: string;
  lowMarginFlag: number;
}

function makeRow(
  versionId: number,
  speedTier: string,
  serviceType: string,
  supportTier: string,
  contractTerm: string,
  wholesaleCost: number,
  sellPrice: number,
  productCode: string,
  dattoProductName: string,
  supportNote: string,
  zone = 'all',
  carbonKey?: string,
): PricebookRow {
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

// ─── Parse ABB TC4 Pricing sheet ─────────────────────────────────────────────
async function parseTc4Sheet(ws: ExcelJS.Worksheet, versionId: number): Promise<PricebookRow[]> {
  const rows: PricebookRow[] = [];

  // Data starts at row 6 (0-indexed: row index 5)
  // Column layout (1-indexed):
  //  1  = speed tier label
  //  2  = ABB wholesale cost (M2M)
  //  3  = Opticom wholesale cost (M2M)  — may be null
  //  4  = gold/support note
  //  5  = ABB RRP (not used — we use SmileTel sell prices)
  //  6  = ABB disc% (not used)
  //  7  = Opticom RRP (not used)
  //  8  = product code
  //  9  = speed tier display (internal)
  // 10  = Datto product name (Standard, multi-line: M2M\n12m\n24m\n36m)
  // 11  = SmileTel Standard M2M sell price
  // 12  = SmileTel Standard 12m sell price
  // 13  = SmileTel Standard 24m sell price
  // 14  = SmileTel Standard 36m sell price
  // 16  = Datto product name (Premium, multi-line)
  // 17  = SmileTel Premium M2M sell price
  // 18  = SmileTel Premium 12m sell price
  // 19  = SmileTel Premium 24m sell price
  // 20  = SmileTel Premium 36m sell price

  for (let rowNum = 6; rowNum <= 22; rowNum++) {
    const row = ws.getRow(rowNum);
    const speedLabel = str(row.getCell(1).value);
    if (!speedLabel) continue;

    const abbCost = num(row.getCell(2).value);
    const supportNote = str(row.getCell(4).value);
    const productCode = str(row.getCell(8).value);

    // Datto product names (multi-line strings, split by newline)
    const dattoStdRaw = str(row.getCell(10).value);
    const dattoPremRaw = str(row.getCell(16).value);
    const dattoStdLines = dattoStdRaw.split('\n').map(s => s.trim()).filter(Boolean);
    const dattoPremLines = dattoPremRaw.split('\n').map(s => s.trim()).filter(Boolean);

    // Sell prices
    const stdM2M = num(row.getCell(11).value);
    const std12m = num(row.getCell(12).value);
    const std24m = num(row.getCell(13).value);
    const std36m = num(row.getCell(14).value);
    const premM2M = num(row.getCell(17).value);
    const prem12m = num(row.getCell(18).value);
    const prem24m = num(row.getCell(19).value);
    const prem36m = num(row.getCell(20).value);

    if (abbCost === null) continue;

    // Determine carbon key from speed tier
    const speedKey = speedLabel.replace(' Unmetered', '').replace(' (Bronze)', '').replace(' (Gold)', '').replace(' (Home Ultra Fast)', '').replace(' Mbps (HFC & FTTP)', '').trim();
    const isFwPlus = speedLabel.includes('Fixed Wireless Plus');
    const isFwEnt = speedLabel.includes('Enterprise');
    const carbonKey = isFwPlus ? 'fw_plus' : isFwEnt ? 'fw_ent_plus' : speedKey;

    // Determine service type
    let serviceType = 'tc4';
    if (isFwPlus) serviceType = 'fw_plus';
    else if (isFwEnt) serviceType = 'fw_ent_plus';
    else if (speedLabel.includes('Home Ultra Fast')) serviceType = 'tc4_home_ultrafast';
    else if (supportNote.includes('Gold')) serviceType = 'tc4_gold';
    else if (supportNote.includes('Bronze')) serviceType = 'tc4_bronze';

    const contracts: Array<{ term: string; stdSell: number | null; premSell: number | null; dattoStd: string; dattoPrem: string }> = [
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

// ─── Parse Svc Price table sheet (Standard + Premium reference) ──────────────
async function parseSvcPriceTable(ws: ExcelJS.Worksheet, versionId: number): Promise<PricebookRow[]> {
  const rows: PricebookRow[] = [];

  // Standard Support section: rows 5-11 (header at row 5, data rows 6-11)
  // Premium Support section: rows 15-21 (header at row 15, data rows 16-22)
  // Columns: B=speed, C=M2M, D=12m, E=24m, F=36m

  const sections = [
    { startRow: 6, endRow: 12, supportTier: 'standard' },
    { startRow: 16, endRow: 23, supportTier: 'premium' },
  ];

  for (const section of sections) {
    for (let rowNum = section.startRow; rowNum <= section.endRow; rowNum++) {
      const row = ws.getRow(rowNum);
      const speedLabel = str(row.getCell(2).value).trim();
      if (!speedLabel || speedLabel.startsWith('Built') || speedLabel.startsWith('For') || speedLabel.startsWith('Smiletel')) continue;

      const m2m = num(row.getCell(3).value);
      const r12m = num(row.getCell(4).value);
      const r24m = num(row.getCell(5).value);
      const r36m = num(row.getCell(6).value);

      // This sheet only has sell prices, not wholesale costs — skip (TC4 sheet has full data)
      // We use this sheet only to cross-validate, not to seed
      void m2m; void r12m; void r24m; void r36m;
    }
  }

  return rows; // intentionally empty — TC4 sheet is authoritative
}

// ─── Parse Aussie BB EE Pricing sheet ────────────────────────────────────────
async function parseEeSheet(ws: ExcelJS.Worksheet, versionId: number): Promise<PricebookRow[]> {
  const rows: PricebookRow[] = [];

  // Column layout (1-indexed) confirmed from spreadsheet inspection:
  //  1 = speed (Mbps)
  //  2 = wholesale 12m CBD
  //  3 = wholesale 12m Z1-Z3
  //  4 = wholesale 24m CBD
  //  5 = wholesale 24m Z1-Z3
  //  6 = wholesale 36m CBD
  //  7 = wholesale 36m Z1-Z3
  // 10 = SmileTel sell price CBD (36m reference, formula cell)
  // 11 = SmileTel sell price Z1-Z3 (36m reference, formula cell)
  // Note: sell prices in cols 10/11 are 36m reference prices.
  //       For 12m/24m we use the same sell price (conservative — EE pricing is
  //       typically quoted at 36m; shorter terms are negotiated separately).

  for (let rowNum = 8; rowNum <= 48; rowNum++) {
    const row = ws.getRow(rowNum);
    const speed = num(row.getCell(1).value);
    if (speed === null || speed <= 0) continue;

    // Wholesale costs by contract term and zone
    const ws12cbd = num(row.getCell(2).value);
    const ws12z13 = num(row.getCell(3).value);
    const ws24cbd = num(row.getCell(4).value);
    const ws24z13 = num(row.getCell(5).value);
    const ws36cbd = num(row.getCell(6).value);
    const ws36z13 = num(row.getCell(7).value);

    // SmileTel sell prices (formula cells — use .result via num() helper)
    const sell36cbd = num(row.getCell(10).value);
    const sell36z13 = num(row.getCell(11).value);

    // Only seed rows where we have at least one wholesale cost and a sell price
    if (sell36cbd === null && sell36z13 === null) continue;

    const contracts = [
      { term: '12m', cbdCost: ws12cbd, z13Cost: ws12z13 },
      { term: '24m', cbdCost: ws24cbd, z13Cost: ws24z13 },
      { term: '36m', cbdCost: ws36cbd, z13Cost: ws36z13 },
    ];

    for (const c of contracts) {
      // CBD zone
      if (c.cbdCost !== null && sell36cbd !== null) {
        rows.push(makeRow(versionId, `EE ${speed}Mbps`, 'ee', 'standard', c.term, c.cbdCost, sell36cbd, '', '', '', 'cbd', 'ee'));
      }
      // Z1-Z3 zone
      if (c.z13Cost !== null && sell36z13 !== null) {
        rows.push(makeRow(versionId, `EE ${speed}Mbps`, 'ee', 'standard', c.term, c.z13Cost, sell36z13, '', '', '', 'z1-z3', 'ee'));
      }
    }
  }

  return rows;
}

// ─── Parse Opticom pricing Residential sheet ─────────────────────────────────
async function parseOpticomSheet(ws: ExcelJS.Worksheet, versionId: number): Promise<PricebookRow[]> {
  const rows: PricebookRow[] = [];

  // Row 3: headers — Standard Support Ex GST Monthly | 50/20 | 100/20 | 250/25
  // Row 5: M2M prices
  // Row 7: 12m prices
  // Row 9: 24m prices
  // Row 11: 36m prices
  // Columns: B=label, C=50/20, D=100/20, E=250/25

  const speedCols: Array<{ col: number; speed: string }> = [
    { col: 3, speed: '50/20' },
    { col: 5, speed: '100/20' },
    { col: 7, speed: '250/25' },
  ];

  const contractRows: Array<{ rowNum: number; term: string }> = [
    { rowNum: 5, term: 'm2m' },
    { rowNum: 7, term: '12m' },
    { rowNum: 9, term: '24m' },
    { rowNum: 11, term: '36m' },
  ];

  // We only have sell prices here, not wholesale costs — use as reference only
  // Opticom wholesale costs come from the TC4 sheet (col 3)
  // For now, skip seeding from this sheet to avoid duplicates
  void speedCols; void contractRows;

  return rows;
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function parseAndSeedInternetPricebook(
  buffer: Buffer | ArrayBuffer,
  label: string,
  effectiveDate: string,
  importedBy: string,
  sourceFile: string,
): Promise<{ versionId: number; itemCount: number }> {
  const db = await getDb();
  if (!db) throw new Error('[InternetPricebook] Database not available');

  const workbook = new ExcelJS.Workbook();
  // ExcelJS accepts Buffer or ArrayBuffer — cast to any to avoid strict Buffer<ArrayBufferLike> mismatch
  await workbook.xlsx.load(buffer as any);

  // Insert version record
  const [versionResult] = await db.execute(
    sql`INSERT INTO internet_pricebook_versions (label, sourceFile, effectiveDate, importedBy) VALUES (${label}, ${sourceFile}, ${effectiveDate}, ${importedBy})`
  ) as unknown as [{ insertId: number }, unknown];
  const versionId = (versionResult as { insertId: number }).insertId;

  const allRows: PricebookRow[] = [];

  // Parse TC4 sheet (primary)
  const tc4Sheet = workbook.getWorksheet('ABB TC4 Pricing');
  if (tc4Sheet) {
    const tc4Rows = await parseTc4Sheet(tc4Sheet, versionId);
    allRows.push(...tc4Rows);
  }

  // Parse EE sheet
  const eeSheet = workbook.getWorksheet('Aussie BB EE Pricing');
  if (eeSheet) {
    const eeRows = await parseEeSheet(eeSheet, versionId);
    allRows.push(...eeRows);
  }

  // Bulk insert all rows
  if (allRows.length > 0) {
    const placeholders = allRows.map(() =>
      '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).join(',');

    const values: unknown[] = [];
    for (const r of allRows) {
      values.push(
        r.versionId, r.productCode, r.speedTier, r.serviceType, r.supportTier,
        r.contractTerm, r.zone, r.supportNote, r.dattoProductName,
        r.wholesaleCost, r.sellPrice, r.grossProfit, r.marginPercent,
        r.carbonPlanName, r.lowMarginFlag, 20.00
      );
    }

    // Build a single sql template with all values to avoid the 2-argument execute issue
    const valueParts = allRows.map(r =>
      sql`(${r.versionId}, ${r.productCode}, ${r.speedTier}, ${r.serviceType}, ${r.supportTier}, ${r.contractTerm}, ${r.zone}, ${r.supportNote}, ${r.dattoProductName}, ${r.wholesaleCost}, ${r.sellPrice}, ${r.grossProfit}, ${r.marginPercent}, ${r.carbonPlanName}, ${r.lowMarginFlag}, 20.00)`
    );
    const insertQuery = sql`INSERT INTO internet_pricebook_items
      (versionId, productCode, speedTier, serviceType, supportTier, contractTerm, zone,
       supportNote, dattoProductName, wholesaleCost, sellPrice, grossProfit, marginPercent,
       carbonPlanName, lowMarginFlag, lowMarginThreshold)
     VALUES ${sql.join(valueParts, sql`, `)}`;
    await db.execute(insertQuery);
  }

  return { versionId, itemCount: allRows.length };
}
