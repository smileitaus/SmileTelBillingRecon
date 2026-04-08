/**
 * billingItemParser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracts structured attributes from billing line item descriptions using
 * regex / fuzzy pattern matching.
 *
 * Attributes extracted:
 *   parsedSpeedTier        — e.g. "50/20", "100/40", "25/10", "250/250"
 *   parsedContractMonths   — integer months; 0 = month-to-month; null = unknown
 *   parsedServiceStartDate — ISO date string from "Starting: DD-Mon-YYYY"
 *   parsedServiceEndDate   — ISO date string from "Ending: DD-Mon-YYYY"
 *   parsedAvcId            — e.g. "AVC000146482523"
 *   parsedHardwareStatus   — "included" | "byod" | "rental" | "one_time" | ""
 *   parsedSipChannels      — integer number of SIP channels, or null
 *   parsedDataAllowance    — "unlimited" | "NNgb" e.g. "10gb", "1000gb"
 *   parsedHas4gBackup      — boolean
 *   parsedAttributes       — JSON string of the full extracted object
 */

export interface ParsedBillingAttributes {
  parsedSpeedTier: string;
  parsedContractMonths: number | null;
  parsedServiceStartDate: string;
  parsedServiceEndDate: string;
  parsedAvcId: string;
  parsedHardwareStatus: string;
  parsedSipChannels: number | null;
  parsedDataAllowance: string;
  parsedHas4gBackup: boolean;
  parsedAttributes: string;
}

// Month name → zero-based index map for date parsing
const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a date string in the format "DD-Mon-YYYY" or "DD/MM/YYYY" or "DD/MM/YY"
 * Returns ISO date string "YYYY-MM-DD" or empty string if unparseable.
 */
function parseDateString(raw: string): string {
  // DD-Mon-YYYY  e.g. "01-Feb-2026"
  const dmy = raw.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = MONTH_MAP[dmy[2].toLowerCase()];
    if (month !== undefined) {
      return `${dmy[3]}-${String(month + 1).padStart(2, "0")}-${day}`;
    }
  }
  // DD/MM/YYYY or DD/MM/YY
  const slash = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }
  return "";
}

/**
 * Main parser: extracts structured attributes from a billing item description.
 */
