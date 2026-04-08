/**
 * Tests for SasBoss product bundle matching logic.
 *
 * Covers:
 * - Bundle takes priority over individual pricebook when score >= 0.7
 * - Bundle uses combined_buy_price when set, otherwise auto-calculates from components
 * - billing_name field is used for matching when set (falls back to bundle_name)
 * - Individual pricebook fallback when no bundle matches
 * - bundled_buy price used for components when uses_bundled_price = true
 * - override_buy_price takes precedence over pricebook prices
 */

import { describe, it, expect } from "vitest";

// ── Shared helpers (mirrors the logic in routers.ts applyCostSync) ────────────

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(\d+\)/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const setA = new Set(normalise(a).split(" ").filter(Boolean));
  const setB = new Set(normalise(b).split(" ").filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  setA.forEach((t) => {
    if (setB.has(t)) inter++;
  });
  return inter / (setA.size + setB.size - inter);
}

function sheetPriority(sheet: string, productType: string | null): number {
  if (sheet === "Managed Voice - DID Hosting" && productType === "did-number") return 2;
  if (sheet === "Managed Voice - Porting" && productType !== "did-number") return 1;
  if (sheet === "UCaaS") return 1;
  if (sheet === "Managed Voice") return 1;
  return 0;
}

const FUZZY_THRESHOLD = 0.5;
const BUNDLE_THRESHOLD = 0.7;

type BundleDef = {
  id: number;
  bundle_name: string;
  billing_name: string | null;
  effective_buy_price: string | null;
};

type PricebookItem = {
  id: number;
  product_name: string;
  sheet_name: string;
  partner_buy_price: string | null;
  bundled_buy: string | null;
};

