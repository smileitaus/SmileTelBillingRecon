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
    unmatched.forEach((s) => {
      expect(s.status).toBe("unmatched");
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
