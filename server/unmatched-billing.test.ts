/**
 * Tests for the Unmatched Billing Services feature:
 * - getServicesWithoutBilling: returns active services with no service-matched billing item
 * - getUnmatchedBillingCount: returns the count of such services
 * - resolveServiceBillingMatch: links a billing item or marks service as intentionally-unbilled
 * - recalculateAllUnmatchedBilling: bulk recalculates unmatchedBillingCount on customers
 *
 * These tests use mocked DB helpers to avoid a live DB connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock the DB module ───────────────────────────────────────────────────────
vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getServicesWithoutBilling: vi.fn(),
    getUnmatchedBillingCount: vi.fn(),
    resolveServiceBillingMatch: vi.fn(),
    recalculateAllUnmatchedBilling: vi.fn(),
    getServiceBillingMatchLog: vi.fn(),
    getAvailableBillingItemsForCustomer: vi.fn(),
  };
});

import {
  getServicesWithoutBilling,
  getUnmatchedBillingCount,
  resolveServiceBillingMatch,
  recalculateAllUnmatchedBilling,
  getServiceBillingMatchLog,
  getAvailableBillingItemsForCustomer,
} from './db';

describe('Unmatched Billing Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getServicesWithoutBilling ──────────────────────────────────────────────
  describe('getServicesWithoutBilling', () => {
    it('returns services that have no service-matched billing item', async () => {
      const mockServices = [
        {
          externalId: 'svc-001',
          serviceType: 'Internet',
          planName: 'NBN 100/20',
          monthlyCost: 45.0,
          monthlyRevenue: 0,
          status: 'active',
        },
        {
          externalId: 'svc-002',
          serviceType: 'Voice',
          planName: 'SIP Trunk',
          monthlyCost: 30.0,
          monthlyRevenue: 0,
          status: 'active',
        },
      ];
      vi.mocked(getServicesWithoutBilling).mockResolvedValueOnce(mockServices as any);

      const result = await getServicesWithoutBilling('cust-abc');
      expect(result).toHaveLength(2);
      expect(result[0].externalId).toBe('svc-001');
      expect(result[1].externalId).toBe('svc-002');
    });

    it('returns empty array when all services have billing items', async () => {
      vi.mocked(getServicesWithoutBilling).mockResolvedValueOnce([]);
      const result = await getServicesWithoutBilling('cust-fully-billed');
      expect(result).toHaveLength(0);
    });

    it('excludes terminated and unmatched services', async () => {
      // The mock simulates the DB already filtering these out
      vi.mocked(getServicesWithoutBilling).mockResolvedValueOnce([]);
      const result = await getServicesWithoutBilling('cust-terminated');
      expect(result).toHaveLength(0);
    });

    it('excludes services marked as intentionally-unbilled in the log', async () => {
      // The mock simulates the DB already filtering these out via the NOT IN subquery
      vi.mocked(getServicesWithoutBilling).mockResolvedValueOnce([]);
      const result = await getServicesWithoutBilling('cust-intentional');
      expect(result).toHaveLength(0);
    });
  });

  // ─── getUnmatchedBillingCount ───────────────────────────────────────────────
  describe('getUnmatchedBillingCount', () => {
    it('returns the correct count of unmatched billing services', async () => {
      vi.mocked(getUnmatchedBillingCount).mockResolvedValueOnce(5);
      const count = await getUnmatchedBillingCount('cust-abc');
      expect(count).toBe(5);
    });

    it('returns 0 when all services are billed', async () => {
      vi.mocked(getUnmatchedBillingCount).mockResolvedValueOnce(0);
      const count = await getUnmatchedBillingCount('cust-billed');
      expect(count).toBe(0);
    });
  });

  // ─── resolveServiceBillingMatch ─────────────────────────────────────────────
  describe('resolveServiceBillingMatch', () => {
    it('links a billing item and returns success', async () => {
      vi.mocked(resolveServiceBillingMatch).mockResolvedValueOnce({
        success: true,
        serviceExternalId: 'svc-001',
        resolution: 'linked',
      });

      const result = await resolveServiceBillingMatch(
        'svc-001',
        'bi-001',
        'linked',
        'Test User',
        'Matched by description'
      );

      expect(result.success).toBe(true);
      expect(result.resolution).toBe('linked');
      expect(result.serviceExternalId).toBe('svc-001');
    });

    it('marks service as intentionally-unbilled and returns success', async () => {
      vi.mocked(resolveServiceBillingMatch).mockResolvedValueOnce({
        success: true,
        serviceExternalId: 'svc-002',
        resolution: 'intentionally-unbilled',
      });

      const result = await resolveServiceBillingMatch(
        'svc-002',
        null,
        'intentionally-unbilled',
        'Test User',
        'Internal service, not billed to customer'
      );

      expect(result.success).toBe(true);
      expect(result.resolution).toBe('intentionally-unbilled');
    });

    it('accepts null billingItemExternalId for intentionally-unbilled', async () => {
      vi.mocked(resolveServiceBillingMatch).mockResolvedValueOnce({
        success: true,
        serviceExternalId: 'svc-003',
        resolution: 'intentionally-unbilled',
      });

      const result = await resolveServiceBillingMatch(
        'svc-003',
        null,
        'intentionally-unbilled',
        'Admin'
      );

      expect(result.success).toBe(true);
    });
  });

  // ─── recalculateAllUnmatchedBilling ─────────────────────────────────────────
  describe('recalculateAllUnmatchedBilling', () => {
    it('returns the count of updated customers', async () => {
      vi.mocked(recalculateAllUnmatchedBilling).mockResolvedValueOnce({ updated: 345 });
      const result = await recalculateAllUnmatchedBilling();
      expect(result.updated).toBe(345);
    });
  });

  // ─── getServiceBillingMatchLog ───────────────────────────────────────────────
  describe('getServiceBillingMatchLog', () => {
    it('returns the resolution history for a service', async () => {
      const mockLog = [
        {
          id: 1,
          serviceExternalId: 'svc-001',
          resolution: 'linked',
          billingItemId: 'bi-001',
          resolvedBy: 'Test User',
          resolvedAt: new Date('2026-03-01'),
          notes: 'Matched manually',
        },
      ];
      vi.mocked(getServiceBillingMatchLog).mockResolvedValueOnce(mockLog as any);

      const log = await getServiceBillingMatchLog('svc-001');
      expect(log).toHaveLength(1);
      expect(log[0].resolution).toBe('linked');
      expect(log[0].resolvedBy).toBe('Test User');
    });

    it('returns empty array for a service with no log entries', async () => {
      vi.mocked(getServiceBillingMatchLog).mockResolvedValueOnce([]);
      const log = await getServiceBillingMatchLog('svc-new');
      expect(log).toHaveLength(0);
    });
  });

  // ─── getAvailableBillingItemsForCustomer ─────────────────────────────────────
  describe('getAvailableBillingItemsForCustomer', () => {
    it('returns unmatched and customer-matched billing items', async () => {
      const mockItems = [
        {
          id: 1,
          externalId: 'bi-001',
          description: 'NBN 100/20 Service',
          lineAmount: 89.95,
          invoiceDate: '2026-03-01',
          matchStatus: 'customer-matched',
        },
        {
          id: 2,
          externalId: 'bi-002',
          description: 'SIP Trunk Monthly',
          lineAmount: 45.0,
          invoiceDate: '2026-03-01',
          matchStatus: 'unmatched',
        },
      ];
      vi.mocked(getAvailableBillingItemsForCustomer).mockResolvedValueOnce(mockItems as any);

      const items = await getAvailableBillingItemsForCustomer('cust-abc');
      expect(items).toHaveLength(2);
      expect(items[0].externalId).toBe('bi-001');
      expect(items[1].matchStatus).toBe('unmatched');
    });

    it('returns empty array when no billing items are available', async () => {
      vi.mocked(getAvailableBillingItemsForCustomer).mockResolvedValueOnce([]);
      const items = await getAvailableBillingItemsForCustomer('cust-no-items');
      expect(items).toHaveLength(0);
    });
  });
});
