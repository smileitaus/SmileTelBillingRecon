/**
 * retail-bundles.test.ts
 * Unit tests for retail bundle billing logic:
 *  - Margin calculations
 *  - Default billing input rules (hardware, support, SIP)
 *  - BYOD detection
 *  - Bundle component parsing
 */

import { describe, it, expect } from "vitest";

// ── Pure logic helpers (extracted from import script) ─────────────────────────

function computeMargin(retailPrice: number, totalCost: number): number | null {
  if (retailPrice <= 0) return null;
  return ((retailPrice - totalCost) / retailPrice) * 100;
}

function classifyMargin(margin: number | null): "critical" | "warning" | "healthy" | "unknown" {
  if (margin === null) return "unknown";
  if (margin < 10) return "critical";
  if (margin < 20) return "warning";
  return "healthy";
}

interface BundleComponents {
  hasInternet: boolean;
  hasSim: boolean;
  hasVoip: boolean;
  hasHardware: boolean;
  hasSupport: boolean;
  isByod: boolean;
}

function parseBundleComponents(rawComponents: string): BundleComponents {
  const lower = rawComponents.toLowerCase();
  const hasInternet = lower.includes("internet") || lower.includes("nbn") || lower.includes("mbb");
  const hasSim = lower.includes("sim") || lower.includes("mbb");
  const hasVoip = lower.includes("voip") || lower.includes("sip") || lower.includes("voice");
  const hasHardware = lower.includes("hardware") || lower.includes("hdwinc") || lower.includes("hw");
  const hasSupport = lower.includes("support");
  const isByod = lower.includes("byod") || lower.includes("hdboyd");
  return { hasInternet, hasSim, hasVoip, hasHardware, hasSupport, isByod };
}

interface DefaultInputs {
  hardware: number;
  support: number;
  sipChannel: number;
}

function computeDefaultBillingInputs(components: BundleComponents): DefaultInputs {
  return {
    hardware: components.hasHardware && !components.isByod ? 7.50 : 0,
    support: components.hasSupport ? 21.00 : 0,
    sipChannel: components.hasVoip ? 1.50 : 0,
  };
}

function computeTotalDefaultCost(components: BundleComponents): number {
  const inputs = computeDefaultBillingInputs(components);
  return inputs.hardware + inputs.support + inputs.sipChannel;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Margin calculations", () => {
  it("computes correct margin for a typical bundle", () => {
    // Retail $139.30, cost $30 → margin ≈ 78.5%
    const margin = computeMargin(139.30, 30.00);
    expect(margin).toBeCloseTo(78.46, 1);
  });

  it("returns null when retail price is 0", () => {
    expect(computeMargin(0, 10)).toBeNull();
  });

  it("returns negative margin when costs exceed retail", () => {
    const margin = computeMargin(100, 120);
    expect(margin).toBeCloseTo(-20, 1);
  });

  it("classifies margin < 10% as critical", () => {
    expect(classifyMargin(5)).toBe("critical");
    expect(classifyMargin(9.9)).toBe("critical");
  });

  it("classifies margin 10–19.9% as warning", () => {
    expect(classifyMargin(10)).toBe("warning");
    expect(classifyMargin(19.9)).toBe("warning");
  });

  it("classifies margin >= 20% as healthy", () => {
    expect(classifyMargin(20)).toBe("healthy");
    expect(classifyMargin(45)).toBe("healthy");
  });

  it("classifies null margin as unknown", () => {
    expect(classifyMargin(null)).toBe("unknown");
  });
});

describe("Bundle component parsing", () => {
  it("parses a full bundle with all components", () => {
    const result = parseBundleComponents("internet, sim, voip, hardware, support");
    expect(result.hasInternet).toBe(true);
    expect(result.hasSim).toBe(true);
    expect(result.hasVoip).toBe(true);
    expect(result.hasHardware).toBe(true);
    expect(result.hasSupport).toBe(true);
    expect(result.isByod).toBe(false);
  });

  it("detects BYOD from HDBOYD in product name", () => {
    const result = parseBundleComponents("internet, sim, support, HDBOYD");
    expect(result.isByod).toBe(true);
    expect(result.hasHardware).toBe(false);
  });

  it("detects BYOD from byod keyword", () => {
    const result = parseBundleComponents("internet, sim, support, byod");
    expect(result.isByod).toBe(true);
  });

  it("parses MBB bundle (no internet, has sim)", () => {
    const result = parseBundleComponents("mbb, sim, support");
    expect(result.hasInternet).toBe(true); // MBB counts as internet
    expect(result.hasSim).toBe(true);
    expect(result.hasVoip).toBe(false);
    expect(result.hasHardware).toBe(false);
  });

  it("parses internet-only bundle (no voip, no sim)", () => {
    const result = parseBundleComponents("internet, support");
    expect(result.hasInternet).toBe(true);
    expect(result.hasSim).toBe(false);
    expect(result.hasVoip).toBe(false);
    expect(result.hasHardware).toBe(false);
    expect(result.hasSupport).toBe(true);
  });

  it("parses Yiros-style bundle (internet + sim + hardware, no voip)", () => {
    const result = parseBundleComponents("internet, sim, hardware, support");
    expect(result.hasVoip).toBe(false);
    expect(result.hasHardware).toBe(true);
    expect(result.isByod).toBe(false);
  });
});

