/**
 * Retail Bundles — Live Cost Resolution & Margin Report Tests
 *
 * Tests the business logic for:
 * 1. Live cost source resolution (Carbon > TIAB > Vocus > default)
 * 2. Margin classification thresholds
 * 3. Margin report aggregation and grouping
 * 4. CSV export row formatting
 * 5. Cost slot rules (BYOD, no-VOIP, no-hardware)
 */

import { describe, it, expect } from "vitest";

// ── Cost Resolution Logic ─────────────────────────────────────────────────────

/**
 * Mirrors the server-side priority chain:
 * carbon > tiab > vocus > default_sim ($15) > default
 */
function resolveSlotCost(
  slotType: string,
  service: {
    carbonMonthlyCost?: number | null;
    tiabBaseCharge?: number | null;
    vocusPlanCost?: number | null;
    provider?: string;
  }
): { cost: number; source: string } {
  if (slotType === "internet") {
    if (service.carbonMonthlyCost != null && service.carbonMonthlyCost > 0) {
      return { cost: service.carbonMonthlyCost, source: "carbon" };
    }
    return { cost: 0, source: "default" };
  }

  if (slotType === "sim_4g") {
    if (service.tiabBaseCharge != null && service.tiabBaseCharge > 0) {
      return { cost: service.tiabBaseCharge, source: "tiab" };
    }
    if (service.vocusPlanCost != null && service.vocusPlanCost > 0) {
      return { cost: service.vocusPlanCost, source: "vocus" };
    }
    // Default SIM cost as per knowledge base
    return { cost: 15.0, source: "default_sim" };
  }

  return { cost: 0, source: "default" };
}

describe("Live Cost Resolution — Internet (NBN) slot", () => {
  it("uses Carbon cost when available", () => {
    const result = resolveSlotCost("internet", { carbonMonthlyCost: 81.05 });
    expect(result.source).toBe("carbon");
    expect(result.cost).toBe(81.05);
  });

  it("falls back to default when Carbon cost is null", () => {
    const result = resolveSlotCost("internet", { carbonMonthlyCost: null });
    expect(result.source).toBe("default");
    expect(result.cost).toBe(0);
  });

  it("falls back to default when Carbon cost is zero", () => {
    const result = resolveSlotCost("internet", { carbonMonthlyCost: 0 });
    expect(result.source).toBe("default");
  });

  it("uses Carbon cost for 100/40 NBN plan ($81.05)", () => {
    const result = resolveSlotCost("internet", { carbonMonthlyCost: 81.05 });
    expect(result.cost).toBeCloseTo(81.05, 2);
  });

  it("uses Carbon cost for 250/25 NBN plan ($93.50)", () => {
    const result = resolveSlotCost("internet", { carbonMonthlyCost: 93.50 });
    expect(result.cost).toBeCloseTo(93.50, 2);
  });
});

describe("Live Cost Resolution — SIM (4G) slot", () => {
  it("uses TIAB base charge when available", () => {
    const result = resolveSlotCost("sim_4g", { tiabBaseCharge: 32.30 });
    expect(result.source).toBe("tiab");
    expect(result.cost).toBe(32.30);
  });

  it("uses Vocus plan cost when TIAB is not available", () => {
    const result = resolveSlotCost("sim_4g", { tiabBaseCharge: null, vocusPlanCost: 15.00 });
    expect(result.source).toBe("vocus");
    expect(result.cost).toBe(15.00);
  });

  it("defaults to $15.00 when neither TIAB nor Vocus cost is available", () => {
    const result = resolveSlotCost("sim_4g", { tiabBaseCharge: null, vocusPlanCost: null });
    expect(result.source).toBe("default_sim");
    expect(result.cost).toBe(15.00);
  });

  it("prefers TIAB over Vocus when both are available", () => {
    const result = resolveSlotCost("sim_4g", { tiabBaseCharge: 28.00, vocusPlanCost: 15.00 });
    expect(result.source).toBe("tiab");
    expect(result.cost).toBe(28.00);
  });

  it("does not use zero TIAB charge — falls through to Vocus", () => {
    const result = resolveSlotCost("sim_4g", { tiabBaseCharge: 0, vocusPlanCost: 15.00 });
    expect(result.source).toBe("vocus");
  });
});

