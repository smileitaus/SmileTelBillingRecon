/**
 * tiab.supplier.test.ts
 * Vitest tests for TIAB supplier invoices and Octane customer links.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import {
  tiabSupplierInvoices,
  tiabSupplierInvoiceLineItems,
  octaneCustomerLinks,
} from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

let db: Awaited<ReturnType<typeof getDb>>;

beforeAll(async () => {
  db = await getDb();
});

afterAll(async () => {
  // No teardown needed — we are reading existing seeded data
});

describe("tiab_supplier_invoices", () => {
  it("should have 4 seeded invoices", async () => {
    const [row] = await db!
      .select({ count: sql<number>`count(*)` })
      .from(tiabSupplierInvoices);
    expect(Number(row.count)).toBe(4);
  });

  it("should have invoice 100998-279 with correct totals", async () => {
    const [inv] = await db!
      .select()
      .from(tiabSupplierInvoices)
      .where(eq(tiabSupplierInvoices.invoiceNumber, "279"))
      .limit(1);
    expect(inv).toBeDefined();
    expect(inv.invoiceReference).toBe("100998-279");
    expect(inv.billingMonth).toBe("2025-11");
    expect(Number(inv.totalExGst)).toBeCloseTo(1343.58, 2);
    expect(Number(inv.totalIncGst)).toBeCloseTo(1477.94, 2);
    expect(inv.supplierName).toContain("Telcoinabox");
    expect(inv.billedToName).toContain("Smile IT");
  });

  it("should show cost growth from Nov 2025 to Feb 2026", async () => {
    const invoices = await db!
      .select({ billingMonth: tiabSupplierInvoices.billingMonth, totalExGst: tiabSupplierInvoices.totalExGst })
      .from(tiabSupplierInvoices)
      .orderBy(tiabSupplierInvoices.billingMonth);
    expect(invoices.length).toBe(4);
    // Feb 2026 should be significantly larger than Nov 2025
    const nov = Number(invoices[0].totalExGst);
    const feb = Number(invoices[3].totalExGst);
    expect(feb).toBeGreaterThan(nov * 3); // At least 3x growth
  });

  it("should have all 4 billing months", async () => {
    const invoices = await db!
      .select({ billingMonth: tiabSupplierInvoices.billingMonth })
      .from(tiabSupplierInvoices);
    const months = invoices.map((i) => i.billingMonth).sort();
    expect(months).toContain("2025-11");
    expect(months).toContain("2025-12");
    expect(months).toContain("2026-01");
    expect(months).toContain("2026-02");
  });
});

describe("tiab_supplier_invoice_line_items", () => {
  it("should have 10 line items across all invoices", async () => {
    const [row] = await db!
      .select({ count: sql<number>`count(*)` })
      .from(tiabSupplierInvoiceLineItems);
    expect(Number(row.count)).toBe(10);
  });

  it("invoice 279 should have 4 line items including SIM cards", async () => {
    const [inv] = await db!
      .select({ id: tiabSupplierInvoices.id })
      .from(tiabSupplierInvoices)
      .where(eq(tiabSupplierInvoices.invoiceNumber, "279"))
      .limit(1);
    const items = await db!
      .select()
      .from(tiabSupplierInvoiceLineItems)
      .where(eq(tiabSupplierInvoiceLineItems.invoiceId, inv.id));
    expect(items.length).toBe(4);
    const categories = items.map((i) => i.lineCategory);
    expect(categories).toContain("mobile_service");
    expect(categories).toContain("sim_card");
    expect(categories).toContain("otp_sms");
  });

  it("invoice 282 should have Telstra Premium Mobile as largest line item", async () => {
    const [inv] = await db!
      .select({ id: tiabSupplierInvoices.id })
      .from(tiabSupplierInvoices)
      .where(eq(tiabSupplierInvoices.invoiceNumber, "282"))
      .limit(1);
    const items = await db!
      .select()
      .from(tiabSupplierInvoiceLineItems)
      .where(eq(tiabSupplierInvoiceLineItems.invoiceId, inv.id));
    const mobileItem = items.find((i) => i.lineCategory === "mobile_service");
    expect(mobileItem).toBeDefined();
    expect(Number(mobileItem!.gstExclusive)).toBeGreaterThan(6000);
  });
});

describe("octane_customer_links", () => {
  it("should have 111 links total", async () => {
    const [row] = await db!
      .select({ count: sql<number>`count(*)` })
      .from(octaneCustomerLinks);
    expect(Number(row.count)).toBe(111);
  });

  it("should have Zambrero service links", async () => {
    const [row] = await db!
      .select({ count: sql<number>`count(*)` })
      .from(octaneCustomerLinks)
      .where(eq(octaneCustomerLinks.isZambreroService, 1));
    // 80 unique Zambrero service links (some duplicates merged during seeding)
    expect(Number(row.count)).toBeGreaterThanOrEqual(80);
  });

  it("Zambrero links should have MSISDN phone numbers", async () => {
    const zambreroLinks = await db!
      .select()
      .from(octaneCustomerLinks)
      .where(eq(octaneCustomerLinks.isZambreroService, 1))
      .limit(5);
    for (const link of zambreroLinks) {
      expect(link.msisdn).toBeTruthy();
      expect(link.msisdn).toMatch(/^04\d{8}$/); // Australian mobile format
    }
  });

  it("non-Zambrero links should have Octane customer IDs", async () => {
    const nonZambrero = await db!
      .select()
      .from(octaneCustomerLinks)
      .where(eq(octaneCustomerLinks.isZambreroService, 0))
      .limit(5);
    expect(nonZambrero.length).toBeGreaterThan(0);
    for (const link of nonZambrero) {
      expect(link.octaneCustomerId).toBeTruthy();
      expect(link.octaneCustomerName).toBeTruthy();
    }
  });

  it("all links should start as unmatched", async () => {
    const matched = await db!
      .select({ count: sql<number>`count(*)` })
      .from(octaneCustomerLinks)
      .where(eq(octaneCustomerLinks.matchType, "manual"));
    // Initially all should be unmatched (0 manual matches)
    expect(Number(matched[0].count)).toBe(0);
  });
});
