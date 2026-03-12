/**
 * Tests for pdfInvoiceParser.ts
 * Verifies that all four new supplier parsers (Vine Direct, Infinet, Blitznet, Exetel PDF)
 * correctly extract services from real invoice PDFs.
 *
 * These tests use the actual PDF files from /home/ubuntu/upload/.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parsePdfInvoice } from "./pdfInvoiceParser";

const UPLOAD_DIR = "/home/ubuntu/upload";

// Helper: load a PDF buffer (skip test if file not found)
function loadPdf(filename: string): Buffer | null {
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

describe("Vine Direct PDF Parser", () => {
  it("parses VineDirectFeb.pdf correctly", async () => {
    const buf = loadPdf("VineDirectFeb.pdf");
    if (!buf) { console.warn("Skipping: VineDirectFeb.pdf not found"); return; }

    const result = await parsePdfInvoice(buf);

    expect(result.supplier).toBe("VineDirect");
    expect(result.invoiceNumber).toBe("VD-47210");
    expect(result.invoiceDate).toBe("01-02-2026");
    expect(result.totalIncGst).toBeCloseTo(246.68, 1);
    expect(result.services).toHaveLength(2);

    const smileIt = result.services.find(s => s.friendlyName.toLowerCase().includes("smile"));
    expect(smileIt).toBeDefined();
    expect(smileIt!.amountExGst).toBeCloseTo(112.13, 1);
    expect(smileIt!.serviceType).toBe("Internet");

    const suncoast = result.services.find(s => s.friendlyName.toLowerCase().includes("suncoast"));
    expect(suncoast).toBeDefined();
    expect(suncoast!.amountExGst).toBeCloseTo(112.13, 1);
  });
});

describe("Infinet PDF Parser", () => {
  it("parses InfinetMar.pdf correctly", async () => {
    const buf = loadPdf("InfinetMar.pdf");
    if (!buf) { console.warn("Skipping: InfinetMar.pdf not found"); return; }

    const result = await parsePdfInvoice(buf);

    expect(result.supplier).toBe("Infinet");
    expect(result.invoiceNumber).toContain("IN2026022701");
    expect(result.invoiceDate).toBeTruthy();
    expect(result.totalIncGst).toBeCloseTo(59, 0);
    // Should have at least 1 service (NBN SkyMuster)
    expect(result.services.length).toBeGreaterThanOrEqual(1);

    const nbn = result.services.find(s => s.amountExGst > 0);
    expect(nbn).toBeDefined();
    expect(nbn!.amountExGst).toBeCloseTo(53.64, 1);
    expect(nbn!.serviceType).toBe("Internet");
  });
});

describe("Blitznet PDF Parser", () => {
  it("parses BlitznetMar.pdf correctly", async () => {
    const buf = loadPdf("BlitznetMar.pdf");
    if (!buf) { console.warn("Skipping: BlitznetMar.pdf not found"); return; }

    const result = await parsePdfInvoice(buf);

    expect(result.supplier).toBe("Blitznet");
    expect(result.invoiceNumber).toBeTruthy();
    expect(result.invoiceDate).toBeTruthy();
    expect(result.totalIncGst).toBeCloseTo(72, 0);
    expect(result.services).toHaveLength(1);

    const service = result.services[0];
    expect(service.amountExGst).toBeCloseTo(65.45, 1);
    expect(service.serviceType).toBe("Internet");
  });
});

describe("Exetel PDF Parser", () => {
  it("parses ExetelFeb.pdf correctly", async () => {
    const buf = loadPdf("ExetelFeb.pdf");
    if (!buf) { console.warn("Skipping: ExetelFeb.pdf not found"); return; }

    const result = await parsePdfInvoice(buf);

    expect(result.supplier).toBe("Exetel");
    expect(result.invoiceNumber).toBe("E83030747");
    expect(result.invoiceDate).toContain("Feb 2026");
    expect(result.totalIncGst).toBeCloseTo(7394.67, 1);
    // Should have 13 service blocks
    expect(result.services).toHaveLength(13);

    // Verify key services
    const spicersHO = result.services.find(s => s.friendlyName.toLowerCase().includes("spicers ho"));
    expect(spicersHO).toBeDefined();
    expect(spicersHO!.amountExGst).toBeCloseTo(613.64, 1);

    const mmcMine = result.services.find(s => s.friendlyName.toLowerCase().includes("mmc"));
    expect(mmcMine).toBeDefined();
    expect(mmcMine!.amountExGst).toBeCloseTo(1181.82, 1);

    const smileTingalpa = result.services.find(s => s.friendlyName.toLowerCase().includes("smile tingalpa"));
    expect(smileTingalpa).toBeDefined();
    expect(smileTingalpa!.amountExGst).toBeCloseTo(850, 0);
  });
});
