/**
 * Vocus Router — Unit Tests
 * Tests the core data retrieval procedures for Mobile SIM and NBN services.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "../db";

describe("Vocus database tables", () => {
  it("vocus_mobile_services table exists and has records", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    const result = await db.execute(
      "SELECT COUNT(*) as count FROM vocus_mobile_services" as any
    );
    const rows = result as any[];
    const count = Number(rows[0]?.count ?? rows[0]?.[0]?.count ?? 0);
    expect(count).toBeGreaterThan(0);
  });

  it("vocus_nbn_services table exists and has records", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    const result = await db.execute(
      "SELECT COUNT(*) as count FROM vocus_nbn_services" as any
    );
    const rows = result as any[];
    const count = Number(rows[0]?.count ?? rows[0]?.[0]?.count ?? 0);
    expect(count).toBeGreaterThan(0);
  });

  it("vocus_buckets table exists and has over-quota records", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    const result = await db.execute(
      "SELECT COUNT(*) as count FROM vocus_buckets WHERE isOverQuota = 1" as any
    );
    const rows = result as any[];
    const count = Number(rows[0]?.count ?? rows[0]?.[0]?.count ?? 0);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("active mobile SIMs have MSN and SIM numbers", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    const result = await db.execute(
      "SELECT COUNT(*) as count FROM vocus_mobile_services WHERE serviceStatus = 'active' AND msn IS NOT NULL AND sim IS NOT NULL" as any
    );
    const rows = result as any[];
    const count = Number(rows[0]?.count ?? rows[0]?.[0]?.count ?? 0);
    expect(count).toBeGreaterThan(0);
  });

  it("active NBN services have AVC IDs", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    const result = await db.execute(
      "SELECT COUNT(*) as count FROM vocus_nbn_services WHERE serviceStatus = 'active' AND avcId IS NOT NULL" as any
    );
    const rows = result as any[];
    const count = Number(rows[0]?.count ?? rows[0]?.[0]?.count ?? 0);
    expect(count).toBeGreaterThan(0);
  });

  it("inactive services are stored with correct status", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    const result = await db.execute(
      "SELECT COUNT(*) as count FROM vocus_nbn_services WHERE serviceStatus = 'inactive'" as any
    );
    const rows = result as any[];
    const count = Number(rows[0]?.count ?? rows[0]?.[0]?.count ?? 0);
    expect(count).toBeGreaterThan(0);
  });
});
