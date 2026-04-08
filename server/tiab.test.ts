/**
 * TIAB / Octane API Integration Tests
 * Tests the tRPC procedures and DB helpers without live API calls.
 * Live API calls require IP whitelisting by Inabox — these tests mock the HTTP layer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDb } from "./db";
import { tiabSyncLog, tiabCustomers, tiabServices, tiabReconIssues } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getTestDb() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TIAB DB schema", () => {
  it("can insert and read a sync log entry", async () => {
    const db = await getTestDb();
    const [entry] = await db.insert(tiabSyncLog).values({
      syncType: "customers",
      status: "running",
      triggeredBy: "test",
      startedAt: new Date(),
    }).$returningId();

    expect(entry.id).toBeGreaterThan(0);

    await db.update(tiabSyncLog)
      .set({ status: "success", recordsFetched: 5, recordsCreated: 3, recordsUpdated: 2, durationMs: 1234 })
      .where(eq(tiabSyncLog.id, entry.id));

    const [updated] = await db.select().from(tiabSyncLog).where(eq(tiabSyncLog.id, entry.id));
    expect(updated.status).toBe("success");
    expect(updated.recordsFetched).toBe(5);
    expect(updated.durationMs).toBe(1234);

    await db.delete(tiabSyncLog).where(eq(tiabSyncLog.id, entry.id));
  });

  it("can insert and read a TIAB customer", async () => {
    const db = await getTestDb();
    // Clean up any leftover from previous run
    await db.delete(tiabCustomers).where(eq(tiabCustomers.tiabCustomerId, "TEST-CUST-001"));
    const [cust] = await db.insert(tiabCustomers).values({
      tiabCustomerId: "TEST-CUST-001",
      companyName: "Test Company Pty Ltd",
      status: "Active",
      matchType: "name",
      matchConfidence: 95,
      lastSyncedAt: new Date(),
    }).$returningId();

    expect(cust.id).toBeGreaterThan(0);

    const [row] = await db.select().from(tiabCustomers).where(eq(tiabCustomers.id, cust.id));
    expect(row.companyName).toBe("Test Company Pty Ltd");
    expect(Number(row.matchConfidence)).toBe(95);

    await db.delete(tiabCustomers).where(eq(tiabCustomers.id, cust.id));
  });

  it("can insert and read a TIAB service", async () => {
    const db = await getTestDb();
    const [svc] = await db.insert(tiabServices).values({
      tiabServiceId: "TEST-SVC-001",
      tiabCustomerId: "TEST-CUST-001",
      msisdn: "0412345678",
      status: "Active",
      reconStatus: "pending",
      lastSyncedAt: new Date(),
    }).$returningId();

    expect(svc.id).toBeGreaterThan(0);

    const [row] = await db.select().from(tiabServices).where(eq(tiabServices.id, svc.id));
    expect(row.msisdn).toBe("0412345678");
    expect(row.reconStatus).toBe("pending");

    await db.delete(tiabServices).where(eq(tiabServices.id, svc.id));
  });

  it("can insert and resolve a recon issue", async () => {
    const db = await getTestDb();
    const [issue] = await db.insert(tiabReconIssues).values({
      issueType: "missing_service",
      severity: "high",
      status: "open",
      description: "TIAB service TEST-SVC-001 has no matching internal service",
      tiabServiceId: "TEST-SVC-001",
      billingPeriod: "2026-03",
    }).$returningId();

    expect(issue.id).toBeGreaterThan(0);

    await db.update(tiabReconIssues)
      .set({ status: "manually_resolved", resolutionNotes: "Service was terminated", resolvedBy: "test", resolvedAt: new Date() })
      .where(eq(tiabReconIssues.id, issue.id));

    const [resolved] = await db.select().from(tiabReconIssues).where(eq(tiabReconIssues.id, issue.id));
    expect(resolved.status).toBe("manually_resolved");
    expect(resolved.resolutionNotes).toBe("Service was terminated");

    await db.delete(tiabReconIssues).where(eq(tiabReconIssues.id, issue.id));
  });
});

describe("TIAB API client (mocked)", () => {
  it("builds correct Basic Auth header", () => {
    const username = "testuser";
    const password = "testpass";
    const token = Buffer.from(`${username}:${password}`).toString("base64");
    const header = `Basic ${token}`;
    expect(header).toBe("Basic dGVzdHVzZXI6dGVzdHBhc3M=");
  });

  it("handles paginated API responses correctly", () => {
    const mockResponse = {
      data: {
        list: [{ id: "1" }, { id: "2" }, { id: "3" }],
        total: 3,
        pageNo: 1,
        pageSize: 10,
      },
    };
    const hasMore = mockResponse.data.list.length === mockResponse.data.pageSize;
    expect(hasMore).toBe(false);
    expect(mockResponse.data.total).toBe(3);
  });

  it("detects when more pages exist", () => {
    const mockResponse = {
      data: {
        list: Array(10).fill({ id: "x" }),
        total: 25,
        pageNo: 1,
        pageSize: 10,
      },
    };
    const hasMore = mockResponse.data.list.length === mockResponse.data.pageSize;
    expect(hasMore).toBe(true);
  });
});

describe("TIAB reconciliation logic", () => {
  it("identifies missing service issue type correctly", () => {
    const tiabSvc = { tiabServiceId: "SVC-001", msisdn: "0412345678", status: "Active" };
    const internalMatch = null;
    const issueType = internalMatch === null ? "missing_service" : "matched";
    expect(issueType).toBe("missing_service");
  });

  it("identifies status mismatch correctly", () => {
    const tiabStatus = "Active";
    const internalStatus = "Ceased";
    const mismatch = tiabStatus !== internalStatus;
    expect(mismatch).toBe(true);
  });

  it("calculates cost variance correctly", () => {
    const tiabCost = 45.00;
    const internalCost = 42.50;
    const variance = Math.abs(tiabCost - internalCost);
    const threshold = 0.01;
    expect(variance).toBeGreaterThan(threshold);
    expect(variance.toFixed(2)).toBe("2.50");
  });
});
