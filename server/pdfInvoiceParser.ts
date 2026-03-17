/**
 * Server-side PDF invoice parser for Channel Haus, Legion, Tech-e, Vine Direct, Infinet, Blitznet, and Exetel.
 * Uses pdf-parse v2 PDFParse class to extract text, then applies regex patterns to identify services.
 */
import { PDFParse } from "pdf-parse";

export interface ParsedPdfService {
  friendlyName: string;
  serviceId: string;
  serviceType: "Internet" | "Voice" | "Other";
  amountExGst: number;
  description: string;
  avcId?: string;
  address?: string;
}

export interface ParsedPdfInvoice {
  supplier: "ChannelHaus" | "Legion" | "Tech-e" | "VineDirect" | "Infinet" | "Blitznet" | "Exetel" | "Access4";
  invoiceNumber: string;
  invoiceDate: string;
  totalIncGst: number;
  services: ParsedPdfService[];
  // Access4-specific: enterprise-level breakdown
  enterprises?: Access4Enterprise[];
}

export interface Access4Enterprise {
  name: string;
  endpoints: number;
  endpointDelta: number;
  mrc: number;
  variable: number;
  onceOff: number;
  total: number;
  isInternal: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Remove blank lines and trim each line */
function compact(text: string): string {
  return text.split("\n").map(l => l.trim()).filter(l => l.length > 0).join("\n");
}

// ── Channel Haus Parser ───────────────────────────────────────────────────────

function parseChannelHaus(text: string): ParsedPdfInvoice {
  const invMatch = text.match(/Invoice:\s*(C\d+)/);
  const invoiceNumber = invMatch?.[1] || "UNKNOWN";
  const dateMatch = text.match(/Date:\s*(\d{2}\/\d{2}\/\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";
  const totalMatch = text.match(/ACCOUNT BALANCE\s*\$?([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));
  const services: ParsedPdfService[] = [];

  const serviceRegex =
    /Service:\s*(\S+)\s+Friendly Name:\s*([^\n$]+?)\s+\$([\d,]+\.\d{2})\s*\n([\s\S]*?)(?=Service:|Service Type:|$)/g;
  let match: RegExpExecArray | null;
  while ((match = serviceRegex.exec(text)) !== null) {
    const serviceId = match[1].trim();
    const friendlyName = match[2].trim();
    const amountIncGst = parseFloat(match[3].replace(/,/g, ""));
    const block = match[4];
    const avcMatch = block.match(/AVC ID:\s*(AVC\w+)/);
    const avcId = avcMatch?.[1];
    const addrMatch = block.match(/AVC ID:[^\n]*\n\s*([A-Z0-9][^\n]{5,60}(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4})/);
    const address = addrMatch?.[1]?.trim();
    let serviceType: "Internet" | "Voice" | "Other" = "Other";
    if (serviceId.startsWith("bsip_") || serviceId.startsWith("bsip") || block.toLowerCase().includes("sip") || block.toLowerCase().includes("voice") || block.toLowerCase().includes("pbx")) {
      serviceType = "Voice";
    } else if (avcId || block.toLowerCase().includes("nbn") || block.toLowerCase().includes("internet") || block.toLowerCase().includes("broadband")) {
      serviceType = "Internet";
    }
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;
    services.push({ friendlyName, serviceId, serviceType, amountExGst, description: block.split("\n").find(l => l.trim().length > 10 && !l.includes("AVC") && !l.includes("Starting"))?.trim() || "", avcId, address });
  }
  return { supplier: "ChannelHaus", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Legion Parser ─────────────────────────────────────────────────────────────

function parseLegion(text: string): ParsedPdfInvoice {
  const invMatch = text.match(/Invoice Number\s+(INV-\d+)/);
  const invoiceNumber = invMatch?.[1] || "UNKNOWN";
  const dateMatch = text.match(/Due Date:\s*(\d{1,2}\s+\w+\s+\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";
  const totalMatch = text.match(/TOTAL AUD\s+([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));
  const refMatch = text.match(/Reference\s+[\d]+ - (.+?)(?:\n|$)/);
  const customerRef = refMatch?.[1]?.trim() || "";
  const services: ParsedPdfService[] = [];
  const lineRegex = /LEGION\s+(.+?)\s+[\d.]+\s+([\d,]+\.\d{2})\s+\d+%\s+([\d,]+\.\d{2})/g;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(text)) !== null) {
    const desc = match[1].trim();
    const amountIncGst = parseFloat(match[3].replace(/,/g, ""));
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;
    services.push({ friendlyName: customerRef || desc, serviceId: `legion_${customerRef.toLowerCase().replace(/\s+/g, "_")}`, serviceType: "Internet", amountExGst, description: desc });
  }
  return { supplier: "Legion", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Tech-e Parser ─────────────────────────────────────────────────────────────

function parseTechE(text: string): ParsedPdfInvoice {
  const invMatch = text.match(/Invoice Number\s+(INV-\d+)/);
  const invoiceNumber = invMatch?.[1] || "UNKNOWN";
  const dateMatch = text.match(/Invoice Date\s+(\d{2}\s+\w+\s+\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";
  const totalMatch = text.match(/Invoice Total AUD\s+([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));
  const services: ParsedPdfService[] = [];
  const lineRegex = /\((\d+)\)\s+(.+?)\n(.+?-recurring fee)\s*\n\s*([\d.]+)\s+([\d,]+\.\d{2})\s+\d+%\s+([\d,]+\.\d{2})/g;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(text)) !== null) {
    const serviceCode = match[1];
    const planDesc = match[2].trim();
    const customerDesc = match[3].trim();
    const amountIncGst = parseFloat(match[6].replace(/,/g, ""));
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;
    const nameMatch = customerDesc.match(/\(([^)]+)\)/);
    const friendlyName = nameMatch?.[1] || customerDesc;
    services.push({ friendlyName, serviceId: `teche_${serviceCode}`, serviceType: "Internet", amountExGst, description: `${planDesc} — ${customerDesc}` });
  }
  return { supplier: "Tech-e", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Vine Direct Parser ────────────────────────────────────────────────────────
// Format: Page 2 lists customers as "Name (accountId) Address" then a single service line.
// The invoice has ONE service line for the combined total of all customers.
// We create one service entry per customer block found.

function parseVineDirect(text: string): ParsedPdfInvoice {
  const invMatch = text.match(/Invoice\s*#\s*(\d+)/);
  const invoiceNumber = invMatch?.[1] ? `VD-${invMatch[1]}` : "UNKNOWN";

  // Date: PDFParse compact text has "Invoice Date\n01-02-2026" (date immediately after)
  // or "Invoice Date\n[address line]\n01-02-2026" (date 2 lines after)
  const compactForDate = compact(text);
  const dateMatch = compactForDate.match(/Invoice Date\n(\d{2}-\d{2}-\d{4})/) ||
                    compactForDate.match(/Invoice Date\n[^\n]+\n(\d{2}-\d{2}-\d{4})/) ||
                    text.match(/Invoice Date\s*\n\s*(\d{2}-\d{2}-\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";

  // Total: PDFParse extracts "Total due by 08-02-2026 A$246.68" (inline, no newline)
  const totalMatch = text.match(/Total due by[^\n]+\s+A\$([\d,]+\.\d{2})/) ||
                     text.match(/Total due by[^\n]+\n\s*A\$([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));

  // Capture the ex-GST charges total from "Charges A$amount" (inline) or "Charges\nA$amount"
  const chargesMatch = text.match(/Charges\s+A\$([\d,]+\.\d{2})/) ||
                       text.match(/Charges\s*\n\s*A\$([\d,]+\.\d{2})/);
  const chargesExGst = chargesMatch ? parseFloat(chargesMatch[1].replace(/,/g, "")) : 0;

  const services: ParsedPdfService[] = [];
  const compactText = compact(text);
  const lines = compactText.split("\n");

  // Find customer blocks: PDFParse format has "Smile IT Pty Ltd (3744476)" on one line,
  // then address on next line(s). Also handles "Name (accountId) address" on one line.
  const customerBlocks: Array<{ name: string; accountId: string; address: string; lineIdx: number }> = [];
  // Pattern 1: "Name (accountId) address" all on one line
  const custRe1 = /^(.+?)\s+\((\d{7})\)\s+(.+)$/;
  // Pattern 2: "Name (accountId)" on one line, address on next
  const custRe2 = /^(.+?)\s+\((\d{7})\)$/;
  for (let i = 0; i < lines.length; i++) {
    const m1 = lines[i].match(custRe1);
    if (m1) {
      let address = m1[3].trim();
      // Address may continue on next line (e.g., "QLD 4558")
      if (i + 1 < lines.length && /^(QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(lines[i + 1])) {
        address += " " + lines[i + 1];
      }
      customerBlocks.push({ name: m1[1].trim(), accountId: m1[2], address, lineIdx: i });
      continue;
    }
    const m2 = lines[i].match(custRe2);
    if (m2) {
      // Address is on the next line(s)
      let address = "";
      if (i + 1 < lines.length) {
        address = lines[i + 1].trim();
        // May continue on next line
        if (i + 2 < lines.length && /^(QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4}$/.test(lines[i + 2])) {
          address += " " + lines[i + 2];
        }
      }
      customerBlocks.push({ name: m2[1].trim(), accountId: m2[2], address, lineIdx: i });
    }
  }

  // Find service line: "VW-xxx: description x N" or "VW-xxx: description x N A$amount" (inline)
  // PDFParse may merge the amount onto the same line
  const serviceRe = /^(VW-[A-Z0-9-]+):\s*(.+?)\s+x\s+\d+(?:\s+A\$([\d,]+\.\d{2}))?$/;
  let productCode = "";
  let serviceDescription = "";
  let totalAmountIncGst = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(serviceRe);
    if (!m) continue;
    productCode = m[1];
    serviceDescription = m[2].trim();
    // Amount may be inline or on next line
    if (m[3]) {
      totalAmountIncGst = parseFloat(m[3].replace(/,/g, ""));
    } else {
      // Find the amount on next lines
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const amtM = lines[j].match(/^A\$([\d,]+\.\d{2})$/);
        if (amtM) {
          totalAmountIncGst = parseFloat(amtM[1].replace(/,/g, ""));
          break;
        }
      }
    }
    break; // Only one service line expected
  }

  // If no service line found, use the total
  if (totalAmountIncGst === 0) totalAmountIncGst = totalIncGst;

  // Create one service entry per customer block
  // Split the total equally between all customers
  // Use chargesExGst (ex-GST total) if available, otherwise derive from totalIncGst
  const totalExGst = chargesExGst > 0 ? chargesExGst : Math.round((totalAmountIncGst / 1.1) * 100) / 100;
  if (customerBlocks.length > 0) {
    const perCustomerExGst = Math.round((totalExGst / customerBlocks.length) * 100) / 100;
    for (const cb of customerBlocks) {
      services.push({
        friendlyName: cb.name,
        serviceId: `vinedirect_${cb.accountId}`,
        serviceType: "Internet",
        amountExGst: perCustomerExGst,
        description: productCode ? `${productCode}: ${serviceDescription}` : "Vine Direct Internet",
        address: cb.address || undefined,
      });
    }
  } else if (totalExGst > 0) {
    // Fallback: single service entry with total
    services.push({
      friendlyName: "Vine Direct Customer",
      serviceId: `vinedirect_${invoiceNumber}`,
      serviceType: "Internet",
      amountExGst: totalExGst,
      description: productCode ? `${productCode}: ${serviceDescription}` : "Vine Direct Internet",
    });
  }

  return { supplier: "VineDirect", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Infinet Parser ────────────────────────────────────────────────────────────
// Format: Each field on its own line with blank lines between.
// The PDF uses Unicode ligature "ﬁ" (U+FB01) in "InﬁNET".
// We compact the text and parse line by line.

function parseInfinet(text: string): ParsedPdfInvoice {
  const invMatch = text.match(/Tax Invoice No\.:\s*\n?\s*(\S+)/);
  const invoiceNumber = invMatch?.[1] || "UNKNOWN";
  const dateMatch = text.match(/Date:\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";
  const totalMatch = text.match(/Total due:\s*([\d,]+\.\d{2})\s*\$/) ||
                     text.match(/TOTAL:\s*\n?\s*([\d,]+\.\d{2})\s*\$/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));

  const services: ParsedPdfService[] = [];
  const lines = compact(text).split("\n");

  // Match "InﬁNET ..." or "InfiNET ..." lines (the ligature ﬁ is U+FB01)
  // But skip "InﬁNET Broadband" (the company name line)
  const infinetPattern = /^In[fﬁ]i?NET\s+(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const lineMatch = lines[i].match(infinetPattern);
    if (!lineMatch) continue;

    let description = lineMatch[1].trim();

    // Skip the company name line "InﬁNET Broadband" and footer references
    if (description.toLowerCase() === "broadband") continue;
    if (description.toLowerCase().includes("accounts on 1300")) continue;

    // Remove date range in parentheses from description
    description = description.replace(/\s*\([^)]+\)\s*$/, "").trim();

    // Determine service type
    let serviceType: "Internet" | "Voice" | "Other" = "Internet";
    if (description.toLowerCase().includes("voip") || description.toLowerCase().includes("voice")) {
      serviceType = "Voice";
    }

    // Look ahead for service address, AVC ID, and amount
    let address: string | undefined;
    let avcId: string | undefined;
    let amountIncGst = 0;
    let foundAmount = false;

    for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
      const l = lines[j];

      if (l.startsWith("Service address:")) {
        address = l.replace("Service address:", "").trim();
        // May continue on next line
        if (j + 1 < lines.length && !lines[j + 1].match(/^(AVC ID:|Service address:|In[fﬁ]i?NET|#|\d+$|\d{2}\/\d{2}\/\d{4})/)) {
          address += " " + lines[j + 1].trim();
          j++;
        }
        continue;
      }

      if (l.startsWith("AVC ID:")) {
        avcId = l.replace("AVC ID:", "").trim();
        continue;
      }

      // PDFParse table row format: "1 53.64 $ 10.00 53.64 $ 59.00 $"
      // Extract the LAST dollar amount from the row (incl. GST total)
      const tableRowMatch = l.match(/^\d+\s+[\d,.]+\s+\$\s+[\d.]+\s+[\d,.]+\s+\$\s+([\d,.]+)\s+\$$/);
      if (tableRowMatch) {
        amountIncGst = parseFloat(tableRowMatch[1].replace(/,/g, ""));
        foundAmount = true;
        continue;
      }

      // Amount: "59.00 $" format (standalone line)
      const amountMatch = l.match(/^([\d,]+\.\d{2})\s*\$$/) || l.match(/^\$\s*([\d,]+\.\d{2})$/);
      if (amountMatch) {
        const val = parseFloat(amountMatch[1].replace(/,/g, ""));
        if (val > amountIncGst) amountIncGst = val; // take the largest (incl. GST)
        foundAmount = true;
        continue;
      }

      // Stop at next item or section (only after we've found the amount)
      if (foundAmount && (l.match(/^In[fﬁ]i?NET\s/) || l.match(/^Total Exclusive:/) ||
          l.match(/^INFINET BROADBAND/) || l.match(/^Voice categories/))) {
        break;
      }
      // Always stop at section headers even if no amount found yet
      if (l.match(/^Total Exclusive:/) || l.match(/^INFINET BROADBAND/)) {
        break;
      }
    }

    // Skip zero-cost VOIP service lines (VOIP services with $0 are included in the plan)
    // The VOIP lines in this invoice show call summaries with $0 — include them as $0 services
    // so they appear in the reconciliation. Don't skip them.
    // (Previously skipped zero-cost VOIP, but they represent real services)

    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;
    const friendlyName = address
      ? address.replace(/,\s*\d{4}$/, "").trim()
      : description;

    services.push({
      friendlyName,
      serviceId: `infinet_${invoiceNumber}_${i}`,
      serviceType,
      amountExGst,
      description: `InfiNET ${description}`,
      avcId,
      address,
    });
  }

  return { supplier: "Infinet", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Blitznet Parser ───────────────────────────────────────────────────────────
// Format: Simple invoice with blank lines between every field.
// Customer details section: "Blitznet\n\nSmileit\n\n4 Cornwallis St\n\n186 Victoria Rd\nMarrickville\n\nEveleigh\n2015"
// The Blitznet address comes first, then customer address.

function parseBlitznet(text: string): ParsedPdfInvoice {
  const invMatch = text.match(/Invoice number:\s*\n?\s*(\S+)/);
  const invoiceNumber = invMatch?.[1] || "UNKNOWN";
  const dateMatch = text.match(/Date:\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";
  const totalMatch = text.match(/Total:\s*\n?\s*\$\s*([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));

  const compactText = compact(text);
  const lines = compactText.split("\n");

  // Find customer address: it's after "Smileit" line
  // The layout is: "Blitznet" (supplier), "Smileit" (customer), then customer address lines
  // Then Blitznet's address follows
  let customerAddress: string | undefined;
  const smileIdx = lines.findIndex(l => l.toLowerCase() === "smileit");
  if (smileIdx >= 0) {
    const addrLines: string[] = [];
    for (let i = smileIdx + 1; i < Math.min(smileIdx + 6, lines.length); i++) {
      const l = lines[i];
      // Stop at postcode, "Australia", or "ABN"
      if (l.match(/^\d{4}$/) || l.match(/^Australia$/) || l.match(/^ABN/)) break;
      // Skip the Blitznet address (4 Cornwallis St, Marrickville)
      if (l.includes("Cornwallis") || l.includes("Marrickville")) continue;
      if (l.length > 2) addrLines.push(l);
    }
    if (addrLines.length > 0) {
      customerAddress = addrLines.join(", ");
    }
  }

  const services: ParsedPdfService[] = [];

  // Find the main internet plan line
  const planLineIdx = lines.findIndex(l => l.toLowerCase().startsWith("blitznet") && l.toLowerCase().includes("mbps"));
  if (planLineIdx >= 0) {
    const planDesc = lines[planLineIdx].trim();
    // Find the incl. total — look ahead for "$ amount" pattern
    let amountIncGst = 0;
    for (let i = planLineIdx + 1; i < Math.min(planLineIdx + 10, lines.length); i++) {
      const amtMatch = lines[i].match(/^\$\s*([\d,]+\.\d{2})$/);
      if (amtMatch) {
        const val = parseFloat(amtMatch[1].replace(/,/g, ""));
        if (val > amountIncGst) amountIncGst = val;
      }
    }
    if (amountIncGst === 0) amountIncGst = totalIncGst;
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;

    services.push({
      friendlyName: customerAddress ? customerAddress.replace(/,?\s*\d{4}$/, "").trim() : "Blitznet Service",
      serviceId: `blitznet_${invoiceNumber}`,
      serviceType: "Internet",
      amountExGst,
      description: planDesc,
      address: customerAddress,
    });

    // Also capture the static IP / add-on charge if present
    const staticIpIdx = lines.findIndex(l => l.toLowerCase().includes("manually assigned ip") || l.toLowerCase().includes("static ip"));
    if (staticIpIdx >= 0 && staticIpIdx !== planLineIdx) {
      let staticAmountIncGst = 0;
      for (let i = staticIpIdx + 1; i < Math.min(staticIpIdx + 10, lines.length); i++) {
        // Blitznet format: "$ 3.00" (with space after $)
        const amtMatch = lines[i].match(/^\$\s*([\d,]+\.\d{2})$/);
        if (amtMatch) { const val = parseFloat(amtMatch[1].replace(/,/g, "")); if (val > staticAmountIncGst) staticAmountIncGst = val; }
      }
      if (staticAmountIncGst > 0) {
        const staticAmountExGst = Math.round((staticAmountIncGst / 1.1) * 100) / 100;
        services.push({
          friendlyName: customerAddress ? customerAddress.replace(/,?\s*\d{4}$/, "").trim() : "Blitznet Service",
          serviceId: `blitznet_${invoiceNumber}_ip`,
          serviceType: "Other",
          amountExGst: staticAmountExGst,
          description: lines[staticIpIdx].trim(),
          address: customerAddress,
        });
      }
    }
  } else if (totalIncGst > 0) {
    const amountExGst = Math.round((totalIncGst / 1.1) * 100) / 100;
    services.push({
      friendlyName: customerAddress ? customerAddress.replace(/,?\s*\d{4}$/, "").trim() : "Blitznet Service",
      serviceId: `blitznet_${invoiceNumber}`,
      serviceType: "Internet",
      amountExGst,
      description: "BlitzNet Internet Service",
      address: customerAddress,
    });
  }

  return { supplier: "Blitznet", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Exetel PDF Parser ─────────────────────────────────────────────────────────
// Format: "Your Service Summary" section with service blocks.
// CORRECT ALGORITHM:
// For each service block, the block-level Sub Total is the LAST Sub Total that appears
// before the FIRST PLAN LINE of the next block ("Monthly Charge...", "Anniversary billing...").
// The amount is the next non-page-header, non-service-header dollar amount after the Sub Total.
// This handles the page-break pattern where the Sub Total and its amount are separated by
// page headers or even the next block's header.

function parseExetelPdf(text: string): ParsedPdfInvoice {
  // Use compact text for header parsing (blank lines cause regex issues)
  const ct = compact(text);

  // Invoice number: PDFParse compact text has "1 Feb 2026 83030747 319206 SMILE IT $7,394.67 2 Feb 2026"
  // The invoice ID is the number in the account summary table row
  const invMatch = ct.match(/Invoice Number:\n(?:[^\n]*\n){0,5}(E\d{8,})/) ||
                   ct.match(/\b(E\d{8,})\b/);
  const invoiceNumber = invMatch?.[1] || (() => {
    // fallback: extract invoice ID from account summary table row
    // Format: "1 Feb 2026 83030747 319206 SMILE IT $7,394.67 2 Feb 2026"
    const m = ct.match(/\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+(\d{7,})\s+\d+/);
    return m ? `E${m[1]}` : "UNKNOWN";
  })();

  // Date: find first date in the invoice header area
  const dateMatches: string[] = [];
  const directRe = /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\b/g;
  let dm: RegExpExecArray | null;
  while ((dm = directRe.exec(ct.slice(0, 3000))) !== null) dateMatches.push(dm[1]);
  const invoiceDate = dateMatches[0] || "";

  // Total: PDFParse extracts "Total Amount Due $7,394.67" (inline) or "Total Owing: $amount"
  const totalStr = ct.match(/Total Owing[:\s]+\$([\d,]+\.\d{2})/) ||
                   ct.match(/Total Amount Due \$([\d,]+\.\d{2})/);
  const totalIncGst = totalStr ? parseFloat(totalStr[1].replace(/,/g, "")) : 0;

  const services: ParsedPdfService[] = [];

  // Work on the compact version of the service summary section
  const summaryStart = text.indexOf("Your Service Summary");
  if (summaryStart < 0) return { supplier: "Exetel", invoiceNumber, invoiceDate, totalIncGst, services };

  const summaryText = text.slice(summaryStart);
  const compactLines = compact(summaryText).split("\n");

  interface ExetelBlock {
    lineIdx: number;
    serviceNumber: string;
    category: string;
    address: string;
    friendlyName: string;
    avcId?: string;
    plan: string;
    amount: number;
    firstPlanLine: number; // index of first plan line in this block
  }

  // PDFParse format: header+address on ONE line, Sub Total inline as "Sub Total $109.00"
  // e.g. "Broadband - 0701561050 UNIT 1A/ 60 ENTERPRISE PLACE, TINGALPA QLD 4173"
  // e.g. "Sub Total $109.00"

  const isPageHeader = (l: string) =>
    /^(Home:|Copyright|Level 9|Sydney NSW|ABN 35|Page \d+ of \d+|Powered by TCPDF|--)/.test(l);

  // Match service block header (with or without address on same line)
  const serviceHeaderRe = /^(Broadband|Corporate)\s+-\s+(\d+)(?:\s+(.+))?$/;

  // Pass 1: collect all service block headers
  const headers: Array<{ lineIdx: number; category: string; serviceNumber: string; addressOnHeader: string }> = [];
  for (let i = 0; i < compactLines.length; i++) {
    const line = compactLines[i];
    if (isPageHeader(line)) continue;
    const m = line.match(serviceHeaderRe);
    if (m) {
      headers.push({ lineIdx: i, category: m[1], serviceNumber: m[2], addressOnHeader: m[3]?.trim() || "" });
    }
    // Stop at Others section
    if (/^Others\s+-\s+\d+/.test(line)) break;
  }

  // Pass 2: for each block, find the Sub Total amount
  // PDFParse inline format: "Sub Total $109.00" on one line
  const blocks: ExetelBlock[] = [];
  for (let hi = 0; hi < headers.length; hi++) {
    const h = headers[hi];
    const nextH = headers[hi + 1];
    const blockEndLine = nextH ? nextH.lineIdx : compactLines.length;

    const block: ExetelBlock = {
      lineIdx: h.lineIdx,
      serviceNumber: h.serviceNumber,
      category: h.category,
      address: h.addressOnHeader,
      friendlyName: "",
      plan: "",
      amount: 0,
      firstPlanLine: h.lineIdx,
    };

    // Collect metadata and find Sub Total within this block's range
    for (let i = h.lineIdx + 1; i < blockEndLine; i++) {
      const line = compactLines[i];
      if (isPageHeader(line)) continue;

      // Friendly name: "(BCG Engineering backup)"
      if (!block.friendlyName && /^\([^)]+\)$/.test(line)) {
        block.friendlyName = line.slice(1, -1).trim();
        continue;
      }

      // AVC ID: "AVC ID - AVC000140707958"
      if (line.startsWith("AVC ID -")) {
        block.avcId = line.replace("AVC ID -", "").trim();
        continue;
      }

      // Sub Total inline: "Sub Total $109.00" or "Sub Total $1,300.00"
      const subTotalMatch = line.match(/^Sub Total \$([\d,]+\.\d{2})$/);
      if (subTotalMatch) {
        const val = parseFloat(subTotalMatch[1].replace(/,/g, ""));
        if (val > block.amount) block.amount = val; // take the largest Sub Total (block-level)
        continue;
      }

      // Plan description: first Monthly Charge line
      if (!block.plan && /^(Monthly Charge|Monthly Internet Charge|Anniversary billing)/.test(line)) {
        // Extract plan name from "Monthly Charge On Plan XYZ - $0.00 1 Feb 2026..."
        const planM = line.match(/^(?:Monthly (?:Charge|Internet Charge) On Plan|Anniversary billing for)\s+(.+?)\s+(?:\d{1,2}\s+\w+\s+\d{4}|\$[\d,])/);
        if (planM) block.plan = planM[1].trim();
        else block.plan = line;
      }
    }

    if (block.amount > 0) blocks.push(block);
  }

  // Convert blocks to services
  for (const block of blocks) {
    const amountExGst = Math.round((block.amount / 1.1) * 100) / 100;
    services.push({
      friendlyName: block.friendlyName || block.address || block.serviceNumber,
      serviceId: block.serviceNumber,
      serviceType: "Internet",
      amountExGst,
      description: block.plan || `${block.category} ${block.serviceNumber}`,
      avcId: block.avcId,
      address: block.address || undefined,
    });
  }

  return { supplier: "Exetel", invoiceNumber, invoiceDate, totalIncGst, services };
}

// ── Access4 Parser ───────────────────────────────────────────────────────────
function parseAccess4(text: string): ParsedPdfInvoice {
  // Extract invoice number and date
  const invMatch = text.match(/Invoice Number\s*(\d+)/);
  const invoiceNumber = invMatch?.[1] || "UNKNOWN";
  const dateMatch = text.match(/Tax Invoice Issued\s*(\d{2}\/\d{2}\/\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";
  const totalMatch = text.match(/Current Charges \(INC-GST\)\s*AUD\s*\$([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));
  const exGstMatch = text.match(/Current Charges \(EX-GST\)\s*\$([\d,]+\.\d{2})/);
  const totalExGst = parseFloat((exGstMatch?.[1] || "0").replace(/,/g, ""));

  // Internal SmileIT enterprise names to exclude from customer matching
  const INTERNAL_NAMES = [
    "SMILE IT PTY. LTD.",
    "Smile IT Internal Demo",
    "Smile IT Internal Training",
    "Smile IT UC Xpress Internal Demo",
    "Smile IT UC Xpress Internal Training",
    "Reseller Direct Charges",
  ];

  // Parse enterprise rows from the summary table
  // Format: EnterpriseName [endpoints] [delta] $MRC $Variable $OnceOff
  const enterprises: Access4Enterprise[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    // Skip header rows and page markers
    if (line.startsWith("Reseller/Enterprise") || line.startsWith("Page ") ||
        line.startsWith("points") || line.startsWith("Total")) continue;

    // Match lines with dollar amounts: name [endpoints] [+/-delta] $mrc $variable $onceoff
    // Various formats:
    // "A & K Financial Planning 2 0 $18.20 $0.78 $0.00"
    // "BT Lawyers Pty Ltd $308.20 $25.80 $0.00"
    // "ASG Hail Pty Ltd 33 +1 $1,220.93 $106.16 $0.00"
    const withEndpoints = line.match(/^(.+?)\s+(\d+)\s+([+-]?\d+)\s+\$(-?[\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})/);
    const withoutEndpoints = line.match(/^(.+?)\s+\$(-?[\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})$/);

    let ent: Access4Enterprise | null = null;
    if (withEndpoints) {
      const name = withEndpoints[1].trim();
      ent = {
        name,
        endpoints: parseInt(withEndpoints[2]),
        endpointDelta: parseInt(withEndpoints[3]),
        mrc: parseFloat(withEndpoints[4].replace(/,/g, "")),
        variable: parseFloat(withEndpoints[5].replace(/,/g, "")),
        onceOff: parseFloat(withEndpoints[6].replace(/,/g, "")),
        total: 0,
        isInternal: INTERNAL_NAMES.some(n => name.toLowerCase().includes(n.toLowerCase())),
      };
    } else if (withoutEndpoints) {
      const name = withoutEndpoints[1].trim();
      // Skip if name looks like a header or summary line
      if (name.length < 3 || /^\$/.test(name)) continue;
      ent = {
        name,
        endpoints: 0,
        endpointDelta: 0,
        mrc: parseFloat(withoutEndpoints[2].replace(/,/g, "")),
        variable: parseFloat(withoutEndpoints[3].replace(/,/g, "")),
        onceOff: parseFloat(withoutEndpoints[4].replace(/,/g, "")),
        total: 0,
        isInternal: INTERNAL_NAMES.some(n => name.toLowerCase().includes(n.toLowerCase())),
      };
    }
    if (ent) {
      ent.total = Math.round((ent.mrc + ent.variable + ent.onceOff) * 100) / 100;
      enterprises.push(ent);
    }
  }

  // Convert enterprises to services (one service per enterprise for the uploader)
  const services: ParsedPdfService[] = enterprises
    .filter(e => !e.isInternal)
    .map(e => ({
      friendlyName: e.name,
      serviceId: `access4-${e.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")}`,
      serviceType: "Voice" as const,
      amountExGst: e.mrc,
      description: `MRC: $${e.mrc.toFixed(2)}, Variable: $${e.variable.toFixed(2)}, Once-Off: $${e.onceOff.toFixed(2)}, Endpoints: ${e.endpoints}`,
    }));

  return {
    supplier: "Access4",
    invoiceNumber,
    invoiceDate,
    totalIncGst,
    services,
    enterprises,
  };
}

// ── Detect & Parse ────────────────────────────────────────────────────────────
export async function parsePdfInvoice(buffer: Buffer): Promise<ParsedPdfInvoice> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const text = result.text;

  if (text.includes("Channel Haus") || text.includes("channelhaus") || text.includes("ECN Pty Ltd")) {
    return parseChannelHaus(text);
  }
  if (text.includes("Legion Telecom") || text.includes("LEGION Fibre")) {
    return parseLegion(text);
  }
  if (text.includes("Tech-e Pty Ltd") || text.includes("tech-e") || text.includes("Tech-e")) {
    return parseTechE(text);
  }
  if (text.includes("VINE DIRECT") || text.includes("Vine Direct") || text.includes("vinenetworks")) {
    return parseVineDirect(text);
  }
  // Infinet uses Unicode ligature "ﬁ" (U+FB01) in "InﬁNET"
  if (text.includes("INFINET BROADBAND") || text.includes("InﬁNET") || text.includes("InfiNET") || text.includes("infinetbroadband")) {
    return parseInfinet(text);
  }
  if (text.includes("BLITZNET") || text.includes("Blitznet") || text.includes("blitznet")) {
    return parseBlitznet(text);
  }
   if (text.includes("Exetel") || text.includes("exetel.com.au")) {
    return parseExetelPdf(text);
  }
  if (text.includes("Access4 Pty Ltd") || text.includes("access4.com.au") || text.includes("accounts@access4")) {
    return parseAccess4(text);
  }
  throw new Error(
    "Could not detect supplier from PDF. Supported: Channel Haus, Legion, Tech-e, Vine Direct, Infinet, Blitznet, Exetel, Access4."
  );
}
