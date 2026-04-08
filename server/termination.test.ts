import { describe, it, expect } from "vitest";

// Unit tests for termination utility functions
// (Integration tests require a live DB — these cover the pure logic)

function generateBatchId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TERM-${ts}-${rand}`;
}

function normalisePhone(p: string): string {
  const s = p.replace(/\s+/g, "");
  if (s.length === 9 && s[0] !== "0") return "0" + s;
  return s;
}

describe("Termination batch ID generation", () => {
  it("generates IDs with TERM- prefix", () => {
    const id = generateBatchId();
    expect(id).toMatch(/^TERM-\d{14}-[A-Z0-9]{4}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, generateBatchId));
    expect(ids.size).toBe(100);
  });
});

describe("Phone number normalisation", () => {
  it("strips spaces", () => {
    expect(normalisePhone("04 1234 5678")).toBe("0412345678");
  });

  it("adds leading 0 to 9-digit numbers", () => {
    expect(normalisePhone("412345678")).toBe("0412345678");
  });

  it("leaves 10-digit numbers unchanged", () => {
    expect(normalisePhone("0412345678")).toBe("0412345678");
  });

  it("handles landlines", () => {
    expect(normalisePhone("0298765432")).toBe("0298765432");
  });
});

describe("Not-found phone detection", () => {
  it("correctly identifies phones not in the matched set", () => {
    const requested = ["0412345678", "0298765432", "0387654321"];
    const matched = new Set(["0412345678"]);
    const notFound = requested.filter(p => !matched.has(p));
    expect(notFound).toEqual(["0298765432", "0387654321"]);
  });

  it("returns empty array when all phones are matched", () => {
    const requested = ["0412345678"];
    const matched = new Set(["0412345678"]);
    const notFound = requested.filter(p => !matched.has(p));
    expect(notFound).toEqual([]);
  });
});
