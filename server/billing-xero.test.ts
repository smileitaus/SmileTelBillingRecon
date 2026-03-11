import { describe, it, expect } from "vitest";
import {
  getBillingItems,
  getBillingSummary,
  getServicesWithMargin,
  getCustomersForMerge,
  updateServiceBillingPlatform,
  getBillingItemsByCustomer,
  getBillingItemsByService,
} from "./db";

describe("Billing Items", () => {
  it("returns billing items with correct structure", async () => {
    const items = await getBillingItems({});
    expect(items).toBeDefined();
    expect(Array.isArray(items)).toBe(true);
    if (items.length > 0) {
      const item = items[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("contactName");
      expect(item).toHaveProperty("description");
      expect(item).toHaveProperty("lineAmount");
      expect(item).toHaveProperty("matchStatus");
      expect(item).toHaveProperty("category");
    }
  });

  it("filters billing items by match status", async () => {
    const unmatched = await getBillingItems({ matchStatus: "unmatched" });
    expect(Array.isArray(unmatched)).toBe(true);
    if (unmatched.length > 0) {
      unmatched.forEach((item: any) => {
        expect(item.matchStatus).toBe("unmatched");
      });
    }

    const matched = await getBillingItems({ matchStatus: "service-matched" });
    expect(Array.isArray(matched)).toBe(true);
    if (matched.length > 0) {
      matched.forEach((item: any) => {
        expect(item.matchStatus).toBe("service-matched");
      });
    }
  });

  it("filters billing items by category", async () => {
    const internet = await getBillingItems({ category: "internet" });
    expect(Array.isArray(internet)).toBe(true);
    if (internet.length > 0) {
      internet.forEach((item: any) => {
        expect(item.category).toBe("internet");
      });
    }
  });

  it("returns billing items by customer", async () => {
    const items = await getBillingItemsByCustomer("C0001");
    expect(Array.isArray(items)).toBe(true);
  });
});

describe("Billing Summary", () => {
  it("returns summary with status and category breakdowns", async () => {
    const summary = await getBillingSummary();
    expect(summary).toBeDefined();
    expect(summary).toHaveProperty("totalItems");
    expect(summary).toHaveProperty("totalRevenue");
    expect(summary).toHaveProperty("statusBreakdown");
    expect(summary).toHaveProperty("categoryBreakdown");
    expect(Array.isArray(summary!.statusBreakdown)).toBe(true);
    expect(Array.isArray(summary!.categoryBreakdown)).toBe(true);

    // Should have at least some items
    expect(summary!.totalItems).toBeGreaterThan(0);
  });

  it("has correct status breakdown totals", async () => {
    const summary = await getBillingSummary();
    const totalFromBreakdown = summary!.statusBreakdown.reduce(
      (sum: number, s: any) => sum + s.count,
      0
    );
    expect(totalFromBreakdown).toBe(summary!.totalItems);
  });

  it("includes margin stats for services with revenue", async () => {
    const summary = await getBillingSummary();
    expect(summary).toHaveProperty("marginStats");
  });
});

describe("Revenue & Margin Analysis", () => {
  it("returns services with margin data", async () => {
    const services = await getServicesWithMargin({});
    expect(Array.isArray(services)).toBe(true);
    expect(services.length).toBeGreaterThan(0);

    const svc = services[0];
    expect(svc).toHaveProperty("monthlyCost");
    expect(svc).toHaveProperty("monthlyRevenue");
    expect(svc).toHaveProperty("marginPercent");
  });

  it("filters by negative margin", async () => {
    const services = await getServicesWithMargin({ marginFilter: "negative" });
    expect(Array.isArray(services)).toBe(true);
    services.forEach((s: any) => {
      expect(Number(s.marginPercent)).toBeLessThan(0);
    });
  });

  it("filters by low margin (<20%)", async () => {
    const services = await getServicesWithMargin({ marginFilter: "low" });
    expect(Array.isArray(services)).toBe(true);
    services.forEach((s: any) => {
      const margin = Number(s.marginPercent);
      expect(margin).toBeGreaterThanOrEqual(0);
      expect(margin).toBeLessThan(20);
    });
  });

  it("filters by high margin (>50%)", async () => {
    const services = await getServicesWithMargin({ marginFilter: "high" });
    expect(Array.isArray(services)).toBe(true);
    services.forEach((s: any) => {
      expect(Number(s.marginPercent)).toBeGreaterThanOrEqual(50);
    });
  });

  it("filters by service type", async () => {
    const internet = await getServicesWithMargin({ serviceType: "Internet" });
    expect(Array.isArray(internet)).toBe(true);
    if (internet.length > 0) {
      internet.forEach((s: any) => {
        expect(s.serviceType).toBe("Internet");
      });
    }
  });

  it("filters by provider", async () => {
    const abb = await getServicesWithMargin({ provider: "ABB" });
    expect(Array.isArray(abb)).toBe(true);
    if (abb.length > 0) {
      abb.forEach((s: any) => {
        expect(s.provider).toBe("ABB");
      });
    }
  });
});

describe("Customer Merge Search", () => {
  it("returns customers matching search query", async () => {
    const results = await getCustomersForMerge("Zambrero");
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    const customer = results[0];
    expect(customer).toHaveProperty("externalId");
    expect(customer).toHaveProperty("name");
    expect(customer).toHaveProperty("serviceCount");
  });

  it("returns empty for non-matching search", async () => {
    const results = await getCustomersForMerge("ZZZZNONEXISTENT12345");
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});

describe("Billing Platform Management", () => {
  it("updates service billing platform", async () => {
    // Get a service first
    const services = await getServicesWithMargin({});
    if (services.length > 0) {
      const svc = services[0];
      const result = await updateServiceBillingPlatform(svc.externalId, ["OneBill", "DataGate"]);
      expect(result.success).toBe(true);

      // Reset it back
      await updateServiceBillingPlatform(svc.externalId, []);
    }
  });
});
