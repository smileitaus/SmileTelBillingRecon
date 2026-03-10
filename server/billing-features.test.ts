import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("billing.summary", () => {
  it("returns summary with AVC coverage fields", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const summary = await caller.billing.summary();
    expect(summary).toBeDefined();
    if (summary) {
      expect(summary).toHaveProperty("totalServices");
      expect(summary).toHaveProperty("totalCustomers");
      expect(summary).toHaveProperty("totalLocations");
      expect(summary).toHaveProperty("matchedServices");
      expect(summary).toHaveProperty("unmatchedServices");
      expect(summary).toHaveProperty("totalMonthlyCost");
      expect(summary).toHaveProperty("servicesByType");
      expect(summary).toHaveProperty("supplierAccounts");
      expect(summary).toHaveProperty("servicesWithAvc");
      expect(summary).toHaveProperty("servicesMissingAvc");
      expect(typeof summary.servicesWithAvc).toBe("number");
      expect(typeof summary.servicesMissingAvc).toBe("number");
      expect(summary.servicesWithAvc + summary.servicesMissingAvc).toBe(summary.totalServices);
    }
  });

  it("returns summary with flagged and terminated service counts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const summary = await caller.billing.summary();
    expect(summary).toBeDefined();
    if (summary) {
      expect(summary).toHaveProperty("flaggedServices");
      expect(summary).toHaveProperty("terminatedServices");
      expect(typeof summary.flaggedServices).toBe("number");
      expect(typeof summary.terminatedServices).toBe("number");
    }
  });
});

describe("billing.customers", () => {
  it("returns a list of customers", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const customers = await caller.billing.customers.list();
    expect(Array.isArray(customers)).toBe(true);
    expect(customers.length).toBeGreaterThan(0);

    const first = customers[0];
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("externalId");
    expect(first).toHaveProperty("serviceCount");
    expect(first).toHaveProperty("monthlyCost");
    expect(first).toHaveProperty("billingPlatforms");
    expect(Array.isArray(first.billingPlatforms)).toBe(true);
  });

  it("filters customers by search term", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const results = await caller.billing.customers.list({ search: "Zambrero" });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((c) => {
      expect(c.name.toLowerCase()).toContain("zambrero");
    });
  });

  it("returns customer by externalId", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const customers = await caller.billing.customers.list();
    if (customers.length > 0) {
      const customer = await caller.billing.customers.byId({ id: customers[0].externalId });
      expect(customer).toBeDefined();
      expect(customer?.name).toBe(customers[0].name);
    }
  });

  it("returns locations for a customer", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const customers = await caller.billing.customers.list();
    if (customers.length > 0) {
      const locations = await caller.billing.customers.locations({ customerId: customers[0].externalId });
      expect(Array.isArray(locations)).toBe(true);
    }
  });

  it("returns services for a customer", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const customers = await caller.billing.customers.list();
    if (customers.length > 0) {
      const services = await caller.billing.customers.services({ customerId: customers[0].externalId });
      expect(Array.isArray(services)).toBe(true);
    }
  });
});

describe("billing.services", () => {
  it("returns all services", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const services = await caller.billing.services.list();
    expect(Array.isArray(services)).toBe(true);
    expect(services.length).toBeGreaterThan(0);

    const first = services[0];
    expect(first).toHaveProperty("serviceType");
    expect(first).toHaveProperty("monthlyCost");
    expect(first).toHaveProperty("externalId");
  });

  it("returns a service by externalId with related customer and location", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const services = await caller.billing.services.list();
    if (services.length > 0) {
      const result = await caller.billing.services.byId({ id: services[0].externalId });
      expect(result).toHaveProperty("service");
      expect(result.service).toBeDefined();
    }
  });
});

describe("billing.unmatched", () => {
  it("returns unmatched services", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const unmatched = await caller.billing.unmatched.list();
    expect(Array.isArray(unmatched)).toBe(true);
    // The list now returns all non-active services: unmatched, flagged_for_termination, and terminated
    const validStatuses = ['unmatched', 'flagged_for_termination', 'terminated'];
    unmatched.forEach((s) => {
      expect(validStatuses).toContain(s.status);
    });
  });

  it("returns suggestions for an unmatched service", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const unmatched = await caller.billing.unmatched.list();
    if (unmatched.length > 0) {
      const suggestions = await caller.billing.unmatched.suggestions({ serviceId: unmatched[0].externalId });
      expect(Array.isArray(suggestions)).toBe(true);
      suggestions.forEach((s) => {
        expect(s).toHaveProperty("customer");
        expect(s).toHaveProperty("confidence");
        expect(s).toHaveProperty("reason");
        expect(s).toHaveProperty("missingInfo");
        expect(["high", "medium", "low"]).toContain(s.confidence);
      });
    }
  });
});

describe("billing.search", () => {
  it("returns customers and services matching a query", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const results = await caller.billing.search({ query: "Zambrero" });
    expect(results).toHaveProperty("customers");
    expect(results).toHaveProperty("services");
    expect(Array.isArray(results.customers)).toBe(true);
    expect(results.customers.length).toBeGreaterThan(0);
  });
});

