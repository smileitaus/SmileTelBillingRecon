/**
 * Unit tests for the SasBoss pricebook fuzzy billing-name matching logic.
 *
 * These tests exercise the normalise(), similarity(), and sheetPriority()
 * helpers that are embedded in the previewCostSync / applyCostSync procedures,
 * extracted here for isolated testing.
 */

import { describe, it, expect } from "vitest";

// ── Helpers (mirrors server/routers.ts implementation) ────────────────────────

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(\d+\)/g, "")          // strip (1), (10), (100) etc.
    .replace(/[^a-z0-9 ]/g, " ")      // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const setA = new Set(normalise(a).split(" ").filter(Boolean));
  const setB = new Set(normalise(b).split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  setA.forEach((t) => { if (setB.has(t)) inter++; });
  return inter / (setA.size + setB.size - inter);
}

function sheetPriority(sheet: string, wbType: string | null): number {
  const s = sheet.toLowerCase();
  if (wbType === "did-number") {
    if (s.includes("did hosting")) return 3;
    if (s.includes("porting"))    return 1;
    return 2;
  }
  if (s.includes("porting"))    return 1;
  if (s.includes("did hosting")) return 2;
  return 3;
}

// ── normalise() ───────────────────────────────────────────────────────────────

describe("normalise()", () => {
  it("lowercases input", () => {
    expect(normalise("UCXcel Essential")).toBe("ucxcel essential");
  });

  it("strips parenthesised numbers", () => {
    expect(normalise("DID Australia (1)")).toBe("did australia");
    expect(normalise("DID Australia (100)")).toBe("did australia");
  });

  it("replaces punctuation with spaces", () => {
    expect(normalise("Call Recording - Unlimited")).toBe("call recording unlimited");
    expect(normalise("iCall Suite - Ultimate User Licence")).toBe("icall suite ultimate user licence");
  });

  it("collapses multiple whitespace", () => {
    expect(normalise("  SmileTel   Basic  User  ")).toBe("smiletel basic user");
  });

  it("handles empty string", () => {
    expect(normalise("")).toBe("");
  });
});

// ── similarity() ──────────────────────────────────────────────────────────────

