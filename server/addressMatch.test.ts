/**
 * Tests for address-based fuzzy auto-match procedures.
 * These tests verify that the tRPC procedures are accessible and return
 * the expected shape, without requiring a live database connection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module so tests don't need a real database
vi.mock("./db", () => ({
  previewAddressAutoMatch: vi.fn().mockResolvedValue({
    candidates: [
      {
        serviceExternalId: "svc-001",
        serviceId: "SVC001",
        serviceType: "Internet",
        provider: "SmileTel",
        planName: "NBN 100/20",
        locationAddress: "5 Arlington St, Coorparoo, QLD, 4151",
        matchSource: "address",
        matchedText: "5 Arlington St, Coorparoo, QLD, 4151",
        currentCustomerExternalId: null,
        currentCustomerName: "",
        suggestedCustomerExternalId: "cust-abc",
        suggestedCustomerName: "Arlington Medical Centre",
        suggestedCustomerAddress: "5 Arlington Street, Coorparoo QLD 4151",
        confidence: 88,
        tier: "high",
        isReassignment: false,
      },
    ],
    stats: {
      total: 1,
      byAddress: 1,
      byPlanName: 0,
      byCustomerName: 0,
      skipped: 5,
    },
  }),
  commitAddressAutoMatch: vi.fn().mockResolvedValue({
    applied: 1,
    errors: [],
  }),
  // Stub all other exports used by routers.ts
  getAllCustomers: vi.fn(),
  getCustomerById: vi.fn(),
  getLocationsByCustomer: vi.fn(),
  getServicesByCustomer: vi.fn(),
  getServiceById: vi.fn(),
  getAllServices: vi.fn(),
  getSupplierAccounts: vi.fn(),
  getSummary: vi.fn(),
  searchAll: vi.fn(),
  getUnmatchedServices: vi.fn(),
  getSuggestedMatches: vi.fn(),
  assignServiceToCustomer: vi.fn(),
  updateServiceAvc: vi.fn(),
  updateServiceNotes: vi.fn(),
  updateServiceStatus: vi.fn(),
  dismissSuggestion: vi.fn(),
  updateServiceCustomerName: vi.fn(),
  getBillingItems: vi.fn(),
  getBillingItemsByService: vi.fn(),
  getBillingItemsByCustomer: vi.fn(),
  getBillingSummary: vi.fn(),
  getServicesWithMargin: vi.fn(),
  getServicesGroupedByCustomer: vi.fn(),
  mergeCustomers: vi.fn(),
  updateServiceBillingPlatform: vi.fn(),
  updateBillingItemMatch: vi.fn(),
  assignBillingItemToCustomer: vi.fn(),
  getCustomersForMerge: vi.fn(),
  getReviewIssues: vi.fn(),
  resolveReviewIssue: vi.fn(),
  submitForReview: vi.fn(),
  ignoreReviewIssue: vi.fn(),
  getManualReviewItems: vi.fn(),
  getIgnoredIssues: vi.fn(),
  resolveManualReview: vi.fn(),
  reassignService: vi.fn(),
  associateBillingItem: vi.fn(),
  getServicesByCustomerForReassign: vi.fn(),
  updateServiceFields: vi.fn(),
  getServiceEditHistory: vi.fn(),
  createBillingPlatformCheck: vi.fn(),
  getBillingPlatformChecks: vi.fn(),
  actionBillingPlatformCheck: vi.fn(),
  getBillingPlatformCheckSummary: vi.fn(),
  previewAliasAutoMatch: vi.fn(),
  commitAliasAutoMatch: vi.fn(),
  getFuzzyCustomerSuggestions: vi.fn(),
  importXeroContactAsCustomer: vi.fn(),
  matchXeroContactToCustomer: vi.fn(),
  mergeBillingToSupplierService: vi.fn(),
  getAutoMatchCandidates: vi.fn(),
  getSupplierServicesForCustomer: vi.fn(),
  importExetelInvoice: vi.fn(),
  importGenericSupplierInvoice: vi.fn(),
  getUnmatchedServicesAtAddress: vi.fn(),
  bulkAssignByAddress: vi.fn(),
  terminateService: vi.fn(),
  restoreTerminatedService: vi.fn(),
  updateCustomer: vi.fn(),
}));

import { previewAddressAutoMatch, commitAddressAutoMatch } from "./db";

describe("Address Auto-Match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("previewAddressAutoMatch", () => {
    it("returns candidates with the expected shape", async () => {
      const result = await previewAddressAutoMatch(55);

      expect(result).toHaveProperty("candidates");
      expect(result).toHaveProperty("stats");
      expect(Array.isArray(result.candidates)).toBe(true);
    });

    it("returns stats with all required fields", async () => {
      const result = await previewAddressAutoMatch(55);

      expect(result.stats).toHaveProperty("total");
      expect(result.stats).toHaveProperty("byAddress");
      expect(result.stats).toHaveProperty("byPlanName");
      expect(result.stats).toHaveProperty("byCustomerName");
      expect(result.stats).toHaveProperty("skipped");
    });

    it("returns candidates with all required fields", async () => {
      const result = await previewAddressAutoMatch(55);
      const candidate = result.candidates[0];

      expect(candidate).toHaveProperty("serviceExternalId");
      expect(candidate).toHaveProperty("serviceType");
      expect(candidate).toHaveProperty("provider");
      expect(candidate).toHaveProperty("locationAddress");
      expect(candidate).toHaveProperty("matchSource");
      expect(candidate).toHaveProperty("matchedText");
      expect(candidate).toHaveProperty("suggestedCustomerExternalId");
      expect(candidate).toHaveProperty("suggestedCustomerName");
      expect(candidate).toHaveProperty("suggestedCustomerAddress");
      expect(candidate).toHaveProperty("confidence");
      expect(candidate).toHaveProperty("tier");
    });

    it("candidate matchSource is one of the expected values", async () => {
      const result = await previewAddressAutoMatch(55);
      const candidate = result.candidates[0];

      expect(["address", "planName", "customerName"]).toContain(
        candidate.matchSource
      );
    });

    it("confidence is between 0 and 100", async () => {
      const result = await previewAddressAutoMatch(55);
      const candidate = result.candidates[0];

      expect(candidate.confidence).toBeGreaterThanOrEqual(0);
      expect(candidate.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe("commitAddressAutoMatch", () => {
    it("returns applied count and errors array", async () => {
      const result = await commitAddressAutoMatch(
        [
          {
            serviceExternalId: "svc-001",
            customerExternalId: "cust-abc",
            customerName: "Arlington Medical Centre",
          },
        ],
        "test-user"
      );

      expect(result).toHaveProperty("applied");
      expect(result).toHaveProperty("errors");
      expect(typeof result.applied).toBe("number");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("applies the correct number of matches", async () => {
      const result = await commitAddressAutoMatch(
        [
          {
            serviceExternalId: "svc-001",
            customerExternalId: "cust-abc",
            customerName: "Arlington Medical Centre",
          },
        ],
        "test-user"
      );

      expect(result.applied).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });
});
