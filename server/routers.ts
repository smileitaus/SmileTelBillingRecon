import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { parsePdfInvoice } from "./pdfInvoiceParser";
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
} from "./db";

export const appRouter = router({
  system: systemRouter,
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
        }).optional())
        .query(async ({ input }) => {
          return await getAllCustomers(input?.search, input?.status, input?.platform, input?.supplier);
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
              input.notes
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
        }).optional())
        .query(async ({ input }) => {
          return await getServicesWithMargin(input);
        }),
      grouped: protectedProcedure
        .input(z.object({
          marginFilter: z.string().optional(),
          serviceType: z.string().optional(),
          provider: z.string().optional(),
          search: z.string().optional(),
        }).optional())
        .query(async ({ input }) => {
          return await getServicesGroupedByCustomer(input);
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
          return await importXeroContactAsCustomer(input.contactName);
        }),
      // Match all unmatched billing items for a Xero contact to an existing customer
      matchToCustomer: protectedProcedure
        .input(z.object({
          contactName: z.string(),
          customerExternalId: z.string(),
        }))
        .mutation(async ({ input }) => {
          return await matchXeroContactToCustomer(input.contactName, input.customerExternalId);
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
        // Auto-apply saved match rules to any newly created services
        await autoApplyMatchRules();
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
        // Auto-apply saved match rules to any newly created services
        await autoApplyMatchRules();
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

    // Carbon API cost sync
    syncCarbonCosts: protectedProcedure
      .mutation(async ({ ctx }) => {
        const syncedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
        const result = await syncCarbonCostsToServices(syncedBy);
        // Also backfill costSource for non-ABB services
        await backfillCostSources();
        return result;
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
        return await importSasBossDispatch(
          input.workbookName,
          input.billingMonth,
          input.invoiceReference,
          input.pivotRows as SasBossPivotRow[],
          input.callUsageRows as SasBossCallUsageRow[],
          importedBy
        );
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
        // Auto-apply saved match rules to any newly imported services
        await autoApplyMatchRules();
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
});

export type AppRouter = typeof appRouter;