describe("similarity()", () => {
  it("returns 1.0 for identical strings", () => {
    expect(similarity("UCXcel Essential", "UCXcel Essential")).toBe(1.0);
  });

  it("returns 1.0 for identical strings after normalisation (quantity stripped)", () => {
    // "DID Australia (1)" normalises to "did australia" — same as "DID Australia"
    expect(similarity("DID Australia (1)", "DID Australia")).toBe(1.0);
  });

  it("returns high score for near-identical names", () => {
    const score = similarity("SmileTel Basic User License", "SmileTel Basic User License");
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it("returns score above threshold for fuzzy match", () => {
    // Billing name may have minor wording differences
    const score = similarity("UCXcel Essential User", "UCXcel Essential");
    expect(score).toBeGreaterThan(0.5);
  });

  it("returns low score for unrelated names", () => {
    const score = similarity("NBN 25/5 Broadband", "SmileTel Executive User License");
    expect(score).toBeLessThan(0.3);
  });

  it("returns 0 for empty strings", () => {
    expect(similarity("", "UCXcel Essential")).toBe(0);
    expect(similarity("UCXcel Essential", "")).toBe(0);
  });

  it("is commutative", () => {
    const a = similarity("Call Recording - Unlimited", "Call Recording Unlimited");
    const b = similarity("Call Recording Unlimited", "Call Recording - Unlimited");
    expect(a).toBeCloseTo(b, 5);
  });
});

// ── sheetPriority() ───────────────────────────────────────────────────────────

describe("sheetPriority()", () => {
  describe("when workbook productType is 'did-number'", () => {
    it("gives highest priority to DID Hosting sheet", () => {
      expect(sheetPriority("Managed Voice - DID Hosting", "did-number")).toBe(3);
    });

    it("gives lowest priority to Porting sheet", () => {
      expect(sheetPriority("Managed Voice - Porting", "did-number")).toBe(1);
    });

    it("gives medium priority to other sheets", () => {
      expect(sheetPriority("UCaaS", "did-number")).toBe(2);
    });
  });

  describe("when workbook productType is 'service-pack' or null", () => {
    it("gives lowest priority to Porting sheet", () => {
      expect(sheetPriority("Managed Voice - Porting", "service-pack")).toBe(1);
      expect(sheetPriority("Managed Voice - Porting", null)).toBe(1);
    });

    it("gives medium priority to DID Hosting sheet", () => {
      expect(sheetPriority("Managed Voice - DID Hosting", "service-pack")).toBe(2);
    });

    it("gives highest priority to UCaaS and Managed Voice sheets", () => {
      expect(sheetPriority("UCaaS", "service-pack")).toBe(3);
      expect(sheetPriority("Managed Voice", null)).toBe(3);
    });
  });
});

// ── End-to-end matching scenarios ────────────────────────────────────────────

describe("end-to-end matching scenarios", () => {
  const FUZZY_THRESHOLD = 0.5;

  interface PbEntry { product_name: string; sheet_name: string; partner_buy_price: string }

  function bestMatch(billingName: string, wbType: string | null, pricebook: PbEntry[]) {
    let bestScore = -1;
    let bestEntry: PbEntry | null = null;
    for (const pb of pricebook) {
      const exact = normalise(billingName) === normalise(pb.product_name);
      const score = exact ? 1.0 : similarity(billingName, pb.product_name);
      if (score < FUZZY_THRESHOLD) continue;
      const combined = score * 10 + sheetPriority(pb.sheet_name, wbType);
      if (combined > bestScore) { bestScore = combined; bestEntry = pb; }
    }
    return bestEntry;
  }

  const didPricebook: PbEntry[] = [
    { product_name: "DID Australia (1)", sheet_name: "Managed Voice - DID Hosting", partner_buy_price: "0.20" },
    { product_name: "DID Australia (1)", sheet_name: "Managed Voice - Porting",     partner_buy_price: "17.14" },
  ];

  it("selects DID Hosting entry for did-number workbook type", () => {
    const match = bestMatch("DID Australia (1)", "did-number", didPricebook);
    expect(match?.sheet_name).toBe("Managed Voice - DID Hosting");
    expect(match?.partner_buy_price).toBe("0.20");
  });

  it("selects DID Hosting entry even when billing name omits quantity", () => {
    const match = bestMatch("DID Australia", "did-number", didPricebook);
    expect(match?.sheet_name).toBe("Managed Voice - DID Hosting");
  });

  it("selects Porting entry only when no DID Hosting entry exists and type is not did-number", () => {
    const portingOnly: PbEntry[] = [
      { product_name: "Inbound 1800 Number Hosting", sheet_name: "Managed Voice - Porting", partner_buy_price: "42.86" },
    ];
    const match = bestMatch("Inbound 1800 Number Hosting", "service-pack", portingOnly);
    expect(match?.sheet_name).toBe("Managed Voice - Porting");
  });

  it("matches UCaaS service-pack by fuzzy name", () => {
    const ucaasPricebook: PbEntry[] = [
      { product_name: "UCXcel Essential", sheet_name: "UCaaS", partner_buy_price: "9.00" },
      { product_name: "UCXcel Lite",      sheet_name: "UCaaS", partner_buy_price: "6.00" },
    ];
    const match = bestMatch("UCXcel Essential User", "service-pack", ucaasPricebook);
    expect(match?.product_name).toBe("UCXcel Essential");
  });

  it("returns null when no pricebook entry exceeds the fuzzy threshold", () => {
    const pricebook: PbEntry[] = [
      { product_name: "SmileTel Executive User License", sheet_name: "UCaaS", partner_buy_price: "9.00" },
    ];
    const match = bestMatch("NBN 25/5 Broadband", "service-pack", pricebook);
    expect(match).toBeNull();
  });
});