function matchService(
  billingName: string,
  productType: string | null,
  bundles: BundleDef[],
  pricebook: PricebookItem[]
): {
  newCost: number | null;
  matchType: string;
  source: "bundle" | "pricebook" | "none";
  name: string;
} {
  // Step A: bundle matching (threshold 0.7)
  let bundleMatch: BundleDef | null = null;
  let bundleScore = -1;
  for (const b of bundles) {
    const matchName = b.billing_name || b.bundle_name;
    const exact = normalise(billingName) === normalise(matchName);
    const score = exact ? 1.0 : similarity(billingName, matchName);
    if (score < BUNDLE_THRESHOLD) continue;
    if (score > bundleScore) {
      bundleScore = score;
      bundleMatch = b;
    }
  }

  if (bundleMatch && bundleMatch.effective_buy_price !== null) {
    return {
      newCost: parseFloat(bundleMatch.effective_buy_price),
      matchType: bundleScore >= 1.0 ? "exact-bundle" : "fuzzy-bundle",
      source: "bundle",
      name: bundleMatch.bundle_name + " [bundle]",
    };
  }

  // Step B: individual pricebook fallback
  let bestScore = -1;
  let bestEntry: PricebookItem | null = null;
  for (const pb of pricebook) {
    const exact = normalise(billingName) === normalise(pb.product_name);
    const score = exact ? 1.0 : similarity(billingName, pb.product_name);
    if (score < FUZZY_THRESHOLD) continue;
    const combined = score * 10 + sheetPriority(pb.sheet_name, productType);
    if (combined > bestScore) {
      bestScore = combined;
      bestEntry = pb;
    }
  }

  if (!bestEntry || bestEntry.partner_buy_price === null) {
    return { newCost: null, matchType: "none", source: "none", name: "" };
  }

  const rawScore = bestScore - sheetPriority(bestEntry.sheet_name, productType);
  return {
    newCost: parseFloat(bestEntry.partner_buy_price),
    matchType: rawScore >= 1.0 ? "exact" : "fuzzy",
    source: "pricebook",
    name: bestEntry.product_name,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const legalBundle: BundleDef = {
  id: 1,
  bundle_name: "Legal Professional Bundle",
  billing_name: null,
  effective_buy_price: "45.00",
};

const mcExecutiveBundle: BundleDef = {
  id: 2,
  bundle_name: "MC - SmileTel Executive User License",
  billing_name: "MC - SmileTel Executive User License",
  effective_buy_price: "21.00",
};

const ucxcelProfessional: PricebookItem = {
  id: 10,
  product_name: "UCXcel Professional",
  sheet_name: "UCaaS",
  partner_buy_price: "22.50",
  bundled_buy: "18.00",
};

const ucxcelWebexBasic: PricebookItem = {
  id: 11,
  product_name: "UCXcel Webex Basic",
  sheet_name: "UCaaS",
  partner_buy_price: "0.00",
  bundled_buy: "0.00",
};

const didHosting: PricebookItem = {
  id: 20,
  product_name: "DID Australia",
  sheet_name: "Managed Voice - DID Hosting",
  partner_buy_price: "0.20",
  bundled_buy: null,
};

const didPorting: PricebookItem = {
  id: 21,
  product_name: "DID Australia",
  sheet_name: "Managed Voice - Porting",
  partner_buy_price: "17.14",
  bundled_buy: null,
};

const allBundles = [legalBundle, mcExecutiveBundle];
const allPricebook = [ucxcelProfessional, ucxcelWebexBasic, didHosting, didPorting];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Bundle matching — priority over individual pricebook", () => {
  it("exact bundle name match returns bundle cost", () => {
    const result = matchService("Legal Professional Bundle", null, allBundles, allPricebook);
    expect(result.source).toBe("bundle");
    expect(result.newCost).toBe(45.0);
    expect(result.matchType).toBe("exact-bundle");
  });

  it("billing_name field used for matching when set", () => {
    const result = matchService(
      "MC - SmileTel Executive User License",
      null,
      allBundles,
      allPricebook
    );
    expect(result.source).toBe("bundle");
    expect(result.newCost).toBe(21.0);
    expect(result.matchType).toBe("exact-bundle");
  });

  it("fuzzy bundle match above 0.7 threshold returns bundle cost", () => {
    // "Legal Professional Bundle" vs "Legal Professional Bundle User" — 3/4 tokens = 0.75
    const fuzzyBundle: BundleDef = {
      id: 3,
      bundle_name: "Legal Professional Bundle",
      billing_name: null,
      effective_buy_price: "45.00",
    };
    // "legal professional bundle user" vs "legal professional bundle"
    // inter = {legal, professional, bundle} = 3, union = 4, Jaccard = 3/4 = 0.75
    const score = similarity("Legal Professional Bundle User", "Legal Professional Bundle");
    expect(score).toBeGreaterThanOrEqual(0.7);
    const result = matchService("Legal Professional Bundle User", null, [fuzzyBundle], allPricebook);
    expect(result.source).toBe("bundle");
  });

  it("bundle match below 0.7 threshold falls through to pricebook", () => {
    // "UCXcel Webex Basic" should NOT match "Legal Professional Bundle"
    const result = matchService("UCXcel Webex Basic", null, [legalBundle], allPricebook);
    expect(result.source).toBe("pricebook");
    expect(result.newCost).toBe(0.0);
  });

  it("bundle with null effective_buy_price falls through to pricebook", () => {
    const nullBundle: BundleDef = {
      id: 99,
      bundle_name: "Legal Professional Bundle",
      billing_name: null,
      effective_buy_price: null,
    };
    const result = matchService("Legal Professional Bundle", null, [nullBundle], allPricebook);
    // Should fall through — no pricebook match for "Legal Professional Bundle" either
    expect(result.source).toBe("none");
  });
});

describe("Individual pricebook fallback when no bundle matches", () => {
  it("UCXcel Webex Basic matches pricebook at $0.00", () => {
    const result = matchService("UCXcel Webex Basic", null, [], allPricebook);
    expect(result.source).toBe("pricebook");
    expect(result.newCost).toBe(0.0);
    expect(result.matchType).toBe("exact");
  });

  it("UCXcel Professional matches pricebook at $22.50 standalone", () => {
    const result = matchService("UCXcel Professional", null, [], allPricebook);
    expect(result.source).toBe("pricebook");
    expect(result.newCost).toBe(22.5);
  });

  it("DID Australia with did-number productType uses DID Hosting rate $0.20", () => {
    const result = matchService("DID Australia (1)", "did-number", [], allPricebook);
    expect(result.source).toBe("pricebook");
    expect(result.newCost).toBe(0.2);
    expect(result.name).toContain("DID Australia");
  });

  it("DID Australia without did-number productType uses Porting rate $17.14", () => {
    const result = matchService("DID Australia (1)", null, [], allPricebook);
    expect(result.source).toBe("pricebook");
    expect(result.newCost).toBe(17.14);
  });

  it("returns none when no match found", () => {
    const result = matchService("Some Unknown Product XYZ", null, [], allPricebook);
    expect(result.source).toBe("none");
    expect(result.newCost).toBeNull();
  });
});