// ── Margin Classification ─────────────────────────────────────────────────────

function classifyMargin(marginPercent: number | null): "critical" | "warning" | "healthy" | "unknown" {
  if (marginPercent === null) return "unknown";
  if (marginPercent < 10) return "critical";
  if (marginPercent < 20) return "warning";
  return "healthy";
}

function calcMargin(retailPrice: number, totalCost: number): number | null {
  if (retailPrice <= 0) return null;
  return ((retailPrice - totalCost) / retailPrice) * 100;
}

describe("Margin Classification", () => {
  it("classifies margin < 10% as critical", () => {
    expect(classifyMargin(9.9)).toBe("critical");
    expect(classifyMargin(0)).toBe("critical");
    expect(classifyMargin(-5)).toBe("critical");
  });

  it("classifies margin 10–19.99% as warning", () => {
    expect(classifyMargin(10)).toBe("warning");
    expect(classifyMargin(15)).toBe("warning");
    expect(classifyMargin(19.99)).toBe("warning");
  });

  it("classifies margin >= 20% as healthy", () => {
    expect(classifyMargin(20)).toBe("healthy");
    expect(classifyMargin(35)).toBe("healthy");
    expect(classifyMargin(100)).toBe("healthy");
  });

  it("classifies null margin as unknown", () => {
    expect(classifyMargin(null)).toBe("unknown");
  });
});

describe("Margin Calculation", () => {
  it("calculates margin correctly for standard bundle", () => {
    // Retail $139.09, cost = $21 + $7.50 + $1.50 + $15 + $81.05 = $126.05
    const margin = calcMargin(139.09, 126.05);
    expect(margin).toBeCloseTo(9.37, 1);
    expect(classifyMargin(margin!)).toBe("critical");
  });

  it("calculates margin for premium bundle", () => {
    // Retail $159.09, same costs
    const margin = calcMargin(159.09, 126.05);
    expect(margin).toBeCloseTo(20.77, 1);
    expect(classifyMargin(margin!)).toBe("healthy");
  });

  it("returns null for zero retail price", () => {
    expect(calcMargin(0, 50)).toBeNull();
  });

  it("handles negative GP (cost > retail)", () => {
    const margin = calcMargin(100, 120);
    expect(margin).toBeCloseTo(-20, 1);
    expect(classifyMargin(margin!)).toBe("critical");
  });

  it("calculates 100% margin when costs are zero", () => {
    const margin = calcMargin(139.09, 0);
    expect(margin).toBeCloseTo(100, 1);
  });
});

// ── Default Billing Input Rules ───────────────────────────────────────────────

function getDefaultInputs(bundle: {
  hasHardware: boolean;
  isByod: boolean;
  hasVoip: boolean;
  hasSupport: boolean;
  hasSim: boolean;
  hasInternet: boolean;
}): Array<{ slotType: string; label: string; cost: number }> {
  const inputs: Array<{ slotType: string; label: string; cost: number }> = [];

  // Hardware: $7.50 unless BYOD or no hardware component
  if (bundle.hasHardware && !bundle.isByod) {
    inputs.push({ slotType: "hardware", label: "Hardware Rental", cost: 7.50 });
  }

  // Support: $21 always when hasSupport
  if (bundle.hasSupport) {
    inputs.push({ slotType: "support", label: "Support", cost: 21.00 });
  }

  // SIP channels: $1.50 only when hasVoip
  if (bundle.hasVoip) {
    inputs.push({ slotType: "sip_channel", label: "SIP Channel", cost: 1.50 });
  }

  return inputs;
}

