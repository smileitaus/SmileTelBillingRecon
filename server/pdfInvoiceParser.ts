/**
 * Server-side PDF invoice parser for Channel Haus, Legion, and Tech-e.
 * Uses pdf-parse to extract text, then applies regex patterns to identify services.
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
  supplier: "ChannelHaus" | "Legion" | "Tech-e";
  invoiceNumber: string;
  invoiceDate: string;
  totalIncGst: number;
  services: ParsedPdfService[];
}

// ── Channel Haus Parser ───────────────────────────────────────────────────────

function parseChannelHaus(text: string): ParsedPdfInvoice {
  // Extract invoice number
  const invMatch = text.match(/Invoice:\s*(C\d+)/);
  const invoiceNumber = invMatch?.[1] || "UNKNOWN";

  // Extract date
  const dateMatch = text.match(/Date:\s*(\d{2}\/\d{2}\/\d{4})/);
  const invoiceDate = dateMatch?.[1] || "";

  // Extract total
  const totalMatch = text.match(/ACCOUNT BALANCE\s*\$?([\d,]+\.\d{2})/);
  const totalIncGst = parseFloat((totalMatch?.[1] || "0").replace(/,/g, ""));

  const services: ParsedPdfService[] = [];

  // Match service blocks:
  // "Service: <id> Friendly Name: <name>  $<amount>"
  // followed by optional AVC ID and address lines
  const serviceRegex =
    /Service:\s*(\S+)\s+Friendly Name:\s*([^\n$]+?)\s+\$([\d,]+\.\d{2})\s*\n([\s\S]*?)(?=Service:|Service Type:|$)/g;

  let match: RegExpExecArray | null;
  while ((match = serviceRegex.exec(text)) !== null) {
    const serviceId = match[1].trim();
    const friendlyName = match[2].trim();
    const amountIncGst = parseFloat(match[3].replace(/,/g, ""));
    const block = match[4];

    // AVC ID
    const avcMatch = block.match(/AVC ID:\s*(AVC\w+)/);
    const avcId = avcMatch?.[1];

    // Address (line after AVC ID or first address-like line)
    const addrMatch = block.match(/AVC ID:[^\n]*\n\s*([A-Z0-9][^\n]{5,60}(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\s+\d{4})/);
    const address = addrMatch?.[1]?.trim();

    // Determine service type
    let serviceType: "Internet" | "Voice" | "Other" = "Other";
    if (serviceId.startsWith("bsip_") || serviceId.startsWith("bsip") || block.toLowerCase().includes("sip") || block.toLowerCase().includes("voice") || block.toLowerCase().includes("pbx")) {
      serviceType = "Voice";
    } else if (avcId || block.toLowerCase().includes("nbn") || block.toLowerCase().includes("internet") || block.toLowerCase().includes("broadband")) {
      serviceType = "Internet";
    }

    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;

    services.push({
      friendlyName,
      serviceId,
      serviceType,
      amountExGst,
      description: block.split("\n").find(l => l.trim().length > 10 && !l.includes("AVC") && !l.includes("Starting"))?.trim() || "",
      avcId,
      address,
    });
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

  // Extract reference (customer name)
  const refMatch = text.match(/Reference\s+[\d]+ - (.+?)(?:\n|$)/);
  const customerRef = refMatch?.[1]?.trim() || "";

  // Extract service lines: "LEGION Fibre Business Service Plan Access Fee  1.00  799.00  10%  799.00"
  const services: ParsedPdfService[] = [];
  const lineRegex = /LEGION\s+(.+?)\s+[\d.]+\s+([\d,]+\.\d{2})\s+\d+%\s+([\d,]+\.\d{2})/g;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(text)) !== null) {
    const desc = match[1].trim();
    const unitPrice = parseFloat(match[2].replace(/,/g, ""));
    const amountIncGst = parseFloat(match[3].replace(/,/g, ""));
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;

    services.push({
      friendlyName: customerRef || desc,
      serviceId: `legion_${customerRef.toLowerCase().replace(/\s+/g, "_")}`,
      serviceType: "Internet",
      amountExGst,
      description: desc,
    });
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

  // Match service lines: "(1003) Internet Connection 250Mbps/250Mbps UL - U2\n5 Mill St (GBA Toowoomba) -recurring fee\n1.00  250.00  10%  250.00"
  const lineRegex = /\((\d+)\)\s+(.+?)\n(.+?-recurring fee)\s*\n\s*([\d.]+)\s+([\d,]+\.\d{2})\s+\d+%\s+([\d,]+\.\d{2})/g;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(text)) !== null) {
    const serviceCode = match[1];
    const planDesc = match[2].trim();
    const customerDesc = match[3].trim();
    const amountIncGst = parseFloat(match[6].replace(/,/g, ""));
    const amountExGst = Math.round((amountIncGst / 1.1) * 100) / 100;

    // Extract customer name from parentheses e.g. "(GBA Toowoomba)"
    const nameMatch = customerDesc.match(/\(([^)]+)\)/);
    const friendlyName = nameMatch?.[1] || customerDesc;

    services.push({
      friendlyName,
      serviceId: `teche_${serviceCode}`,
      serviceType: "Internet",
      amountExGst,
      description: `${planDesc} — ${customerDesc}`,
    });
  }

  return { supplier: "Tech-e", invoiceNumber, invoiceDate, totalIncGst, services };
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

  throw new Error(
    "Could not detect supplier from PDF. Supported: Channel Haus, Legion, Tech-e."
  );
}
