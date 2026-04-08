/**
 * Starlink Invoice PDF Parser
 * Handles the Starlink AU tax invoice format (INV-DF-AUS-...)
 */

export interface ParsedInvoiceLine {
  serviceLineNumber?: string;
  serviceNickname?: string;
  kitSerial?: string;
  productDescription: string;
  qty: number;
  unitPriceExGst?: number;
  totalGst?: number;
  totalIncGst: number;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  lineType: string;
}

export interface ParsedInvoice {
  invoiceNumber: string;
  accountNumber: string;
  invoiceDate: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotalExGst: number;
  totalGst: number;
  totalIncGst: number;
  paymentReceived: number;
  totalDue: number;
  status: string;
  lines: ParsedInvoiceLine[];
}

/** Parse AUD 1,234.56 or 1,234.56 -> 1234.56 */
function parseMoney(s: string): number {
  return parseFloat(s.replace(/[AUD$,\s]/g, "")) || 0;
}

/** Parse long date "Wednesday, 7 January 2026" or "7/01/2026" -> "2026-01-07" */
function parseDate(s: string): string {
  // Long format: "Wednesday, 7 January 2026" or "7 January 2026"
  const longMatch = s.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (longMatch) {
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04",
      may: "05", june: "06", july: "07", august: "08",
      september: "09", october: "10", november: "11", december: "12",
    };
    const m = months[longMatch[2].toLowerCase()];
    return `${longMatch[3]}-${m}-${longMatch[1].padStart(2, "0")}`;
  }
  // Short format: DD/MM/YYYY
  const shortMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (shortMatch) {
    return `${shortMatch[3]}-${shortMatch[2].padStart(2, "0")}-${shortMatch[1].padStart(2, "0")}`;
  }
  return s.trim();
}

