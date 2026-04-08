/**
 * backfillBillingItemParser.mjs
 * Run with: node scripts/backfillBillingItemParser.mjs
 *
 * Reads all billing_items, runs the parser on each description,
 * and writes the extracted attributes back to the database.
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

// ── Inline parser (mirrors billingItemParser.ts) ──────────────────────────────
const MONTH_MAP = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDateString(raw) {
  const dmy = raw.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = MONTH_MAP[dmy[2].toLowerCase()];
    if (month !== undefined) return `${dmy[3]}-${String(month + 1).padStart(2, "0")}-${day}`;
  }
  const slash = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }
  return "";
}

function parseBillingDescription(description) {
  const d = description || "";

  // Speed Tier
  let parsedSpeedTier = "";
  const speedMatch = d.match(/\b(\d{1,4})\/(\d{1,4})\s*(?:Mbps|mbps|mb|Mb)?(?:\s|,|\.|-|$)/);
  if (speedMatch) {
    const down = parseInt(speedMatch[1], 10);
    const up = parseInt(speedMatch[2], 10);
    if (down >= 1 && down <= 10000 && up >= 1 && up <= 10000 && !(down <= 31 && up <= 12)) {
      parsedSpeedTier = `${down}/${up}`;
    }
  }
  if (!parsedSpeedTier) {
    const fibreMatch = d.match(/FIBRE(\d+)\/(\d+)/i);
    if (fibreMatch) parsedSpeedTier = `${fibreMatch[1]}/${fibreMatch[2]}`;
  }

  // Contract Length
  let parsedContractMonths = null;
  if (/month[\s-]to[\s-]month|m2m\b/i.test(d)) {
    parsedContractMonths = 0;
  } else {
    const monthMatch = d.match(/\b(\d{1,3})\s*[-]?\s*months?\b/i);
    if (monthMatch) {
      const months = parseInt(monthMatch[1], 10);
      if (months >= 1 && months <= 120) parsedContractMonths = months;
    }
    if (parsedContractMonths === null) {
      const yearMatch = d.match(/\b(\d{1,2})\s*years?\b/i);
      if (yearMatch) {
        const years = parseInt(yearMatch[1], 10);
        if (years >= 1 && years <= 10) parsedContractMonths = years * 12;
      }
    }
  }

  // Start Date
  let parsedServiceStartDate = "";
  const startMatch = d.match(/Starting:\s*([^\.\n,]+)/i);
  if (startMatch) parsedServiceStartDate = parseDateString(startMatch[1].trim());
  if (!parsedServiceStartDate) {
    const startDateMatch = d.match(/Start\s*Date:\s*([^\.\n,]+)/i);
    if (startDateMatch) parsedServiceStartDate = parseDateString(startDateMatch[1].trim());
  }

  // End Date
  let parsedServiceEndDate = "";
  const endMatch = d.match(/Ending:\s*([^\.\n,]+)/i);
  if (endMatch) parsedServiceEndDate = parseDateString(endMatch[1].trim());
  if (!parsedServiceEndDate) {
    const endDateMatch = d.match(/Contract\s*End\s*Date:\s*([^\.\n,]+)/i);
    if (endDateMatch) parsedServiceEndDate = parseDateString(endDateMatch[1].trim());
  }
  if (!parsedServiceEndDate) {
    const planEndMatch = d.match(/Plan\s*End\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (planEndMatch) parsedServiceEndDate = parseDateString(planEndMatch[1].trim());
  }

  // AVC ID
  let parsedAvcId = "";
  const avcMatch = d.match(/\b(AVC\d{9,})\b/i);
  if (avcMatch) parsedAvcId = avcMatch[1].toUpperCase();

  // Hardware Status
  let parsedHardwareStatus = "";
  if (/\bBYOD\b/i.test(d)) {
    parsedHardwareStatus = "byod";
  } else if (/HWD\s*INC\b|hardware\s*included|hardware\s*supplied|SmileTel\s*Hardware|Business\s*Grade\s*Hardware|omada\s*router|TP-Link|VPN\s*Router|Voip\s*gateway/i.test(d)) {
    parsedHardwareStatus = "included";
  } else if (/\brental\b|# Rental/i.test(d)) {
    parsedHardwareStatus = "rental";
  } else if (/\bone[\s-]time\b|one time|install|Installation/i.test(d)) {
    parsedHardwareStatus = "one_time";
  }

  // SIP Channels
  let parsedSipChannels = null;
  const sipMatch = d.match(/\b(\d+)\s*(?:x\s*)?(?:Channel|Channels|SIP\s*Channel|SIP\s*Trunk)\b/i);
  if (sipMatch) {
    const ch = parseInt(sipMatch[1], 10);
    if (ch >= 1 && ch <= 1000) parsedSipChannels = ch;
  }
  if (parsedSipChannels === null && /SIP\s*Trunk/i.test(d) && !/\d+\s*(?:Channel|SIP\s*Trunk)/i.test(d)) {
    parsedSipChannels = 1;
  }

  // Data Allowance
  let parsedDataAllowance = "";
  if (/\bUnlimited\b/i.test(d)) {
    parsedDataAllowance = "unlimited";
  } else {
    const dataMatch = d.match(/\b(\d+)\s*GB\b/i);
    if (dataMatch) parsedDataAllowance = `${dataMatch[1]}gb`;
  }

  // 4G Backup
  const parsedHas4gBackup = /4G\s*Back[\s-]?up|4G\s*Backup|4G\s*SIM\s*Backup|4G\s*Backup\s*SIM/i.test(d) ? 1 : 0;

  // parsedAttributes JSON
  const attrs = {};
  if (parsedSpeedTier) attrs.speedTier = parsedSpeedTier;
  if (parsedContractMonths !== null) attrs.contractMonths = parsedContractMonths;
  if (parsedServiceStartDate) attrs.serviceStartDate = parsedServiceStartDate;
  if (parsedServiceEndDate) attrs.serviceEndDate = parsedServiceEndDate;
  if (parsedAvcId) attrs.avcId = parsedAvcId;
  if (parsedHardwareStatus) attrs.hardwareStatus = parsedHardwareStatus;
  if (parsedSipChannels !== null) attrs.sipChannels = parsedSipChannels;
  if (parsedDataAllowance) attrs.dataAllowance = parsedDataAllowance;
  if (parsedHas4gBackup) attrs.has4gBackup = true;

  return {
    parsedSpeedTier,
    parsedContractMonths,
    parsedServiceStartDate,
    parsedServiceEndDate,
    parsedAvcId,
    parsedHardwareStatus,
    parsedSipChannels,
    parsedDataAllowance,
    parsedHas4gBackup,
    parsedAttributes: Object.keys(attrs).length > 0 ? JSON.stringify(attrs) : null,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const db = await createConnection(process.env.DATABASE_URL);
console.log("Connected to database");

const [rows] = await db.query("SELECT id, description FROM billing_items");
console.log(`Processing ${rows.length} billing items...`);

let updated = 0;
let withData = 0;
const BATCH = 200;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  for (const row of batch) {
    const p = parseBillingDescription(row.description);
    const hasData = p.parsedSpeedTier || p.parsedContractMonths !== null ||
      p.parsedServiceStartDate || p.parsedServiceEndDate || p.parsedAvcId ||
      p.parsedHardwareStatus || p.parsedSipChannels !== null ||
      p.parsedDataAllowance || p.parsedHas4gBackup;

    await db.execute(
      `UPDATE billing_items SET
        parsedSpeedTier = ?,
        parsedContractMonths = ?,
        parsedServiceStartDate = ?,
        parsedServiceEndDate = ?,
        parsedAvcId = ?,
        parsedHardwareStatus = ?,
        parsedSipChannels = ?,
        parsedDataAllowance = ?,
        parsedHas4gBackup = ?,
        parsedAttributes = ?
      WHERE id = ?`,
      [
        p.parsedSpeedTier || "",
        p.parsedContractMonths,
        p.parsedServiceStartDate || "",
        p.parsedServiceEndDate || "",
        p.parsedAvcId || "",
        p.parsedHardwareStatus || "",
        p.parsedSipChannels,
        p.parsedDataAllowance || "",
        p.parsedHas4gBackup,
        p.parsedAttributes,
        row.id,
      ]
    );
    updated++;
    if (hasData) withData++;
  }
  console.log(`  Processed ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
}

await db.end();
console.log(`\nDone! Updated ${updated} rows, ${withData} had extractable attributes.`);
