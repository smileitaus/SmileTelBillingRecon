import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { paymentPlans, paymentPlanInvoices } from "../../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

export const paymentPlansRouter = router({
  /**
   * List all payment plans with summary stats
   */
  listPlans: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const plans = await db!
      .select()
      .from(paymentPlans)
      .orderBy(desc(paymentPlans.createdAt));

    // Enrich each plan with invoice stats
    const enriched = await Promise.all(
      plans.map(async (plan) => {
        const [stats] = await db!
          .select({
            totalInvoices: sql<number>`COUNT(*)`,
            totalIncGst: sql<number>`SUM(amountIncGst)`,
            paidIncGst: sql<number>`SUM(CASE WHEN paymentStatus = 'paid' THEN amountIncGst ELSE 0 END)`,
            outstandingIncGst: sql<number>`SUM(CASE WHEN paymentStatus IN ('outstanding','promised') THEN amountIncGst ELSE 0 END)`,
            paidCount: sql<number>`SUM(CASE WHEN paymentStatus = 'paid' THEN 1 ELSE 0 END)`,
            outstandingCount: sql<number>`SUM(CASE WHEN paymentStatus IN ('outstanding','promised') THEN 1 ELSE 0 END)`,
          })
          .from(paymentPlanInvoices)
          .where(eq(paymentPlanInvoices.planId, plan.planId));

        return {
          ...plan,
          invoiceStats: stats,
        };
      })
    );

    return enriched;
  }),

  /**
   * Get a single payment plan with all its invoices
   */
  getPlan: protectedProcedure
    .input(z.object({ planId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [plan] = await db!
        .select()
        .from(paymentPlans)
        .where(eq(paymentPlans.planId, input.planId));

      if (!plan) throw new Error("Payment plan not found");

      const invoices = await db!
        .select()
        .from(paymentPlanInvoices)
        .where(eq(paymentPlanInvoices.planId, input.planId))
        .orderBy(desc(paymentPlanInvoices.invoiceDate));

      return { plan, invoices };
    }),

  /**
   * Update the payment status of a single invoice
   */
  updateInvoiceStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        paymentStatus: z.enum(["outstanding", "promised", "paid", "disputed", "waived"]),
        paidDate: z.string().optional(),
        promisedPaymentDate: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db!
        .update(paymentPlanInvoices)
        .set({
          paymentStatus: input.paymentStatus,
          paidDate: input.paidDate ? new Date(input.paidDate) : undefined,
          promisedPaymentDate: input.promisedPaymentDate
            ? new Date(input.promisedPaymentDate)
            : undefined,
        })
        .where(eq(paymentPlanInvoices.id, input.id));

      return { success: true };
    }),

  /**
   * Update plan status (active / completed / defaulted / cancelled)
   */
  updatePlanStatus: protectedProcedure
    .input(
      z.object({
        planId: z.string(),
        status: z.enum(["active", "completed", "defaulted", "cancelled"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db!
        .update(paymentPlans)
        .set({
          status: input.status,
          notes: input.notes,
        })
        .where(eq(paymentPlans.planId, input.planId));

      return { success: true };
    }),

  /**
   * Create a new payment plan
   */
  createPlan: protectedProcedure
    .input(
      z.object({
        planId: z.string(),
        customerExternalId: z.string(),
        customerName: z.string(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        totalOverdueIncGst: z.number(),
        totalOverdueExGst: z.number(),
        agreedTerms: z.string().optional(),
        sourceReference: z.string().optional(),
        notes: z.string().optional(),
        arrangementDate: z.string().optional(),
        targetClearDate: z.string().optional(),
        createdBy: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db!.insert(paymentPlans).values({
        planId: input.planId,
        customerExternalId: input.customerExternalId,
        customerName: input.customerName,
        contactName: input.contactName ?? "",
        contactEmail: input.contactEmail ?? "",
        contactPhone: input.contactPhone ?? "",
        totalOverdueIncGst: String(input.totalOverdueIncGst),
        totalOverdueExGst: String(input.totalOverdueExGst),
        agreedTerms: input.agreedTerms,
        sourceReference: input.sourceReference ?? "",
        notes: input.notes,
        arrangementDate: input.arrangementDate ? new Date(input.arrangementDate) : undefined,
        targetClearDate: input.targetClearDate ? new Date(input.targetClearDate) : undefined,
        createdBy: input.createdBy ?? ctx.user?.name ?? "",
      });
      return { success: true };
    }),
});
