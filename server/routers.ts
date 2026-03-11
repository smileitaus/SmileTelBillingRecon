import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
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
        }))
        .mutation(async ({ input }) => {
          return await assignServiceToCustomer(
            input.serviceExternalId,
            input.customerExternalId,
            input.locationExternalId
          );
        }),

      dismiss: protectedProcedure
        .input(z.object({
          serviceExternalId: z.string(),
          customerExternalId: z.string(),
        }))
        .mutation(async ({ input }) => {
          return await dismissSuggestion(input.serviceExternalId, input.customerExternalId);
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
        }).optional())
        .query(async ({ input }) => {
          return await getServicesWithMargin(input);
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
        .mutation(async ({ input }) => {
          return await resolveReviewIssue(input.issueType, input.itemId, input.action, input.notes);
        }),

      submitForReview: protectedProcedure
        .input(z.object({
          targetType: z.enum(['service', 'customer', 'billing-item']),
          targetId: z.string(),
          targetName: z.string(),
          note: z.string().min(1, 'Note is required'),
        }))
        .mutation(async ({ input, ctx }) => {
          return await submitForReview({
            ...input,
            submittedBy: ctx.user?.name || ctx.user?.email || 'Unknown',
          });
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
