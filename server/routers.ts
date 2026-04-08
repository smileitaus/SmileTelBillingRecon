import { COOKIE_NAME } from "@shared/const";
import { tiabRouter } from "./routers/tiab";
import { terminationRouter, terminationManagementRouter } from "./routers/termination";
import { numbersRouter } from "./routers/numbers";
import { vocusRouter } from "./routers/vocus";
import { internetPricebookRouter } from "./routers/internetPricebook";
import { retailBundlesRouter } from "./routers/retailBundles";
import { paymentPlansRouter } from "./routers/paymentPlans";
import { billingCycleRouter } from "./routers/billingCycle";
import { starlinkRouter } from "./routers/starlink";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { parsePdfInvoice } from "./pdfInvoiceParser";
import { fetchSasBossToken, syncAllSasBossData, fetchProducts } from "./suppliers/sasboss-api";
import {
  listOmadaSites,
  getOmadaSiteDetail,
  getOmadaWanStatus,
  listOmadaDevices,
  listOmadaClients,
  getOmadaClientCount,
  blockOmadaClient,
  unblockOmadaClient,
  autoMatchSitesToCustomers,
} from "./suppliers/omada";
import { omadaSites, omadaDeviceCache, customers, supplierRateCards, supplierRateCardItems, services } from "../drizzle/schema";
import { eq, desc, and, or, isNull, not, sql } from "drizzle-orm";
import {
  getAllCustomers,
  getCustomerById,
  getLocationsByCustomer,
  getServicesByCustomer,
  getServiceById,
  getAllServices,
  getSupplierAccounts,
  getSummary,
  searchAll,
  getUnmatchedServices,
  getUnmatchedServiceTriage,
  getSuggestedMatches,
  assignServiceToCustomer,
  updateServiceAvc,
  updateServiceNotes,
  updateServiceStatus,
  dismissSuggestion,
  updateServiceCustomerName,
  getBillingItems,
  getBillingItemsByService,
  getBillingItemsByCustomer,
  getBillingSummary,
  getServicesWithMargin,
  getServicesGroupedByCustomer,
  mergeCustomers,
  updateServiceBillingPlatform,
  updateBillingItemMatch,
  assignBillingItemToCustomer,
  getCustomersForMerge,
  getReviewIssues,
  resolveReviewIssue,
  submitForReview,
  ignoreReviewIssue,
  getManualReviewItems,
  getIgnoredIssues,
  resolveManualReview,
  reassignService,
  associateBillingItem,
  getServicesByCustomerForReassign,
  updateServiceFields,
  getServiceEditHistory,
  createBillingPlatformCheck,
  getBillingPlatformChecks,
  actionBillingPlatformCheck,
  addNoteToBillingPlatformCheck,
  getBillingPlatformCheckSummary,
  previewAliasAutoMatch,
  commitAliasAutoMatch,
  terminateService,
  restoreTerminatedService,
  updateCustomer,
  getFuzzyCustomerSuggestions,
  importXeroContactAsCustomer,
  matchXeroContactToCustomer,
  reclassifyRetailOffering,
  mergeBillingToSupplierService,
  getAutoMatchCandidates,
  getSupplierServicesForCustomer,
  importExetelInvoice,
  importGenericSupplierInvoice,
  type GenericSupplierRow,
  getUnmatchedServicesAtAddress,
  bulkAssignByAddress,
  previewAddressAutoMatch,
  commitAddressAutoMatch,
  bulkActivateLinkedServices,
  recalculateAll,
  createCustomer,
  getSuggestedCustomersForService,
  submitCustomerProposal,
  listCustomerProposals,
  approveCustomerProposal,
  rejectCustomerProposal,
  countPendingProposals,
  assignProposalToExistingCustomer,
  syncCarbonCostsToServices,
  getCarbonCacheStatus,
  backfillCostSources,
  getServiceCostHistory,
  getServiceForPlatformCheck,
  importSasBossDispatch,
  dryRunSasBossDispatch,
  confirmSasBossDispatch,
  getSupplierWorkbookUploads,
  getWorkbookLineItems,
  getCustomerUsageSummaries,
  type SasBossPivotRow,
  type SasBossCallUsageRow,
  type SasBossConfirmInput,
  type AddressMatchCandidate,
  getServicesWithoutBilling,
  getSuppressedUnbilledServices,
  getAvailableBillingItemsForCustomer,
  resolveServiceBillingMatch,
  recalculateAllUnmatchedBilling,
  getServiceBillingMatchLog,
  getUnmatchedServicesForMatching,
  getWorkbookItemsForCustomer,
  fuzzyMatchServicesToWorkbook,
  linkServiceToWorkbookItem,
  getBillingItemsWithAssignments,
  getUnassignedServicesForCustomer,
  assignServiceToBillingItem,
  removeServiceAssignment,
  markServiceUnbillable,
  unmarkServiceUnbillable,
  getUnbillableServicesForCustomer,
  fuzzyMatchServicesAgainstBillingItems,
  autoApplyMatchRules,
  escalateService,
  resolveEscalatedService,
  getEscalatedServices,
  getCustomersWithEscalations,
  getBlitzTerminationServices,
  getBlitzImportStats,
  getSupplierRegistry,
  getSupplierInvoiceUploads,
  getAaptServices,
  getUnmatchedAaptServices,
  getSupplierServiceMappings,
  assignAaptServiceToCustomer,
  getAaptImportStats,
  getDashboardTotals,
  getProductCostMappings,
  updateProductCostMapping,
  importAccess4Invoice,
  globalAutoMatchBillingItems,
  recalculateCostsFromWorkbook,
  redistributeProportionalRevenue,
  deriveServiceCategory,
  setCustomerType,
  setVocusSimPlanCost,
  inheritLocationFromColocated,
  bulkInheritLocationsForCustomer,
  getMatchProvenance,
  flagMatchEvent,
  clearMatchEventFlag,
} from "./db";
import {
  importVocusMobileSims,
  getVocusServices,
  getVocusImportStats,
  VOCUS_STANDARD_MOBILE_SIMS,
} from "./db-vocus";
import {
  bulkAutoAssignHighConfidence,
  previewBulkAutoAssignHighConfidence,
} from "./db-bulk-assign";

// In-memory background job store for globalAutoMatch (per-server-instance)
type AutoMatchJobState = {
  status: 'running' | 'done' | 'error' | 'not_found';
  startedAt: number;
  result: { applied: number; skipped: number; customersProcessed: number; errors: string[] } | null;
  error: string | null;
};
const autoMatchJobs = new Map<string, AutoMatchJobState>();