describe("Default billing input rules", () => {
  it("applies hardware $7.50 when hardware is present and not BYOD", () => {
    const components = parseBundleComponents("internet, sim, voip, hardware, support");
    const inputs = computeDefaultBillingInputs(components);
    expect(inputs.hardware).toBe(7.50);
  });

  it("does NOT apply hardware cost when BYOD", () => {
    const components = parseBundleComponents("internet, sim, support, byod");
    const inputs = computeDefaultBillingInputs(components);
    expect(inputs.hardware).toBe(0);
  });

  it("does NOT apply hardware cost when no hardware component", () => {
    const components = parseBundleComponents("internet, sim, voip, support");
    const inputs = computeDefaultBillingInputs(components);
    expect(inputs.hardware).toBe(0);
  });

  it("applies support $21 when support is present", () => {
    const components = parseBundleComponents("internet, sim, voip, hardware, support");
    const inputs = computeDefaultBillingInputs(components);
    expect(inputs.support).toBe(21.00);
  });

  it("does NOT apply support cost when no support component", () => {
    const components = parseBundleComponents("internet, sim");
    const inputs = computeDefaultBillingInputs(components);
    expect(inputs.support).toBe(0);
  });

  it("applies SIP channel $1.50 when VOIP is present", () => {
    const components = parseBundleComponents("internet, sim, voip, hardware, support");
    const inputs = computeDefaultBillingInputs(components);
    expect(inputs.sipChannel).toBe(1.50);
  });

  it("does NOT apply SIP channel cost when no VOIP (Yiros-style)", () => {
    const components = parseBundleComponents("internet, sim, hardware, support");
    const inputs = computeDefaultBillingInputs(components);
    expect(inputs.sipChannel).toBe(0);
  });

  it("does NOT apply SIP channel cost for MBB bundles (no VOIP)", () => {
    const components = parseBundleComponents("mbb, sim, support");
    const inputs = computeDefaultBillingInputs(components);
    expect(inputs.sipChannel).toBe(0);
  });
});

describe("Total default cost calculations", () => {
  it("calculates $30 total for full bundle (hardware + support + SIP)", () => {
    const components = parseBundleComponents("internet, sim, voip, hardware, support");
    const total = computeTotalDefaultCost(components);
    expect(total).toBe(30.00); // 7.50 + 21.00 + 1.50
  });

  it("calculates $22.50 for bundle with VOIP but no hardware (BYOD)", () => {
    const components = parseBundleComponents("internet, sim, voip, support, byod");
    const total = computeTotalDefaultCost(components);
    expect(total).toBe(22.50); // 0 + 21.00 + 1.50
  });

  it("calculates $28.50 for Yiros-style bundle (hardware + support, no VOIP)", () => {
    const components = parseBundleComponents("internet, sim, hardware, support");
    const total = computeTotalDefaultCost(components);
    expect(total).toBe(28.50); // 7.50 + 21.00 + 0
  });

  it("calculates $21 for internet-only + support bundle", () => {
    const components = parseBundleComponents("internet, support");
    const total = computeTotalDefaultCost(components);
    expect(total).toBe(21.00); // 0 + 21.00 + 0
  });

  it("calculates $21 for MBB bundle (sim + support, no hardware, no VOIP)", () => {
    const components = parseBundleComponents("mbb, sim, support");
    const total = computeTotalDefaultCost(components);
    expect(total).toBe(21.00); // 0 + 21.00 + 0
  });

  it("calculates $0 for bundle with no cost-attracting components", () => {
    const components = parseBundleComponents("internet, sim");
    const total = computeTotalDefaultCost(components);
    expect(total).toBe(0);
  });
});

describe("Margin with default costs applied", () => {
  it("calculates realistic margin for a Zambrero bundle at $139.30", () => {
    // Full bundle: hardware $7.50 + support $21 + SIP $1.50 = $30 default costs
    // Retail $139.30, default costs $30 → margin ≈ 78.5%
    const components = parseBundleComponents("internet, sim, voip, hardware, support");
    const defaultCost = computeTotalDefaultCost(components);
    const margin = computeMargin(139.30, defaultCost);
    expect(margin).toBeGreaterThan(70);
    expect(classifyMargin(margin)).toBe("healthy");
  });

  it("identifies a low-margin bundle correctly", () => {
    // Retail $25, default costs $22.50 → margin ≈ 10%
    const components = parseBundleComponents("internet, sim, voip, support, byod");
    const defaultCost = computeTotalDefaultCost(components);
    const margin = computeMargin(25, defaultCost);
    expect(margin).toBeCloseTo(10, 0);
    expect(classifyMargin(margin)).toBe("warning");
  });
});