describe("Default Billing Input Rules", () => {
  it("standard bundle (NBN + SIM + VOIP + hardware + support) gets all 3 inputs", () => {
    const inputs = getDefaultInputs({
      hasHardware: true, isByod: false, hasVoip: true, hasSupport: true,
      hasSim: true, hasInternet: true,
    });
    expect(inputs).toHaveLength(3);
    expect(inputs.find(i => i.slotType === "hardware")?.cost).toBe(7.50);
    expect(inputs.find(i => i.slotType === "support")?.cost).toBe(21.00);
    expect(inputs.find(i => i.slotType === "sip_channel")?.cost).toBe(1.50);
  });

  it("BYOD bundle skips hardware rental", () => {
    const inputs = getDefaultInputs({
      hasHardware: false, isByod: true, hasVoip: true, hasSupport: true,
      hasSim: true, hasInternet: true,
    });
    expect(inputs.find(i => i.slotType === "hardware")).toBeUndefined();
    expect(inputs.find(i => i.slotType === "support")?.cost).toBe(21.00);
    expect(inputs.find(i => i.slotType === "sip_channel")?.cost).toBe(1.50);
  });

  it("Yiros-style bundle (no VOIP) skips SIP channel", () => {
    const inputs = getDefaultInputs({
      hasHardware: true, isByod: false, hasVoip: false, hasSupport: true,
      hasSim: true, hasInternet: true,
    });
    expect(inputs.find(i => i.slotType === "sip_channel")).toBeUndefined();
    expect(inputs.find(i => i.slotType === "hardware")?.cost).toBe(7.50);
    expect(inputs.find(i => i.slotType === "support")?.cost).toBe(21.00);
  });

  it("MBB-only bundle (no NBN, no VOIP, no hardware) only gets support", () => {
    const inputs = getDefaultInputs({
      hasHardware: false, isByod: false, hasVoip: false, hasSupport: true,
      hasSim: true, hasInternet: false,
    });
    expect(inputs).toHaveLength(1);
    expect(inputs[0].slotType).toBe("support");
    expect(inputs[0].cost).toBe(21.00);
  });

  it("internet+support only bundle (no SIM, no VOIP, no hardware) only gets support", () => {
    const inputs = getDefaultInputs({
      hasHardware: false, isByod: false, hasVoip: false, hasSupport: true,
      hasSim: false, hasInternet: true,
    });
    expect(inputs).toHaveLength(1);
    expect(inputs[0].slotType).toBe("support");
  });

  it("bundle with hardware flag but isByod=true skips hardware", () => {
    const inputs = getDefaultInputs({
      hasHardware: true, isByod: true, hasVoip: true, hasSupport: true,
      hasSim: true, hasInternet: true,
    });
    expect(inputs.find(i => i.slotType === "hardware")).toBeUndefined();
  });
});

// ── Margin Report Aggregation ─────────────────────────────────────────────────

interface BundleReportItem {
  id: number;
  subscriberName: string;
  bundleType: string;
  retailPriceExGst: number;
  totalCostExGst: number;
  grossProfit: number;
  marginPercent: number | null;
  marginClass: string;
  carbonSlots: number;
  tiabSlots: number;
  vocusSlots: number;
  defaultSlots: number;
}

function buildReportSummary(items: BundleReportItem[]) {
  const totalRevenue = items.reduce((s, i) => s + i.retailPriceExGst, 0);
  const totalCost = items.reduce((s, i) => s + i.totalCostExGst, 0);
  const totalGP = totalRevenue - totalCost;
  const marginsWithData = items.filter(i => i.marginPercent !== null).map(i => i.marginPercent!);
  const avgMargin = marginsWithData.length > 0
    ? marginsWithData.reduce((s, m) => s + m, 0) / marginsWithData.length
    : null;
  const criticalCount = items.filter(i => i.marginClass === "critical").length;
  const warningCount = items.filter(i => i.marginClass === "warning").length;
  const healthyCount = items.filter(i => i.marginClass === "healthy").length;

  return { totalRevenue, totalCost, totalGP, avgMargin, criticalCount, warningCount, healthyCount };
}

