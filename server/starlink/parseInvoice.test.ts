import { describe, it, expect } from "vitest";
import { parseStarlinkInvoiceText } from "./parseInvoice";

// ── Simple single-line invoice (Ian Donald, Residential Max) ──────────────────
const SIMPLE_INVOICE = `
                                                                                Tax Invoice
Attn: Ian Donald                                                                INV-DF-AUS-10240343-45740-49
-26.7614221, 152.8727814
                                                                                Invoice Date: Wednesday, 7 January 2026
Maleny, QLD 4552
                                                                                Transaction Date: Invoice Date
                                                                                Payment Due Date: Wednesday, 7 January 2026
                                                                                Customer Account: ACC-1184884-81009-17
Product Description                                                                            Qty                 Amount
Residential Max (Wednesday, 7 January 2026 - Saturday, 7 February 2026)                         1                AUD 126.36
Subtotal                                                                                                         AUD 126.36
Total GST                                                                                                         AUD 12.64
Total Charges                                                                                                    AUD 139.00
Payment                                                                                                          AUD 139.00
Total Due                                                                                                    AUD 0.00
                                                                    Service Lines
#                                               Product Description                                                 Qty Unit Price   Total GST    Amount
    Residential Max (Wednesday, 7 January 2026 00:00 - Saturday, 7 February 2026 00:00)
1                                                                                          1    AUD 126.36   AUD 12.64   AUD 139.00
                        Spicers Tamarind Res Plan KIT300336988
`;

// ── Multi-line invoice (Smile IT, Local Priority) ─────────────────────────────
const MULTI_INVOICE = `
                                                                             Tax Invoice
Smile IT                                                                     INV-DF-AUS-10782649-82983-79
Attn: Peter Drummond
                                                                             Invoice Date: Saturday, 7 February 2026
4J9Q+9C Middlemount QLD
                                                                             Customer Account: ACC-1312736-19577-17
Product Description                                                                         Qty                 Amount
Local Priority Terminal Access Charge (Saturday, 7 February 2026 - Saturday, 7 March 2026)  7                AUD 420.00
Local Priority 50GB Data Block (Saturday, 7 February 2026 - Saturday, 7 March 2026)          1                 AUD 38.18
Subtotal                                                                                                  AUD 5,460.01
Total GST                                                                                                     AUD 545.99
Total Charges                                                                                             AUD 6,006.00
Payment                                                                                                   AUD 6,006.00
Total Due                                                                                                 AUD 0.00
                                                                    Service Lines
#                                               Product Description                                                 Qty Unit Price   Total GST    Amount
     Local Priority Terminal Access Charge (Saturday, 7 February 2026 12:00 am - Saturday, 7 March 2026 12:00 am)
1                                                                                                                    1   AUD 60.00   AUD 6.00    AUD 66.00
                                     Grunskies By The River KITP00337467
       Local Priority 50GB Data Block (Saturday, 7 February 2026 12:00 am - Saturday, 7 March 2026 12:00 am)
2                                                                                                                    1   AUD 38.18   AUD 3.82    AUD 42.00
                                     Grunskies By The River KITP00337467
                                                                 Addon Lines
#                                         Product Description                                            Qty Unit Price   Total GST        Amount
    Local Priority 50GB Top-Up (Tuesday, 27 January 2026 8:59 am - Saturday, 7 February 2026 12:00 am)
1                                                                                                         2   AUD 38.18    AUD 7.64      AUD 84.00
                              Middlemount Coal Priority - 1TB KIT00273656
`;

describe("parseStarlinkInvoiceText", () => {
  describe("simple single-line invoice", () => {
    const result = parseStarlinkInvoiceText(SIMPLE_INVOICE);

    it("extracts invoice number", () => {
      expect(result.invoiceNumber).toBe("INV-DF-AUS-10240343-45740-49");
    });

    it("extracts account number", () => {
      expect(result.accountNumber).toBe("ACC-1184884-81009-17");
    });

    it("extracts invoice date", () => {
      expect(result.invoiceDate).toBe("2026-01-07");
    });

    it("extracts billing period", () => {
      expect(result.billingPeriodStart).toBe("2026-01-07");
      expect(result.billingPeriodEnd).toBe("2026-02-07");
    });

    it("extracts totals", () => {
      expect(result.subtotalExGst).toBe(126.36);
      expect(result.totalGst).toBe(12.64);
      expect(result.totalIncGst).toBe(139);
      expect(result.paymentReceived).toBe(139);
      expect(result.totalDue).toBe(0);
    });

    it("marks invoice as paid when totalDue is 0", () => {
      expect(result.status).toBe("paid");
    });

    it("extracts at least one service line", () => {
      expect(result.lines.length).toBeGreaterThan(0);
    });

    it("service line has correct total", () => {
      const total = result.lines.reduce((s, l) => s + l.totalIncGst, 0);
      expect(total).toBeCloseTo(139, 0);
    });
  });

  describe("multi-line invoice with service lines section", () => {
    const result = parseStarlinkInvoiceText(MULTI_INVOICE);

    it("extracts invoice number", () => {
      expect(result.invoiceNumber).toBe("INV-DF-AUS-10782649-82983-79");
    });

    it("extracts account number", () => {
      expect(result.accountNumber).toBe("ACC-1312736-19577-17");
    });

    it("extracts invoice date", () => {
      expect(result.invoiceDate).toBe("2026-02-07");
    });

    it("extracts totals correctly", () => {
      expect(result.subtotalExGst).toBeCloseTo(5460.01, 1);
      expect(result.totalGst).toBeCloseTo(545.99, 1);
      expect(result.totalIncGst).toBe(6006);
      expect(result.status).toBe("paid");
    });

    it("extracts service lines", () => {
      const serviceLines = result.lines.filter(l => l.lineType === "service");
      expect(serviceLines.length).toBeGreaterThan(0);
    });

    it("extracts addon lines", () => {
      const addonLines = result.lines.filter(l => l.lineType === "addon");
      expect(addonLines.length).toBeGreaterThan(0);
    });

    it("service line has KIT serial", () => {
      const withKit = result.lines.filter(l => l.kitSerial);
      expect(withKit.length).toBeGreaterThan(0);
    });

    it("service line has nickname", () => {
      const withNick = result.lines.filter(l => l.serviceNickname && l.serviceNickname.length > 0);
      expect(withNick.length).toBeGreaterThan(0);
    });

    it("Grunskies line has correct KIT serial", () => {
      const grunskies = result.lines.find(l => l.serviceNickname?.includes("Grunskies"));
      expect(grunskies).toBeDefined();
      expect(grunskies?.kitSerial).toContain("KITP00337467");
    });
  });

  describe("edge cases", () => {
    it("handles empty text gracefully", () => {
      const result = parseStarlinkInvoiceText("");
      expect(result.invoiceNumber).toBe("");
      expect(result.totalIncGst).toBe(0);
      expect(result.lines).toHaveLength(0);
    });

    it("handles text with no service lines section", () => {
      const result = parseStarlinkInvoiceText(SIMPLE_INVOICE);
      expect(result.lines.length).toBeGreaterThanOrEqual(1);
    });
  });
});