export const appRouter = router({
  system: systemRouter,
  tiab: tiabRouter,
  termination: terminationRouter,
  terminationMgmt: terminationManagementRouter,
  numbers: numbersRouter,
  vocus: vocusRouter,
  internetPricebook: internetPricebookRouter,
  retailBundles: retailBundlesRouter,
  paymentPlans: paymentPlansRouter,
  billingCycle: billingCycleRouter,
  starlink: starlinkRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  billing: router({
    summary: protectedProcedure.query(async () => {
      return await getSummary();
    }),

    customers: router({
      list: protectedProcedure
        .input(z.object({
          search: z.string().optional(),
          status: z.string().optional(),
          platform: z.string().optional(),
          supplier: z.string().optional(),
          customerType: z.string().optional(),
        }).optional())
        .query(async ({ input }) => {
          return await getAllCustomers(input?.search, input?.status, input?.platform, input?.supplier, input?.customerType);
        }),

      byId: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
          return await getCustomerById(input.id);
        }),

      locations: protectedProcedure
        .input(z.object({ customerId: z.string() }))
        .query(async ({ input }) => {
          return await getLocationsByCustomer(input.customerId);
        }),

      services: protectedProcedure
        .input(z.object({ customerId: z.string() }))
        .query(async ({ input }) => {
          return await getServicesByCustomer(input.customerId);
        }),

      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1, 'Customer name is required'),
          businessName: z.string().optional(),
          contactName: z.string().optional(),
          contactEmail: z.string().optional(),
          contactPhone: z.string().optional(),
          siteAddress: z.string().optional(),
          notes: z.string().optional(),
          billingPlatforms: z.array(z.string()).nullable().optional(),
          createPlatformCheck: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const createdBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          const result = await createCustomer({ ...input, createdBy });
          // Optionally create a Platform Check entry for the new customer
          if (result.success && input.createPlatformCheck) {
            await createBillingPlatformCheck({
              targetType: 'service',
              targetId: result.externalId,
              targetName: input.name,
              platform: (input.billingPlatforms?.[0]) || 'Unknown',
              issueType: 'new-customer',
              issueDescription: `New customer created manually by ${createdBy}. Verify billing platform setup.`,
              customerName: input.name,
              customerExternalId: result.externalId,
              monthlyAmount: 0,
              priority: 'medium',
              createdBy,
            });
          }
          return result;
        }),

      suggestionsForService: protectedProcedure
        .input(z.object({ serviceExternalId: z.string() }))
        .query(async ({ input }) => {
          return await getSuggestedCustomersForService(input.serviceExternalId);
        }),

      proposals: router({
        submit: protectedProcedure
          .input(z.object({
            proposedName: z.string().min(1, 'Customer name is required'),
            notes: z.string().optional(),
            serviceExternalIds: z.array(z.string()).default([]),
            source: z.string().optional(),
            createPlatformCheck: z.boolean().optional(),
          }))
          .mutation(async ({ input, ctx }) => {
            const proposedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
            return await submitCustomerProposal({ ...input, proposedBy });
          }),

        list: protectedProcedure
          .input(z.object({
            status: z.enum(['pending', 'approved', 'rejected']).optional(),
          }).optional())
          .query(async ({ input }) => {
            return await listCustomerProposals(input?.status);
          }),

        approve: protectedProcedure
          .input(z.object({ proposalId: z.number() }))
          .mutation(async ({ input, ctx }) => {
            const reviewedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
            return await approveCustomerProposal(input.proposalId, reviewedBy);
          }),

        reject: protectedProcedure
          .input(z.object({
            proposalId: z.number(),
            reason: z.string().optional(),
          }))
          .mutation(async ({ input, ctx }) => {
            const reviewedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
            return await rejectCustomerProposal(input.proposalId, reviewedBy, input.reason);
          }),

        pendingCount: protectedProcedure
          .query(async () => {
            return await countPendingProposals();
          }),

        assignToExisting: protectedProcedure
          .input(z.object({
            proposalId: z.number(),
            customerExternalId: z.string(),
          }))
          .mutation(async ({ input, ctx }) => {
            const reviewedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
            return await assignProposalToExistingCustomer(input.proposalId, input.customerExternalId, reviewedBy);
          }),

        searchCustomers: protectedProcedure
          .input(z.object({ search: z.string() }))
          .query(async ({ input }) => {
            return await getCustomersForMerge(input.search);
          }),
      }),

      update: protectedProcedure
        .input(z.object({
          externalId: z.string(),
          updates: z.object({
            name: z.string().optional(),
            businessName: z.string().optional(),
            contactName: z.string().optional(),
            contactEmail: z.string().optional(),
            contactPhone: z.string().optional(),
            siteAddress: z.string().optional(),
            notes: z.string().optional(),
            xeroContactName: z.string().optional(),
            xeroAccountNumber: z.string().optional(),
            ownershipType: z.string().optional(),
            billingPlatforms: z.array(z.string()).nullable().optional(),
          }),
        }))
        .mutation(async ({ input, ctx }) => {
          const updatedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await updateCustomer(input.externalId, input.updates, updatedBy);
        }),

      // ── Unmatched Billing Services ──────────────────────────────────────────
      unmatchedBillingServices: protectedProcedure
        .input(z.object({ customerExternalId: z.string() }))
        .query(async ({ input }) => {
          return await getServicesWithoutBilling(input.customerExternalId);
        }),

      // Services suppressed from the unbilled list due to an active Carbon outage
      suppressedUnbilledServices: protectedProcedure
        .input(z.object({ customerExternalId: z.string() }))
        .query(async ({ input }) => {
          return await getSuppressedUnbilledServices(input.customerExternalId);
        }),

      availableBillingItems: protectedProcedure
        .input(z.object({ customerExternalId: z.string() }))
        .query(async ({ input }) => {
          return await getAvailableBillingItemsForCustomer(input.customerExternalId);
        }),

      resolveServiceBilling: protectedProcedure
        .input(z.object({
          serviceExternalId: z.string(),
          billingItemExternalId: z.string().nullable(),
          resolution: z.enum(['linked', 'intentionally-unbilled']),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const resolvedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await resolveServiceBillingMatch(
            input.serviceExternalId,
            input.billingItemExternalId,
            input.resolution,
            resolvedBy,
            input.notes
          );
        }),

      billingMatchLog: protectedProcedure
        .input(z.object({ serviceExternalId: z.string() }))
        .query(async ({ input }) => {
          return await getServiceBillingMatchLog(input.serviceExternalId);
        }),

      recalculateUnmatchedBilling: protectedProcedure
        .mutation(async () => {
          return await recalculateAllUnmatchedBilling();
        }),

      // ── Billing Assignments (many-to-one service → billing item) ────────────
      billingAssignments: router({
        billingItemsWithAssignments: protectedProcedure
          .input(z.object({ customerExternalId: z.string() }))
          .query(async ({ input }) => {
            return await getBillingItemsWithAssignments(input.customerExternalId);
          }),

        unassignedServices: protectedProcedure
          .input(z.object({ customerExternalId: z.string() }))
          .query(async ({ input }) => {
            return await getUnassignedServicesForCustomer(input.customerExternalId);
          }),

        assign: protectedProcedure
          .input(z.object({
            billingItemExternalId: z.string(),
            serviceExternalId: z.string(),
            customerExternalId: z.string(),
            assignmentMethod: z.enum(['manual', 'auto', 'drag-drop']).default('drag-drop'),
            assignmentBucket: z.enum(['standard', 'usage-holding', 'professional-services', 'hardware-sales', 'internal-cost']).default('standard'),
            notes: z.string().optional(),
          }))
          .mutation(async ({ input, ctx }) => {
            const assignedBy = ctx.user?.name || ctx.user?.email || 'unknown';
            return await assignServiceToBillingItem(
              input.billingItemExternalId,
              input.serviceExternalId,
              input.customerExternalId,
              assignedBy,
              input.assignmentMethod,
              input.notes,
              input.assignmentBucket
            );
          }),

        removeAssignment: protectedProcedure
          .input(z.object({
            billingItemExternalId: z.string(),
            serviceExternalId: z.string(),
          }))
          .mutation(async ({ input }) => {
            return await removeServiceAssignment(input.billingItemExternalId, input.serviceExternalId);
          }),

        markUnbillable: protectedProcedure
          .input(z.object({
            serviceExternalId: z.string(),
            customerExternalId: z.string(),
            reason: z.string(),
            notes: z.string().optional(),
          }))
          .mutation(async ({ input, ctx }) => {
            const markedBy = ctx.user?.name || ctx.user?.email || 'unknown';
            return await markServiceUnbillable(
              input.serviceExternalId,
              input.customerExternalId,
              input.reason,
              markedBy,
              input.notes
            );
          }),

        unmarkUnbillable: protectedProcedure
          .input(z.object({ serviceExternalId: z.string() }))
          .mutation(async ({ input }) => {
            return await unmarkServiceUnbillable(input.serviceExternalId);
          }),

        unbillableServices: protectedProcedure
          .input(z.object({ customerExternalId: z.string() }))
          .query(async ({ input }) => {
            return await getUnbillableServicesForCustomer(input.customerExternalId);
          }),

        fuzzyProposals: protectedProcedure
          .input(z.object({ customerExternalId: z.string() }))
          .query(async ({ input }) => {
            return await fuzzyMatchServicesAgainstBillingItems(input.customerExternalId);
          }),

        // ── Escalation workflow ──────────────────────────────────────────────
        escalate: protectedProcedure
          .input(z.object({
            serviceExternalId: z.string(),
            customerExternalId: z.string(),
            reason: z.string().optional(),
            notes: z.string().optional(),
          }))
          .mutation(async ({ input, ctx }) => {
            const escalatedBy = ctx.user?.name || ctx.user?.email || 'unknown';
            return await escalateService(
              input.serviceExternalId,
              input.customerExternalId,
              escalatedBy,
              input.reason,
              input.notes
            );
          }),

        resolveEscalation: protectedProcedure
          .input(z.object({
            serviceExternalId: z.string(),
            resolutionNotes: z.string().optional(),
          }))
          .mutation(async ({ input, ctx }) => {
            const resolvedBy = ctx.user?.name || ctx.user?.email || 'unknown';
            return await resolveEscalatedService(
              input.serviceExternalId,
              resolvedBy,
              input.resolutionNotes
            );
          }),

        escalatedServices: protectedProcedure
          .input(z.object({ customerExternalId: z.string().optional() }))
          .query(async ({ input }) => {
            return await getEscalatedServices(input.customerExternalId);
          }),

        customersWithEscalations: protectedProcedure
          .query(async () => {
            return await getCustomersWithEscalations();
          }),
      }),

      // ── Workbook Matching (drag-and-drop + fuzzy auto-match) ────────────────
      workbookMatching: router({
        unmatchedServices: protectedProcedure
          .input(z.object({ customerExternalId: z.string() }))
          .query(async ({ input }) => {
            return await getUnmatchedServicesForMatching(input.customerExternalId);
          }),

        workbookItems: protectedProcedure
          .input(z.object({ customerExternalId: z.string() }))
          .query(async ({ input }) => {
            return await getWorkbookItemsForCustomer(input.customerExternalId);
          }),

        fuzzyProposals: protectedProcedure
          .input(z.object({
            customerExternalId: z.string(),
            minScore: z.number().min(0).max(100).optional(),
          }))
          .query(async ({ input }) => {
            return await fuzzyMatchServicesToWorkbook(
              input.customerExternalId,
              input.minScore ?? 40
            );
          }),

        linkService: protectedProcedure
          .input(z.object({
            serviceExternalId: z.string(),
            workbookItemId: z.number(),
          }))
          .mutation(async ({ input, ctx }) => {
            const linkedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
            return await linkServiceToWorkbookItem(
              input.serviceExternalId,
              input.workbookItemId,
              linkedBy
            );
          }),
      }),
      // ── Retail Offering ──────────────────────────────────────────────────────
      setCustomerType: protectedProcedure
        .input(z.object({
          externalId: z.string(),
          customerType: z.enum(['standard', 'retail_offering']),
        }))
        .mutation(async ({ input, ctx }) => {
          const updatedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await setCustomerType(input.externalId, input.customerType, updatedBy);
        }),
      // ── Vocus SIM plan cost ──────────────────────────────────────────────────
      setVocusSimPlanCost: protectedProcedure
        .input(z.object({
          vocusServiceId: z.string(),
          planCost: z.number().min(0),
        }))
        .mutation(async ({ input, ctx }) => {
          const updatedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await setVocusSimPlanCost(input.vocusServiceId, input.planCost, updatedBy);
        }),
    }),

    services: router({
      list: protectedProcedure.query(async () => {
        return await getAllServices();
      }),

      byId: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
          const service = await getServiceById(input.id);
          if (!service) return { service: null, location: null, customer: null };

          // Fetch related location and customer
          let location = null;
          let customer = null;

          if (service.locationExternalId) {
            const { getLocationById } = await import('./db');
            location = await getLocationById(service.locationExternalId);
          }

          if (service.customerExternalId) {
            customer = await getCustomerById(service.customerExternalId);
          }

          return { service, location, customer };
        }),

      // Full edit of a service (name and cost are read-only)
      update: protectedProcedure
        .input(z.object({
          serviceExternalId: z.string(),
          updates: z.object({
            // Previously system-managed, now editable
            serviceId: z.string().optional(),
            monthlyCost: z.string().optional(),
            serviceType: z.string().optional(),
            provider: z.string().optional(),
            supplierName: z.string().optional(),
            // Standard editable fields
            serviceTypeDetail: z.string().optional(),
            planName: z.string().optional(),
            status: z.string().optional(),
            locationAddress: z.string().optional(),
            phoneNumber: z.string().optional(),
            email: z.string().optional(),
            connectionId: z.string().optional(),
            avcId: z.string().optional(),
            ipAddress: z.string().optional(),
            technology: z.string().optional(),
            speedTier: z.string().optional(),
            billingPlatform: z.array(z.string()).nullable().optional(),
            simSerialNumber: z.string().optional(),
            hardwareType: z.string().optional(),
            macAddress: z.string().optional(),
            modemSerialNumber: z.string().optional(),
            wifiPassword: z.string().optional(),
            simOwner: z.string().optional(),
            dataPlanGb: z.string().optional(),
            userName: z.string().optional(),
            contractEndDate: z.string().optional(),
            serviceActivationDate: z.string().optional(),
            serviceEndDate: z.string().optional(),
            proposedPlan: z.string().optional(),
            proposedCost: z.string().optional(),
            discoveryNotes: z.string().optional(),
            // Reassign
            customerExternalId: z.string().nullable().optional(),
            customerName: z.string().nullable().optional(),
          }),
          reason: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const editedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await updateServiceFields(input.serviceExternalId, input.updates, editedBy, input.reason);
        }),

      editHistory: protectedProcedure
        .input(z.object({ serviceExternalId: z.string() }))
        .query(async ({ input }) => {
          return await getServiceEditHistory(input.serviceExternalId);
        }),
      inheritLocation: protectedProcedure
        .input(z.object({ serviceExternalId: z.string(), chosenAddress: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
          const updatedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await inheritLocationFromColocated(input.serviceExternalId, updatedBy, input.chosenAddress);
        }),
      bulkInheritLocations: protectedProcedure
        .input(z.object({ customerExternalId: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const updatedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await bulkInheritLocationsForCustomer(input.customerExternalId, updatedBy);
        }),

      matchProvenance: router({
        /** Returns all match provenance events for a service, most recent first */
        get: protectedProcedure
          .input(z.object({ serviceExternalId: z.string() }))
          .query(async ({ input }) => {
            return await getMatchProvenance(input.serviceExternalId);
          }),

        /** Flags a match event as potentially incorrect */
        flag: protectedProcedure
          .input(z.object({
            eventId: z.number(),
            flagReason: z.string().min(1),
          }))
          .mutation(async ({ input, ctx }) => {
            const flaggedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
            await flagMatchEvent(input.eventId, flaggedBy, input.flagReason);
            return { success: true };
          }),

        /** Clears the flag on a match event */
        clearFlag: protectedProcedure
          .input(z.object({ eventId: z.number() }))
          .mutation(async ({ input }) => {
            await clearMatchEventFlag(input.eventId);
            return { success: true };
          }),
      }),
    }),

    supplierAccounts: protectedProcedure.query(async () => {
      return await getSupplierAccounts();
    }),

    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        return await searchAll(input.query);
      }),

    unmatched: router({
      list: protectedProcedure.query(async () => {
        return await getUnmatchedServices();
      }),

      triage: protectedProcedure.query(async () => {
        return await getUnmatchedServiceTriage();
      }),

      suggestions: protectedProcedure
        .input(z.object({ serviceId: z.string() }))
        .query(async ({ input }) => {
          return await getSuggestedMatches(input.serviceId);
        }),

      assign: protectedProcedure
        .input(z.object({
          serviceExternalId: z.string(),
          customerExternalId: z.string(),
          locationExternalId: z.string().optional(),
          createPlatformCheck: z.boolean().optional(),
          billingPlatforms: z.array(z.string()).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await assignServiceToCustomer(
            input.serviceExternalId,
            input.customerExternalId,
            input.locationExternalId
          );
          // Auto-create a Platform Check task for billing verification
          if (result.success && input.createPlatformCheck) {
            const createdBy = ctx.user?.name || ctx.user?.email || 'Unknown';
            // Fetch service details for the platform check
            const svcDetails = await getServiceForPlatformCheck(input.serviceExternalId);
            await createBillingPlatformCheck({
              targetType: 'service',
              targetId: input.serviceExternalId,
              targetName: svcDetails?.planName || svcDetails?.serviceType || input.serviceExternalId,
              platform: input.billingPlatforms?.[0] || svcDetails?.billingPlatform || 'Unknown',
              issueType: 'new-customer-assignment',
              issueDescription: `Service assigned to new customer "${svcDetails?.customerName || input.customerExternalId}". Verify billing platform setup matches service details (type: ${svcDetails?.serviceType || 'Unknown'}, cost: $${svcDetails?.monthlyCost ?? 0}/mo).`,
              customerName: svcDetails?.customerName || input.customerExternalId,
              customerExternalId: input.customerExternalId,
              monthlyAmount: Number(svcDetails?.monthlyCost ?? 0),
              priority: 'medium',
              createdBy,
            });
          }
          return result;
        }),

      dismiss: protectedProcedure
        .input(z.object({
          serviceExternalId: z.string(),
          customerExternalId: z.string(),
        }))
        .mutation(async ({ input }) => {
          return await dismissSuggestion(input.serviceExternalId, input.customerExternalId);
        }),

      // Returns all unmatched services sharing the same address (for bulk-assign prompt)
      sameAddress: protectedProcedure
        .input(z.object({
          serviceExternalId: z.string(),
          address: z.string(),
        }))
        .query(async ({ input }) => {
          return await getUnmatchedServicesAtAddress(input.serviceExternalId, input.address);
        }),

      // Bulk-assigns a list of services to a customer by address match
      bulkAssignByAddress: protectedProcedure
        .input(z.object({
          serviceExternalIds: z.array(z.string()),
          customerExternalId: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          const assignedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await bulkAssignByAddress(
            input.serviceExternalIds,
            input.customerExternalId,
            assignedBy
          );
        }),
    }),

    updateAvc: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        connectionId: z.string(),
      }))
      .mutation(async ({ input }) => {
        return await updateServiceAvc(input.serviceExternalId, input.connectionId);
      }),

    updateNotes: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        notes: z.string(),
        author: z.string(),
      }))
      .mutation(async ({ input }) => {
        return await updateServiceNotes(input.serviceExternalId, input.notes, input.author);
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        status: z.enum(['active', 'unmatched', 'flagged_for_termination', 'terminated']),
      }))
      .mutation(async ({ input }) => {
        return await updateServiceStatus(input.serviceExternalId, input.status);
      }),

    updateCustomerName: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        customerName: z.string(),
      }))
      .mutation(async ({ input }) => {
        return await updateServiceCustomerName(input.serviceExternalId, input.customerName);
      }),

    terminate: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userName = ctx.user?.name || ctx.user?.email || 'unknown';
        return await terminateService(input.serviceExternalId, userName, input.reason);
      }),

    restore: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userName = ctx.user?.name || ctx.user?.email || 'unknown';
        return await restoreTerminatedService(input.serviceExternalId, userName);
      }),

    updateBillingPlatform: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        platforms: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        return await updateServiceBillingPlatform(input.serviceExternalId, input.platforms);
      }),

    // Billing items
    billingItems: router({
      list: protectedProcedure
        .input(z.object({
          matchStatus: z.string().optional(),
          customerExternalId: z.string().optional(),
          category: z.string().optional(),
          billingPlatform: z.string().optional(),
        }).optional())
        .query(async ({ input }) => {
          return await getBillingItems(input);
        }),

      byService: protectedProcedure
        .input(z.object({ serviceExternalId: z.string() }))
        .query(async ({ input }) => {
          return await getBillingItemsByService(input.serviceExternalId);
        }),

      byCustomer: protectedProcedure
        .input(z.object({ customerExternalId: z.string() }))
        .query(async ({ input }) => {
          return await getBillingItemsByCustomer(input.customerExternalId);
        }),

      summary: protectedProcedure.query(async () => {
        return await getBillingSummary();
      }),

      matchToService: protectedProcedure
        .input(z.object({
          billingItemId: z.number(),
          serviceExternalId: z.string(),
        }))
        .mutation(async ({ input }) => {
          return await updateBillingItemMatch(input.billingItemId, input.serviceExternalId);
        }),

      assignToCustomer: protectedProcedure
        .input(z.object({
          billingItemId: z.number(),
          customerExternalId: z.string(),
        }))
        .mutation(async ({ input }) => {
          return await assignBillingItemToCustomer(input.billingItemId, input.customerExternalId);
        }),
    }),

    // Margin analysis
    margin: router({
      list: protectedProcedure
        .input(z.object({
          marginFilter: z.string().optional(),
          customerExternalId: z.string().optional(),
          serviceType: z.string().optional(),
          provider: z.string().optional(),
          costReviewNeeded: z.boolean().optional(),
          search: z.string().optional(),
          customerType: z.string().optional(),
        }).optional())
        .query(async ({ input }) => {
          const services = await getServicesWithMargin(input);
          // Attach billing period so the UI can show "Data as of Feb 2026" on summary cards
          let latestBillingPeriod: string | null = null;
          try {
            const db = await (await import('./db')).getDb();
            if (db) {
              const { sql: drizzleSql } = await import('drizzle-orm');
              const periodResult = await db.execute(
                drizzleSql`SELECT DATE_FORMAT(STR_TO_DATE(invoiceDate, '%Y-%m-%d'), '%b %Y') as period, COUNT(*) as cnt
                    FROM billing_items
                    WHERE invoiceDate REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    GROUP BY period ORDER BY cnt DESC LIMIT 1`
              ) as any;
              const rows: any[] = Array.isArray(periodResult) ? (periodResult[0] as any[]) : (periodResult.rows || []);
              if (rows[0]?.period) latestBillingPeriod = rows[0].period;
            }
          } catch (_) { /* ignore */ }
          return { services, latestBillingPeriod };
        }),
      grouped: protectedProcedure
        .input(z.object({
          marginFilter: z.string().optional(),
          serviceType: z.string().optional(),
          provider: z.string().optional(),
          search: z.string().optional(),
          customerType: z.string().optional(),
        }).optional())
        .query(async ({ input }) => {
          return await getServicesGroupedByCustomer(input);
        }),

      groupDetail: protectedProcedure
        .input(z.object({ groupId: z.string() }))
        .query(async ({ input }) => {
          const db = await (await import('./db')).getDb();
          if (!db) return null;
          const { sql: drizzleSql } = await import('drizzle-orm');
          // Fetch the group header
          const grpRows = await db.execute(
            drizzleSql`SELECT groupId, name, type, customerExternalId, customerName,
                              totalRevenue, totalCost, autoDetected
                       FROM revenue_groups WHERE groupId = ${input.groupId} LIMIT 1`
          ) as any;
          const grpArr: any[] = Array.isArray(grpRows) ? (grpRows[0] as any[]) : (grpRows.rows || []);
          if (!grpArr[0]) return null;
          const group = grpArr[0];

          // Fetch all services in the group
          const svcRows = await db.execute(
            drizzleSql`SELECT s.id, s.externalId, s.planName, s.serviceType, s.phoneNumber,
                              s.connectionId, s.monthlyCost, s.monthlyRevenue, s.costSource,
                              s.provider, s.billingPlatforms, s.status
                       FROM services s
                       WHERE s.revenueGroupId = ${input.groupId}
                       ORDER BY s.monthlyCost DESC, s.planName ASC`
          ) as any;
          const services: any[] = Array.isArray(svcRows) ? (svcRows[0] as any[]) : (svcRows.rows || []);

          // Compute group totals
          const totalCost = services.reduce((sum: number, s: any) => sum + parseFloat(s.monthlyCost || '0'), 0);
          const totalRevenue = parseFloat(group.totalRevenue || '0');
          const groupMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : null;
          const isLoss = totalCost > totalRevenue;

          return {
            ...group,
            totalCost,
            totalRevenue,
            groupMargin,
            isLoss,
            services,
          };
        }),
    }),

    // Review page
    review: router({
      issues: protectedProcedure.query(async () => {
        return await getReviewIssues();
      }),

      resolve: protectedProcedure
        .input(z.object({
          issueType: z.string(),
          itemId: z.string(),
          action: z.enum(['resolve', 'ignore', 'flag']),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const submittedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await resolveReviewIssue(input.issueType, input.itemId, input.action, input.notes, submittedBy);
        }),

      submitForReview: protectedProcedure
        .input(z.object({
          targetType: z.enum(['service', 'customer', 'billing-item']),
          targetId: z.string(),
          targetName: z.string(),
          note: z.string().min(1, 'Note is required'),
          // Optional: auto-create a platform check
          createPlatformCheck: z.boolean().optional(),
          platform: z.string().optional(),
          issueType: z.string().optional(),
          issueDescription: z.string().optional(),
          customerName: z.string().optional(),
          customerExternalId: z.string().optional(),
          monthlyAmount: z.number().optional(),
          priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const submittedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          const reviewResult = await submitForReview({
            targetType: input.targetType,
            targetId: input.targetId,
            targetName: input.targetName,
            note: input.note,
            submittedBy,
          });

          // Auto-create a billing platform check if requested
          if (input.createPlatformCheck && input.platform && input.issueType) {
            await createBillingPlatformCheck({
              reviewItemId: (reviewResult as any).id,
              targetType: input.targetType === 'billing-item' ? 'billing-item' : 'service',
              targetId: input.targetId,
              targetName: input.targetName,
              platform: input.platform,
              issueType: input.issueType,
              issueDescription: input.issueDescription || input.note,
              customerName: input.customerName || '',
              customerExternalId: input.customerExternalId || '',
              monthlyAmount: input.monthlyAmount || 0,
              priority: input.priority || 'medium',
              createdBy: submittedBy,
            });
          }

          return reviewResult;
        }),

      ignore: protectedProcedure
        .input(z.object({
          issueType: z.string(),
          targetType: z.enum(['service', 'customer', 'billing-item']),
          targetId: z.string(),
          targetName: z.string(),
          note: z.string().min(1, 'Note is required'),
        }))
        .mutation(async ({ input, ctx }) => {
          return await ignoreReviewIssue({
            ...input,
            submittedBy: ctx.user?.name || ctx.user?.email || 'Unknown',
          });
        }),

      manualItems: protectedProcedure.query(async () => {
        return await getManualReviewItems();
      }),

      ignoredItems: protectedProcedure.query(async () => {
        return await getIgnoredIssues();
      }),

      resolveManual: protectedProcedure
        .input(z.object({
          id: z.number(),
          resolvedNote: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          return await resolveManualReview(input.id, ctx.user?.name || ctx.user?.email || 'Unknown', input.resolvedNote);
        }),
    }),

    // Billing Platform Checks
    platformChecks: router({
      list: protectedProcedure
        .input(z.object({
          status: z.string().optional(),
          platform: z.string().optional(),
          priority: z.string().optional(),
          search: z.string().optional(),
        }).optional())
        .query(async ({ input }) => {
          return await getBillingPlatformChecks(input);
        }),

      summary: protectedProcedure.query(async () => {
        return await getBillingPlatformCheckSummary();
      }),

      create: protectedProcedure
        .input(z.object({
          targetType: z.enum(['service', 'billing-item']),
          targetId: z.string(),
          targetName: z.string(),
          platform: z.string(),
          issueType: z.string(),
          issueDescription: z.string().optional(),
          customerName: z.string().optional(),
          customerExternalId: z.string().optional(),
          monthlyAmount: z.number().optional(),
          priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const createdBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await createBillingPlatformCheck({
            targetType: input.targetType,
            targetId: input.targetId,
            targetName: input.targetName,
            platform: input.platform,
            issueType: input.issueType,
            issueDescription: input.issueDescription || '',
            customerName: input.customerName || '',
            customerExternalId: input.customerExternalId || '',
            monthlyAmount: input.monthlyAmount || 0,
            priority: input.priority || 'medium',
            createdBy,
          });
        }),

      action: protectedProcedure
        .input(z.object({
          id: z.number(),
          actionedNote: z.string().optional().default(''),
          newStatus: z.enum(['actioned', 'dismissed', 'in-progress']),
        }))
        .mutation(async ({ input, ctx }) => {
          const actionedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await actionBillingPlatformCheck(input.id, actionedBy, input.actionedNote, input.newStatus);
        }),

      // Get unverified services (provider claim not confirmed by API or invoice)
      getUnverifiedServices: protectedProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        const rows = await db
          .select({
            externalId: services.externalId,
            customerExternalId: services.customerExternalId,
            provider: services.provider,
            planName: services.planName,
            serviceType: services.serviceType,
            carbonServiceId: services.carbonServiceId,
            avcId: services.avcId,
            dataSource: services.dataSource,
            status: services.status,
          })
          .from(services)
          .where(
            and(
              eq(services.provider, 'ABB'),
              or(
                isNull(services.carbonServiceId),
                eq(services.carbonServiceId, '')
              ),
              sql`${services.status} NOT IN ('terminated', 'billing_platform_stub')`
            )
          );
        // Annotate each with a suggested correction
        return rows.map(r => ({
          ...r,
          suggestedProvider: r.planName?.toLowerCase().includes('opticomm') ? 'Opticomm' : null,
          verificationIssue: r.planName?.toLowerCase().includes('opticomm')
            ? 'Opticomm plan name — likely misclassified as ABB'
            : 'No Carbon API record found for this ABB service',
        }));
      }),

      // Bulk reclassify services matching a plan name pattern to a new provider
      bulkReclassifyProvider: protectedProcedure
        .input(z.object({
          planNamePattern: z.string(), // substring to match in planName (case-insensitive)
          fromProvider: z.string(),    // only reclassify services currently set to this provider
          toProvider: z.string(),      // new provider value
        }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error('DB not available');
          // Find all matching services
          const matching = await db
            .select({ externalId: services.externalId, planName: services.planName })
            .from(services)
            .where(
              and(
                eq(services.provider, input.fromProvider),
                sql`LOWER(${services.planName}) LIKE ${('%' + input.planNamePattern.toLowerCase() + '%')}`,
                sql`${services.status} NOT IN ('terminated', 'billing_platform_stub')`
              )
            );
          if (matching.length === 0) return { updated: 0, services: [] };
          // Update all matching services
          await db
            .update(services)
            .set({ provider: input.toProvider })
            .where(
              and(
                eq(services.provider, input.fromProvider),
                sql`LOWER(${services.planName}) LIKE ${('%' + input.planNamePattern.toLowerCase() + '%')}`,
                sql`${services.status} NOT IN ('terminated', 'billing_platform_stub')`
              )
            );
          return {
            updated: matching.length,
            services: matching.map(s => s.externalId),
          };
        }),

      // Add or update a note WITHOUT changing the status (record stays visible)
      addNote: protectedProcedure
        .input(z.object({
          id: z.number(),
          note: z.string().min(1, 'Note cannot be empty'),
        }))
        .mutation(async ({ input, ctx }) => {
          const addedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await addNoteToBillingPlatformCheck(input.id, input.note, addedBy);
        }),
    }),

    // Service reassignment
    reassignService: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        newCustomerExternalId: z.string().nullable(),
        newCustomerName: z.string().nullable(),
        reason: z.string().min(1, 'Reason is required'),
      }))
      .mutation(async ({ input, ctx }) => {
        const reassignedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
        return await reassignService(
          input.serviceExternalId,
          input.newCustomerExternalId,
          input.newCustomerName,
          reassignedBy,
          input.reason
        );
      }),

    // Associate billing item to customer/service
    associateBillingItem: protectedProcedure
      .input(z.object({
        billingItemId: z.number(),
        customerExternalId: z.string().nullable(),
        customerName: z.string().nullable(),
        serviceExternalId: z.string().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const associatedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
        return await associateBillingItem(
          input.billingItemId,
          input.customerExternalId,
          input.customerName,
          input.serviceExternalId,
          associatedBy
        );
      }),

    // Get services for a customer (for reassignment target lookup)
    servicesByCustomer: protectedProcedure
      .input(z.object({ customerExternalId: z.string() }))
      .query(async ({ input }) => {
        return await getServicesByCustomerForReassign(input.customerExternalId);
      }),

    // Auto-match via Carbon alias
    autoMatch: router({
      preview: protectedProcedure
        .input(z.object({ minConfidence: z.number().min(0).max(100).optional() }).optional())
        .query(async ({ input }) => {
          return await previewAliasAutoMatch(input?.minConfidence ?? 60);
        }),

      commit: protectedProcedure
        .input(z.object({
          approvedMatches: z.array(z.object({
            serviceExternalId: z.string(),
            customerExternalId: z.string(),
            customerName: z.string(),
          })),
        }))
        .mutation(async ({ input, ctx }) => {
          const committedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await commitAliasAutoMatch(input.approvedMatches, committedBy);
        }),
    }),

    // Address-based fuzzy auto-match
    addressMatch: router({
      preview: protectedProcedure
        .input(z.object({ minConfidence: z.number().min(0).max(100).optional() }).optional())
        .query(async ({ input }) => {
          return await previewAddressAutoMatch(input?.minConfidence ?? 55);
        }),

      commit: protectedProcedure
        .input(z.object({
          approvedMatches: z.array(z.object({
            serviceExternalId: z.string(),
            customerExternalId: z.string(),
            customerName: z.string(),
          })),
        }))
        .mutation(async ({ input, ctx }) => {
          const committedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await commitAddressAutoMatch(input.approvedMatches, committedBy);
        }),
    }),

    // Bulk-activate services that already have a customerExternalId but are stuck as 'unmatched'
    bulkActivate: router({
      preview: protectedProcedure
        .query(async () => {
          return await bulkActivateLinkedServices(true);
        }),
      commit: protectedProcedure
        .mutation(async () => {
          return await bulkActivateLinkedServices(false);
        }),
    }),
    recalculateAll: protectedProcedure
      .mutation(async () => {
        return await recalculateAll();
      }),
    // Bulk auto-assign HIGH confidence suggested matches
    bulkHighConfidence: router({
      preview: protectedProcedure
        .query(async () => {
          return await previewBulkAutoAssignHighConfidence();
        }),
      commit: protectedProcedure
        .mutation(async ({ ctx }) => {
          const assignedBy = ctx.user?.name || ctx.user?.email || 'Bulk Auto-Assign';
          return await bulkAutoAssignHighConfidence(assignedBy);
        }),
    }),
    // Global auto-match billing items across ALL customers (no screen required)
    // In-memory job store for background globalAutoMatch runs
    // Applies saved match rules (100% confidence) + fuzzy matching (>=minConfidence%)
    globalAutoMatch: protectedProcedure
      .input(z.object({
        minConfidence: z.number().min(0).max(100).default(70),
      }).optional())
      .mutation(async ({ input, ctx }) => {
        const triggeredBy = ctx.user?.name || ctx.user?.email || 'system';
        const confidence = input?.minConfidence ?? 70;
        // Fire-and-forget: start the job in the background and return immediately
        const jobId = `automatch-${Date.now()}`;
        autoMatchJobs.set(jobId, { status: 'running' as const, startedAt: Date.now(), result: null, error: null });
        (async () => {
          try {
            const matchResult = await globalAutoMatchBillingItems(confidence, triggeredBy);
            // After matching: run proportional split then full revenue recalculation
            try { await redistributeProportionalRevenue(); } catch (e) { console.error('[ProportionalSplit] Error:', e); }
            try { await recalculateAll(); } catch (e) { console.error('[RecalculateAll] Error:', e); }
            // Flatten result to avoid [Max Depth] serialisation issue in tRPC response
            const flatResult = {
              applied: typeof matchResult.applied === 'number' ? matchResult.applied : 0,
              skipped: typeof matchResult.skipped === 'number' ? matchResult.skipped : 0,
              customersProcessed: typeof matchResult.customersProcessed === 'number' ? matchResult.customersProcessed : 0,
              errors: Array.isArray(matchResult.errors) ? matchResult.errors.slice(0, 10) : [],
            };
            autoMatchJobs.set(jobId, { status: 'done' as const, startedAt: autoMatchJobs.get(jobId)!.startedAt, result: flatResult, error: null });
          } catch (e: any) {
            autoMatchJobs.set(jobId, { status: 'error' as const, startedAt: autoMatchJobs.get(jobId)!.startedAt, result: null, error: e?.message || 'Unknown error' });
          }
          // Clean up old jobs after 10 minutes
          setTimeout(() => autoMatchJobs.delete(jobId), 10 * 60 * 1000);
        })();
        return { jobId, status: 'started' as const };
      }),
    // Poll the status of a background globalAutoMatch job
    globalAutoMatchStatus: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .query(({ input }) => {
        const job = autoMatchJobs.get(input.jobId);
        if (!job) return { status: 'not_found' as const, result: null, error: null, startedAt: 0 };
        return job;
      }),
    // Proportional revenue split for multi-service billing items (Fix #3)
    redistributeRevenue: protectedProcedure
      .mutation(async () => {
        return await redistributeProportionalRevenue();
      }),
    // Recalculate costs from the most recent workbook line items
    recalculateCosts: protectedProcedure
      .input(z.object({
        customerExternalId: z.string().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return await recalculateCostsFromWorkbook(input?.customerExternalId);
      }),
    // Xero contact import workfloww
    xeroContacts: router({
      // Get fuzzy customer suggestions for a given Xero contact name
      suggestions: protectedProcedure
        .input(z.object({ contactName: z.string() }))
        .query(async ({ input }) => {
          return await getFuzzyCustomerSuggestions(input.contactName);
        }),
      // Import a Xero contact as a new customer (creates customer + assigns billing items)
      importAsCustomer: protectedProcedure
        .input(z.object({ contactName: z.string() }))
        .mutation(async ({ input }) => {
          const result = await importXeroContactAsCustomer(input.contactName);
          // Auto-reclassify retail_offering after billing items are assigned
          await reclassifyRetailOffering().catch(() => {/* non-fatal */});
          return result;
        }),
      // Match all unmatched billing items for a Xero contact to an existing customer
      matchToCustomer: protectedProcedure
        .input(z.object({
          contactName: z.string(),
          customerExternalId: z.string(),
        }))
        .mutation(async ({ input }) => {
          const result = await matchXeroContactToCustomer(input.contactName, input.customerExternalId);
          // Auto-reclassify retail_offering after billing items are matched
          await reclassifyRetailOffering().catch(() => {/* non-fatal */});
          return result;
        }),
      // Manually trigger retail_offering reclassification for all customers
      reclassifyRetail: protectedProcedure
        .mutation(async () => {
          return await reclassifyRetailOffering();
        }),
    }),

    // Service-to-billing matching
    serviceBillingMatch: router({
      // Get auto-match candidates (1:1 same-type same-customer)
      candidates: protectedProcedure.query(async () => {
        return await getAutoMatchCandidates();
      }),
      // Get supplier services for a customer (for manual match picker)
      supplierServices: protectedProcedure
        .input(z.object({ customerExternalId: z.string() }))
        .query(async ({ input }) => {
          return await getSupplierServicesForCustomer(input.customerExternalId);
        }),
      // Merge a Xero stub service into a supplier service
      merge: protectedProcedure
        .input(z.object({
          xeroServiceExternalId: z.string(),
          supplierServiceExternalId: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          const mergedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
          return await mergeBillingToSupplierService(
            input.xeroServiceExternalId,
            input.supplierServiceExternalId,
            mergedBy
          );
        }),
    }),

    // Supplier invoice import
    importExetelInvoice: protectedProcedure
      .input(z.object({
        invoiceNumber: z.string(),
        rows: z.array(z.object({
          serviceNumber: z.string(),
          idTag: z.string(),
          category: z.string(),
          description: z.string(),
          totalIncGst: z.number(),
          billStart: z.string(),
          billEnd: z.string(),
          chargeType: z.string(),
          avcId: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        const result = await importExetelInvoice(input.invoiceNumber, input.rows);
        // Auto-apply saved match rules + global auto-match after every Exetel import
        await autoApplyMatchRules();
        globalAutoMatchBillingItems(90, 'post-exetel-import').catch(e => console.error('[AutoMatch] Post-Exetel error:', e));
        return result;
      }),

    // Generic supplier invoice import (Channel Haus, Legion, Tech-e, etc.)
    importGenericInvoice: protectedProcedure
      .input(z.object({
        supplier: z.string(),
        invoiceNumber: z.string(),
        rows: z.array(z.object({
          friendlyName: z.string(),
          serviceType: z.enum(['Internet', 'Voice', 'Other']),
          amountExGst: z.number(),
          serviceId: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const importedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
        const result = await importGenericSupplierInvoice(
          input.supplier,
          input.invoiceNumber,
          input.rows as GenericSupplierRow[],
          importedBy
        );
        // Auto-apply saved match rules + global auto-match after every generic supplier import
        await autoApplyMatchRules();
        globalAutoMatchBillingItems(90, 'post-generic-import').catch(e => console.error('[AutoMatch] Post-Generic error:', e));
        return result;
      }),

    // PDF invoice parse (Channel Haus, Legion, Tech-e)
    parsePdf: protectedProcedure
      .input(z.object({
        base64: z.string(),  // base64-encoded PDF buffer
        filename: z.string(),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, 'base64');
        return await parsePdfInvoice(buffer);
      }),

    // Upload raw invoice file to S3 and attach to an existing invoice upload record
    uploadInvoiceFile: protectedProcedure
      .input(z.object({
        invoiceUploadId: z.number(),  // ID of the supplier_invoice_uploads row
        base64: z.string(),           // base64-encoded file content
        filename: z.string(),         // original filename (e.g. invoice_123.pdf)
        mimeType: z.string().default('application/pdf'),
      }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import('./storage');
        const { getDb } = await import('./db');
        const { supplierInvoiceUploads } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const buffer = Buffer.from(input.base64, 'base64');
        const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileKey = `supplier-invoices/${Date.now()}-${safeName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        const db = await getDb();
        if (db) {
          await db.update(supplierInvoiceUploads)
            .set({ fileUrl: url, fileKey, fileName: input.filename })
            .where(eq(supplierInvoiceUploads.id, input.invoiceUploadId));
        }
        return { url, fileKey, fileName: input.filename };
      }),

    // Upload a standalone invoice file (not tied to an import record) — returns S3 URL
    uploadStandaloneInvoiceFile: protectedProcedure
      .input(z.object({
        base64: z.string(),
        filename: z.string(),
        mimeType: z.string().default('application/pdf'),
        supplier: z.string(),
        invoiceNumber: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { storagePut } = await import('./storage');
        const { getDb } = await import('./db');
        const { supplierInvoiceUploads } = await import('../drizzle/schema');
        const importedBy = ctx.user?.name || ctx.user?.email || 'system';
        const buffer = Buffer.from(input.base64, 'base64');
        const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileKey = `supplier-invoices/${Date.now()}-${safeName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        // Create a minimal upload record so the file appears in the invoice history
        const db = await getDb();
        let insertId: number | undefined;
        if (db) {
          const billingMonth = new Date().toISOString().slice(0, 7);
          const result = await db.insert(supplierInvoiceUploads).values({
            supplier: input.supplier,
            invoiceNumber: input.invoiceNumber || `FILE-${Date.now()}`,
            billingMonth,
            totalExGst: '0.00',
            totalIncGst: '0.00',
            serviceCount: 0,
            matchedCount: 0,
            unmatchedCount: 0,
            autoMatchedCount: 0,
            newMappingsCreated: 0,
            importedBy,
            status: 'file-only',
            fileUrl: url,
            fileKey,
            fileName: input.filename,
          });
          insertId = (result as any).insertId;
        }
        return { url, fileKey, fileName: input.filename, uploadId: insertId };
      }),

    // Carbon API cost sync — fetches live data from ABB Carbon API (with 6h cache)
    syncCarbonCosts: protectedProcedure
      .input(z.object({ forceRefresh: z.boolean().optional().default(false) }))
      .mutation(async ({ input, ctx }) => {
        const syncedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
        const result = await syncCarbonCostsToServices(syncedBy, input.forceRefresh);
        // Also backfill costSource for non-ABB services
        await backfillCostSources();
        return result;
      }),

    // Get Carbon API cache status
    carbonCacheStatus: protectedProcedure
      .query(async () => {
        return await getCarbonCacheStatus();
      }),

    // ── Supplier API Sync procedures ──────────────────────────────────────────
    // Vocus Product Inventory API sync
    syncVocusServices: protectedProcedure
      .input(z.object({ triggeredBy: z.string().default('manual') }))
      .mutation(async ({ input }) => {
        const { syncVocusProductInventory } = await import('./suppliers/vocus-api');
        return await syncVocusProductInventory(input.triggeredBy);
      }),
    getVocusSyncHistory: protectedProcedure
      .input(z.object({ limit: z.number().default(10) }))
      .query(async ({ input }) => {
        const { getVocusSyncHistory } = await import('./suppliers/vocus-api');
        return await getVocusSyncHistory(input.limit);
      }),
    // AAPT CDR FTP sync
    syncAaptCdr: protectedProcedure
      .input(z.object({
        triggeredBy: z.string().default('manual'),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { syncAaptCdrFiles } = await import('./suppliers/aapt-cdr');
        return await syncAaptCdrFiles(input.triggeredBy, input.dateFrom, input.dateTo);
      }),
    getAaptCdrSyncHistory: protectedProcedure
      .input(z.object({ limit: z.number().default(10) }))
      .query(async ({ input }) => {
        const { getAaptCdrSyncHistory } = await import('./suppliers/aapt-cdr');
        return await getAaptCdrSyncHistory(input.limit);
      }),
    // Get all sync logs (for the integrations dashboard)
    getSyncLogs: protectedProcedure
      .input(z.object({ limit: z.number().default(20) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { supplierSyncLog } = await import('../drizzle/schema');
        return db.select()
          .from(supplierSyncLog)
          .orderBy(supplierSyncLog.startedAt)
          .limit(input.limit);
      }),
    // ── Unified Integration Sync Status ─────────────────────────────────────
    // Returns the latest sync status for every integration in one query.
    // Used by the Integrations page and stale-data banners across the app.
    getIntegrationSyncStatus: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return {};
      const {
        supplierSyncLog, tiabSyncLog, vocusSyncLog,
        phoneNumbers,
      } = await import('../drizzle/schema');
      const { desc, eq, max } = await import('drizzle-orm');

      // Helper: get latest entry from supplier_sync_log by integration key
      async function latestSupplierSync(integration: string) {
        const rows = await db!.select()
          .from(supplierSyncLog)
          .where(eq(supplierSyncLog.integration, integration))
          .orderBy(desc(supplierSyncLog.startedAt))
          .limit(1);
        return rows[0] ?? null;
      }

      // Helper: get latest lastSyncedAt from phone_numbers by provider
      async function latestNumberSync(provider: string) {
        const rows = await db!.select({ lastSyncedAt: max(phoneNumbers.lastSyncedAt) })
          .from(phoneNumbers)
          .where(eq(phoneNumbers.provider, provider));
        return rows[0]?.lastSyncedAt ?? null;
      }

      // TIAB: latest from tiab_sync_log
      const tiabRows = await db.select()
        .from(tiabSyncLog)
        .orderBy(desc(tiabSyncLog.startedAt))
        .limit(1);
      const tiabLatest = tiabRows[0] ?? null;

      // Vocus: latest from vocus_sync_log
      const vocusRows = await db.select()
        .from(vocusSyncLog)
        .orderBy(desc(vocusSyncLog.startedAt))
        .limit(1);
      const vocusLatest = vocusRows[0] ?? null;

      const [vocusApi, aaptCdr, commsCode, netSip, channelHaus, sasBoss, carbonCosts] = await Promise.all([
        latestSupplierSync('vocus_api'),
        latestSupplierSync('aapt_cdr_ftp'),
        latestNumberSync('CommsCode'),
        latestNumberSync('NetSIP'),
        latestNumberSync('Channel Haus'),
        latestNumberSync('SasBoss'),
        latestSupplierSync('carbon_costs'),
      ]);

      return {
        vocus_api: vocusApi,
        aapt_cdr: aaptCdr,
        commsCode: { lastSyncedAt: commsCode },
        netSip: { lastSyncedAt: netSip },
        channelHaus: { lastSyncedAt: channelHaus },
        sasBoss: { lastSyncedAt: sasBoss },
        carbon_costs: carbonCosts,
        tiab: tiabLatest,
        vocus_buckets: vocusLatest,
      };
    }),
    // ── Carbon API Outage Monitor & Usage Sync ────────────────────────────────
    syncCarbonOutages: protectedProcedure
      .input(z.object({ triggeredBy: z.string().default('manual') }))
      .mutation(async ({ input }) => {
        const { syncCarbonOutages } = await import('./suppliers/carbon-outage-usage');
        return await syncCarbonOutages(input.triggeredBy);
      }),
    syncCarbonUsage: protectedProcedure
      .input(z.object({ triggeredBy: z.string().default('manual') }))
      .mutation(async ({ input }) => {
        const { syncCarbonUsage } = await import('./suppliers/carbon-outage-usage');
        return await syncCarbonUsage(input.triggeredBy);
      }),
    getActiveOutages: protectedProcedure
      .input(z.object({ customerExternalId: z.string().optional() }))
      .query(async ({ input }) => {
        const { getActiveOutages } = await import('./suppliers/carbon-outage-usage');
        return await getActiveOutages(input.customerExternalId);
      }),
    getOutageHistory: protectedProcedure
      .input(z.object({ serviceExternalId: z.string() }))
      .query(async ({ input }) => {
        const { getOutageHistory } = await import('./suppliers/carbon-outage-usage');
        return await getOutageHistory(input.serviceExternalId);
      }),
    getUsageSnapshot: protectedProcedure
      .input(z.object({ serviceExternalId: z.string(), billingPeriod: z.string().optional() }))
      .query(async ({ input }) => {
        const { getUsageSnapshot } = await import('./suppliers/carbon-outage-usage');
        return await getUsageSnapshot(input.serviceExternalId, input.billingPeriod);
      }),
    getCustomerUsageSnapshots: protectedProcedure
      .input(z.object({ customerExternalId: z.string(), billingPeriod: z.string().optional() }))
      .query(async ({ input }) => {
        const { getCustomerUsageSnapshots } = await import('./suppliers/carbon-outage-usage');
        return await getCustomerUsageSnapshots(input.customerExternalId, input.billingPeriod);
      }),
    // ── Carbon Remote Diagnostics ──────────────────────────────────────────────
    runPortReset: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        carbonServiceId: z.string(),
        customerExternalId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { runPortReset } = await import('./suppliers/carbon-diagnostics');
        const triggeredBy = (ctx.user as { name?: string })?.name ?? 'unknown';
        return await runPortReset(
          input.serviceExternalId,
          input.carbonServiceId,
          input.customerExternalId ?? null,
          triggeredBy
        );
      }),
    runLoopbackTest: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        carbonServiceId: z.string(),
        customerExternalId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { runLoopbackTest } = await import('./suppliers/carbon-diagnostics');
        const triggeredBy = (ctx.user as { name?: string })?.name ?? 'unknown';
        return await runLoopbackTest(
          input.serviceExternalId,
          input.carbonServiceId,
          input.customerExternalId ?? null,
          triggeredBy
        );
      }),
    runStabilityProfile: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        carbonServiceId: z.string(),
        customerExternalId: z.string().optional(),
        profileName: z.enum(['FAST', 'STABLE', 'INTERLEAVED', 'DEFAULT']),
      }))
      .mutation(async ({ input, ctx }) => {
        const { runStabilityProfileChange } = await import('./suppliers/carbon-diagnostics');
        const triggeredBy = (ctx.user as { name?: string })?.name ?? 'unknown';
        return await runStabilityProfileChange(
          input.serviceExternalId,
          input.carbonServiceId,
          input.customerExternalId ?? null,
          input.profileName,
          triggeredBy
        );
      }),
    getDiagnosticHistory: protectedProcedure
      .input(z.object({ serviceExternalId: z.string(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        const { getDiagnosticHistory } = await import('./suppliers/carbon-diagnostics');
        return await getDiagnosticHistory(input.serviceExternalId, input.limit);
      }),
    getDiagnosticRun: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getDiagnosticRun } = await import('./suppliers/carbon-diagnostics');
        return await getDiagnosticRun(input.id);
      }),

    // ── System availability check ─────────────────────────────────────────────
    checkSystemAvailability: protectedProcedure
      .query(async () => {
        const { checkTestSystemAvailability } = await import('./suppliers/carbon-diagnostics');
        return await checkTestSystemAvailability();
      }),

    // ── Per-service available tests ───────────────────────────────────────────
    getAvailableTests: protectedProcedure
      .input(z.object({ carbonServiceId: z.string() }))
      .query(async ({ input }) => {
        const { getAvailableTestsForService } = await import('./suppliers/carbon-diagnostics');
        return await getAvailableTestsForService(input.carbonServiceId);
      }),

    // ── Generic test runner (with pre-flight validation) ──────────────────────
    runTest: protectedProcedure
      .input(z.object({
        serviceExternalId: z.string(),
        carbonServiceId: z.string(),
        customerExternalId: z.string().optional(),
        testName: z.string(),
        extraBody: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { runDiagnosticTest } = await import('./suppliers/carbon-diagnostics');
        const triggeredBy = (ctx.user as { name?: string })?.name ?? 'unknown';
        return await runDiagnosticTest(
          input.serviceExternalId,
          input.carbonServiceId,
          input.customerExternalId ?? null,
          input.testName,
          triggeredBy,
          input.extraBody
        );
      }),

    // ── Service outages ───────────────────────────────────────────────────────
    getServiceOutages: protectedProcedure
      .input(z.object({ carbonServiceId: z.string() }))
      .query(async ({ input }) => {
        const { getServiceOutages } = await import('./suppliers/carbon-diagnostics');
        return await getServiceOutages(input.carbonServiceId);
      }),

    // ── Bulk customer outage status ───────────────────────────────────────────
    // Returns a map of customerExternalId → hasActiveOutage (boolean)
    // Used to show outage badges on the Customer List.
    // Fetches outages in parallel for all ABB services that have a carbonServiceId.
    getCustomerOutageStatus: protectedProcedure
      .query(async () => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return {};
        const { eq, sql } = await import('drizzle-orm');
        const { services } = await import('../drizzle/schema');
        // Get all ABB services with a carbonServiceId
        const abbServices = await db.select({
          externalId: services.externalId,
          customerExternalId: services.customerExternalId,
          carbonServiceId: services.carbonServiceId,
        }).from(services).where(
          sql`${services.provider} = 'ABB' AND ${services.carbonServiceId} IS NOT NULL AND ${services.carbonServiceId} != '' AND ${services.status} NOT IN ('terminated', 'billing_platform_stub')`
        );
        if (abbServices.length === 0) return {};
        const { getServiceOutages } = await import('./suppliers/carbon-diagnostics');
        // Fetch outages in parallel (cap concurrency at 10)
        const CONCURRENCY = 10;
        const customerOutageMap: Record<string, boolean> = {};
        for (let i = 0; i < abbServices.length; i += CONCURRENCY) {
          const batch = abbServices.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(
            batch.map(svc => getServiceOutages(svc.carbonServiceId!))
          );
          results.forEach((result, idx) => {
            const svc = batch[idx];
            if (!svc.customerExternalId) return;
            if (result.status === 'fulfilled') {
              const outages = result.value;
              const hasActive =
                outages.networkEvents.length > 0 ||
                outages.aussieOutages.length > 0 ||
                outages.currentNbnOutages.length > 0 ||
                outages.scheduledNbnOutages.length > 0;
              if (hasActive) customerOutageMap[svc.customerExternalId] = true;
              else if (!(svc.customerExternalId in customerOutageMap)) {
                customerOutageMap[svc.customerExternalId] = false;
              }
            }
          });
        }
        return customerOutageMap;
      }),

    // ── Re-verify a single ABB service against the Carbon API ─────────────────
    // Runs a fresh match of the service against the live Carbon API service list.
    // Returns the matched Carbon service data if found, or null if not matched.
    reverifyWithCarbonApi: protectedProcedure
      .input(z.object({ serviceExternalId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new Error('Database not available');
        const { eq, sql } = await import('drizzle-orm');
        const { services } = await import('../drizzle/schema');
        const { getCarbonServicesCached } = await import('./db');
        const triggeredBy = (ctx.user as { name?: string })?.name ?? 'unknown';
        // Fetch the service
        const [svc] = await db.select().from(services).where(eq(services.externalId, input.serviceExternalId)).limit(1);
        if (!svc) throw new Error('Service not found');
        // Get fresh Carbon services (force refresh to get latest data)
        const { services: carbonServices } = await getCarbonServicesCached(true);
        // Build lookup maps
        const byServiceIdentifier = new Map<string, typeof carbonServices[0]>();
        const byCircuitId = new Map<string, typeof carbonServices[0]>();
        for (const cs of carbonServices) {
          if (cs.service_identifier) byServiceIdentifier.set(cs.service_identifier.trim().toUpperCase(), cs);
          if (cs.circuit_id) byCircuitId.set(cs.circuit_id.trim().toUpperCase(), cs);
        }
        const extId = svc.externalId.trim().toUpperCase();
        const cs = byServiceIdentifier.get(extId) ?? byCircuitId.get(extId);
        if (!cs) {
          return { matched: false, message: 'No matching Carbon API record found for this service ID.' };
        }
        // Update the service with the matched Carbon data
        const carbonCost = cs.monthly_cost_cents / 100;
        await db.update(services).set({
          carbonServiceId: String(cs.id),
          carbonPlanName: cs.plan?.name ?? '',
          carbonAlias: cs.alias ?? '',
          carbonServiceType: cs.type ?? '',
          carbonMonthlyCost: carbonCost.toFixed(2),
          monthlyCost: carbonCost.toFixed(2),
          costSource: 'carbon_api',
        }).where(eq(services.externalId, input.serviceExternalId));
        console.log(`[ReverifyCarbonAPI] Service ${input.serviceExternalId} matched to Carbon ID ${cs.id} by ${triggeredBy}`);
        return {
          matched: true,
          carbonServiceId: String(cs.id),
          carbonPlanName: cs.plan?.name ?? '',
          carbonAlias: cs.alias ?? '',
          monthlyCost: carbonCost,
          message: `Matched to Carbon service #${cs.id} (${cs.plan?.name ?? 'Unknown plan'})`,
        };
      }),

    // ── Active outages count for Platform Checks ──────────────────────────────
    // Returns the list of services with active outages (for the alert card).
    getActiveOutagesServices: protectedProcedure
      .query(async () => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return [];
        const { sql } = await import('drizzle-orm');
        const { services } = await import('../drizzle/schema');
        const abbServices = await db.select({
          externalId: services.externalId,
          planName: services.planName,
          customerExternalId: services.customerExternalId,
          carbonServiceId: services.carbonServiceId,
        }).from(services).where(
          sql`${services.provider} = 'ABB' AND ${services.carbonServiceId} IS NOT NULL AND ${services.carbonServiceId} != '' AND ${services.status} NOT IN ('terminated', 'billing_platform_stub')`
        );
        if (abbServices.length === 0) return [];
        const { getServiceOutages } = await import('./suppliers/carbon-diagnostics');
        const CONCURRENCY = 10;
        const withOutages: Array<{ externalId: string; planName: string | null; customerExternalId: string | null; carbonServiceId: string }> = [];
        for (let i = 0; i < abbServices.length; i += CONCURRENCY) {
          const batch = abbServices.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(
            batch.map(svc => getServiceOutages(svc.carbonServiceId!))
          );
          results.forEach((result, idx) => {
            const svc = batch[idx];
            if (result.status === 'fulfilled') {
              const outages = result.value;
              const hasActive =
                outages.networkEvents.length > 0 ||
                outages.aussieOutages.length > 0 ||
                outages.currentNbnOutages.length > 0 ||
                outages.scheduledNbnOutages.length > 0;
              if (hasActive) withOutages.push(svc as any);
            }
          });
        }
        return withOutages;
      }),

    // ── Usage Threshold Alertss ────────────────────────────────────────────────
    checkUsageThresholds: protectedProcedure
      .input(z.object({ triggeredBy: z.string().default('manual') }))
      .mutation(async ({ input }) => {
        const { checkUsageThresholds } = await import('./suppliers/carbon-usage-alerts');
        return await checkUsageThresholds(input.triggeredBy);
      }),
    // List all historical Carbon API tests for a service (GET /tests/{serviceId})
    listServiceTests: protectedProcedure
      .input(z.object({ carbonServiceId: z.string() }))
      .query(async ({ input }) => {
        const { listServiceTests } = await import('./suppliers/carbon-diagnostics');
        return await listServiceTests(input.carbonServiceId);
      }),

    getUsageThresholdAlerts: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        customerExternalId: z.string().optional(),
        billingPeriod: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const { getUsageThresholdAlerts } = await import('./suppliers/carbon-usage-alerts');
        return await getUsageThresholdAlerts(input?.status, input?.customerExternalId, input?.billingPeriod);
      }),
    acknowledgeUsageAlert: protectedProcedure
      .input(z.object({ alertId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { acknowledgeUsageAlert } = await import('./suppliers/carbon-usage-alerts');
        const acknowledgedBy = (ctx.user as { name?: string })?.name ?? 'unknown';
        return await acknowledgeUsageAlert(input.alertId, acknowledgedBy);
      }),

    // Get cost history for a service
    serviceCostHistory: protectedProcedure
      .input(z.object({ serviceExternalId: z.string() }))
      .query(async ({ input }) => {
        return await getServiceCostHistory(input.serviceExternalId);
      }),

    // SasBoss Dispatch Workbook import
    importSasBoss: protectedProcedure
      .input(z.object({
        workbookName: z.string(),
        billingMonth: z.string(), // e.g. '2026-03'
        invoiceReference: z.string().default(''),
        pivotRows: z.array(z.object({
          enterprise_name: z.string(),
          product_name: z.string(),
          product_type: z.string(),
          service_ref_id: z.string().optional(),
          sum_ex_gst: z.number(),
          sum_inc_gst: z.number(),
        })),
        callUsageRows: z.array(z.object({
          enterprise_name: z.string(),
          call_usage_ex_gst: z.number(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const importedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
        const sasbossResult = await importSasBossDispatch(
          input.workbookName,
          input.billingMonth,
          input.invoiceReference,
          input.pivotRows as SasBossPivotRow[],
          input.callUsageRows as SasBossCallUsageRow[],
          importedBy
        );
        // Auto-run global billing match after every SasBoss import
        globalAutoMatchBillingItems(90, 'post-sasboss-import').catch(e => console.error('[AutoMatch] Post-SasBoss error:', e));
        return sasbossResult;
      }),

    // Dry-run: analyse workbook and return match proposals (no DB writes)
    dryRunSasBoss: protectedProcedure
      .input(z.object({
        workbookName: z.string(),
        billingMonth: z.string(),
        pivotRows: z.array(z.object({
          enterprise_name: z.string(),
          product_name: z.string(),
          product_type: z.string(),
          service_ref_id: z.string().optional(),
          sum_ex_gst: z.number(),
          sum_inc_gst: z.number(),
        })),
        callUsageRows: z.array(z.object({
          enterprise_name: z.string(),
          call_usage_ex_gst: z.number(),
        })),
      }))
      .mutation(async ({ input }) => {
        return await dryRunSasBossDispatch(
          input.workbookName,
          input.billingMonth,
          input.pivotRows as SasBossPivotRow[],
          input.callUsageRows as SasBossCallUsageRow[]
        );
      }),

    // Confirm: commit only user-approved proposals to the database
    confirmSasBoss: protectedProcedure
      .input(z.object({
        workbookName: z.string(),
        billingMonth: z.string(),
        invoiceReference: z.string().default(''),
        importedBy: z.string().optional(),
        approvedProposals: z.array(z.object({
          rowIndex: z.number(),
          enterpriseName: z.string(),
          productName: z.string(),
          productType: z.string(),
          serviceRefId: z.string(),
          amountExGst: z.number(),
          amountIncGst: z.number(),
          confirmedCustomerExternalId: z.string().nullable(),
          confirmedCustomerName: z.string().nullable(),
          confirmedServiceExternalId: z.string().nullable(),
          action: z.enum(['approve', 'skip']),
        })),
        callUsageProposals: z.array(z.object({
          enterpriseName: z.string(),
          callUsageExGst: z.number(),
          confirmedCustomerExternalId: z.string().nullable(),
          confirmedCustomerName: z.string().nullable(),
          action: z.enum(['approve', 'skip']),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const importedBy = input.importedBy || ctx.user?.name || ctx.user?.email || 'Unknown';
        const result = await confirmSasBossDispatch({
          ...input,
          importedBy,
        } as SasBossConfirmInput);
        // Auto-apply saved match rules + global auto-match after every confirmed SasBoss import
        await autoApplyMatchRules();
        globalAutoMatchBillingItems(90, 'post-sasboss-confirm').catch(e => console.error('[AutoMatch] Post-SasBoss-confirm error:', e));
        return result;
      }),

    // List SasBoss workbook uploads
    listWorkbookUploads: protectedProcedure
      .query(async () => {
        return await getSupplierWorkbookUploads();
      }),

    // Get line items for a workbook upload
    workbookLineItems: protectedProcedure
      .input(z.object({ uploadId: z.number() }))
      .query(async ({ input }) => {
        return await getWorkbookLineItems(input.uploadId);
      }),

    // Get call usage summaries for a customer
    customerUsage: protectedProcedure
      .input(z.object({ customerExternalId: z.string() }))
      .query(async ({ input }) => {
        return await getCustomerUsageSummaries(input.customerExternalId);
      }),

    // AAPT services & supplier registry
    aapt: router({
      stats: protectedProcedure.query(async () => {
        return await getAaptImportStats();
      }),
      services: protectedProcedure
        .input(z.object({ status: z.string().optional() }).optional())
        .query(async ({ input }) => {
          return await getAaptServices(input?.status);
        }),
      unmatched: protectedProcedure.query(async () => {
        return await getUnmatchedAaptServices();
      }),
      assign: protectedProcedure
        .input(z.object({
          serviceExternalId: z.string(),
          customerExternalId: z.string(),
          customerName: z.string(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          return await assignAaptServiceToCustomer(
            input.serviceExternalId,
            input.customerExternalId,
            input.customerName,
            ctx.user.name || ctx.user.openId,
            input.notes
          );
        }),
      mappings: protectedProcedure.query(async () => {
        return await getSupplierServiceMappings('AAPT');
      }),
      invoiceUploads: protectedProcedure.query(async () => {
        return await getSupplierInvoiceUploads('AAPT');
      }),
    }),
    // Vocus Standard Mobile SIMs
    vocus: router({
      stats: protectedProcedure.query(async () => {
        return await getVocusImportStats();
      }),
      services: protectedProcedure
        .input(z.object({ status: z.string().optional() }).optional())
        .query(async ({ input }) => {
          return await getVocusServices(input?.status);
        }),
      importStandardMobileSims: protectedProcedure
        .mutation(async () => {
          return await importVocusMobileSims(VOCUS_STANDARD_MOBILE_SIMS);
        }),
    }),
    supplierRegistry: router({
      list: protectedProcedure.query(async () => {
        return await getSupplierRegistry();
      }),
      invoiceUploads: protectedProcedure
        .input(z.object({ supplier: z.string().optional() }).optional())
        .query(async ({ input }) => {
          return await getSupplierInvoiceUploads(input?.supplier);
        }),
      allMappings: protectedProcedure
        .input(z.object({ supplierName: z.string() }))
        .query(async ({ input }) => {
          return await getSupplierServiceMappings(input.supplierName);
        }),
    }),
    dashboardTotals: protectedProcedure.query(async () => {
      return await getDashboardTotals();
    }),
    // Product cost mappings (Access4 Diamond pricebook)
    productCosts: router({
      list: protectedProcedure
        .input(z.object({ supplier: z.string().optional() }).optional())
        .query(async ({ input }) => {
          return await getProductCostMappings(input?.supplier);
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          wholesaleCost: z.number(),
          defaultRetailPrice: z.number(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          return await updateProductCostMapping(input.id, input.wholesaleCost, input.defaultRetailPrice, input.notes);
        }),
    }),
    // Blitz termination review
    blitz: router({
      terminationList: protectedProcedure
        .query(async () => {
          return await getBlitzTerminationServices();
        }),
      importStats: protectedProcedure
        .query(async () => {
          return await getBlitzImportStats();
        }),
    }),
    // Access4 / SasBoss PDF invoice import
    importAccess4: protectedProcedure
      .input(z.object({
        invoiceNumber: z.string(),
        invoiceDate: z.string(),
        totalIncGst: z.number(),
        enterprises: z.array(z.object({
          name: z.string(),
          endpoints: z.number(),
          endpointDelta: z.number(),
          mrc: z.number(),
          variable: z.number(),
          onceOff: z.number(),
          total: z.number(),
          isInternal: z.boolean(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const importedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
        const access4Result = await importAccess4Invoice(
          input.invoiceNumber,
          input.invoiceDate,
          input.totalIncGst,
          input.enterprises,
          importedBy
        );
        // Auto-run global billing match after every Access4 import
        globalAutoMatchBillingItems(90, 'post-access4-import').catch(e => console.error('[AutoMatch] Post-Access4 error:', e));
        return access4Result;
      }),
    // -----------------------------------------------------------------------
    // Omada Network API
    // -----------------------------------------------------------------------
    omada: router({
      /** List all Omada sites from DB cache */
      listSites: protectedProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(omadaSites).orderBy(desc(omadaSites.updatedAt));
      }),

      /** Sync all sites from Omada API into DB, auto-match to customers */
      syncSites: protectedProcedure.mutation(async () => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const liveSites = await listOmadaSites();
        const allCustomers = await db.select({
          externalId: customers.externalId,
          name: customers.name,
          businessName: customers.businessName,
        }).from(customers);
        const matches = autoMatchSitesToCustomers(liveSites, allCustomers);
        // Load existing site records so we can preserve manual links
        const existingSites = await db.select({
          omadaSiteId: omadaSites.omadaSiteId,
          customerExternalId: omadaSites.customerExternalId,
          matchType: omadaSites.matchType,
          matchConfidence: omadaSites.matchConfidence,
        }).from(omadaSites);
        const existingMap = new Map(existingSites.map((s) => [s.omadaSiteId, s]));
        let upserted = 0;
        for (const site of liveSites) {
          const match = matches.find((m) => m.omadaSiteId === site.siteId);
          // Fetch live device list and client count (CBC API doesn't include counts in site list)
          let wanIp: string | null = null;
          let wanStatus: string | null = null;
          let wanUptimeSeconds: number | null = null;
          let deviceCount = 0;
          let apCount = 0;
          let switchCount = 0;
          let gatewayCount = 0;
          let clientCount = 0;
          try {
            const [devices, clients] = await Promise.all([
              listOmadaDevices(site.siteId),
              getOmadaClientCount(site.siteId),
            ]);
            deviceCount = devices.length;
            apCount = devices.filter((d) => d.type === 'ap').length;
            switchCount = devices.filter((d) => d.type === 'switch').length;
            gatewayCount = devices.filter((d) => d.type === 'gateway').length;
            clientCount = clients;
            // Derive WAN from gateway device
            const gateway = devices.find((d) => d.type === 'gateway');
            if (gateway) {
              const gw = gateway as typeof gateway & { publicIp?: string };
              const rawUptime: unknown = (gateway as unknown as Record<string, unknown>).uptime;
              wanIp = gw.publicIp ?? gw.ip ?? null;
              wanStatus = gateway.status === 1 ? 'connected' : 'disconnected';
              if (typeof rawUptime === 'string') {
                // Parse "39day(s) 12h 40m 25s" format
                let secs = 0;
                const dm = rawUptime.match(/(\d+)\s*day/); if (dm) secs += parseInt(dm[1]) * 86400;
                const hm = rawUptime.match(/(\d+)\s*h/); if (hm) secs += parseInt(hm[1]) * 3600;
                const mm = rawUptime.match(/(\d+)\s*m/); if (mm) secs += parseInt(mm[1]) * 60;
                const sm = rawUptime.match(/(\d+)\s*s/); if (sm) secs += parseInt(sm[1]);
                wanUptimeSeconds = secs;
              } else if (typeof rawUptime === 'number') {
                wanUptimeSeconds = rawUptime;
              }
            }
          } catch { /* ignore per-site errors */ }
          // Preserve manual links — only update customerExternalId if not manually set
          const existing = existingMap.get(site.siteId);
          const isManualLink = existing?.matchType === 'manual';
          const resolvedCustomerExternalId = isManualLink
            ? existing!.customerExternalId
            : (match?.customerExternalId ?? null);
          const resolvedMatchType = isManualLink
            ? 'manual'
            : (match?.customerExternalId ? 'auto' : 'unmatched');
          const resolvedMatchConfidence = isManualLink
            ? existing!.matchConfidence
            : (match ? String(match.confidence) : null);
          const values = {
            omadaSiteId: site.siteId,
            omadaSiteName: site.name,
            customerExternalId: resolvedCustomerExternalId,
            matchType: resolvedMatchType,
            matchConfidence: resolvedMatchConfidence,
            siteRegion: site.region ?? null,
            siteScenario: site.scenario ?? null,
            wanIp,
            wanStatus,
            wanUptimeSeconds,
            deviceCount,
            apCount,
            switchCount,
            gatewayCount,
            clientCount,
            healthScore: site.healthScore ?? null,
            healthStatus: site.healthStatus ?? null,
            alertCount: site.alertNum ?? 0,
            rawJson: JSON.stringify(site),
            lastSyncedAt: new Date(),
          };
          await db.insert(omadaSites).values(values)
            .onDuplicateKeyUpdate({ set: values });
          upserted++;
        }
        return { synced: upserted, total: liveSites.length };
      }),

      /** Get live site status for a specific site */
      getSiteStatus: protectedProcedure
        .input(z.object({ omadaSiteId: z.string() }))
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return { cached: null, live: null, wan: null };
          const [cached] = await db.select().from(omadaSites)
            .where(eq(omadaSites.omadaSiteId, input.omadaSiteId)).limit(1);
          const [siteDetail, wan] = await Promise.all([
            getOmadaSiteDetail(input.omadaSiteId).catch(() => null),
            getOmadaWanStatus(input.omadaSiteId).catch(() => null),
          ]);
          return { cached: cached ?? null, live: siteDetail, wan };
        }),

      /** Get live device list for a site */
      getDevices: protectedProcedure
        .input(z.object({ omadaSiteId: z.string() }))
        .query(async ({ input }) => {
          return listOmadaDevices(input.omadaSiteId);
        }),

      /** Sync devices for a site into the device cache */
      syncDevices: protectedProcedure
        .input(z.object({ omadaSiteId: z.string() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error('Database unavailable');
          const devices = await listOmadaDevices(input.omadaSiteId);
          for (const d of devices) {
            const values = {
              omadaSiteId: input.omadaSiteId,
              omadaDeviceId: d.mac,
              macAddress: d.mac,
              deviceName: d.name ?? null,
              deviceType: d.type ?? null,
              deviceModel: d.model ?? null,
              firmwareVersion: d.firmwareVersion ?? null,
              status: d.status === 1 ? 'connected' : d.status === 0 ? 'disconnected' : 'isolated',
              uptimeSeconds: d.uptime ?? null,
              cpuPercent: d.cpuUtil ?? null,
              memPercent: d.memUtil ?? null,
              wanIp: d.ip ?? null,
              rawJson: JSON.stringify(d),
              lastSyncedAt: new Date(),
            };
            await db.insert(omadaDeviceCache).values(values)
              .onDuplicateKeyUpdate({ set: values });
          }
          return { synced: devices.length };
        }),

      /** Get cached device linked to a specific service */
      getDeviceByService: protectedProcedure
        .input(z.object({ serviceExternalId: z.string() }))
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return null;
          const [device] = await db.select().from(omadaDeviceCache)
            .where(eq(omadaDeviceCache.serviceExternalId, input.serviceExternalId))
            .orderBy(desc(omadaDeviceCache.lastSyncedAt))
            .limit(1);
          return device ?? null;
        }),

      /** Get live connected clients for a site */
      getClients: protectedProcedure
        .input(z.object({ omadaSiteId: z.string() }))
        .query(async ({ input }) => {
          return listOmadaClients(input.omadaSiteId);
        }),

      /** Block a client MAC at a site */
      blockClient: protectedProcedure
        .input(z.object({ omadaSiteId: z.string(), mac: z.string() }))
        .mutation(async ({ input }) => {
          await blockOmadaClient(input.omadaSiteId, input.mac);
          return { success: true, mac: input.mac, action: 'blocked' as const };
        }),

      /** Unblock a client MAC at a site */
      unblockClient: protectedProcedure
        .input(z.object({ omadaSiteId: z.string(), mac: z.string() }))
        .mutation(async ({ input }) => {
          await unblockOmadaClient(input.omadaSiteId, input.mac);
          return { success: true, mac: input.mac, action: 'unblocked' as const };
        }),

      /** Manually link an Omada site to a customer */
      linkSiteToCustomer: protectedProcedure
        .input(z.object({ omadaSiteId: z.string(), customerExternalId: z.string() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error('Database unavailable');
          await db.update(omadaSites)
            .set({ customerExternalId: input.customerExternalId, matchType: 'manual', updatedAt: new Date() })
            .where(eq(omadaSites.omadaSiteId, input.omadaSiteId));
          return { success: true };
        }),

      /** Get the Omada site linked to a customer */
      getSiteByCustomer: protectedProcedure
        .input(z.object({ customerExternalId: z.string() }))
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return null;
          const [site] = await db.select().from(omadaSites)
            .where(eq(omadaSites.customerExternalId, input.customerExternalId))
            .limit(1);
          return site ?? null;
        }),

      /** Get top clients by traffic for a site */
      getTopClients: protectedProcedure
        .input(z.object({
          omadaSiteId: z.string(),
          limit: z.number().default(5),
          timeRange: z.enum(['24h', '7d', '30d', 'all']).default('30d'),
        }))
        .query(async ({ input }) => {
          const now = Date.now();
          const rangeMs: Record<string, number | null> = {
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            'all': null,
          };
          const ms = rangeMs[input.timeRange];
          const timeOptions = ms ? { startTime: now - ms, endTime: now } : undefined;
          const clients = await listOmadaClients(input.omadaSiteId, timeOptions);
          return clients
            .map((c) => ({
              mac: c.mac,
              name: c.name ?? c.hostName ?? c.mac,
              ip: c.ip,
              trafficDown: (c as typeof c & { trafficDown?: number }).trafficDown ?? 0,
              trafficUp: (c as typeof c & { trafficUp?: number }).trafficUp ?? 0,
              totalTraffic: ((c as typeof c & { trafficDown?: number }).trafficDown ?? 0) +
                            ((c as typeof c & { trafficUp?: number }).trafficUp ?? 0),
              connectDevType: c.connectDevType,
              uptime: c.uptime,
            }))
            .sort((a, b) => b.totalTraffic - a.totalTraffic)
            .slice(0, input.limit);
        }),

      /** List all Omada sites with their current customer link */
      listAllSites: protectedProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return db.select({
          omadaSiteId: omadaSites.omadaSiteId,
          omadaSiteName: omadaSites.omadaSiteName,
          customerExternalId: omadaSites.customerExternalId,
          matchType: omadaSites.matchType,
          wanIp: omadaSites.wanIp,
          wanStatus: omadaSites.wanStatus,
          deviceCount: omadaSites.deviceCount,
          clientCount: omadaSites.clientCount,
          lastSyncedAt: omadaSites.lastSyncedAt,
        }).from(omadaSites).orderBy(omadaSites.omadaSiteName);
      }),

      /** Unlink an Omada site from its customer */
      unlinkSite: protectedProcedure
        .input(z.object({ omadaSiteId: z.string() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error('Database unavailable');
          await db.update(omadaSites)
            .set({ customerExternalId: null, matchType: 'unmatched', matchConfidence: null, updatedAt: new Date() })
            .where(eq(omadaSites.omadaSiteId, input.omadaSiteId));
          return { success: true };
        }),

      /** List unmatched Omada sites */
      listUnmatchedSites: protectedProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(omadaSites)
          .where(eq(omadaSites.matchType, 'unmatched'))
          .orderBy(omadaSites.omadaSiteName);
      }),
    }),

    // Customer merge
    merge: router({
      search: protectedProcedure
        .input(z.object({ search: z.string() }))
        .query(async ({ input }) => {
          return await getCustomersForMerge(input.search);
        }),

      execute: protectedProcedure
        .input(z.object({
          primaryExternalId: z.string(),
          secondaryExternalId: z.string(),
        }))
        .mutation(async ({ input }) => {
          return await mergeCustomers(input.primaryExternalId, input.secondaryExternalId);
        }),
    }),
  }),

  rateCards: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      return await db!.select().from(supplierRateCards).orderBy(desc(supplierRateCards.effectiveDate));
    }),

    getItems: protectedProcedure
      .input(z.object({
        rateCardId: z.number(),
        category: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        const rows = await db!.select().from(supplierRateCardItems)
          .where(eq(supplierRateCardItems.rateCardId, input.rateCardId))
          .orderBy(supplierRateCardItems.category, supplierRateCardItems.priceExGst);
        if (input.category) {
          return rows.filter((r: typeof rows[0]) => r.category === input.category);
        }
        return rows;
      }),

     getCategories: protectedProcedure
      .input(z.object({ rateCardId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const rows = await db!.select({
          category: supplierRateCardItems.category,
          categoryLabel: supplierRateCardItems.categoryLabel,
        }).from(supplierRateCardItems)
          .where(eq(supplierRateCardItems.rateCardId, input.rateCardId));
        // Deduplicate
        const seen = new Set<string>();
        return rows.filter((r: typeof rows[0]) => {
          if (seen.has(r.category)) return false;
          seen.add(r.category);
          return true;
        });
      }),
  }),

  // ── SasBoss Pricebook ──────────────────────────────────────────────────────
  pricebook: router({
    /** List all pricebook versions, newest first */
    listVersions: protectedProcedure.query(async () => {
      const db = await getDb();
      const rows = await db!.execute(
        sql`SELECT id, version_label, effective_date, imported_at, source_filename, notes, is_active
            FROM sasboss_pricebook_versions ORDER BY effective_date DESC`
      );
      return (rows as any[])[0] as Array<{
        id: number;
        version_label: string;
        effective_date: string;
        imported_at: string;
        source_filename: string | null;
        notes: string | null;
        is_active: number;
      }>;
    }),

    /** Get all items for a specific version, grouped by sheet */
    getItems: protectedProcedure
      .input(z.object({
        versionId: z.number(),
        sheet: z.string().optional(),
        search: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        let query = `SELECT id, product_id, sheet_name, product_filter, buy_name, product_name,
                            partner_buy_price, partner_sell_price, partner_margin,
                            nfr_partner_price, product_code, product_type,
                            api_buy_price, api_rrp, api_nfr_price,
                            api_buy_bundled, api_rrp_bundled,
                            api_buy_unlimited, api_rrp_unlimited, api_last_synced
                     FROM sasboss_pricebook_items
                     WHERE version_id = ${input.versionId}`;
        if (input.sheet) query += ` AND sheet_name = '${input.sheet.replace(/'/g, "''")}'`;
        if (input.search) {
          const s = input.search.replace(/'/g, "''");
          query += ` AND (product_name LIKE '%${s}%' OR buy_name LIKE '%${s}%')`;
        }
        query += ` ORDER BY sheet_name, product_name`;
        const rows = await db!.execute(sql.raw(query));
        return (rows as any[])[0] as Array<{
          id: number;
          product_id: number | null;
          sheet_name: string;
          product_filter: string | null;
          buy_name: string | null;
          product_name: string;
          partner_buy_price: string | null;
          partner_sell_price: string | null;
          partner_margin: string | null;
          nfr_partner_price: string | null;
          product_code: string | null;
          product_type: string | null;
          api_buy_price: string | null;
          api_rrp: string | null;
          api_nfr_price: string | null;
          api_buy_bundled: string | null;
          api_rrp_bundled: string | null;
          api_buy_unlimited: string | null;
          api_rrp_unlimited: string | null;
          api_last_synced: string | null;
          driftAmount: number | null;
          hasDrift: boolean;
        }>;
      }),

    /** Preview which SasBoss-billed services would be updated and by how much.
     *
     * Scope: services where billingPlatform LIKE '%SasBoss%'  OR  the service is
     * linked to a SasBoss supplier-workbook line item (provisioned elsewhere but
     * billed through SasBoss — e.g. NBN billed in SasBoss, provisioned in Carbon).
     *
     * Matching: fuzzy normalisation strips parenthesised quantities, punctuation and
     * extra whitespace so billing names align with pricebook product names.
     *
     * Disambiguation: when a product name appears in both DID Hosting and Porting
     * sheets, the workbook productType='did-number' selects DID Hosting (recurring
     * monthly cost); otherwise the UCaaS / Managed Voice sheet is preferred.
     */
    previewCostSync: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const vid = input.versionId;

        // ── 1. Collect all SasBoss-billed services ──────────────────────────────
        // A service is SasBoss-billed if:
        //   (a) its billingPlatform column contains 'SasBoss', OR
        //   (b) it has been matched to a SasBoss workbook line item
        const rows = await db!.execute(sql.raw(`
          SELECT
            s.id,
            s.externalId,
            s.planName,
            s.monthlyCost,
            s.monthlyRevenue,
            s.billingPlatform,
            c.name AS customerName,
            -- workbook productType for the most recent SasBoss line item for this service
            (
              SELECT li.productType
              FROM supplier_workbook_line_items li
              JOIN supplier_workbook_uploads wu ON wu.id = li.uploadId
              WHERE wu.supplier = 'SasBoss'
                AND li.matchedServiceExternalId = s.externalId
              ORDER BY wu.importedAt DESC
              LIMIT 1
            ) AS wbProductType,
            -- billing name from the most recent SasBoss workbook line item (may differ from planName)
            (
              SELECT li.productName
              FROM supplier_workbook_line_items li
              JOIN supplier_workbook_uploads wu ON wu.id = li.uploadId
              WHERE wu.supplier = 'SasBoss'
                AND li.matchedServiceExternalId = s.externalId
                AND li.productName NOT IN ('(blank)', '')
              ORDER BY wu.importedAt DESC
              LIMIT 1
            ) AS wbBillingName
          FROM services s
          LEFT JOIN customers c ON s.customerExternalId = c.externalId
          WHERE
            s.status != 'terminated'
            AND (
              IFNULL(s.billingPlatform,'') LIKE '%SasBoss%'
              OR IFNULL(s.billingPlatform,'') LIKE '%sasboss%'
              OR EXISTS (
                SELECT 1
                FROM supplier_workbook_line_items li2
                JOIN supplier_workbook_uploads wu2 ON wu2.id = li2.uploadId
                WHERE wu2.supplier = 'SasBoss'
                  AND li2.matchedServiceExternalId = s.externalId
              )
            )
        `));

        const services = (rows as any[])[0] as Array<{
          id: number;
          externalId: string;
          planName: string | null;
          monthlyCost: string | null;
          monthlyRevenue: string | null;
          billingPlatform: string | null;
          customerName: string | null;
          wbProductType: string | null;
          wbBillingName: string | null;
        }>;

        // ── 2. Load all pricebook items for this version ─────────────────────────
        const pbRows = await db!.execute(sql.raw(`
          SELECT id, product_name, sheet_name, partner_buy_price, partner_sell_price
          FROM sasboss_pricebook_items
          WHERE version_id = ${vid}
        `));
        const pricebook = (pbRows as any[])[0] as Array<{
          id: number;
          product_name: string;
          sheet_name: string;
          partner_buy_price: string | null;
          partner_sell_price: string | null;
        }>;

        // ── 3. Fuzzy matching helpers ─────────────────────────────────────────────
        // Normalise: lowercase, strip parenthesised numbers, collapse whitespace/punctuation
        function normalise(s: string): string {
          return s
            .toLowerCase()
            .replace(/\(\d+\)/g, '')          // strip (1), (10), (100) etc.
            .replace(/[^a-z0-9 ]/g, ' ')      // punctuation → space
            .replace(/\s+/g, ' ')
            .trim();
        }

        // Token-overlap similarity score (Jaccard on word sets)
        function similarity(a: string, b: string): number {
          const setA = new Set(normalise(a).split(' ').filter(Boolean));
          const setB = new Set(normalise(b).split(' ').filter(Boolean));
          if (setA.size === 0 || setB.size === 0) return 0;
          let inter = 0;
          setA.forEach(t => { if (setB.has(t)) inter++; });
          return inter / (setA.size + setB.size - inter);
        }

        // Sheet priority for disambiguation:
        //   did-number workbook type → prefer DID Hosting sheet
        //   everything else → prefer UCaaS or Managed Voice (not Porting)
        function sheetPriority(sheet: string, wbType: string | null): number {
          const s = sheet.toLowerCase();
          if (wbType === 'did-number') {
            if (s.includes('did hosting')) return 3;
            if (s.includes('porting'))    return 1;  // deprioritise porting for hosting
            return 2;
          }
          // For service-pack / call-pack / unknown: avoid porting sheet
          if (s.includes('porting'))    return 1;
          if (s.includes('did hosting')) return 2;
          return 3;
        }

        // ── 4. Match each service to the best pricebook entry ────────────────────
        const FUZZY_THRESHOLD = 0.5;
        const results: Array<{
          id: number;
          externalId: string;
          planName: string | null;
          monthlyCost: string | null;
          monthlyRevenue: string | null;
          billingPlatform: string | null;
          customerName: string | null;
          pricebookName: string;
          pricebookCost: string | null;
          pricebookRrp: string | null;
          pricebookSheet: string;
          matchScore: number;
          matchType: 'exact' | 'fuzzy';
          billingName: string | null;
        }> = [];

        for (const svc of services) {
          // Prefer the workbook billing name; fall back to planName
          const billingName = svc.wbBillingName || svc.planName || '';
          if (!billingName) continue;

          let bestScore = -1;
          let bestEntry: typeof pricebook[0] | null = null;

          for (const pb of pricebook) {
            // Exact match (case-insensitive)
            const exact = normalise(billingName) === normalise(pb.product_name);
            const score = exact ? 1.0 : similarity(billingName, pb.product_name);
            if (score < FUZZY_THRESHOLD) continue;

            // Prefer by sheet priority, then by score
            const priority = sheetPriority(pb.sheet_name, svc.wbProductType);
            const combined = score * 10 + priority; // priority as tiebreaker

            if (combined > bestScore) {
              bestScore = combined;
              bestEntry = pb;
            }
          }

          if (!bestEntry) continue;

          const newCost = bestEntry.partner_buy_price !== null ? parseFloat(bestEntry.partner_buy_price) : null;
          const oldCost = svc.monthlyCost !== null ? parseFloat(svc.monthlyCost) : null;

          // Only include if cost actually differs
          if (newCost === null) continue;
          if (oldCost !== null && Math.abs(oldCost - newCost) < 0.005) continue;

          const rawScore = bestScore - sheetPriority(bestEntry.sheet_name, svc.wbProductType);
          results.push({
            id: svc.id,
            externalId: svc.externalId,
            planName: svc.planName,
            monthlyCost: svc.monthlyCost,
            monthlyRevenue: svc.monthlyRevenue,
            billingPlatform: svc.billingPlatform,
            customerName: svc.customerName,
            pricebookName: bestEntry.product_name,
            pricebookCost: bestEntry.partner_buy_price,
            pricebookRrp: bestEntry.partner_sell_price,
            pricebookSheet: bestEntry.sheet_name,
            matchScore: Math.round(rawScore * 100) / 100,
            matchType: rawScore >= 1.0 ? 'exact' : 'fuzzy',
            billingName: billingName !== svc.planName ? billingName : null,
          });
        }

        results.sort((a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? ''));
        return results;
      }),

    /** Apply pricebook costs to all matching SasBoss-billed services.
     * Scoped by billing origin (billingPlatform = SasBoss OR linked workbook item).
     * Uses the same fuzzy billing-name matching as previewCostSync.
     * Bundle-matched services use bundled_buy price; standalone services use partner_buy_price.
     */
    applyCostSync: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const user = ctx.user?.name || ctx.user?.email || 'system';
        const vid = input.versionId;

        // Re-run the same matching logic as preview
        const rows = await db!.execute(sql.raw(`
          SELECT
            s.id,
            s.externalId,
            s.planName,
            s.monthlyCost,
            s.billingPlatform,
            (
              SELECT li.productType
              FROM supplier_workbook_line_items li
              JOIN supplier_workbook_uploads wu ON wu.id = li.uploadId
              WHERE wu.supplier = 'SasBoss'
                AND li.matchedServiceExternalId = s.externalId
              ORDER BY wu.importedAt DESC
              LIMIT 1
            ) AS wbProductType,
            (
              SELECT li.productName
              FROM supplier_workbook_line_items li
              JOIN supplier_workbook_uploads wu ON wu.id = li.uploadId
              WHERE wu.supplier = 'SasBoss'
                AND li.matchedServiceExternalId = s.externalId
                AND li.productName NOT IN ('(blank)', '')
              ORDER BY wu.importedAt DESC
              LIMIT 1
            ) AS wbBillingName
          FROM services s
          WHERE
            s.status != 'terminated'
            AND (
              IFNULL(s.billingPlatform,'') LIKE '%SasBoss%'
              OR IFNULL(s.billingPlatform,'') LIKE '%sasboss%'
              OR EXISTS (
                SELECT 1
                FROM supplier_workbook_line_items li2
                JOIN supplier_workbook_uploads wu2 ON wu2.id = li2.uploadId
                WHERE wu2.supplier = 'SasBoss'
                  AND li2.matchedServiceExternalId = s.externalId
              )
            )
        `));
        const services = (rows as any[])[0] as Array<{
          id: number;
          externalId: string;
          planName: string | null;
          monthlyCost: string | null;
          billingPlatform: string | null;
          wbProductType: string | null;
          wbBillingName: string | null;
        }>;

        // Load pricebook items with bundled_buy prices
        const pbRows = await db!.execute(sql.raw(`
          SELECT id, product_name, sheet_name, partner_buy_price, bundled_buy
          FROM sasboss_pricebook_items WHERE version_id = ${vid}
        `));
        const pricebook = (pbRows as any[])[0] as Array<{
          id: number;
          product_name: string;
          sheet_name: string;
          partner_buy_price: string | null;
          bundled_buy: string | null;
        }>;

        // Load active bundle definitions to check if a service is bundle-priced
        const bundleDefRows = await db!.execute(sql.raw(`
          SELECT
            b.id, b.bundle_name, b.billing_name,
            COALESCE(
              b.combined_buy_price,
              SUM(
                CASE
                  WHEN c.override_buy_price IS NOT NULL THEN c.override_buy_price * c.quantity
                  WHEN c.uses_bundled_price = 1 AND pi.bundled_buy IS NOT NULL THEN pi.bundled_buy * c.quantity
                  WHEN pi.partner_buy_price IS NOT NULL THEN pi.partner_buy_price * c.quantity
                  ELSE 0
                END
              )
            ) AS effective_buy_price
          FROM sasboss_bundle_definitions b
          LEFT JOIN sasboss_bundle_components c ON c.bundle_id = b.id
          LEFT JOIN sasboss_pricebook_items pi ON pi.id = c.pricebook_item_id AND pi.version_id = ${vid}
          WHERE b.is_active = 1
          GROUP BY b.id
        `));
        const bundleDefs = (bundleDefRows as any[])[0] as Array<{
          id: number; bundle_name: string; billing_name: string | null; effective_buy_price: string | null;
        }>;

        function normalise(s: string): string {
          return s.toLowerCase().replace(/\(\d+\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        }
        function similarity(a: string, b: string): number {
          const setA = new Set(normalise(a).split(' ').filter(Boolean));
          const setB = new Set(normalise(b).split(' ').filter(Boolean));
          if (!setA.size || !setB.size) return 0;
          let inter = 0;
          setA.forEach(t => { if (setB.has(t)) inter++; });
          return inter / (setA.size + setB.size - inter);
        }
        function sheetPriority(sheet: string, wbType: string | null): number {
          const s = sheet.toLowerCase();
          if (wbType === 'did-number') {
            if (s.includes('did hosting')) return 3;
            if (s.includes('porting'))    return 1;
            return 2;
          }
          if (s.includes('porting'))    return 1;
          if (s.includes('did hosting')) return 2;
          return 3;
        }

        const FUZZY_THRESHOLD = 0.5;
        let updated = 0;
        const log: Array<{ externalId: string; planName: string | null; billingName: string | null; oldCost: number | null; newCost: number; matchType: string; pricebookName: string }> = [];

        for (const svc of services) {
          const billingName = svc.wbBillingName || svc.planName || '';
          if (!billingName) continue;

          // ── Step A: Check if this service matches a bundle definition (higher threshold = 0.7) ──
          let bundleMatch: typeof bundleDefs[0] | null = null;
          let bundleScore = -1;
          for (const b of bundleDefs) {
            const matchName = b.billing_name || b.bundle_name;
            const exact = normalise(billingName) === normalise(matchName);
            const score = exact ? 1.0 : similarity(billingName, matchName);
            if (score < 0.7) continue;
            if (score > bundleScore) { bundleScore = score; bundleMatch = b; }
          }

          let newCost: number;
          let pricebookName: string;
          let matchType: string;

          if (bundleMatch && bundleMatch.effective_buy_price !== null) {
            // Use bundle combined buy price
            newCost = parseFloat(bundleMatch.effective_buy_price);
            pricebookName = bundleMatch.bundle_name + ' [bundle]';
            matchType = bundleScore >= 1.0 ? 'exact-bundle' : 'fuzzy-bundle';
          } else {
            // ── Step B: Fall back to individual pricebook matching ──
            let bestScore = -1;
            let bestEntry: typeof pricebook[0] | null = null;

            for (const pb of pricebook) {
              const exact = normalise(billingName) === normalise(pb.product_name);
              const score = exact ? 1.0 : similarity(billingName, pb.product_name);
              if (score < FUZZY_THRESHOLD) continue;
              const combined = score * 10 + sheetPriority(pb.sheet_name, svc.wbProductType);
              if (combined > bestScore) { bestScore = combined; bestEntry = pb; }
            }

            if (!bestEntry || bestEntry.partner_buy_price === null) continue;
            newCost = parseFloat(bestEntry.partner_buy_price);
            pricebookName = bestEntry.product_name;
            const rawScore = bestScore - sheetPriority(bestEntry.sheet_name, svc.wbProductType);
            matchType = rawScore >= 1.0 ? 'exact' : 'fuzzy';
          }
          const oldCost = svc.monthlyCost !== null ? parseFloat(svc.monthlyCost) : null;
          if (oldCost !== null && Math.abs(oldCost - newCost) < 0.005) continue;

          await db!.execute(sql.raw(
            `UPDATE services
             SET monthlyCost = ${newCost},
                 costSource = 'sasboss_pricebook',
                 updatedAt = NOW()
             WHERE id = ${svc.id}`
          ));

          log.push({
            externalId: svc.externalId,
            planName: svc.planName,
            billingName: svc.wbBillingName !== svc.planName ? svc.wbBillingName : null,
            oldCost,
            newCost,
            matchType,
            pricebookName,
          });
          updated++;
        }

        return {
          updated,
          versionId: input.versionId,
          appliedBy: user,
          appliedAt: new Date().toISOString(),
          log,
        };
      }),

    /** List all bundle definitions with their components */
    listBundles: protectedProcedure.query(async () => {
      const db = await getDb();
      const rows = await db!.execute(sql.raw(`
        SELECT
          b.id,
          b.bundle_name,
          b.bundle_type,
          b.description,
          b.combined_buy_price,
          b.partner_rrp,
          b.billing_name,
          b.is_active,
          b.notes,
          b.created_at,
          b.updated_at,
          COUNT(c.id) AS component_count,
          -- Compute auto combined_buy from bundled_buy prices of components
          SUM(
            CASE
              WHEN c.override_buy_price IS NOT NULL THEN c.override_buy_price * c.quantity
              WHEN c.uses_bundled_price = 1 AND pi.bundled_buy IS NOT NULL THEN pi.bundled_buy * c.quantity
              WHEN pi.partner_buy_price IS NOT NULL THEN pi.partner_buy_price * c.quantity
              ELSE 0
            END
          ) AS auto_combined_buy
        FROM sasboss_bundle_definitions b
        LEFT JOIN sasboss_bundle_components c ON c.bundle_id = b.id
        LEFT JOIN sasboss_pricebook_items pi ON pi.id = c.pricebook_item_id
        GROUP BY b.id
        ORDER BY b.bundle_type, b.bundle_name
      `));
      return (rows as any[])[0] as Array<{
        id: number;
        bundle_name: string;
        bundle_type: string;
        description: string | null;
        combined_buy_price: string | null;
        partner_rrp: string | null;
        billing_name: string | null;
        is_active: number;
        notes: string | null;
        created_at: string;
        updated_at: string;
        component_count: number;
        auto_combined_buy: string | null;
      }>;
    }),

    /** Get a single bundle with all its components */
    getBundleDetail: protectedProcedure
      .input(z.object({ bundleId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [bundleRows, compRows] = await Promise.all([
          db!.execute(sql.raw(`SELECT * FROM sasboss_bundle_definitions WHERE id = ${input.bundleId} LIMIT 1`)),
          db!.execute(sql.raw(`
            SELECT
              c.*,
              pi.product_name AS pb_product_name,
              pi.sheet_name AS pb_sheet_name,
              pi.partner_buy_price AS pb_standalone_buy,
              pi.bundled_buy AS pb_bundled_buy,
              pi.partner_sell_price AS pb_standalone_sell,
              pi.bundled_sell AS pb_bundled_sell
            FROM sasboss_bundle_components c
            LEFT JOIN sasboss_pricebook_items pi ON pi.id = c.pricebook_item_id
            WHERE c.bundle_id = ${input.bundleId}
            ORDER BY c.id
          `)),
        ]);
        const bundle = ((bundleRows as any[])[0] as any[])[0] ?? null;
        const components = (compRows as any[])[0] as any[];
        return { bundle, components };
      }),

    /** Create a new bundle definition */
    createBundle: protectedProcedure
      .input(z.object({
        bundleName: z.string().min(1),
        bundleType: z.enum(['access4_formal', 'custom_smiletel']),
        description: z.string().optional(),
        combinedBuyPrice: z.number().optional(),
        partnerRrp: z.number().optional(),
        billingName: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const result = await db!.execute(sql.raw(`
          INSERT INTO sasboss_bundle_definitions
            (bundle_name, bundle_type, description, combined_buy_price, partner_rrp, billing_name, notes)
          VALUES (
            ${JSON.stringify(input.bundleName)},
            ${JSON.stringify(input.bundleType)},
            ${input.description ? JSON.stringify(input.description) : 'NULL'},
            ${input.combinedBuyPrice !== undefined ? input.combinedBuyPrice : 'NULL'},
            ${input.partnerRrp !== undefined ? input.partnerRrp : 'NULL'},
            ${input.billingName ? JSON.stringify(input.billingName) : 'NULL'},
            ${input.notes ? JSON.stringify(input.notes) : 'NULL'}
          )
        `));
        return { id: (result as any[])[0]?.insertId };
      }),

    /** Update a bundle definition */
    updateBundle: protectedProcedure
      .input(z.object({
        bundleId: z.number(),
        combinedBuyPrice: z.number().nullable().optional(),
        partnerRrp: z.number().nullable().optional(),
        billingName: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const parts: string[] = [];
        if (input.combinedBuyPrice !== undefined) parts.push(`combined_buy_price = ${input.combinedBuyPrice ?? 'NULL'}`);
        if (input.partnerRrp !== undefined) parts.push(`partner_rrp = ${input.partnerRrp ?? 'NULL'}`);
        if (input.billingName !== undefined) parts.push(`billing_name = ${input.billingName ? JSON.stringify(input.billingName) : 'NULL'}`);
        if (input.description !== undefined) parts.push(`description = ${input.description ? JSON.stringify(input.description) : 'NULL'}`);
        if (input.notes !== undefined) parts.push(`notes = ${input.notes ? JSON.stringify(input.notes) : 'NULL'}`);
        if (input.isActive !== undefined) parts.push(`is_active = ${input.isActive ? 1 : 0}`);
        if (!parts.length) return { updated: 0 };
        await db!.execute(sql.raw(`UPDATE sasboss_bundle_definitions SET ${parts.join(', ')}, updated_at = NOW() WHERE id = ${input.bundleId}`));
        return { updated: 1 };
      }),

    /** Add a component to a bundle */
    addBundleComponent: protectedProcedure
      .input(z.object({
        bundleId: z.number(),
        componentName: z.string().min(1),
        pricebookItemId: z.number().nullable().optional(),
        usesBundledPrice: z.boolean().default(true),
        overrideBuyPrice: z.number().nullable().optional(),
        quantity: z.number().min(1).default(1),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db!.execute(sql.raw(`
          INSERT INTO sasboss_bundle_components
            (bundle_id, pricebook_item_id, component_name, uses_bundled_price, override_buy_price, quantity, notes)
          VALUES (
            ${input.bundleId},
            ${input.pricebookItemId ?? 'NULL'},
            ${JSON.stringify(input.componentName)},
            ${input.usesBundledPrice ? 1 : 0},
            ${input.overrideBuyPrice !== undefined && input.overrideBuyPrice !== null ? input.overrideBuyPrice : 'NULL'},
            ${input.quantity},
            ${input.notes ? JSON.stringify(input.notes) : 'NULL'}
          )
        `));
        return { success: true };
      }),

    /** Remove a component from a bundle */
    removeBundleComponent: protectedProcedure
      .input(z.object({ componentId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db!.execute(sql.raw(`DELETE FROM sasboss_bundle_components WHERE id = ${input.componentId}`));
        return { success: true };
      }),

    /** Preview which services would have their costs updated using bundle pricing */
    previewBundleCostSync: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const vid = input.versionId;

        // Load active bundles with their computed combined buy price
        const bundleRows = await db!.execute(sql.raw(`
          SELECT
            b.id, b.bundle_name, b.billing_name,
            COALESCE(
              b.combined_buy_price,
              SUM(
                CASE
                  WHEN c.override_buy_price IS NOT NULL THEN c.override_buy_price * c.quantity
                  WHEN c.uses_bundled_price = 1 AND pi.bundled_buy IS NOT NULL THEN pi.bundled_buy * c.quantity
                  WHEN pi.partner_buy_price IS NOT NULL THEN pi.partner_buy_price * c.quantity
                  ELSE 0
                END
              )
            ) AS effective_buy_price
          FROM sasboss_bundle_definitions b
          LEFT JOIN sasboss_bundle_components c ON c.bundle_id = b.id
          LEFT JOIN sasboss_pricebook_items pi ON pi.id = c.pricebook_item_id
            AND pi.version_id = ${vid}
          WHERE b.is_active = 1
          GROUP BY b.id
        `));
        const bundles = (bundleRows as any[])[0] as Array<{
          id: number;
          bundle_name: string;
          billing_name: string | null;
          effective_buy_price: string | null;
        }>;

        // Load SasBoss services
        const svcRows = await db!.execute(sql.raw(`
          SELECT s.id, s.externalId, s.planName, s.monthlyCost, s.billingPlatform, s.costSource,
            (SELECT c.name FROM customers c WHERE c.externalId = s.customerExternalId LIMIT 1) AS customerName,
            (SELECT li.productName FROM supplier_workbook_line_items li
             JOIN supplier_workbook_uploads wu ON wu.id = li.uploadId
             WHERE wu.supplier = 'SasBoss' AND li.matchedServiceExternalId = s.externalId
               AND li.productName NOT IN ('(blank)','')
             ORDER BY wu.importedAt DESC LIMIT 1) AS wbBillingName
          FROM services s
          WHERE s.status != 'terminated'
            AND (
              IFNULL(s.billingPlatform,'') LIKE '%SasBoss%'
              OR IFNULL(s.billingPlatform,'') LIKE '%sasboss%'
              OR EXISTS (
                SELECT 1 FROM supplier_workbook_line_items li2
                JOIN supplier_workbook_uploads wu2 ON wu2.id = li2.uploadId
                WHERE wu2.supplier = 'SasBoss' AND li2.matchedServiceExternalId = s.externalId
              )
            )
        `));
        const svcs = (svcRows as any[])[0] as Array<{
          id: number; externalId: string; planName: string | null;
          monthlyCost: string | null; billingPlatform: string | null;
          costSource: string | null; customerName: string | null;
          wbBillingName: string | null;
        }>;

        function normalise(s: string): string {
          return s.toLowerCase().replace(/\(\d+\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        }
        function similarity(a: string, b: string): number {
          const setA = new Set(normalise(a).split(' ').filter(Boolean));
          const setB = new Set(normalise(b).split(' ').filter(Boolean));
          if (!setA.size || !setB.size) return 0;
          let inter = 0;
          setA.forEach(t => { if (setB.has(t)) inter++; });
          return inter / (setA.size + setB.size - inter);
        }

        const results: Array<{
          externalId: string; planName: string | null; customerName: string | null;
          billingName: string | null; oldCost: number | null; newCost: number;
          bundleName: string; matchType: 'exact' | 'fuzzy'; matchScore: number;
        }> = [];

        for (const svc of svcs) {
          const billingName = svc.wbBillingName || svc.planName || '';
          if (!billingName) continue;

          let bestBundle: typeof bundles[0] | null = null;
          let bestScore = -1;

          for (const b of bundles) {
            const matchName = b.billing_name || b.bundle_name;
            const exact = normalise(billingName) === normalise(matchName);
            const score = exact ? 1.0 : similarity(billingName, matchName);
            if (score < 0.7) continue; // higher threshold for bundles
            if (score > bestScore) { bestScore = score; bestBundle = b; }
          }

          if (!bestBundle || bestBundle.effective_buy_price === null) continue;
          const newCost = parseFloat(bestBundle.effective_buy_price);
          const oldCost = svc.monthlyCost !== null ? parseFloat(svc.monthlyCost) : null;
          if (oldCost !== null && Math.abs(oldCost - newCost) < 0.005) continue;

          results.push({
            externalId: svc.externalId,
            planName: svc.planName,
            customerName: svc.customerName,
            billingName: svc.wbBillingName !== svc.planName ? svc.wbBillingName : null,
            oldCost,
            newCost,
            bundleName: bestBundle.bundle_name,
            matchType: bestScore >= 1.0 ? 'exact' : 'fuzzy',
            matchScore: Math.round(bestScore * 100) / 100,
          });
        }

        results.sort((a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? ''));
        return results;
      }),

    /** Summary stats for the active pricebook version */
    activeSummary: protectedProcedure.query(async () => {
      const db = await getDb();
      const rows = await db!.execute(sql`
        SELECT
          v.id, v.version_label, v.effective_date, v.imported_at, v.source_filename,
          COUNT(i.id) AS total_items,
          SUM(CASE WHEN i.sheet_name IN ('Managed Voice','Managed Voice - DID Hosting','Managed Voice - Porting') THEN 1 ELSE 0 END) AS voice_items,
          SUM(CASE WHEN i.sheet_name = 'UCaaS' THEN 1 ELSE 0 END) AS ucaas_items,
          SUM(CASE WHEN i.sheet_name = 'Phone Hardware' THEN 1 ELSE 0 END) AS hardware_items
        FROM sasboss_pricebook_versions v
        LEFT JOIN sasboss_pricebook_items i ON i.version_id = v.id
        WHERE v.is_active = 1
        GROUP BY v.id
        LIMIT 1
      `);
      return ((rows as any[])[0]?.[0] ?? null) as {
        id: number;
        version_label: string;
        effective_date: string;
        imported_at: string;
        source_filename: string | null;
        total_items: number;
        voice_items: number;
        ucaas_items: number;
        hardware_items: number;
      } | null;
    }),
  }),
  // ── SasBoss Live API ──────────────────────────────────────────────────────────────────────
  sasbossApi: router({
    /**
     * Returns the outbound IP address this server uses for external requests.
     * Useful for confirming which IP needs to be whitelisted by Access4/SasBoss.
     */
    getOutboundIp: publicProcedure.query(async () => {
      try {
        const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) });
        const data = await res.json() as { ip: string };
        return { ip: data.ip, ok: true };
      } catch (e) {
        return { ip: 'unknown', ok: false, error: String(e) };
      }
    }),
    /**
     * Test the SasBoss live API connection by fetching an auth token.
     * Returns { apiUser, roleType, ok: true } on success.
     */
    testConnection: protectedProcedure.mutation(async () => {
      const result = await fetchSasBossToken();
      return { ok: true, apiUser: result.apiUser, roleType: result.roleType };
    }),
    /**
     * Run a full SasBoss API sync: enterprises, service accounts, DID numbers,
     * products, and invoices. Returns counts and any errors.
     */
    syncAll: protectedProcedure.mutation(async () => {
      const result = await syncAllSasBossData();
      return {
        ok: result.errors.length === 0,
        enterpriseCount: result.enterprises.length,
        serviceAccountCount: result.serviceAccounts.length,
        didNumberCount: result.didNumbers.length,
        productCount: result.products.length,
        invoiceCount: result.invoices.length,
        errors: result.errors,
      };
    }),

    /**
     * Sync live API prices into sasboss_pricebook_items.
     * Fetches all 4 product types, matches by productName, upserts api_* columns.
     */
    syncPrices: protectedProcedure.mutation(async () => {
      const db = await getDb();
      const errors: string[] = [];

      // Helper: extract full error detail including network cause code
      const errDetail = (e: unknown): string => {
        if (!(e instanceof Error)) return String(e);
        const cause = (e as any).cause;
        const code: string = cause?.code ?? (e as any).code ?? '';
        const causeMsg: string = cause?.message ?? '';
        if (code) return `${e.message} [${code}${causeMsg ? ': ' + causeMsg : ''}]`;
        return e.message;
      };

      // Step 1: verify token fetch before attempting product fetches
      try {
        await fetchSasBossToken();
      } catch (e) {
        throw new Error(`SasBoss token fetch failed — check IP whitelist or credentials: ${errDetail(e)}`);
      }

      const [servicePacks, callPacks, didNums, devices] = await Promise.all([
        fetchProducts('service-pack', 'active').catch(e => { errors.push(`service-pack: ${errDetail(e)}`); return []; }),
        fetchProducts('call-pack', 'active').catch(e => { errors.push(`call-pack: ${errDetail(e)}`); return []; }),
        fetchProducts('did-number', 'active').catch(e => { errors.push(`did-number: ${errDetail(e)}`); return []; }),
        fetchProducts('device', 'active').catch(e => { errors.push(`device: ${errDetail(e)}`); return []; }),
      ]);
      const allProducts = [...servicePacks, ...callPacks, ...didNums, ...devices];
      if (allProducts.length === 0 && errors.length > 0) throw new Error(`API fetch failed: ${errors.join('; ')}`);
      void errDetail; // used above

      // Load all items from active pricebook version
      const pbRows = await db!.execute(
        sql`SELECT id, product_name, buy_name FROM sasboss_pricebook_items
            WHERE version_id = (SELECT id FROM sasboss_pricebook_versions WHERE is_active = 1 ORDER BY effective_date DESC LIMIT 1)`
      );
      const pbItems = (pbRows as any[])[0] as Array<{ id: number; product_name: string; buy_name: string | null }>;

      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const pbMap = new Map<string, number>();
      for (const item of pbItems) {
        pbMap.set(norm(item.product_name), item.id);
        if (item.buy_name) {
          const stripped = item.buy_name.replace(/\s*-\s*\d+\s*$/, '').trim();
          pbMap.set(norm(stripped), item.id);
        }
      }

      let matched = 0, unmatched = 0;
      const now = new Date();
      for (const p of allProducts) {
        const pbId = pbMap.get(norm(p.productName));
        if (!pbId) { unmatched++; continue; }
        await db!.execute(sql`
          UPDATE sasboss_pricebook_items SET
            api_product_id    = ${p.productId},
            api_buy_price     = ${p.chargeRecurringFee},
            api_rrp           = ${p.rrpRecurringFee},
            api_nfr_price     = ${p.nfrRecurringFee ?? null},
            api_buy_bundled   = ${p.chargeBundledRecurringFee ?? null},
            api_rrp_bundled   = ${p.rrpBundledRecurringFee ?? null},
            api_buy_unlimited = ${p.chargeUnlimitedRecurringFee ?? null},
            api_rrp_unlimited = ${p.rrpUnlimitedRecurringFee ?? null},
            api_item_type     = ${p.itemType},
            api_last_synced   = ${now}
          WHERE id = ${pbId}
        `);
        matched++;
      }
      return { ok: errors.length === 0, totalApiProducts: allProducts.length, matched, unmatched, errors };
    }),

    /**
     * Unified pricebook: pricebook items + live API prices + service aggregates.
     */
    getUnifiedPricebook: protectedProcedure
      .input(z.object({
        sheet: z.string().optional(),
        search: z.string().optional(),
        onlyDrift: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        let where = `pi.version_id = (SELECT id FROM sasboss_pricebook_versions WHERE is_active = 1 ORDER BY effective_date DESC LIMIT 1)`;
        if (input.sheet) where += ` AND pi.sheet_name = '${input.sheet.replace(/'/g, "''")}'`;
        if (input.search) {
          const s = input.search.replace(/'/g, "''");
          where += ` AND (pi.product_name LIKE '%${s}%' OR pi.buy_name LIKE '%${s}%')`;
        }
        if (input.onlyDrift) {
          where += ` AND pi.api_buy_price IS NOT NULL AND ABS(CAST(pi.partner_buy_price AS DECIMAL(10,6)) - pi.api_buy_price) > 0.005`;
        }
        const rows = await db!.execute(sql.raw(`
          SELECT
            pi.id, pi.sheet_name, pi.product_name, pi.buy_name, pi.product_type,
            pi.partner_buy_price, pi.partner_sell_price, pi.nfr_partner_price,
            pi.api_product_id, pi.api_buy_price, pi.api_rrp, pi.api_nfr_price,
            pi.api_buy_bundled, pi.api_rrp_bundled, pi.api_buy_unlimited, pi.api_rrp_unlimited,
            pi.api_item_type, pi.api_last_synced,
            COUNT(DISTINCT s.id) AS active_service_count,
            AVG(CASE WHEN s.monthlyRevenue > 0 THEN s.monthlyRevenue END) AS avg_sell_price,
            AVG(CASE WHEN s.monthlyCost > 0 THEN s.monthlyCost END) AS avg_cost,
            SUM(s.monthlyRevenue) AS total_monthly_revenue
          FROM sasboss_pricebook_items pi
          LEFT JOIN services s ON (
            s.billingPlatform LIKE '%SasBoss%'
            AND LOWER(REPLACE(REPLACE(s.planName,' ',''),'-',''))
                LIKE CONCAT('%',LOWER(REPLACE(REPLACE(pi.product_name,' ',''),'-','')), '%')
          )
          WHERE ${where}
          GROUP BY pi.id
          ORDER BY pi.sheet_name, pi.product_name
        `));
        const items = (rows as any[])[0] as any[];
        return items.map(item => {
          const pbBuy = parseFloat(item.partner_buy_price ?? '0') || 0;
          const apiBuy = item.api_buy_price != null ? parseFloat(item.api_buy_price) : null;
          const driftAmount = apiBuy != null ? apiBuy - pbBuy : null;
          const hasDrift = driftAmount != null && Math.abs(driftAmount) > 0.005;
          return { ...item, driftAmount, hasDrift };
        });
      }),

    /** Distinct sheet names from the active pricebook version. */
    getPricebookSheets: protectedProcedure.query(async () => {
      const db = await getDb();
      const rows = await db!.execute(
        sql`SELECT DISTINCT sheet_name FROM sasboss_pricebook_items
            WHERE version_id = (SELECT id FROM sasboss_pricebook_versions WHERE is_active = 1 ORDER BY effective_date DESC LIMIT 1)
            ORDER BY sheet_name`
      );
      return ((rows as any[])[0] as Array<{ sheet_name: string }>).map(r => r.sheet_name);
    }),
  }),
});
export type AppRouter = typeof appRouter;