export function parseBillingDescription(description: string): ParsedBillingAttributes {
  const d = description || "";

  // ── Speed Tier ──────────────────────────────────────────────────────────────
  // Match patterns like 50/20, 100/40, 25/10, 250/250, 1000/50
  // Avoid matching dates like 01/02/2026 by requiring both sides < 5 digits
  let parsedSpeedTier = "";
  const speedMatch = d.match(/\b(\d{1,4})\/(\d{1,4})\s*(?:Mbps|mbps|mb|Mb)?(?:\s|,|\.|-|$)/);
  if (speedMatch) {
    const down = parseInt(speedMatch[1], 10);
    const up = parseInt(speedMatch[2], 10);
    // Sanity check: speeds should be reasonable (1–10000 Mbps) and not look like a date
    if (down >= 1 && down <= 10000 && up >= 1 && up <= 10000 && !(down <= 31 && up <= 12)) {
      parsedSpeedTier = `${down}/${up}`;
    }
  }
  // Also match "FIBRE400/36" style (down/up without space)
  if (!parsedSpeedTier) {
    const fibreMatch = d.match(/FIBRE(\d+)\/(\d+)/i);
    if (fibreMatch) {
      parsedSpeedTier = `${fibreMatch[1]}/${fibreMatch[2]}`;
    }
  }

  // ── Contract Length ──────────────────────────────────────────────────────────
  let parsedContractMonths: number | null = null;
  // "month to month" or "M2M" or "month-to-month" = 0
  if (/month[\s-]to[\s-]month|m2m\b/i.test(d)) {
    parsedContractMonths = 0;
  } else {
    // "36 month", "36 months", "36-month", "36 Month Contract", "36 Months"
    const monthMatch = d.match(/\b(\d{1,3})\s*[-]?\s*months?\b/i);
    if (monthMatch) {
      const months = parseInt(monthMatch[1], 10);
      // Sanity: reasonable contract lengths 1–120 months
      if (months >= 1 && months <= 120) {
        parsedContractMonths = months;
      }
    }
    // "N year" / "N years" → convert to months
    if (parsedContractMonths === null) {
      const yearMatch = d.match(/\b(\d{1,2})\s*years?\b/i);
      if (yearMatch) {
        const years = parseInt(yearMatch[1], 10);
        if (years >= 1 && years <= 10) {
          parsedContractMonths = years * 12;
        }
      }
    }
  }

  // ── Service Start Date ───────────────────────────────────────────────────────
  let parsedServiceStartDate = "";
  const startMatch = d.match(/Starting:\s*([^\.\n,]+)/i);
  if (startMatch) {
    parsedServiceStartDate = parseDateString(startMatch[1].trim());
  }
  // Also handle "Start Date: DD/MM/YYYY"
  if (!parsedServiceStartDate) {
    const startDateMatch = d.match(/Start\s*Date:\s*([^\.\n,]+)/i);
    if (startDateMatch) {
      parsedServiceStartDate = parseDateString(startDateMatch[1].trim());
    }
  }

  // ── Service End Date ─────────────────────────────────────────────────────────
  let parsedServiceEndDate = "";
  const endMatch = d.match(/Ending:\s*([^\.\n,]+)/i);
  if (endMatch) {
    parsedServiceEndDate = parseDateString(endMatch[1].trim());
  }
  // "Contract End Date: DD/MM/YY"
  if (!parsedServiceEndDate) {
    const endDateMatch = d.match(/Contract\s*End\s*Date:\s*([^\.\n,]+)/i);
    if (endDateMatch) {
      parsedServiceEndDate = parseDateString(endDateMatch[1].trim());
    }
  }
  // "Plan End DD/MM/YYYY"
  if (!parsedServiceEndDate) {
    const planEndMatch = d.match(/Plan\s*End\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (planEndMatch) {
      parsedServiceEndDate = parseDateString(planEndMatch[1].trim());
    }
  }

  // ── AVC ID ───────────────────────────────────────────────────────────────────
  let parsedAvcId = "";
  const avcMatch = d.match(/\b(AVC\d{9,})\b/i);
  if (avcMatch) {
    parsedAvcId = avcMatch[1].toUpperCase();
  }

  // ── Hardware Status ──────────────────────────────────────────────────────────
  let parsedHardwareStatus = "";
  if (/\bBYOD\b/i.test(d)) {
    parsedHardwareStatus = "byod";
  } else if (/HWD\s*INC\b|hardware\s*included|hardware\s*supplied|SmileTel\s*Hardware|Business\s*Grade\s*Hardware|omada\s*router|TP-Link|VPN\s*Router|Voip\s*gateway/i.test(d)) {
    parsedHardwareStatus = "included";
  } else if (/\brental\b|\bRental\b|# Rental/i.test(d)) {
    parsedHardwareStatus = "rental";
  } else if (/\bone[\s-]time\b|one time|install|Installation/i.test(d)) {
    parsedHardwareStatus = "one_time";
  }

  // ── SIP Channels ─────────────────────────────────────────────────────────────
  let parsedSipChannels: number | null = null;
  const sipMatch = d.match(/\b(\d+)\s*(?:x\s*)?(?:Channel|Channels|SIP\s*Channel|SIP\s*Trunk)\b/i);
  if (sipMatch) {
    const ch = parseInt(sipMatch[1], 10);
    if (ch >= 1 && ch <= 1000) {
      parsedSipChannels = ch;
    }
  }
  // "Teams Voice SIP Trunk" without a number = 1 trunk
  if (parsedSipChannels === null && /SIP\s*Trunk/i.test(d) && !/\d+\s*(?:Channel|SIP\s*Trunk)/i.test(d)) {
    parsedSipChannels = 1;
  }

  // ── Data Allowance ───────────────────────────────────────────────────────────
  let parsedDataAllowance = "";
  if (/\bUnlimited\b/i.test(d)) {
    parsedDataAllowance = "unlimited";
  } else {
    // "100GB", "100 GB", "100Gb", "1000 GB", "50GB"
    const dataMatch = d.match(/\b(\d+)\s*GB\b/i);
    if (dataMatch) {
      parsedDataAllowance = `${dataMatch[1]}gb`;
    }
  }

  // ── 4G Backup ────────────────────────────────────────────────────────────────
  const parsedHas4gBackup = /4G\s*Back[\s-]?up|4G\s*Backup|4G\s*SIM\s*Backup|4G\s*Backup\s*SIM/i.test(d);

  // ── Build parsedAttributes JSON ───────────────────────────────────────────────
  const attrs: Record<string, unknown> = {};
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
    parsedAttributes: Object.keys(attrs).length > 0 ? JSON.stringify(attrs) : "",
  };
}