export function parseStarlinkInvoiceText(text: string): ParsedInvoice {
  // ── Invoice number ──────────────────────────────────────────────────────────
  let invoiceNumber = "";
  const invMatch = text.match(/INV-DF-AUS-[\d-]+/);
  if (invMatch) invoiceNumber = invMatch[0];

  // ── Account number ──────────────────────────────────────────────────────────
  let accountNumber = "";
  const acctMatch = text.match(/Customer Account:\s*(ACC-[\d-]+)/i);
  if (acctMatch) accountNumber = acctMatch[1];
  else {
    const fallback = text.match(/ACC-[\d-]+/);
    if (fallback) accountNumber = fallback[0];
  }

  // ── Invoice date ────────────────────────────────────────────────────────────
  let invoiceDate = "";
  const dateMatch = text.match(/Invoice Date:\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*(.+?)(?:\n|$)/i);
  if (dateMatch) invoiceDate = parseDate(dateMatch[1].trim());

  // ── Billing period from product description lines ───────────────────────────
  // Format: "Product Description (StartDate - EndDate)"
  let billingPeriodStart = "";
  let billingPeriodEnd = "";
  const bpMatch = text.match(/\((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(\d{1,2}\s+\w+\s+\d{4})\s*[-–]\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(\d{1,2}\s+\w+\s+\d{4})/i);
  if (bpMatch) {
    billingPeriodStart = parseDate(bpMatch[1]);
    billingPeriodEnd = parseDate(bpMatch[2]);
  }
  // Fallback: use invoice date as start, +1 month as end
  if (!billingPeriodStart && invoiceDate) {
    billingPeriodStart = invoiceDate;
    billingPeriodEnd = invoiceDate; // will be same if we can't determine
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  let subtotalExGst = 0;
  let totalGst = 0;
  let totalIncGst = 0;
  let paymentReceived = 0;
  let totalDue = 0;

  const subtotalMatch = text.match(/Subtotal\s+AUD\s+([\d,]+\.?\d*)/i);
  if (subtotalMatch) subtotalExGst = parseMoney(subtotalMatch[1]);

  const gstMatch = text.match(/Total GST\s+AUD\s+([\d,]+\.?\d*)/i);
  if (gstMatch) totalGst = parseMoney(gstMatch[1]);

  // "Total Charges" is the total inc GST in Starlink invoices
  const totalChargesMatch = text.match(/Total Charges\s+AUD\s+([\d,]+\.?\d*)/i);
  if (totalChargesMatch) totalIncGst = parseMoney(totalChargesMatch[1]);

  const payMatch = text.match(/Payment\s+AUD\s+([\d,]+\.?\d*)/i);
  if (payMatch) paymentReceived = parseMoney(payMatch[1]);

  const dueMatch = text.match(/Total Due\s+AUD\s+([\d,]+\.?\d*)/i);
  if (dueMatch) totalDue = parseMoney(dueMatch[1]);

  // Derive missing totals
  if (!subtotalExGst && totalIncGst) subtotalExGst = Math.round((totalIncGst / 1.1) * 100) / 100;
  if (!totalGst && totalIncGst) totalGst = Math.round((totalIncGst - subtotalExGst) * 100) / 100;
  if (!totalIncGst && subtotalExGst) totalIncGst = Math.round((subtotalExGst * 1.1) * 100) / 100;

  const status = totalDue <= 0 ? "paid" : "unpaid";

  // ── Service lines ───────────────────────────────────────────────────────────
  // Format in "Service Lines" section:
  //   Product Description (date range)
  //   lineNum   qty   unitPrice   gst   total
  //   Nickname KITXXXXXXXX
  const parsedLines: ParsedInvoiceLine[] = [];

  // Split into service lines section and addon lines section
  const serviceLinesSectionMatch = text.match(/Service Lines\s*\n([\s\S]*?)(?:Addon Lines|$)/i);
  const addonLinesSectionMatch = text.match(/Addon Lines\s*\n([\s\S]*?)$/i);

  function parseLineSection(sectionText: string, lineType: string) {
    // Each entry is:
    // Product Description (date range)
    // lineNum   qty   unitPrice   gst   total
    // Nickname KITXXXXXXXX
    const lines = sectionText.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      // Skip header line and empty lines
      if (!line || line.match(/^#\s+Product Description/i)) { i++; continue; }

      // Check if this is a product description line (doesn't start with a number)
      if (!line.match(/^\d+\s/)) {
        const productLine = line;
        // Extract billing period from product description
        let lineBpStart = billingPeriodStart;
        let lineBpEnd = billingPeriodEnd;
        const lineBpMatch = productLine.match(/\((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(\d{1,2}\s+\w+\s+\d{4})\s*\d+:\d+\s*(?:am|pm)\s*[-–]\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(\d{1,2}\s+\w+\s+\d{4})/i);
        if (lineBpMatch) {
          lineBpStart = parseDate(lineBpMatch[1]);
          lineBpEnd = parseDate(lineBpMatch[2]);
        }

        // Next line should be the number line
        i++;
        if (i >= lines.length) break;
        const numLine = lines[i].trim();
        const numMatch = numLine.match(/^(\d+)\s+([\d,]+)\s+AUD\s+([\d,]+\.?\d*)\s+AUD\s+([\d,]+\.?\d*)\s+AUD\s+([\d,]+\.?\d*)/);
        if (!numMatch) { continue; }

        const qty = parseInt(numMatch[2]);
        const unitPriceExGst = parseMoney(numMatch[3]);
        const lineGst = parseMoney(numMatch[4]);
        const lineTotal = parseMoney(numMatch[5]);

        // Next line should be nickname + KIT serial
        i++;
        let serviceNickname: string | undefined;
        let kitSerial: string | undefined;
        if (i < lines.length) {
          const nickLine = lines[i].trim();
          // Extract KIT serials
          const kitMatches = nickLine.match(/KIT[A-Z0-9]+(?:,\s*KIT[A-Z0-9]+)*/g);
          if (kitMatches) {
            kitSerial = kitMatches.join(", ");
            serviceNickname = nickLine.replace(/KIT[A-Z0-9]+(?:,\s*KIT[A-Z0-9]+)*/g, "").trim().replace(/,\s*$/, "").trim();
          } else {
            serviceNickname = nickLine || undefined;
          }
          i++;
        }

        // Clean up product description (remove the date range)
        const productDescription = productLine.replace(/\s*\([^)]+\)\s*$/, "").trim() || productLine;

        parsedLines.push({
          serviceNickname: serviceNickname || undefined,
          kitSerial: kitSerial || undefined,
          productDescription,
          qty,
          unitPriceExGst,
          totalGst: lineGst,
          totalIncGst: lineTotal,
          billingPeriodStart: lineBpStart,
          billingPeriodEnd: lineBpEnd,
          lineType,
        });
      } else {
        i++;
      }
    }
  }

  if (serviceLinesSectionMatch) {
    parseLineSection(serviceLinesSectionMatch[1], "service");
  }
  if (addonLinesSectionMatch) {
    parseLineSection(addonLinesSectionMatch[1], "addon");
  }

  // If no structured lines found, create a summary line from the product table at the top
  if (parsedLines.length === 0 && totalIncGst > 0) {
    // Parse the simple product table (before "Service Lines" section)
    const productTableMatch = text.match(/Product Description\s*Qty\s*Amount\s*([\s\S]*?)(?:Subtotal|$)/i);
    if (productTableMatch) {
      const tableLines = productTableMatch[1].split("\n").filter(l => l.trim());
      for (const tl of tableLines) {
        const m = tl.match(/^(.+?)\s+(\d+)\s+AUD\s+([\d,]+\.?\d*)$/);
        if (m) {
          const desc = m[1].trim();
          const qty = parseInt(m[2]);
          const lineTotal = parseMoney(m[3]);
          const lineExGst = Math.round((lineTotal / 1.1) * 100) / 100;
          const lineGst = Math.round((lineTotal - lineExGst) * 100) / 100;
          // Extract billing period from description
          let lineBpStart = billingPeriodStart;
          let lineBpEnd = billingPeriodEnd;
          const lineBpMatch = desc.match(/\((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(\d{1,2}\s+\w+\s+\d{4})\s*[-–]\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(\d{1,2}\s+\w+\s+\d{4})/i);
          if (lineBpMatch) {
            lineBpStart = parseDate(lineBpMatch[1]);
            lineBpEnd = parseDate(lineBpMatch[2]);
          }
          parsedLines.push({
            productDescription: desc.replace(/\s*\([^)]+\)\s*$/, "").trim(),
            qty,
            unitPriceExGst: lineExGst,
            totalGst: lineGst,
            totalIncGst: lineTotal,
            billingPeriodStart: lineBpStart,
            billingPeriodEnd: lineBpEnd,
            lineType: "service",
          });
        }
      }
    }
  }

  // Final fallback: single summary line
  if (parsedLines.length === 0 && totalIncGst > 0) {
    parsedLines.push({
      productDescription: "Starlink Service (see PDF for details)",
      qty: 1,
      unitPriceExGst: subtotalExGst,
      totalGst,
      totalIncGst,
      billingPeriodStart,
      billingPeriodEnd,
      lineType: "service",
    });
  }

  return {
    invoiceNumber,
    accountNumber,
    invoiceDate,
    billingPeriodStart,
    billingPeriodEnd,
    subtotalExGst,
    totalGst,
    totalIncGst,
    paymentReceived,
    totalDue,
    status,
    lines: parsedLines,
  };
}
