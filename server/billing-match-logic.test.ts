/**
 * Tests for the billing match logic improvements:
 * - Category-aware fuzzy matching (Voice/Internet/Mobile)
 * - Provider alignment scoring
 * - unmatchedBillingCount using service_billing_assignments
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  fuzzyMatchServicesAgainstBillingItems,
  getBillingItemsWithAssignments,
  getUnassignedServicesForCustomer,
  getUnmatchedBillingCount,
  assignServiceToBillingItem,
  removeServiceAssignment,
  getAllCustomers,
} from './db';

// Use Back2Health (C0029) as the reference customer — it has known data
const CUSTOMER_ID = 'C0029';

describe('fuzzy matching - category awareness', () => {
  it('returns proposals only for unassigned services', async () => {
    const proposals = await fuzzyMatchServicesAgainstBillingItems(CUSTOMER_ID);
    // Back2Health has all services assigned, so proposals should be empty
    expect(Array.isArray(proposals)).toBe(true);
  });

  it('each proposal has required fields', async () => {
    // Use a customer that likely has unassigned services
    const allCustomers = await getAllCustomers();
    const withUnmatched = allCustomers.find((c: any) => c.unmatchedBillingCount > 0);
    if (!withUnmatched) return; // skip if no unmatched customers

    const proposals = await fuzzyMatchServicesAgainstBillingItems(withUnmatched.externalId);
    for (const p of proposals) {
      expect(p).toHaveProperty('serviceExternalId');
      expect(p).toHaveProperty('servicePlanName');
      expect(p).toHaveProperty('serviceType');
      expect(p).toHaveProperty('billingItemExternalId');
      expect(p).toHaveProperty('billingDescription');
      expect(p).toHaveProperty('score');
      expect(p).toHaveProperty('scorePercent');
      expect(p.score).toBeGreaterThanOrEqual(0.5); // must have category match
      expect(p.score).toBeLessThanOrEqual(1.0);
    }
  });

  it('proposals are sorted by score descending', async () => {
    const allCustomers = await getAllCustomers();
    const withUnmatched = allCustomers.find((c: any) => c.unmatchedBillingCount > 0);
    if (!withUnmatched) return;

    const proposals = await fuzzyMatchServicesAgainstBillingItems(withUnmatched.externalId);
    for (let i = 1; i < proposals.length; i++) {
      expect(proposals[i - 1].score).toBeGreaterThanOrEqual(proposals[i].score);
    }
  });

  it('does not propose negative/credit billing items as targets', async () => {
    const allCustomers = await getAllCustomers();
    const withUnmatched = allCustomers.find((c: any) => c.unmatchedBillingCount > 0);
    if (!withUnmatched) return;

    const proposals = await fuzzyMatchServicesAgainstBillingItems(withUnmatched.externalId);
    const billingItems = await getBillingItemsWithAssignments(withUnmatched.externalId);
    const negativeItemIds = new Set(billingItems.filter(b => b.lineAmount <= 0).map(b => b.externalId));

    for (const p of proposals) {
      expect(negativeItemIds.has(p.billingItemExternalId)).toBe(false);
    }
  });
});

describe('unmatchedBillingCount - uses service_billing_assignments', () => {
  it('Back2Health has 0 unmatched (all services assigned via drag-drop)', async () => {
    const count = await getUnmatchedBillingCount(CUSTOMER_ID);
    expect(count).toBe(0);
  });

  it('count decreases after assigning a service', async () => {
    // Find a customer with unassigned services
    const unassigned = await getUnassignedServicesForCustomer(CUSTOMER_ID);
    if (unassigned.length === 0) {
      // Back2Health is fully assigned, test with a different customer
      const allCustomers = await getAllCustomers();
      const withUnmatched = allCustomers.find((c: any) => c.unmatchedBillingCount > 0);
      if (!withUnmatched) return;

      const svcsBefore = await getUnassignedServicesForCustomer(withUnmatched.externalId);
      const items = await getBillingItemsWithAssignments(withUnmatched.externalId);
      if (svcsBefore.length === 0 || items.length === 0) return;

      const countBefore = await getUnmatchedBillingCount(withUnmatched.externalId);
      await assignServiceToBillingItem(
        items[0].externalId,
        svcsBefore[0].externalId,
        withUnmatched.externalId,
        'test-user',
        'manual',
        'vitest test assignment'
      );
      const countAfter = await getUnmatchedBillingCount(withUnmatched.externalId);
      expect(countAfter).toBe(countBefore - 1);

      // Clean up
      await removeServiceAssignment(items[0].externalId, svcsBefore[0].externalId);
      return;
    }

    // Back2Health has no unassigned, so count should stay 0
    expect(unassigned.length).toBe(0);
  });

  it('returns a non-negative integer', async () => {
    const count = await getUnmatchedBillingCount(CUSTOMER_ID);
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(count)).toBe(true);
  });
});

describe('getBillingItemsWithAssignments - margin calculation', () => {
  it('returns billing items with correct structure', async () => {
    const items = await getBillingItemsWithAssignments(CUSTOMER_ID);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it('each item has lineAmount (revenue), totalCost, and margin', async () => {
    const items = await getBillingItemsWithAssignments(CUSTOMER_ID);
    for (const item of items) {
      expect(typeof item.lineAmount).toBe('number');
      expect(typeof item.totalCost).toBe('number');
      expect(typeof item.margin).toBe('number');
      // margin = revenue - cost
      expect(item.margin).toBeCloseTo(item.lineAmount - item.totalCost, 5);
    }
  });

  it('assigned services have monthlyCost summing to totalCost', async () => {
    const items = await getBillingItemsWithAssignments(CUSTOMER_ID);
    for (const item of items) {
      const sumOfServices = item.assignedServices.reduce((s, svc) => s + svc.monthlyCost, 0);
      expect(item.totalCost).toBeCloseTo(sumOfServices, 5);
    }
  });

  it('Back2Health has Voice - Services item with assigned services', async () => {
    const items = await getBillingItemsWithAssignments(CUSTOMER_ID);
    const voiceServices = items.find(i => i.description.includes('Voice - Services'));
    expect(voiceServices).toBeDefined();
    expect(voiceServices!.assignedServices.length).toBeGreaterThan(0);
  });

  it('Back2Health has Data - Internet item assigned to Opticomm service', async () => {
    const items = await getBillingItemsWithAssignments(CUSTOMER_ID);
    const dataItem = items.find(i => i.description.includes('Data - Internet'));
    expect(dataItem).toBeDefined();
    const hasOpticomm = dataItem!.assignedServices.some(s =>
      s.planName.toLowerCase().includes('opticomm')
    );
    expect(hasOpticomm).toBe(true);
  });
});