describe("Margin Report Aggregation", () => {
  const sampleItems: BundleReportItem[] = [
    {
      id: 1, subscriberName: "Zambrero Box Hill", bundleType: "NBN 100/40 Bundle",
      retailPriceExGst: 139.09, totalCostExGst: 126.05, grossProfit: 13.04,
      marginPercent: 9.37, marginClass: "critical",
      carbonSlots: 1, tiabSlots: 1, vocusSlots: 0, defaultSlots: 3,
    },
    {
      id: 2, subscriberName: "Zambrero Canberra", bundleType: "NBN 100/40 Bundle",
      retailPriceExGst: 159.09, totalCostExGst: 126.05, grossProfit: 33.04,
      marginPercent: 20.77, marginClass: "healthy",
      carbonSlots: 1, tiabSlots: 0, vocusSlots: 1, defaultSlots: 3,
    },
    {
      id: 3, subscriberName: "Yiros Shop Fortitude", bundleType: "NBN 25/10 Bundle",
      retailPriceExGst: 109.09, totalCostExGst: 98.50, grossProfit: 10.59,
      marginPercent: 9.71, marginClass: "critical",
      carbonSlots: 0, tiabSlots: 0, vocusSlots: 0, defaultSlots: 5,
    },
    {
      id: 4, subscriberName: "Nodo Café", bundleType: "NBN 50/20 Bundle",
      retailPriceExGst: 129.09, totalCostExGst: 105.00, grossProfit: 24.09,
      marginPercent: 18.66, marginClass: "warning",
      carbonSlots: 1, tiabSlots: 1, vocusSlots: 0, defaultSlots: 3,
    },
  ];

  it("calculates total revenue correctly", () => {
    const summary = buildReportSummary(sampleItems);
    expect(summary.totalRevenue).toBeCloseTo(536.36, 2);
  });

  it("calculates total GP correctly", () => {
    const summary = buildReportSummary(sampleItems);
    expect(summary.totalGP).toBeCloseTo(80.76, 2);
  });

  it("counts margin classes correctly", () => {
    const summary = buildReportSummary(sampleItems);
    expect(summary.criticalCount).toBe(2);
    expect(summary.warningCount).toBe(1);
    expect(summary.healthyCount).toBe(1);
  });

  it("calculates average margin correctly", () => {
    const summary = buildReportSummary(sampleItems);
    // (9.37 + 20.77 + 9.71 + 18.66) / 4 = 14.6275
    expect(summary.avgMargin).toBeCloseTo(14.63, 1);
  });

  it("filters critical-only items correctly", () => {
    const critical = sampleItems.filter(i => i.marginClass === "critical");
    const summary = buildReportSummary(critical);
    expect(summary.criticalCount).toBe(2);
    expect(summary.warningCount).toBe(0);
    expect(summary.healthyCount).toBe(0);
  });

  it("groups items by bundle type correctly", () => {
    const groups = sampleItems.reduce((acc, item) => {
      if (!acc[item.bundleType]) acc[item.bundleType] = [];
      acc[item.bundleType].push(item);
      return acc;
    }, {} as Record<string, BundleReportItem[]>);

    expect(Object.keys(groups)).toHaveLength(3);
    expect(groups["NBN 100/40 Bundle"]).toHaveLength(2);
    expect(groups["NBN 25/10 Bundle"]).toHaveLength(1);
    expect(groups["NBN 50/20 Bundle"]).toHaveLength(1);
  });
});

// ── CSV Row Formatting ────────────────────────────────────────────────────────

