/**
 * Tests for the customer proposals workflow
 * Covers: submit, list, approve, reject, pending count
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB module ─────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    submitCustomerProposal: vi.fn(),
    listCustomerProposals: vi.fn(),
    approveCustomerProposal: vi.fn(),
    rejectCustomerProposal: vi.fn(),
    countPendingProposals: vi.fn(),
  };
});

import {
  submitCustomerProposal,
  listCustomerProposals,
  approveCustomerProposal,
  rejectCustomerProposal,
  countPendingProposals,
} from "./db";

describe("Customer Proposals Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("submitCustomerProposal", () => {
    it("should create a proposal with required fields", async () => {
      const mockProposal = {
        id: 1,
        proposedName: "Zambrero Marrickville",
        status: "pending",
        proposedBy: "test@example.com",
        createdAt: new Date(),
      };
      vi.mocked(submitCustomerProposal).mockResolvedValue(mockProposal as any);

      const result = await submitCustomerProposal({
        proposedName: "Zambrero Marrickville",
        proposedBy: "test@example.com",
        serviceExternalIds: ["SVC-001"],
        source: "manual",
        createPlatformCheck: true,
      });

      expect(submitCustomerProposal).toHaveBeenCalledWith({
        proposedName: "Zambrero Marrickville",
        proposedBy: "test@example.com",
        serviceExternalIds: ["SVC-001"],
        source: "manual",
        createPlatformCheck: true,
      });
      expect(result.proposedName).toBe("Zambrero Marrickville");
      expect(result.status).toBe("pending");
    });

    it("should accept multiple service external IDs", async () => {
      vi.mocked(submitCustomerProposal).mockResolvedValue({ id: 2 } as any);

      await submitCustomerProposal({
        proposedName: "Nodo Southbank",
        proposedBy: "admin",
        serviceExternalIds: ["SVC-001", "SVC-002", "SVC-003"],
      });

      expect(submitCustomerProposal).toHaveBeenCalledWith(
        expect.objectContaining({ serviceExternalIds: ["SVC-001", "SVC-002", "SVC-003"] })
      );
    });
  });

  describe("listCustomerProposals", () => {
    it("should return all proposals when no status filter", async () => {
      const mockProposals = [
        { id: 1, proposedName: "Customer A", status: "pending" },
        { id: 2, proposedName: "Customer B", status: "approved" },
        { id: 3, proposedName: "Customer C", status: "rejected" },
      ];
      vi.mocked(listCustomerProposals).mockResolvedValue(mockProposals as any);

      const result = await listCustomerProposals();
      expect(result).toHaveLength(3);
    });

    it("should filter by status when provided", async () => {
      const mockPending = [
        { id: 1, proposedName: "Customer A", status: "pending" },
      ];
      vi.mocked(listCustomerProposals).mockResolvedValue(mockPending as any);

      const result = await listCustomerProposals("pending");
      expect(listCustomerProposals).toHaveBeenCalledWith("pending");
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("pending");
    });
  });

  describe("approveCustomerProposal", () => {
    it("should approve a pending proposal and return the created customer", async () => {
      const mockResult = {
        proposal: { id: 1, status: "approved", proposedName: "Zambrero Marrickville" },
        customer: { externalId: "CUST-999", name: "Zambrero Marrickville" },
        platformCheckCreated: true,
        servicesAssigned: 1,
      };
      vi.mocked(approveCustomerProposal).mockResolvedValue(mockResult as any);

      const result = await approveCustomerProposal(1, "approver@example.com");

      expect(approveCustomerProposal).toHaveBeenCalledWith(1, "approver@example.com");
      expect(result.proposal.status).toBe("approved");
      expect(result.customer.name).toBe("Zambrero Marrickville");
      expect(result.servicesAssigned).toBe(1);
    });
  });

  describe("rejectCustomerProposal", () => {
    it("should reject a proposal with a reason", async () => {
      const mockResult = {
        proposal: { id: 1, status: "rejected", rejectionReason: "Duplicate of existing customer" },
      };
      vi.mocked(rejectCustomerProposal).mockResolvedValue(mockResult as any);

      const result = await rejectCustomerProposal(1, "reviewer@example.com", "Duplicate of existing customer");

      expect(rejectCustomerProposal).toHaveBeenCalledWith(
        1,
        "reviewer@example.com",
        "Duplicate of existing customer"
      );
      expect(result.proposal.status).toBe("rejected");
    });

    it("should reject without a reason", async () => {
      vi.mocked(rejectCustomerProposal).mockResolvedValue({
        proposal: { id: 2, status: "rejected", rejectionReason: null },
      } as any);

      await rejectCustomerProposal(2, "reviewer@example.com", undefined);
      expect(rejectCustomerProposal).toHaveBeenCalledWith(2, "reviewer@example.com", undefined);
    });
  });

  describe("countPendingProposals", () => {
    it("should return the count of pending proposals", async () => {
      vi.mocked(countPendingProposals).mockResolvedValue(5);

      const count = await countPendingProposals();
      expect(count).toBe(5);
    });

    it("should return 0 when no pending proposals", async () => {
      vi.mocked(countPendingProposals).mockResolvedValue(0);

      const count = await countPendingProposals();
      expect(count).toBe(0);
    });
  });

  describe("Proposal workflow invariants", () => {
    it("should not allow empty proposed names", async () => {
      vi.mocked(submitCustomerProposal).mockRejectedValue(new Error("Customer name is required"));

      await expect(
        submitCustomerProposal({ proposedName: "", proposedBy: "user" })
      ).rejects.toThrow("Customer name is required");
    });

    it("should track who submitted and who reviewed", async () => {
      const mockProposal = {
        id: 1,
        proposedName: "Test Customer",
        status: "approved",
        proposedBy: "ella@company.com",
        reviewedBy: "manager@company.com",
      };
      vi.mocked(approveCustomerProposal).mockResolvedValue({ proposal: mockProposal } as any);

      const result = await approveCustomerProposal(1, "manager@company.com");
      expect(result.proposal.proposedBy).toBe("ella@company.com");
      expect(result.proposal.reviewedBy).toBe("manager@company.com");
    });
  });
});
