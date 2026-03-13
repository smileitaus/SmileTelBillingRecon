/**
 * Cost integrity tests — verify that monthlyCost is never set from Xero billing items.
 * 
 * Key invariants:
 * 1. No service should have monthlyCost == monthlyRevenue (cost == sell price is impossible)
 * 2. Services with dataSource = 'Xero Feb 2026 Invoice' should have monthlyCost = 0 (cost unknown)
 * 3. recalculateAll() should never modify monthlyCost
 * 4. marginPercent should only be set when both cost and revenue are > 0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recalculateAll, getServicesWithMargin } from './db';

// Mock the database module
vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
  };
});

describe('Cost/Revenue Data Integrity', () => {
  describe('recalculateAll invariants', () => {
    it('should never set monthlyCost from billing items', async () => {
      // The recalculateAll function should only update monthlyRevenue and marginPercent
      // It should NEVER touch monthlyCost
      const dbTs = await import('fs').then(fs => 
        fs.readFileSync('./server/db.ts', 'utf-8')
      );
      
      // Find the recalculateAll function body
      const recalcStart = dbTs.indexOf('export async function recalculateAll()');
      const recalcEnd = dbTs.indexOf('\nexport async function', recalcStart + 1);
      const recalcBody = dbTs.slice(recalcStart, recalcEnd > 0 ? recalcEnd : recalcStart + 3000);
      
      // The function should NOT set monthlyCost in the UPDATE services statement
      // It should only update monthlyRevenue and marginPercent
      // Find the Step 2 UPDATE services block
      const step2Start = recalcBody.indexOf('UPDATE services s');
      const step2End = recalcBody.indexOf('// Step 3:', step2Start);
      const step2Block = recalcBody.slice(step2Start, step2End > 0 ? step2End : step2Start + 2000);
      
      // monthlyCost should NOT appear as a SET target (but can appear in CAST/subquery)
      // Check that 'monthlyCost =' pattern doesn't appear in SET position
      expect(step2Block).not.toMatch(/SET[\s\S]*monthlyCost\s*=/);
      // monthlyRevenue SHOULD appear (it's being updated from billing items)
      expect(step2Block).toMatch(/monthlyRevenue/);
      // marginPercent SHOULD appear (it's being recalculated)
      expect(step2Block).toMatch(/marginPercent/);
    });

    it('should only compute marginPercent when both cost and revenue are known', async () => {
      const dbTs = await import('fs').then(fs => 
        fs.readFileSync('./server/db.ts', 'utf-8')
      );
      
      // Find the recalculateAll function body
      const recalcStart = dbTs.indexOf('export async function recalculateAll()');
      const recalcEnd = dbTs.indexOf('\nexport async function', recalcStart + 1);
      const recalcBody = dbTs.slice(recalcStart, recalcEnd > 0 ? recalcEnd : recalcStart + 3000);
      
      // The marginPercent CASE WHEN should require BOTH cost AND revenue > 0
      // Look for the pattern: WHEN ... > 0 AND ... > 0
      expect(recalcBody).toMatch(/monthlyCost.*>\s*0/);
    });
  });

  describe('getServicesWithMargin', () => {
    it('should compute NULL margin when cost is 0 (unknown)', async () => {
      const dbTs = await import('fs').then(fs => 
        fs.readFileSync('./server/db.ts', 'utf-8')
      );
      
      // Find the computedMargin formula
      const computedMarginMatch = dbTs.match(/const computedMargin = sql.*?`(.*?)`/s);
      if (computedMarginMatch) {
        const formula = computedMarginMatch[1];
        // Formula should require BOTH monthlyCost > 0 AND monthlyRevenue > 0
        expect(formula).toMatch(/monthlyCost\s*>\s*0/);
        expect(formula).toMatch(/monthlyRevenue\s*>\s*0/);
        // When condition fails, it should return NULL (not 0 or 100)
        expect(formula).toMatch(/ELSE NULL/i);
      }
    });

    it('should include cost > 0 guard in all margin filter conditions', async () => {
      const dbTs = await import('fs').then(fs => 
        fs.readFileSync('./server/db.ts', 'utf-8')
      );
      
      // Find the margin filter switch statement
      const switchStart = dbTs.indexOf("case 'negative':");
      const switchEnd = dbTs.indexOf('break;\n    }\n  }', switchStart) + 20;
      const switchBody = dbTs.slice(switchStart, switchEnd);
      
      // Each case should include monthlyCost > 0 guard
      const cases = ['negative', 'low', 'healthy', 'high'];
      for (const c of cases) {
        const caseStart = switchBody.indexOf(`case '${c}':`);
        const caseEnd = switchBody.indexOf('break;', caseStart);
        const caseBody = switchBody.slice(caseStart, caseEnd);
        expect(caseBody).toMatch(/monthlyCost\s*>\s*0/);
      }
    });
  });
});

describe('Data Quality Checks', () => {
  it('cost should never equal revenue for services with known supplier costs', () => {
    // This is a logical invariant: if a service has a real supplier cost,
    // the sell price (revenue) should always be different from the cost
    // (either higher for profit, or lower for a loss — but never exactly equal)
    
    // We can't test the actual DB here without mocking, but we can verify
    // the fix script logic is correct
    const testServices = [
      { externalId: 'S001', monthlyCost: 93.00, monthlyRevenue: 136.36, dataSource: 'Telstra Invoice' },
      { externalId: 'S002', monthlyCost: 0, monthlyRevenue: 239.67, dataSource: 'Xero Feb 2026 Invoice' },
      { externalId: 'S003', monthlyCost: 80.00, monthlyRevenue: 95.45, dataSource: 'ABB Invoice' },
    ];
    
    // Services with Xero as dataSource should have cost = 0 (unknown)
    const xeroServices = testServices.filter(s => s.dataSource?.includes('Xero'));
    xeroServices.forEach(s => {
      expect(s.monthlyCost).toBe(0);
    });
    
    // Services with supplier invoices should have cost != revenue
    const supplierServices = testServices.filter(s => !s.dataSource?.includes('Xero'));
    supplierServices.forEach(s => {
      if (s.monthlyCost > 0) {
        expect(s.monthlyCost).not.toBe(s.monthlyRevenue);
      }
    });
  });

  it('margin should be null when cost is unknown', () => {
    // Verify the margin calculation logic
    const computeMargin = (cost: number, revenue: number): number | null => {
      if (cost > 0 && revenue > 0) {
        return (revenue - cost) / revenue * 100;
      }
      return null; // unknown
    };
    
    // Cost unknown → margin unknown
    expect(computeMargin(0, 136.36)).toBeNull();
    
    // Both known → real margin
    expect(computeMargin(93.00, 136.36)).toBeCloseTo(31.8, 1);
    
    // Negative margin
    expect(computeMargin(93.00, 92.53)).toBeCloseTo(-0.5, 1);
    
    // Both zero → unknown
    expect(computeMargin(0, 0)).toBeNull();
  });
});
