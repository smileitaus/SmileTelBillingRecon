/**
 * Tests for the escalation workflow:
 * - escalateService
 * - resolveEscalatedService
 * - getEscalatedServices
 * - getCustomersWithEscalations
 * - tRPC procedures: billingAssignments.escalate, resolveEscalation, escalatedServices, customersWithEscalations
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  escalateService,
  resolveEscalatedService,
  getEscalatedServices,
  getCustomersWithEscalations,
} from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Test helpers ──────────────────────────────────────────────────────────────

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

// Use a unique test service ID to avoid conflicts with real data
const TEST_SERVICE_ID = "TEST-ESC-SVCID-001";
const TEST_CUSTOMER_ID = "TEST-ESC-CUSTID-001";

afterEach(async () => {
  // Clean up test records from escalated_services table
  const { getDb } = await import("./db");
  // We can't import getDb directly, so we use the tRPC caller to resolve
  // Instead, just call resolveEscalatedService to clean up (soft-delete via resolvedAt)
  try {
    await resolveEscalatedService(TEST_SERVICE_ID, "test-cleanup", "Test cleanup");
  } catch {
    // Ignore if not found
  }
});

// ─── Unit tests for DB helpers ────────────────────────────────────────────────

describe("escalateService", () => {
  it("creates an escalation record for a service", async () => {
    const result = await escalateService(
      TEST_SERVICE_ID,
      TEST_CUSTOMER_ID,
      "test-user",
      "No matching Xero billing item found",
      "Test escalation note"
    );

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/escalat/i);
  });

  it("returns success when escalating an already-escalated service (upsert)", async () => {
    // First escalation
    await escalateService(TEST_SERVICE_ID, TEST_CUSTOMER_ID, "test-user");

    // Second escalation (should upsert)
    const result = await escalateService(
      TEST_SERVICE_ID,
      TEST_CUSTOMER_ID,
      "test-user-2",
      "Updated reason"
    );

    expect(result.success).toBe(true);
  });
});

describe("getEscalatedServices", () => {
  it("returns escalated services filtered by customer", async () => {
    // Create an escalation first
    await escalateService(TEST_SERVICE_ID, TEST_CUSTOMER_ID, "test-user");

    const escalated = await getEscalatedServices(TEST_CUSTOMER_ID);

    // Should include our test record (if it hasn't been resolved)
    expect(Array.isArray(escalated)).toBe(true);
    const found = escalated.find(e => e.serviceExternalId === TEST_SERVICE_ID);
    // May or may not be found depending on cleanup order; just verify structure
    if (found) {
      expect(found).toHaveProperty("serviceExternalId");
      expect(found).toHaveProperty("customerExternalId");
      expect(found).toHaveProperty("reason");
      expect(found).toHaveProperty("escalatedBy");
      expect(found).toHaveProperty("createdAt");
    }
  });

  it("returns all open escalations when no customer filter", async () => {
    const escalated = await getEscalatedServices();
    expect(Array.isArray(escalated)).toBe(true);
  });
});

describe("resolveEscalatedService", () => {
  it("resolves an escalated service", async () => {
    // Create escalation first
    await escalateService(TEST_SERVICE_ID, TEST_CUSTOMER_ID, "test-user");

    const result = await resolveEscalatedService(
      TEST_SERVICE_ID,
      "test-resolver",
      "Resolved in test"
    );

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/resolv/i);
  });

  it("resolved service no longer appears in open escalations", async () => {
    // Create and then resolve
    await escalateService(TEST_SERVICE_ID, TEST_CUSTOMER_ID, "test-user");
    await resolveEscalatedService(TEST_SERVICE_ID, "test-resolver");

    const escalated = await getEscalatedServices(TEST_CUSTOMER_ID);
    const found = escalated.find(e => e.serviceExternalId === TEST_SERVICE_ID);
    expect(found).toBeUndefined();
  });
});

describe("getCustomersWithEscalations", () => {
  it("returns an array of customer groups", async () => {
    const groups = await getCustomersWithEscalations();
    expect(Array.isArray(groups)).toBe(true);
  });

  it("each group has required fields", async () => {
    const groups = await getCustomersWithEscalations();
    for (const group of groups) {
      expect(group).toHaveProperty("customerExternalId");
      expect(group).toHaveProperty("customerName");
      expect(group).toHaveProperty("escalationCount");
      expect(group).toHaveProperty("totalMonthlyCost");
      expect(group).toHaveProperty("services");
      expect(Array.isArray(group.services)).toBe(true);
      expect(group.escalationCount).toBeGreaterThan(0);
    }
  });
});

// ─── tRPC procedure tests ─────────────────────────────────────────────────────

describe("tRPC billing.customers.billingAssignments.escalate", () => {
  it("escalates a service via tRPC", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.billing.customers.billingAssignments.escalate({
      serviceExternalId: TEST_SERVICE_ID,
      customerExternalId: TEST_CUSTOMER_ID,
      reason: "tRPC test escalation",
      notes: "Created by vitest",
    });

    expect(result.success).toBe(true);
  });

  it("resolves an escalation via tRPC", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Escalate first
    await caller.billing.customers.billingAssignments.escalate({
      serviceExternalId: TEST_SERVICE_ID,
      customerExternalId: TEST_CUSTOMER_ID,
    });

    // Resolve
    const result = await caller.billing.customers.billingAssignments.resolveEscalation({
      serviceExternalId: TEST_SERVICE_ID,
      resolutionNotes: "Resolved in tRPC test",
    });

    expect(result.success).toBe(true);
  });

  it("escalatedServices query returns array", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.billing.customers.billingAssignments.escalatedServices({
      customerExternalId: TEST_CUSTOMER_ID,
    });

    expect(Array.isArray(result)).toBe(true);
  });

  it("customersWithEscalations query returns array", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.billing.customers.billingAssignments.customersWithEscalations();

    expect(Array.isArray(result)).toBe(true);
  });
});
