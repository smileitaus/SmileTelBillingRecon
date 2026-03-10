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
      role: "user",
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

function createUnauthContext(): TrpcContext {
  return {
    user: null,
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
  it("returns summary data for authenticated users", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const summary = await caller.billing.summary();
    expect(summary).toBeTruthy();
    if (summary) {
      expect(summary).toHaveProperty("totalCustomers");
      expect(summary).toHaveProperty("totalServices");
      expect(summary).toHaveProperty("matchedServices");
      expect(summary).toHaveProperty("unmatchedServices");
      expect(summary).toHaveProperty("totalMonthlyCost");
      expect(summary).toHaveProperty("servicesByType");
      expect(typeof summary.totalCustomers).toBe("number");
      expect(typeof summary.totalServices).toBe("number");
    }
  });

  it("rejects unauthenticated requests", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.billing.summary()).rejects.toThrow();
  });
});

describe("billing.customers.list", () => {
  it("returns customer list for authenticated users", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const customers = await caller.billing.customers.list({});
    expect(Array.isArray(customers)).toBe(true);
    if (customers.length > 0) {
      const c = customers[0];
      expect(c).toHaveProperty("name");
      expect(c).toHaveProperty("externalId");
      expect(c).toHaveProperty("serviceCount");
      expect(c).toHaveProperty("monthlyCost");
      expect(c).toHaveProperty("billingPlatforms");
      expect(Array.isArray(c.billingPlatforms)).toBe(true);
    }
  });

  it("rejects unauthenticated requests", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.billing.customers.list({})).rejects.toThrow();
  });
});

describe("billing.services.byId", () => {
  it("returns structured response with service, location, and customer", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Test with a non-existent ID
    const result = await caller.billing.services.byId({ id: "NONEXISTENT" });
    expect(result).toHaveProperty("service");
    expect(result).toHaveProperty("location");
    expect(result).toHaveProperty("customer");
    expect(result.service).toBeNull();
  });

  it("rejects unauthenticated requests", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.billing.services.byId({ id: "S0001" })).rejects.toThrow();
  });
});

describe("billing.search", () => {
  it("returns customers and services arrays", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.billing.search({ query: "Zambrero" });
    expect(result).toHaveProperty("customers");
    expect(result).toHaveProperty("services");
    expect(Array.isArray(result.customers)).toBe(true);
    expect(Array.isArray(result.services)).toBe(true);
  });

  it("rejects unauthenticated requests", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.billing.search({ query: "test" })).rejects.toThrow();
  });
});