describe("billing.updateNotes", () => {
  it("saves discovery notes for a service", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.billing.updateNotes({
      serviceExternalId: "svc-001",
      notes: "Checked Telstra portal - service appears to belong to ABC Corp",
      author: "Test User",
    });

    expect(result).toEqual({ success: true });
  });

  it("allows saving empty notes to clear them", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.billing.updateNotes({
      serviceExternalId: "svc-001",
      notes: "",
      author: "Test User",
    });

    expect(result).toEqual({ success: true });
  });
});

describe("billing.updateStatus", () => {
  it("flags a service for termination", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.billing.updateStatus({
      serviceExternalId: "svc-002",
      status: "flagged_for_termination",
    });

    expect(result).toEqual({ success: true });
  });

  it("marks a service as terminated", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.billing.updateStatus({
      serviceExternalId: "svc-003",
      status: "terminated",
    });

    expect(result).toEqual({ success: true });
  });

  it("resets a service to active", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.billing.updateStatus({
      serviceExternalId: "svc-004",
      status: "active",
    });

    expect(result).toEqual({ success: true });
  });

  it("resets a service to unmatched", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.billing.updateStatus({
      serviceExternalId: "svc-005",
      status: "unmatched",
    });

    expect(result).toEqual({ success: true });
  });

  it("rejects invalid status values", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.billing.updateStatus({
        serviceExternalId: "svc-006",
        status: "invalid_status" as any,
      })
    ).rejects.toThrow();
  });
});

describe("billing.supplierAccounts", () => {
  it("returns supplier accounts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const accounts = await caller.billing.supplierAccounts();
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThan(0);

    const first = accounts[0];
    expect(first).toHaveProperty("accountNumber");
    expect(first).toHaveProperty("serviceCount");
    expect(first).toHaveProperty("monthlyCost");
  });
});

describe("billing.unmatched.dismiss", () => {
  it("dismisses a suggestion for a service", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Get an unmatched service with suggestions
    const unmatched = await caller.billing.unmatched.list();
    expect(unmatched.length).toBeGreaterThan(0);

    // Find one with a supplier account that has matches
    const svcWithAcct = unmatched.find(s => s.supplierAccount && s.supplierAccount !== '');
    if (svcWithAcct) {
      const suggestions = await caller.billing.unmatched.suggestions({ serviceId: svcWithAcct.externalId });
      if (suggestions.length > 0) {
        const firstSuggestion = suggestions[0];

        // Dismiss the first suggestion
        const result = await caller.billing.unmatched.dismiss({
          serviceExternalId: svcWithAcct.externalId,
          customerExternalId: firstSuggestion.customer.externalId,
        });
        expect(result).toEqual({ success: true });

        // Verify the dismissed suggestion no longer appears
        const updatedSuggestions = await caller.billing.unmatched.suggestions({ serviceId: svcWithAcct.externalId });
        const dismissed = updatedSuggestions.find(
          s => s.customer.externalId === firstSuggestion.customer.externalId
        );
        expect(dismissed).toBeUndefined();
      }
    }
  });
});

describe("matching algorithm - supplier account", () => {
  it("suggests customers from same supplier account", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Find an unmatched service on account 192549800 (has matched services)
    const unmatched = await caller.billing.unmatched.list();
    const svcOnSharedAcct = unmatched.find(s => s.supplierAccount === '192549800');
    if (svcOnSharedAcct) {
      const suggestions = await caller.billing.unmatched.suggestions({ serviceId: svcOnSharedAcct.externalId });
      expect(suggestions.length).toBeGreaterThan(0);
      // Should suggest Zambrero locations (which are on the same account)
      const hasZambrero = suggestions.some(s => s.customer.name.includes('Zambrero'));
      expect(hasZambrero).toBe(true);
      // Reason should mention supplier account
      const acctSuggestion = suggestions.find(s => s.reason.includes('supplier account'));
      expect(acctSuggestion).toBeDefined();
    }
  });

  it("does not suggest Yiros Marketplace for unrelated services", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Check a service on account 586992900 (no matched services on this account)
    const unmatched = await caller.billing.unmatched.list();
    const svcOn586 = unmatched.find(s => s.supplierAccount === '586992900');
    if (svcOn586) {
      const suggestions = await caller.billing.unmatched.suggestions({ serviceId: svcOn586.externalId });
      const hasYiros = suggestions.some(s => s.customer.name.includes('Yiros'));
      expect(hasYiros).toBe(false);
    }
  });
});

describe("matching algorithm - confidence levels", () => {
  it("returns suggestions sorted by confidence (high > medium > low)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const unmatched = await caller.billing.unmatched.list();
    if (unmatched.length > 0) {
      const suggestions = await caller.billing.unmatched.suggestions({ serviceId: unmatched[0].externalId });
      if (suggestions.length >= 2) {
        const confidenceOrder = { high: 0, medium: 1, low: 2 };
        for (let i = 1; i < suggestions.length; i++) {
          const prev = confidenceOrder[suggestions[i - 1].confidence as keyof typeof confidenceOrder];
          const curr = confidenceOrder[suggestions[i].confidence as keyof typeof confidenceOrder];
          expect(prev).toBeLessThanOrEqual(curr);
        }
      }
    }
  });

  it("limits suggestions to max 8 results", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const unmatched = await caller.billing.unmatched.list();
    for (const svc of unmatched.slice(0, 5)) {
      const suggestions = await caller.billing.unmatched.suggestions({ serviceId: svc.externalId });
      expect(suggestions.length).toBeLessThanOrEqual(8);
    }
  });
});
