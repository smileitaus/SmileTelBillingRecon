import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helper: prevPeriodKey ─────────────────────────────────────────────────────
// Extracted logic from billingCycle router for unit testing

function fmtPeriodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function prevPeriodKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return fmtPeriodKey(d);
}

function extractRows(result: any): any[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? result[0] : result;
  }
  return result.rows || [];
}

// ── Period key helpers ────────────────────────────────────────────────────────

describe("prevPeriodKey", () => {
  it("returns the previous month for a mid-year period", () => {
    expect(prevPeriodKey("2026-04")).toBe("2026-03");
  });

  it("wraps correctly from January to December of previous year", () => {
    expect(prevPeriodKey("2026-01")).toBe("2025-12");
  });

  it("handles end-of-year correctly", () => {
    expect(prevPeriodKey("2025-12")).toBe("2025-11");
  });

  it("returns correct format with zero-padded month", () => {
    const result = prevPeriodKey("2026-10");
    expect(result).toBe("2026-09");
  });
});

describe("fmtPeriodKey", () => {
  it("formats a date as YYYY-MM", () => {
    expect(fmtPeriodKey(new Date(2026, 3, 1))).toBe("2026-04"); // April
  });

  it("zero-pads single-digit months", () => {
    expect(fmtPeriodKey(new Date(2026, 0, 15))).toBe("2026-01"); // January
  });
});

// ── extractRows helper ────────────────────────────────────────────────────────

describe("extractRows", () => {
  it("handles Drizzle [rows, fields] tuple format", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const result = extractRows([rows, []]);
    expect(result).toEqual(rows);
  });

  it("handles flat array format", () => {
    const rows = [{ id: 1 }];
    const result = extractRows(rows);
    expect(result).toEqual(rows);
  });

  it("handles object with .rows property", () => {
    const rows = [{ id: 1 }];
    const result = extractRows({ rows });
    expect(result).toEqual(rows);
  });

  it("returns empty array for empty result", () => {
    const result = extractRows([[], []]);
    expect(result).toEqual([]);
  });
});

// ── Discrepancy detection logic ───────────────────────────────────────────────

describe("discrepancy detection thresholds", () => {
  function detectDiscrepancy(prevAmount: number, currAmount: number): { shouldAlert: boolean; pct: number; severity: string } {
    if (prevAmount === 0) return { shouldAlert: false, pct: 0, severity: "none" };
    const changePct = ((currAmount - prevAmount) / prevAmount) * 100;
    const shouldAlert = Math.abs(changePct) >= 10;
    const severity = Math.abs(changePct) >= 25 ? "critical" : "warning";
    return { shouldAlert, pct: Math.round(changePct * 100) / 100, severity };
  }

  it("does not alert for changes below 10%", () => {
    const result = detectDiscrepancy(1000, 1090); // +9%
    expect(result.shouldAlert).toBe(false);
  });

  it("alerts for exactly 10% increase", () => {
    const result = detectDiscrepancy(1000, 1100); // +10%
    expect(result.shouldAlert).toBe(true);
    expect(result.pct).toBe(10);
  });

  it("alerts for 15% decrease", () => {
    const result = detectDiscrepancy(1000, 850); // -15%
    expect(result.shouldAlert).toBe(true);
    expect(result.pct).toBe(-15);
  });

  it("classifies changes >=25% as critical", () => {
    const result = detectDiscrepancy(1000, 1300); // +30%
    expect(result.shouldAlert).toBe(true);
    expect(result.severity).toBe("critical");
  });

  it("classifies changes between 10-24% as warning", () => {
    const result = detectDiscrepancy(1000, 1200); // +20%
    expect(result.shouldAlert).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("does not divide by zero for new suppliers", () => {
    const result = detectDiscrepancy(0, 500);
    expect(result.shouldAlert).toBe(false);
  });

  it("handles AAPT real-world scenario: $8317 -> $8317 (flat)", () => {
    const result = detectDiscrepancy(8317, 8317);
    expect(result.shouldAlert).toBe(false);
    expect(result.pct).toBe(0);
  });

  it("handles SasBoss real-world scenario: $12513 -> $13500 (+7.9%)", () => {
    const result = detectDiscrepancy(12513, 13500);
    expect(result.shouldAlert).toBe(false); // under 10%
  });

  it("flags large SasBoss increase: $12513 -> $14500 (+15.9%)", () => {
    const result = detectDiscrepancy(12513, 14500);
    expect(result.shouldAlert).toBe(true);
    expect(result.severity).toBe("warning");
  });
});

// ── Checklist progress calculation ───────────────────────────────────────────

describe("checklist progress calculation", () => {
  function calcProgress(items: { isRequired: number; status: string }[]): { progress: number; completed: number; total: number; allDone: boolean } {
    const required = items.filter(i => i.isRequired === 1);
    const completed = required.filter(i => i.status === "uploaded" || i.status === "synced");
    const progress = required.length > 0 ? Math.round((completed.length / required.length) * 100) : 0;
    return { progress, completed: completed.length, total: required.length, allDone: required.length > 0 && completed.length === required.length };
  }

  it("returns 0% when no items are complete", () => {
    const items = [
      { isRequired: 1, status: "pending" },
      { isRequired: 1, status: "pending" },
    ];
    const result = calcProgress(items);
    expect(result.progress).toBe(0);
    expect(result.allDone).toBe(false);
  });

  it("returns 50% when half the required items are done", () => {
    const items = [
      { isRequired: 1, status: "uploaded" },
      { isRequired: 1, status: "pending" },
    ];
    const result = calcProgress(items);
    expect(result.progress).toBe(50);
  });

  it("returns 100% when all required items are done", () => {
    const items = [
      { isRequired: 1, status: "uploaded" },
      { isRequired: 1, status: "synced" },
      { isRequired: 0, status: "pending" }, // optional, not counted
    ];
    const result = calcProgress(items);
    expect(result.progress).toBe(100);
    expect(result.allDone).toBe(true);
  });

  it("ignores optional items in progress calculation", () => {
    const items = [
      { isRequired: 1, status: "uploaded" },
      { isRequired: 0, status: "pending" },
      { isRequired: 0, status: "pending" },
    ];
    const result = calcProgress(items);
    expect(result.progress).toBe(100);
    expect(result.total).toBe(1);
  });

  it("counts skipped items as not complete", () => {
    const items = [
      { isRequired: 1, status: "skipped" },
      { isRequired: 1, status: "uploaded" },
    ];
    const result = calcProgress(items);
    expect(result.progress).toBe(50);
  });
});

// ── Period key validation ─────────────────────────────────────────────────────

describe("period key format validation", () => {
  const PERIOD_KEY_REGEX = /^\d{4}-\d{2}$/;

  it("accepts valid period keys", () => {
    expect(PERIOD_KEY_REGEX.test("2026-04")).toBe(true);
    expect(PERIOD_KEY_REGEX.test("2025-12")).toBe(true);
    expect(PERIOD_KEY_REGEX.test("2026-01")).toBe(true);
  });

  it("rejects invalid period keys", () => {
    expect(PERIOD_KEY_REGEX.test("April 2026")).toBe(false);
    expect(PERIOD_KEY_REGEX.test("2026-4")).toBe(false);
    expect(PERIOD_KEY_REGEX.test("26-04")).toBe(false);
    expect(PERIOD_KEY_REGEX.test("2026/04")).toBe(false);
  });
});
