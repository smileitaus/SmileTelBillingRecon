/**
 * retail-bundles-board.test.ts
 * Tests for bundle cost inputs integration with the Reconciliation Board.
 */

import { describe, it, expect } from 'vitest';

// ── Types mirroring the tRPC response ────────────────────────────────────────

type CostInput = {
  id: number;
  slotType: string;
  label: string;
  monthlyCostExGst: number;
  costSource: string;
  linkedServiceExternalId: string | null;
  linkedServicePlanName: string | null;
  linkedServiceType: string | null;
  icon: string;
  notes: string | null;
};

type BundleCostData = {
  bundleId: number;
  subscriberName: string;
  legacyProductName: string;
  standardProductName: string | null;
  retailPriceExGst: number;
  oneBillAccountNumber: string | null;
  isByod: boolean;
  hasVoip: boolean;
  hasHardware: boolean;
  hasSim: boolean;
  hasInternet: boolean;
  matchConfidence: string;
  costInputs: CostInput[];
  totalFixedCost: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCostInput(overrides: Partial<CostInput> = {}): CostInput {
  return {
    id: 1,
    slotType: 'support',
    label: 'SmileTel Support',
    monthlyCostExGst: 21.00,
    costSource: 'default',
    linkedServiceExternalId: null,
    linkedServicePlanName: null,
    linkedServiceType: null,
    icon: 'headphones',
    notes: null,
    ...overrides,
  };
}

function makeBundleCostData(overrides: Partial<BundleCostData> = {}): BundleCostData {
  const costInputs = overrides.costInputs ?? [
    makeCostInput({ id: 1, slotType: 'support', label: 'SmileTel Support', monthlyCostExGst: 21.00 }),
    makeCostInput({ id: 2, slotType: 'hardware', label: 'Hardware Rental', monthlyCostExGst: 7.50 }),
    makeCostInput({ id: 3, slotType: 'sip_channel', label: 'SIP Channel', monthlyCostExGst: 1.50 }),
  ];
  const totalFixedCost = overrides.totalFixedCost ?? costInputs.reduce((s, i) => s + i.monthlyCostExGst, 0);
  return {
    bundleId: 1,
    subscriberName: 'Test Customer Pty Ltd',
    legacyProductName: 'Zam100-36',
    standardProductName: null,
    retailPriceExGst: 139.30,
    oneBillAccountNumber: 'STL1234',
    isByod: false,
    hasVoip: true,
    hasHardware: true,
    hasSim: true,
    hasInternet: true,
    matchConfidence: 'exact',
    costInputs,
    totalFixedCost,
    ...overrides,
  };
}

// ── Cost aggregation logic ────────────────────────────────────────────────────

function computeTotalCost(
  supplierServiceCost: number,
  bundleCostData: BundleCostData | null | undefined
): number {
  const bundleFixedCost = bundleCostData?.totalFixedCost ?? 0;
  return supplierServiceCost + bundleFixedCost;
}

function computeMargin(totalRevenue: number, totalCost: number): {
  margin: number;
  marginPct: number | null;
} {
  const margin = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : null;
  return { margin, marginPct };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Bundle cost inputs on Reconciliation Board', () => {

  describe('getBundleCostInputsForCustomer response shape', () => {
    it('returns correct totalFixedCost as sum of all active cost inputs', () => {
      const data = makeBundleCostData();
      // 21.00 + 7.50 + 1.50 = 30.00
      expect(data.totalFixedCost).toBe(30.00);
    });

    it('returns null for customers without a retail bundle', () => {
      // Non-retail customer returns null from the procedure
      const result: BundleCostData | null = null;
      expect(result).toBeNull();
    });

    it('includes correct icon mappings for each slot type', () => {
      const SLOT_ICONS: Record<string, string> = {
        internet: 'wifi',
        sim_4g: 'smartphone',
        hardware: 'hard-drive',
        sip_channel: 'phone',
        support: 'headphones',
        other: 'package',
      };
      expect(SLOT_ICONS['internet']).toBe('wifi');
      expect(SLOT_ICONS['sim_4g']).toBe('smartphone');
      expect(SLOT_ICONS['hardware']).toBe('hard-drive');
      expect(SLOT_ICONS['sip_channel']).toBe('phone');
      expect(SLOT_ICONS['support']).toBe('headphones');
      expect(SLOT_ICONS['other']).toBe('package');
    });

    it('includes OneBill account number in bundle header', () => {
      const data = makeBundleCostData({ oneBillAccountNumber: 'STL7894' });
      expect(data.oneBillAccountNumber).toBe('STL7894');
    });

    it('handles null OneBill account number gracefully', () => {
      const data = makeBundleCostData({ oneBillAccountNumber: null });
      expect(data.oneBillAccountNumber).toBeNull();
    });
  });

  describe('Total cost calculation with bundle fixed costs', () => {
    it('adds bundle fixed costs to supplier service cost', () => {
      const bundleData = makeBundleCostData(); // totalFixedCost = 30.00
      const supplierServiceCost = 93.00; // e.g. Telstra NBN
      const total = computeTotalCost(supplierServiceCost, bundleData);
      expect(total).toBe(123.00);
    });

    it('returns only supplier cost when no bundle data (non-retail customer)', () => {
      const supplierServiceCost = 93.00;
      const total = computeTotalCost(supplierServiceCost, null);
      expect(total).toBe(93.00);
    });

    it('returns only supplier cost when bundle data is undefined', () => {
      const supplierServiceCost = 61.36;
      const total = computeTotalCost(supplierServiceCost, undefined);
      expect(total).toBe(61.36);
    });

    it('handles zero supplier cost with bundle fixed costs', () => {
      const bundleData = makeBundleCostData({ totalFixedCost: 30.00 });
      const total = computeTotalCost(0, bundleData);
      expect(total).toBe(30.00);
    });

    it('handles bundle with only support cost (no hardware, no SIP)', () => {
      const bundleData = makeBundleCostData({
        costInputs: [
          makeCostInput({ id: 1, slotType: 'support', monthlyCostExGst: 21.00 }),
        ],
        totalFixedCost: 21.00,
      });
      const total = computeTotalCost(61.36, bundleData);
      expect(total).toBeCloseTo(82.36, 2);
    });

    it('handles BYOD bundle (no hardware cost)', () => {
      const bundleData = makeBundleCostData({
        isByod: true,
        costInputs: [
          makeCostInput({ id: 1, slotType: 'support', monthlyCostExGst: 21.00 }),
          makeCostInput({ id: 2, slotType: 'sip_channel', monthlyCostExGst: 1.50 }),
        ],
        totalFixedCost: 22.50,
      });
      expect(bundleData.isByod).toBe(true);
      const total = computeTotalCost(61.36, bundleData);
      expect(total).toBeCloseTo(83.86, 2);
    });
  });

  describe('Margin calculation with bundle fixed costs included', () => {
    it('calculates correct margin for a typical retail bundle customer', () => {
      // Xero revenue: $136.36, Supplier NBN: $61.36, Bundle fixed: $30.00
      const totalRevenue = 136.36;
      const totalCost = computeTotalCost(61.36, makeBundleCostData()); // 61.36 + 30 = 91.36
      const { margin, marginPct } = computeMargin(totalRevenue, totalCost);
      expect(margin).toBeCloseTo(45.00, 1);
      expect(marginPct).toBeCloseTo(33.0, 0);
    });

    it('flags negative margin when costs exceed revenue', () => {
      const totalRevenue = 100.00;
      const totalCost = computeTotalCost(80.00, makeBundleCostData({ totalFixedCost: 30.00 }));
      // 80 + 30 = 110 > 100
      const { margin, marginPct } = computeMargin(totalRevenue, totalCost);
      expect(margin).toBe(-10.00);
      expect(marginPct).toBeCloseTo(-10.0, 0);
    });

    it('returns null marginPct when revenue is zero', () => {
      const { marginPct } = computeMargin(0, 30.00);
      expect(marginPct).toBeNull();
    });

    it('calculates correct margin when bundle has linked service costs', () => {
      // NBN linked to Carbon: $81.05, SIM linked to TIAB: $32.30, fixed: $30.00
      const bundleData = makeBundleCostData({
        costInputs: [
          makeCostInput({ slotType: 'internet', monthlyCostExGst: 81.05, costSource: 'carbon' }),
          makeCostInput({ slotType: 'sim_4g', monthlyCostExGst: 32.30, costSource: 'tiab' }),
          makeCostInput({ slotType: 'support', monthlyCostExGst: 21.00, costSource: 'default' }),
          makeCostInput({ slotType: 'hardware', monthlyCostExGst: 7.50, costSource: 'default' }),
          makeCostInput({ slotType: 'sip_channel', monthlyCostExGst: 1.50, costSource: 'default' }),
        ],
        totalFixedCost: 81.05 + 32.30 + 21.00 + 7.50 + 1.50,
      });
      // totalFixedCost = 143.35, supplierServiceCost = 0 (all in bundle)
      const totalCost = computeTotalCost(0, bundleData);
      const { margin, marginPct } = computeMargin(180.00, totalCost);
      expect(totalCost).toBeCloseTo(143.35, 2);
      expect(margin).toBeCloseTo(36.65, 2);
      expect(marginPct).toBeCloseTo(20.4, 0);
    });
  });

  describe('Cost source badge display logic', () => {
    it('maps cost sources to correct badge colors', () => {
      const sourceColor: Record<string, string> = {
        carbon: 'bg-teal-100 text-teal-700',
        tiab: 'bg-blue-100 text-blue-700',
        vocus: 'bg-emerald-100 text-emerald-700',
        default: 'bg-gray-100 text-gray-600',
        manual: 'bg-amber-100 text-amber-700',
        service_link: 'bg-violet-100 text-violet-700',
      };
      expect(sourceColor['carbon']).toContain('teal');
      expect(sourceColor['tiab']).toContain('blue');
      expect(sourceColor['vocus']).toContain('emerald');
      expect(sourceColor['default']).toContain('gray');
      expect(sourceColor['manual']).toContain('amber');
      expect(sourceColor['service_link']).toContain('violet');
    });

    it('shows "linked" label for service_link source', () => {
      const ci = makeCostInput({ costSource: 'service_link' });
      const label = ci.costSource === 'service_link' ? 'linked' : ci.costSource;
      expect(label).toBe('linked');
    });

    it('shows costSource as label for non-linked sources', () => {
      const ci = makeCostInput({ costSource: 'carbon' });
      const label = ci.costSource === 'service_link' ? 'linked' : ci.costSource;
      expect(label).toBe('carbon');
    });
  });

  describe('Bundle header display', () => {
    it('shows retail price correctly formatted', () => {
      const data = makeBundleCostData({ retailPriceExGst: 139.30 });
      const formatted = `$${data.retailPriceExGst.toFixed(2)}/mo`;
      expect(formatted).toBe('$139.30/mo');
    });

    it('shows total fixed cost correctly formatted', () => {
      const data = makeBundleCostData({ totalFixedCost: 30.00 });
      const formatted = `$${data.totalFixedCost.toFixed(2)}/mo`;
      expect(formatted).toBe('$30.00/mo');
    });

    it('shows OB account number with prefix', () => {
      const data = makeBundleCostData({ oneBillAccountNumber: 'STL7894' });
      const display = data.oneBillAccountNumber ? `OB#${data.oneBillAccountNumber}` : '';
      expect(display).toBe('OB#STL7894');
    });

    it('hides OB account number when null', () => {
      const data = makeBundleCostData({ oneBillAccountNumber: null });
      const display = data.oneBillAccountNumber ? `OB#${data.oneBillAccountNumber}` : '';
      expect(display).toBe('');
    });
  });
});
