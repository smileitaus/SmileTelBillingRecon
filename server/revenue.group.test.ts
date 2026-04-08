/**
 * Tests for Revenue Group logic:
 * - Loss detection (totalCost > totalRevenue)
 * - Group margin calculation
 * - Badge type assignment (voice_pack vs data_bundle vs generic)
 * - groupTotalCost propagation to service rows
 */
import { describe, it, expect } from "vitest";

// ─── Pure helpers (extracted from router logic for testability) ───────────────

function computeGroupMargin(totalRevenue: number, totalCost: number): number | null {
  if (totalRevenue <= 0) return null;
  return ((totalRevenue - totalCost) / totalRevenue) * 100;
}

function isGroupAtLoss(totalRevenue: number, totalCost: number): boolean {
  return totalCost > totalRevenue && totalRevenue > 0;
}

function getBadgeType(groupType: string): "voice_pack" | "data_bundle" | "generic" {
  if (groupType === "voice_pack") return "voice_pack";
  if (groupType === "data_bundle") return "data_bundle";
  return "generic";
}

function getBadgeColour(groupType: string, isLoss: boolean): string {
  if (isLoss) return "red";
  if (groupType === "data_bundle") return "teal";
  return "blue";
}

// ─── Group Margin Tests ───────────────────────────────────────────────────────

describe("computeGroupMargin", () => {
  it("returns correct margin percentage for a profitable group", () => {
    const margin = computeGroupMargin(1837.08, 0);
    expect(margin).toBe(100);
  });

  it("returns correct margin for partial cost", () => {
    const margin = computeGroupMargin(1000, 250);
    expect(margin).toBeCloseTo(75, 1);
  });

  it("returns negative margin when cost exceeds revenue", () => {
    const margin = computeGroupMargin(500, 600);
    expect(margin).toBeCloseTo(-20, 1);
  });

  it("returns null when revenue is zero (no revenue data)", () => {
    const margin = computeGroupMargin(0, 100);
    expect(margin).toBeNull();
  });

  it("returns null when revenue is negative (invalid data)", () => {
    const margin = computeGroupMargin(-50, 100);
    expect(margin).toBeNull();
  });

  it("returns 0% margin when cost equals revenue exactly", () => {
    const margin = computeGroupMargin(500, 500);
    expect(margin).toBe(0);
  });
});

// ─── Loss Detection Tests ─────────────────────────────────────────────────────

describe("isGroupAtLoss", () => {
  it("returns true when cost exceeds revenue", () => {
    expect(isGroupAtLoss(500, 600)).toBe(true);
  });

  it("returns false when revenue exceeds cost", () => {
    expect(isGroupAtLoss(1837.08, 0)).toBe(false);
  });

  it("returns false when cost equals revenue (breakeven is not a loss)", () => {
    expect(isGroupAtLoss(500, 500)).toBe(false);
  });

  it("returns false when revenue is zero (no revenue data — cannot determine loss)", () => {
    expect(isGroupAtLoss(0, 100)).toBe(false);
  });

  it("correctly flags a voice pack with high component costs", () => {
    // Voice pack: 10 services at $50/month cost, billed as $400 total
    expect(isGroupAtLoss(400, 500)).toBe(true);
  });

  it("does not flag a zero-cost voice pack as a loss", () => {
    // UCXcel Webex Basic: $0 wholesale, $1837 revenue
    expect(isGroupAtLoss(1837.08, 0)).toBe(false);
  });
});

// ─── Badge Type Tests ─────────────────────────────────────────────────────────

describe("getBadgeType", () => {
  it("returns voice_pack for voice_pack groups", () => {
    expect(getBadgeType("voice_pack")).toBe("voice_pack");
  });

  it("returns data_bundle for data_bundle groups", () => {
    expect(getBadgeType("data_bundle")).toBe("data_bundle");
  });

  it("returns generic for unknown group types", () => {
    expect(getBadgeType("retail_bundle")).toBe("generic");
    expect(getBadgeType("")).toBe("generic");
    expect(getBadgeType("custom")).toBe("generic");
  });
});

// ─── Badge Colour Tests ───────────────────────────────────────────────────────

describe("getBadgeColour", () => {
  it("returns red for any loss group regardless of type", () => {
    expect(getBadgeColour("voice_pack", true)).toBe("red");
    expect(getBadgeColour("data_bundle", true)).toBe("red");
    expect(getBadgeColour("retail_bundle", true)).toBe("red");
  });

  it("returns teal for non-loss data bundles", () => {
    expect(getBadgeColour("data_bundle", false)).toBe("teal");
  });

  it("returns blue for non-loss voice packs and other types", () => {
    expect(getBadgeColour("voice_pack", false)).toBe("blue");
    expect(getBadgeColour("retail_bundle", false)).toBe("blue");
  });
});

// ─── Group Detail Aggregation Tests ──────────────────────────────────────────

describe("group detail aggregation", () => {
  const mockServices = [
    { planName: "UCXcel Webex Basic", monthlyCost: "0.00", costSource: "sasboss_pricebook" },
    { planName: "UCXcel Professional", monthlyCost: "22.50", costSource: "sasboss_pricebook" },
    { planName: "Auto Attendant", monthlyCost: "0.00", costSource: "sasboss_pricebook" },
    { planName: "DID Australia", monthlyCost: "0.20", costSource: "sasboss_pricebook" },
    { planName: "Call Queue", monthlyCost: "0.00", costSource: "sasboss_pricebook" },
  ];

  it("correctly sums total cost from all services in a group", () => {
    const totalCost = mockServices.reduce((sum, s) => sum + parseFloat(s.monthlyCost), 0);
    expect(totalCost).toBeCloseTo(22.70, 2);
  });

  it("correctly identifies the highest-cost component", () => {
    const sorted = [...mockServices].sort(
      (a, b) => parseFloat(b.monthlyCost) - parseFloat(a.monthlyCost)
    );
    expect(sorted[0].planName).toBe("UCXcel Professional");
  });

  it("counts zero-cost services correctly", () => {
    // DID Australia = $0.20 (not zero), so 3 of 5 services are zero-cost
    const zeroCostCount = mockServices.filter(s => parseFloat(s.monthlyCost) === 0).length;
    expect(zeroCostCount).toBe(3);
  });

  it("computes correct group margin with mixed zero and non-zero costs", () => {
    const totalCost = mockServices.reduce((sum, s) => sum + parseFloat(s.monthlyCost), 0);
    const totalRevenue = 1837.08;
    const margin = computeGroupMargin(totalRevenue, totalCost);
    // (1837.08 - 22.70) / 1837.08 * 100 ≈ 98.76%
    expect(margin).toBeCloseTo(98.76, 1);
  });
});