function formatCsvRow(item: BundleReportItem & { oneBillAccountNumber: string; customerName: string; isByod: boolean; hasVoip: boolean; matchConfidence: string; legacyProductName: string; manualSlots: number; costBreakdown: Array<{ slotType: string; cost: number }> }): string[] {
  const getSlotCost = (type: string) => {
    const slot = item.costBreakdown?.find(s => s.slotType === type);
    return slot ? slot.cost.toFixed(2) : "0.00";
  };

  return [
    item.oneBillAccountNumber,
    `"${item.subscriberName.replace(/"/g, '""')}"`,
    `"${item.customerName.replace(/"/g, '""')}"`,
    `"${item.bundleType}"`,
    `"${item.legacyProductName.replace(/"/g, '""')}"`,
    item.retailPriceExGst.toFixed(2),
    item.totalCostExGst.toFixed(2),
    item.grossProfit.toFixed(2),
    item.marginPercent !== null ? item.marginPercent.toFixed(1) : "",
    item.marginClass,
    item.isByod ? "Yes" : "No",
    item.hasVoip ? "Yes" : "No",
    item.matchConfidence,
    getSlotCost("internet"),
    getSlotCost("sim_4g"),
    getSlotCost("hardware"),
    getSlotCost("sip_channel"),
    getSlotCost("support"),
    String(item.carbonSlots),
    String(item.tiabSlots),
    String(item.vocusSlots),
    String(item.defaultSlots),
  ];
}

describe("CSV Export Row Formatting", () => {
  const testItem = {
    id: 1,
    oneBillAccountNumber: "STL2402",
    subscriberName: 'Zambrero "Box Hill"',
    customerName: "Zambrero Box Hill Pty Ltd",
    bundleType: "NBN 100/40 Bundle",
    legacyProductName: "ST-Retail Premium Support NBN 100/40-36 Months HDWINC",
    retailPriceExGst: 139.09,
    totalCostExGst: 126.05,
    grossProfit: 13.04,
    marginPercent: 9.37,
    marginClass: "critical",
    isByod: false,
    hasVoip: true,
    matchConfidence: "high",
    carbonSlots: 1,
    tiabSlots: 1,
    vocusSlots: 0,
    defaultSlots: 3,
    manualSlots: 0,
    costBreakdown: [
      { slotType: "internet", cost: 81.05 },
      { slotType: "sim_4g", cost: 15.00 },
      { slotType: "hardware", cost: 7.50 },
      { slotType: "sip_channel", cost: 1.50 },
      { slotType: "support", cost: 21.00 },
    ],
  };

  it("escapes double quotes in subscriber name", () => {
    const row = formatCsvRow(testItem);
    expect(row[1]).toBe('"Zambrero ""Box Hill"""');
  });

  it("formats retail price to 2 decimal places", () => {
    const row = formatCsvRow(testItem);
    expect(row[5]).toBe("139.09");
  });

  it("formats margin percent to 1 decimal place", () => {
    const row = formatCsvRow(testItem);
    expect(row[8]).toBe("9.4");
  });

  it("outputs correct internet cost from breakdown", () => {
    const row = formatCsvRow(testItem);
    expect(row[13]).toBe("81.05"); // internet slot
  });

  it("outputs correct SIM cost from breakdown", () => {
    const row = formatCsvRow(testItem);
    expect(row[14]).toBe("15.00"); // sim_4g slot
  });

  it("outputs 0.00 for missing slot types", () => {
    const itemNoHardware = { ...testItem, costBreakdown: testItem.costBreakdown.filter(s => s.slotType !== "hardware") };
    const row = formatCsvRow(itemNoHardware);
    expect(row[15]).toBe("0.00"); // hardware slot
  });

  it("outputs BYOD flag correctly", () => {
    const row = formatCsvRow(testItem);
    expect(row[10]).toBe("No");
    const byodRow = formatCsvRow({ ...testItem, isByod: true });
    expect(byodRow[10]).toBe("Yes");
  });

  it("outputs correct number of columns (22)", () => {
    const row = formatCsvRow(testItem);
    expect(row).toHaveLength(22);
  });
});
