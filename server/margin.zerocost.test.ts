/**
 * Tests for zero-cost margin logic.
 *
 * The margin formula has three cases:
 *   1. cost > 0 AND revenue > 0  → normal formula: (revenue - cost) / revenue * 100
 *   2. cost = 0 AND costSource is a confirmed pricebook source AND revenue > 0 → 100%
 *   3. cost = 0 AND costSource = 'unknown' (or null) → NULL (unknown, not misleading 100%)
 *
 * The CostCell display logic:
 *   - confirmed zero-cost sources → show "$0.00"
 *   - unknown zero-cost → show "Unknown"
 */

import { describe, it, expect } from 'vitest';

// ── Margin formula (mirrors the SQL CASE logic in db.ts getServicesWithMargin) ──

const CONFIRMED_ZERO_COST_SOURCES = new Set([
  'sasboss_pricebook',
  'access4_diamond_pricebook_excel',
  'access4_diamond_pricebook',
  'retail_only_no_wholesale',
  'access4_invoice_corrected',
  'pricebook-derived',
  'product_map',
]);

function computeMargin(
  monthlyCost: number,
  monthlyRevenue: number,
  costSource: string | null
): number | null {
  if (monthlyRevenue > 0 && monthlyCost > 0) {
    return Math.round(((monthlyRevenue - monthlyCost) / monthlyRevenue) * 10000) / 100;
  }
  if (
    monthlyRevenue > 0 &&
    monthlyCost === 0 &&
    costSource !== null &&
    CONFIRMED_ZERO_COST_SOURCES.has(costSource)
  ) {
    return 100.0;
  }
  return null;
}

// ── CostCell display logic (mirrors RevenueMargin.tsx) ──

function costCellLabel(
  cost: number,
  costSource: string | null | undefined
): string {
  if (cost === 0) {
    if (costSource && CONFIRMED_ZERO_COST_SOURCES.has(costSource)) {
      return '$0.00';
    }
    return 'Unknown';
  }
  return `$${cost.toFixed(2)}`;
}

// ── Margin formula tests ──

describe('computeMargin – normal cost > 0', () => {
  it('returns correct margin for typical service', () => {
    expect(computeMargin(13.80, 25.00, 'sasboss_pricebook')).toBeCloseTo(44.8, 1);
  });

  it('returns 0 when cost equals revenue', () => {
    expect(computeMargin(25.00, 25.00, 'supplier_invoice')).toBe(0);
  });

  it('returns negative margin when cost exceeds revenue', () => {
    const m = computeMargin(30.00, 25.00, 'supplier_invoice');
    expect(m).not.toBeNull();
    expect(m!).toBeLessThan(0);
  });

  it('ignores costSource when both cost and revenue are > 0', () => {
    expect(computeMargin(11.25, 20.00, 'unknown')).toBeCloseTo(43.75, 1);
  });
});

describe('computeMargin – confirmed zero-cost sources → 100%', () => {
  const confirmedSources = [
    'sasboss_pricebook',
    'access4_diamond_pricebook_excel',
    'access4_diamond_pricebook',
    'retail_only_no_wholesale',
    'access4_invoice_corrected',
    'pricebook-derived',
    'product_map',
  ];

  for (const src of confirmedSources) {
    it(`returns 100% for costSource="${src}" with $0 cost and revenue > 0`, () => {
      expect(computeMargin(0, 1837.08, src)).toBe(100.0);
    });
  }

  it('UCXcel Webex Basic: $0.00 cost from sasboss_pricebook → 100% margin', () => {
    expect(computeMargin(0, 1837.08, 'sasboss_pricebook')).toBe(100.0);
  });

  it('UCXcel Basic Queue Agent: $0.00 cost from sasboss_pricebook → 100% margin', () => {
    expect(computeMargin(0, 45.00, 'sasboss_pricebook')).toBe(100.0);
  });
});

describe('computeMargin – unknown cost source → NULL', () => {
  it('returns null when costSource is "unknown" and cost is 0', () => {
    expect(computeMargin(0, 150.00, 'unknown')).toBeNull();
  });

  it('returns null when costSource is null and cost is 0', () => {
    expect(computeMargin(0, 150.00, null)).toBeNull();
  });

  it('returns null when revenue is 0 regardless of cost', () => {
    expect(computeMargin(0, 0, 'sasboss_pricebook')).toBeNull();
    expect(computeMargin(13.80, 0, 'supplier_invoice')).toBeNull();
  });

  it('returns null for supplier_invoice with $0 cost (not a confirmed zero-cost source)', () => {
    expect(computeMargin(0, 100.00, 'supplier_invoice')).toBeNull();
  });
});

// ── CostCell display tests ──

describe('costCellLabel – confirmed zero-cost → $0.00', () => {
  it('shows $0.00 for sasboss_pricebook zero-cost', () => {
    expect(costCellLabel(0, 'sasboss_pricebook')).toBe('$0.00');
  });

  it('shows $0.00 for retail_only_no_wholesale', () => {
    expect(costCellLabel(0, 'retail_only_no_wholesale')).toBe('$0.00');
  });

  it('shows $0.00 for access4_diamond_pricebook_excel', () => {
    expect(costCellLabel(0, 'access4_diamond_pricebook_excel')).toBe('$0.00');
  });
});

describe('costCellLabel – unknown zero-cost → Unknown', () => {
  it('shows Unknown when costSource is "unknown"', () => {
    expect(costCellLabel(0, 'unknown')).toBe('Unknown');
  });

  it('shows Unknown when costSource is null', () => {
    expect(costCellLabel(0, null)).toBe('Unknown');
  });

  it('shows Unknown when costSource is undefined', () => {
    expect(costCellLabel(0, undefined)).toBe('Unknown');
  });

  it('shows Unknown for supplier_invoice with $0 cost', () => {
    expect(costCellLabel(0, 'supplier_invoice')).toBe('Unknown');
  });
});

describe('costCellLabel – non-zero cost', () => {
  it('shows formatted cost for positive values', () => {
    expect(costCellLabel(13.80, 'sasboss_pricebook')).toBe('$13.80');
    expect(costCellLabel(11.25, 'access4_diamond_pricebook_excel')).toBe('$11.25');
  });
});
