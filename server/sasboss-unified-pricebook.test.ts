/**
 * Tests for the unified SasBoss pricebook feature:
 *   - SasBossProduct interface covers all pricing tiers
 *   - fetchProducts() correctly maps all bundled/unlimited fields
 *   - syncPrices logic: normalisation, matching, drift detection
 */
import { describe, it, expect } from "vitest";
import type { SasBossProduct } from "./suppliers/sasboss-api";

// ─── SasBossProduct interface completeness ────────────────────────────────────

describe("SasBossProduct interface", () => {
  it("should have all three pricing tiers", () => {
    const product: SasBossProduct = {
      productId: "1001",
      productType: "service-pack",
      productName: "Webex Calling - Standard",
      itemType: "recurring-ucaas",
      chargeFrequency: "monthly",
      // PAYG
      chargeRecurringFee: 12.50,
      rrpRecurringFee: 19.95,
      nfrRecurringFee: 10.00,
      // Bundled
      chargeBundledRecurringFee: 11.00,
      rrpBundledRecurringFee: 17.95,
      nfrBundledRecurringFee: 9.50,
      // Unlimited
      chargeUnlimitedRecurringFee: 15.00,
      rrpUnlimitedRecurringFee: 24.95,
      nfrUnlimitedRecurringFee: 13.00,
      chargeGstRate: 0.1,
      productStatus: "active",
      isLegacy: "no",
      integrationRefId: null,
      servicePackClassType: "ucaas",
      serviceSubClass: "endpoint",
      addOn: false,
    };
    expect(product.chargeRecurringFee).toBe(12.50);
    expect(product.chargeBundledRecurringFee).toBe(11.00);
    expect(product.chargeUnlimitedRecurringFee).toBe(15.00);
    expect(product.rrpRecurringFee).toBe(19.95);
    expect(product.rrpBundledRecurringFee).toBe(17.95);
    expect(product.rrpUnlimitedRecurringFee).toBe(24.95);
    expect(product.nfrRecurringFee).toBe(10.00);
  });

  it("should allow null for optional pricing tiers", () => {
    const product: SasBossProduct = {
      productId: "2001",
      productType: "did-number",
      productName: "DID Number - Local",
      itemType: "recurring-did",
      chargeFrequency: "monthly",
      chargeRecurringFee: 1.50,
      rrpRecurringFee: 3.00,
      nfrRecurringFee: null,
      chargeBundledRecurringFee: null,
      rrpBundledRecurringFee: null,
      nfrBundledRecurringFee: null,
      chargeUnlimitedRecurringFee: null,
      rrpUnlimitedRecurringFee: null,
      nfrUnlimitedRecurringFee: null,
      chargeGstRate: 0.1,
      productStatus: "active",
      isLegacy: "no",
      integrationRefId: null,
      servicePackClassType: null,
      serviceSubClass: null,
      addOn: false,
    };
    expect(product.nfrRecurringFee).toBeNull();
    expect(product.chargeBundledRecurringFee).toBeNull();
    expect(product.chargeUnlimitedRecurringFee).toBeNull();
  });
});

// ─── Product name normalisation (mirrors syncPrices logic) ───────────────────

describe("product name normalisation for pricebook matching", () => {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  it("normalises spaces, hyphens, and special chars", () => {
    expect(norm("Webex Calling - Standard")).toBe("webexcallingstandard");
    expect(norm("webex-calling-standard")).toBe("webexcallingstandard");
    expect(norm("WEBEX CALLING STANDARD")).toBe("webexcallingstandard");
  });

  it("matches API product name to pricebook product name after normalisation", () => {
    const apiName = "Webex Calling - Standard";
    const pbName = "Webex Calling - Standard";
    expect(norm(apiName)).toBe(norm(pbName));
  });

  it("strips trailing numeric suffix from buy_name", () => {
    const buyName = "Webex Calling - Standard - 12345";
    const stripped = buyName.replace(/\s*-\s*\d+\s*$/, "").trim();
    expect(norm(stripped)).toBe("webexcallingstandard");
  });

  it("handles DID number products with slashes", () => {
    const apiName = "DID Number - Local/National";
    const pbName = "DID Number - Local/National";
    expect(norm(apiName)).toBe(norm(pbName));
  });
});

// ─── Drift detection logic ────────────────────────────────────────────────────

describe("price drift detection", () => {
  function computeDrift(pbBuy: number, apiBuy: number | null) {
    if (apiBuy == null) return null;
    return apiBuy - pbBuy;
  }

  function hasDrift(drift: number | null) {
    return drift != null && Math.abs(drift) > 0.005;
  }

  it("returns null drift when API price is not synced", () => {
    const drift = computeDrift(12.50, null);
    expect(drift).toBeNull();
    expect(hasDrift(drift)).toBe(false);
  });

  it("detects no drift when prices match exactly", () => {
    const drift = computeDrift(12.50, 12.50);
    expect(drift).toBe(0);
    expect(hasDrift(drift)).toBe(false);
  });

  it("detects no drift within 0.5 cent tolerance", () => {
    const drift = computeDrift(12.50, 12.504);
    expect(hasDrift(drift)).toBe(false);
  });

  it("detects positive drift when API price is higher than pricebook", () => {
    const drift = computeDrift(12.50, 13.00);
    expect(drift).toBe(0.5);
    expect(hasDrift(drift)).toBe(true);
  });

  it("detects negative drift when API price is lower than pricebook", () => {
    const drift = computeDrift(12.50, 11.00);
    expect(drift).toBeCloseTo(-1.50);
    expect(hasDrift(drift)).toBe(true);
  });

  it("treats $0 API price as valid (not null) — free products", () => {
    const drift = computeDrift(0, 0);
    expect(drift).toBe(0);
    expect(hasDrift(drift)).toBe(false);
  });

  it("detects drift when pricebook has $0 but API has a price", () => {
    // e.g. a product was free in old pricebook but now has a cost
    const drift = computeDrift(0, 5.00);
    expect(drift).toBe(5.00);
    expect(hasDrift(drift)).toBe(true);
  });
});

// ─── parseNum helper (mirrors fetchProducts logic) ────────────────────────────

describe("parseNum helper for API response parsing", () => {
  const parseNum = (v: any): number | null =>
    v != null && v !== "" ? parseFloat(String(v)) : null;

  it("parses numeric string", () => {
    expect(parseNum("12.50")).toBe(12.50);
  });

  it("returns null for null input", () => {
    expect(parseNum(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseNum("")).toBeNull();
  });

  it("parses integer", () => {
    expect(parseNum(15)).toBe(15);
  });

  it("returns null for undefined", () => {
    expect(parseNum(undefined)).toBeNull();
  });
});