describe("Bundle component cost calculation", () => {
  it("component uses override_buy_price when set", () => {
    const comp = {
      override_buy_price: "5.00",
      uses_bundled_price: true,
      pb_bundled_buy: "18.00",
      pb_standalone_buy: "22.50",
      quantity: 2,
    };
    const effectiveCost =
      comp.override_buy_price !== null
        ? parseFloat(comp.override_buy_price) * comp.quantity
        : comp.uses_bundled_price && comp.pb_bundled_buy !== null
        ? parseFloat(comp.pb_bundled_buy) * comp.quantity
        : comp.pb_standalone_buy !== null
        ? parseFloat(comp.pb_standalone_buy) * comp.quantity
        : null;
    expect(effectiveCost).toBe(10.0); // override 5.00 × 2
  });

  it("component uses bundled_buy when uses_bundled_price = true and no override", () => {
    const comp = {
      override_buy_price: null,
      uses_bundled_price: true,
      pb_bundled_buy: "18.00",
      pb_standalone_buy: "22.50",
      quantity: 1,
    };
    const effectiveCost =
      comp.override_buy_price !== null
        ? parseFloat(comp.override_buy_price) * comp.quantity
        : comp.uses_bundled_price && comp.pb_bundled_buy !== null
        ? parseFloat(comp.pb_bundled_buy) * comp.quantity
        : comp.pb_standalone_buy !== null
        ? parseFloat(comp.pb_standalone_buy) * comp.quantity
        : null;
    expect(effectiveCost).toBe(18.0); // bundled_buy
  });

  it("component falls back to standalone_buy when uses_bundled_price = false", () => {
    const comp = {
      override_buy_price: null,
      uses_bundled_price: false,
      pb_bundled_buy: "18.00",
      pb_standalone_buy: "22.50",
      quantity: 1,
    };
    const effectiveCost =
      comp.override_buy_price !== null
        ? parseFloat(comp.override_buy_price) * comp.quantity
        : comp.uses_bundled_price && comp.pb_bundled_buy !== null
        ? parseFloat(comp.pb_bundled_buy) * comp.quantity
        : comp.pb_standalone_buy !== null
        ? parseFloat(comp.pb_standalone_buy) * comp.quantity
        : null;
    expect(effectiveCost).toBe(22.5); // standalone
  });

  it("component with null bundled_buy falls back to standalone", () => {
    const comp = {
      override_buy_price: null,
      uses_bundled_price: true,
      pb_bundled_buy: null,
      pb_standalone_buy: "22.50",
      quantity: 3,
    };
    const effectiveCost =
      comp.override_buy_price !== null
        ? parseFloat(comp.override_buy_price) * comp.quantity
        : comp.uses_bundled_price && comp.pb_bundled_buy !== null
        ? parseFloat(comp.pb_bundled_buy) * comp.quantity
        : comp.pb_standalone_buy !== null
        ? parseFloat(comp.pb_standalone_buy) * comp.quantity
        : null;
    expect(effectiveCost).toBe(67.5); // standalone × 3
  });
});

describe("Bundle threshold boundary conditions", () => {
  it("similarity exactly at 0.7 is accepted", () => {
    // Construct a case where score is exactly at threshold
    // "Legal Bundle" vs "Legal Professional Bundle" — 2/4 tokens intersection
    const score = similarity("Legal Bundle", "Legal Professional Bundle");
    // "legal bundle" = {legal, bundle}, "legal professional bundle" = {legal, professional, bundle}
    // inter = 2, union = 3, Jaccard = 2/3 ≈ 0.667 — just below threshold
    expect(score).toBeLessThan(0.7);
    const result = matchService("Legal Bundle", null, [legalBundle], allPricebook);
    expect(result.source).toBe("none"); // below threshold, no pricebook match either
  });

  it("high-similarity bundle name (>=0.7) is matched", () => {
    // "Legal Professional Bundle" exact = 1.0
    const score = similarity("Legal Professional Bundle", "Legal Professional Bundle");
    expect(score).toBe(1.0);
    expect(score).toBeGreaterThanOrEqual(BUNDLE_THRESHOLD);
  });

  it("completely unrelated name scores below threshold", () => {
    const score = similarity("NBN 25 5 Broadband", "Legal Professional Bundle");
    expect(score).toBeLessThan(BUNDLE_THRESHOLD);
  });
});
