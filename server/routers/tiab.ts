/**
 * TIAB / Octane (Inabox) tRPC Router
 *
 * Procedures:
 *  tiab.testConnection       — connectivity check (returns ok, message, customerCount)
 *  tiab.syncCustomers        — full customer sync from Octane → tiab_customers
 *  tiab.syncServices         — full service sync from Octane → tiab_services
 *  tiab.syncPlans            — full plan sync from Octane → tiab_plans
 *  tiab.syncTransactions     — transaction sync for a billing period
 *  tiab.syncAll              — run all syncs in sequence
 *  tiab.getSyncLog           — list recent sync runs
 *  tiab.getCustomers         — list tiab_customers with optional search/filter
 *  tiab.getServices          — list tiab_services with optional filter
 *  tiab.getServiceDetail     — get a single tiab_service with linked internal service
 *  tiab.getDataPool          — get live data pool for a service (live API call)
 *  tiab.updateDataLimit      — update data limit for a service (live API call)
 *  tiab.getEsimDetails       — get eSIM details for a service (live API call)
 *  tiab.manageEsim           — suspend/activate/reset/replace eSIM (live API call)
 *  tiab.getNotificationSettings — get notification settings for a customer (live API call)
 *  tiab.updateNotificationSettings — update notification settings (live API call)
 *  tiab.runReconciliation    — compare tiab_services vs internal services, create recon issues
 *  tiab.getReconIssues       — list open reconciliation issues
 *  tiab.resolveReconIssue    — mark a recon issue as resolved
 *  tiab.linkService          — manually link a tiab_service to an internal service
 *  tiab.linkCustomer         — manually link a tiab_customer to an internal customer
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  tiabCustomers,
  tiabServices,
  tiabPlans,
  tiabTransactions,
  tiabDataPools,
  tiabSyncLog,
  tiabReconIssues,
  tiabSupplierInvoices,
  tiabSupplierInvoiceLineItems,
  octaneCustomerLinks,
  services as internalServices,
  customers as internalCustomers,
} from "../../drizzle/schema";
import { eq, desc, and, or, like, sql, isNull } from "drizzle-orm";
import * as TiabAPI from "../suppliers/tiab";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function startSyncLog(
  db: Awaited<ReturnType<typeof getDb>>,
  syncType: string,
  triggeredBy: string
): Promise<number> {
  const result = await db!.insert(tiabSyncLog).values({
    syncType,
    status: "running",
    triggeredBy,
    startedAt: new Date(),
  });
  return (result as unknown as { insertId: number }).insertId;
}

async function completeSyncLog(
  db: Awaited<ReturnType<typeof getDb>>,
  logId: number,
  stats: {
    recordsFetched?: number;
    recordsCreated?: number;
    recordsUpdated?: number;
    recordsErrored?: number;
    errorMessage?: string;
    status?: string;
  },
  startTime: number
) {
  await db!
    .update(tiabSyncLog)
    .set({
      status: stats.errorMessage ? "failed" : (stats.status ?? "completed"),
      recordsFetched: stats.recordsFetched ?? 0,
      recordsCreated: stats.recordsCreated ?? 0,
      recordsUpdated: stats.recordsUpdated ?? 0,
      recordsErrored: stats.recordsErrored ?? 0,
      errorMessage: stats.errorMessage ?? null,
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
    })
    .where(eq(tiabSyncLog.id, logId));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const tiabRouter = router({
  // -------------------------------------------------------------------------
  // Connectivity
  // -------------------------------------------------------------------------
  testConnection: protectedProcedure.mutation(async () => {
    const result = await TiabAPI.testConnectivity();
    return result;
  }),

  // -------------------------------------------------------------------------
  // Sync — Customers
  // -------------------------------------------------------------------------
  syncCustomers: protectedProcedure
    .input(z.object({ triggeredBy: z.string().default("manual") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const startTime = Date.now();
      const logId = await startSyncLog(db, "customers", input.triggeredBy);
      const stats = { recordsFetched: 0, recordsCreated: 0, recordsUpdated: 0, recordsErrored: 0 };

      try {
        const customers = await TiabAPI.listCustomers();
        stats.recordsFetched = customers.length;

        for (const c of customers) {
          try {
            const existing = await db!
              .select({ id: tiabCustomers.id })
              .from(tiabCustomers)
              .where(eq(tiabCustomers.tiabCustomerId, c.customerId))
              .limit(1);

            const record = {
              tiabCustomerId: c.customerId,
              companyName: c.companyName ?? null,
              firstName: c.firstName ?? null,
              lastName: c.lastName ?? null,
              email: c.email ?? null,
              phone: c.phone ?? null,
              mobile: c.mobile ?? null,
              abn: c.abn ?? null,
              address: c.address ?? null,
              suburb: c.suburb ?? null,
              state: c.state ?? null,
              postcode: c.postcode ?? null,
              status: c.status ?? null,
              rawJson: JSON.stringify(c),
              lastSyncedAt: new Date(),
            };

            if (existing.length > 0) {
              await db!.update(tiabCustomers).set(record).where(eq(tiabCustomers.tiabCustomerId, c.customerId));
              stats.recordsUpdated++;
            } else {
              await db!.insert(tiabCustomers).values(record);
              stats.recordsCreated++;
            }
          } catch {
            stats.recordsErrored++;
          }
        }

        await completeSyncLog(db, logId, stats, startTime);
        return { success: true, ...stats };
      } catch (err) {
        await completeSyncLog(db, logId, { ...stats, errorMessage: (err as Error).message }, startTime);
        throw err;
      }
    }),

  // -------------------------------------------------------------------------
  // Sync — Services
  // -------------------------------------------------------------------------
  syncServices: protectedProcedure
    .input(z.object({ triggeredBy: z.string().default("manual") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const startTime = Date.now();
      const logId = await startSyncLog(db, "services", input.triggeredBy);
      const stats = { recordsFetched: 0, recordsCreated: 0, recordsUpdated: 0, recordsErrored: 0 };

      try {
        const services = await TiabAPI.listServices();
        stats.recordsFetched = services.length;

        for (const s of services) {
          try {
            const existing = await db!
              .select({ id: tiabServices.id, internalServiceExternalId: tiabServices.internalServiceExternalId })
              .from(tiabServices)
              .where(eq(tiabServices.tiabServiceId, s.serviceId))
              .limit(1);

            const record = {
              tiabServiceId: s.serviceId,
              tiabCustomerId: s.customerId,
              planId: s.planId ?? null,
              planName: s.planName ?? null,
              status: s.status ?? null,
              serviceType: s.serviceType ?? null,
              msisdn: s.msisdn ?? null,
              simSerial: s.simSerial ?? null,
              imei: s.imei ?? null,
              activationDate: s.activationDate ?? null,
              suspensionDate: s.suspensionDate ?? null,
              cessationDate: s.cessationDate ?? null,
              dataPoolId: s.dataPoolId ?? null,
              rawJson: JSON.stringify(s),
              lastSyncedAt: new Date(),
            };

            if (existing.length > 0) {
              await db!.update(tiabServices).set(record).where(eq(tiabServices.tiabServiceId, s.serviceId));
              stats.recordsUpdated++;
            } else {
              await db!.insert(tiabServices).values({ ...record, reconStatus: "pending" });
              stats.recordsCreated++;
            }
          } catch {
            stats.recordsErrored++;
          }
        }

        await completeSyncLog(db, logId, stats, startTime);
        return { success: true, ...stats };
      } catch (err) {
        await completeSyncLog(db, logId, { ...stats, errorMessage: (err as Error).message }, startTime);
        throw err;
      }
    }),

  // -------------------------------------------------------------------------
  // Sync — Plans
  // -------------------------------------------------------------------------
  syncPlans: protectedProcedure
    .input(z.object({ triggeredBy: z.string().default("manual") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const startTime = Date.now();
      const logId = await startSyncLog(db, "plans", input.triggeredBy);
      const stats = { recordsFetched: 0, recordsCreated: 0, recordsUpdated: 0, recordsErrored: 0 };

      try {
        const plans = await TiabAPI.listPlans();
        stats.recordsFetched = plans.length;

        for (const p of plans) {
          try {
            const existing = await db!
              .select({ id: tiabPlans.id })
              .from(tiabPlans)
              .where(eq(tiabPlans.tiabPlanId, p.planId))
              .limit(1);

            const record = {
              tiabPlanId: p.planId,
              planName: p.planName,
              planType: p.planType ?? null,
              description: p.description ?? null,
              baseCharge: p.baseCharge != null ? String(p.baseCharge) : null,
              dataAllowanceGb: p.dataAllowanceGb != null ? String(p.dataAllowanceGb) : null,
              voiceAllowanceMinutes: p.voiceAllowanceMinutes ?? null,
              smsAllowance: p.smsAllowance ?? null,
              contractTermMonths: p.contractTerm ?? null,
              status: p.status ?? null,
              rawJson: JSON.stringify(p),
              lastSyncedAt: new Date(),
            };

            if (existing.length > 0) {
              await db!.update(tiabPlans).set(record).where(eq(tiabPlans.tiabPlanId, p.planId));
              stats.recordsUpdated++;
            } else {
              await db!.insert(tiabPlans).values(record);
              stats.recordsCreated++;
            }
          } catch {
            stats.recordsErrored++;
          }
        }

        await completeSyncLog(db, logId, stats, startTime);
        return { success: true, ...stats };
      } catch (err) {
        await completeSyncLog(db, logId, { ...stats, errorMessage: (err as Error).message }, startTime);
        throw err;
      }
    }),

  // -------------------------------------------------------------------------
  // Sync — Transactions
  // -------------------------------------------------------------------------
  syncTransactions: protectedProcedure
    .input(
      z.object({
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        triggeredBy: z.string().default("manual"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const startTime = Date.now();
      const logId = await startSyncLog(db, "transactions", input.triggeredBy);
      const stats = { recordsFetched: 0, recordsCreated: 0, recordsUpdated: 0, recordsErrored: 0 };

      try {
        const params: Record<string, string> = {};
        if (input.fromDate) params.fromDate = input.fromDate;
        if (input.toDate) params.toDate = input.toDate;

        const transactions = await TiabAPI.listTransactions(params);
        stats.recordsFetched = transactions.length;

        for (const t of transactions) {
          try {
            const existing = await db!
              .select({ id: tiabTransactions.id })
              .from(tiabTransactions)
              .where(eq(tiabTransactions.tiabTransactionId, t.transactionId))
              .limit(1);

            const record = {
              tiabTransactionId: t.transactionId,
              tiabCustomerId: t.customerId,
              tiabServiceId: t.serviceId ?? null,
              transactionType: t.transactionType ?? null,
              amount: t.amount != null ? String(t.amount) : null,
              gst: t.gst != null ? String(t.gst) : null,
              description: t.description ?? null,
              transactionDate: t.transactionDate ?? null,
              billingPeriodStart: t.billingPeriodStart ?? null,
              billingPeriodEnd: t.billingPeriodEnd ?? null,
              status: t.status ?? null,
              rawJson: JSON.stringify(t),
            };

            if (existing.length > 0) {
              await db!.update(tiabTransactions).set(record).where(eq(tiabTransactions.tiabTransactionId, t.transactionId));
              stats.recordsUpdated++;
            } else {
              await db!.insert(tiabTransactions).values(record);
              stats.recordsCreated++;
            }
          } catch {
            stats.recordsErrored++;
          }
        }

        await completeSyncLog(db, logId, stats, startTime);
        return { success: true, ...stats };
      } catch (err) {
        await completeSyncLog(db, logId, { ...stats, errorMessage: (err as Error).message }, startTime);
        throw err;
      }
    }),

  // -------------------------------------------------------------------------
  // Sync All
  // -------------------------------------------------------------------------
  syncAll: protectedProcedure.mutation(async () => {
    const db = await getDb();
    const startTime = Date.now();
    const logId = await startSyncLog(db, "full", "manual");
    const results: Record<string, unknown> = {};

    try {
      // Customers
      try {
        const customers = await TiabAPI.listCustomers();
        let created = 0, updated = 0;
        for (const c of customers) {
          const existing = await db!.select({ id: tiabCustomers.id }).from(tiabCustomers)
            .where(eq(tiabCustomers.tiabCustomerId, c.customerId)).limit(1);
          const record = {
            tiabCustomerId: c.customerId, companyName: c.companyName ?? null,
            firstName: c.firstName ?? null, lastName: c.lastName ?? null,
            email: c.email ?? null, phone: c.phone ?? null, mobile: c.mobile ?? null,
            abn: c.abn ?? null, address: c.address ?? null, suburb: c.suburb ?? null,
            state: c.state ?? null, postcode: c.postcode ?? null, status: c.status ?? null,
            rawJson: JSON.stringify(c), lastSyncedAt: new Date(),
          };
          if (existing.length > 0) { await db!.update(tiabCustomers).set(record).where(eq(tiabCustomers.tiabCustomerId, c.customerId)); updated++; }
          else { await db!.insert(tiabCustomers).values(record); created++; }
        }
        results.customers = { fetched: customers.length, created, updated };
      } catch (e) { results.customers = { error: (e as Error).message }; }

      // Services
      try {
        const services = await TiabAPI.listServices();
        let created = 0, updated = 0;
        for (const s of services) {
          const existing = await db!.select({ id: tiabServices.id }).from(tiabServices)
            .where(eq(tiabServices.tiabServiceId, s.serviceId)).limit(1);
          const record = {
            tiabServiceId: s.serviceId, tiabCustomerId: s.customerId,
            planId: s.planId ?? null, planName: s.planName ?? null, status: s.status ?? null,
            serviceType: s.serviceType ?? null, msisdn: s.msisdn ?? null,
            simSerial: s.simSerial ?? null, imei: s.imei ?? null,
            activationDate: s.activationDate ?? null, suspensionDate: s.suspensionDate ?? null,
            cessationDate: s.cessationDate ?? null, dataPoolId: s.dataPoolId ?? null,
            rawJson: JSON.stringify(s), lastSyncedAt: new Date(),
          };
          if (existing.length > 0) { await db!.update(tiabServices).set(record).where(eq(tiabServices.tiabServiceId, s.serviceId)); updated++; }
          else { await db!.insert(tiabServices).values({ ...record, reconStatus: "pending" }); created++; }
        }
        results.services = { fetched: services.length, created, updated };
      } catch (e) { results.services = { error: (e as Error).message }; }

      // Plans
      try {
        const plans = await TiabAPI.listPlans();
        let created = 0, updated = 0;
        for (const p of plans) {
          const existing = await db!.select({ id: tiabPlans.id }).from(tiabPlans)
            .where(eq(tiabPlans.tiabPlanId, p.planId)).limit(1);
          const record = {
            tiabPlanId: p.planId, planName: p.planName, planType: p.planType ?? null,
            description: p.description ?? null, baseCharge: p.baseCharge != null ? String(p.baseCharge) : null,
            dataAllowanceGb: p.dataAllowanceGb != null ? String(p.dataAllowanceGb) : null,
            voiceAllowanceMinutes: p.voiceAllowanceMinutes ?? null, smsAllowance: p.smsAllowance ?? null,
            contractTermMonths: p.contractTerm ?? null, status: p.status ?? null,
            rawJson: JSON.stringify(p), lastSyncedAt: new Date(),
          };
          if (existing.length > 0) { await db!.update(tiabPlans).set(record).where(eq(tiabPlans.tiabPlanId, p.planId)); updated++; }
          else { await db!.insert(tiabPlans).values(record); created++; }
        }
        results.plans = { fetched: plans.length, created, updated };
      } catch (e) { results.plans = { error: (e as Error).message }; }

      await completeSyncLog(db, logId, {
        recordsFetched: Object.values(results).reduce((sum: number, r: unknown) => sum + ((r as Record<string, number>).fetched ?? 0), 0),
        recordsCreated: Object.values(results).reduce((sum: number, r: unknown) => sum + ((r as Record<string, number>).created ?? 0), 0),
        recordsUpdated: Object.values(results).reduce((sum: number, r: unknown) => sum + ((r as Record<string, number>).updated ?? 0), 0),
      }, startTime);

      return { success: true, results };
    } catch (err) {
      await completeSyncLog(db, logId, { errorMessage: (err as Error).message }, startTime);
      throw err;
    }
  }),

  // -------------------------------------------------------------------------
  // Sync Log
  // -------------------------------------------------------------------------
  getSyncLog: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db!.select().from(tiabSyncLog).orderBy(desc(tiabSyncLog.startedAt)).limit(input.limit);
    }),

  // -------------------------------------------------------------------------
  // Customers
  // -------------------------------------------------------------------------
  getCustomers: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        linked: z.boolean().optional(),
        page: z.number().default(0),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const offset = input.page * input.pageSize;

      let rows = await db!.select().from(tiabCustomers).orderBy(tiabCustomers.companyName);

      if (input.search) {
        const s = input.search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.companyName?.toLowerCase().includes(s) ||
            r.firstName?.toLowerCase().includes(s) ||
            r.lastName?.toLowerCase().includes(s) ||
            r.email?.toLowerCase().includes(s) ||
            r.phone?.includes(s) ||
            r.abn?.includes(s)
        );
      }
      if (input.status) rows = rows.filter((r) => r.status === input.status);
      if (input.linked === true) rows = rows.filter((r) => r.internalCustomerExternalId);
      if (input.linked === false) rows = rows.filter((r) => !r.internalCustomerExternalId);

      return {
        total: rows.length,
        rows: rows.slice(offset, offset + input.pageSize),
      };
    }),

  // -------------------------------------------------------------------------
  // Services
  // -------------------------------------------------------------------------
  getServices: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        reconStatus: z.string().optional(),
        tiabCustomerId: z.string().optional(),
        linked: z.boolean().optional(),
        page: z.number().default(0),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const offset = input.page * input.pageSize;

      let rows = await db!.select().from(tiabServices).orderBy(desc(tiabServices.lastSyncedAt));

      if (input.search) {
        const s = input.search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.msisdn?.includes(s) ||
            r.simSerial?.toLowerCase().includes(s) ||
            r.imei?.includes(s) ||
            r.planName?.toLowerCase().includes(s) ||
            r.tiabCustomerId?.includes(s)
        );
      }
      if (input.status) rows = rows.filter((r) => r.status === input.status);
      if (input.reconStatus) rows = rows.filter((r) => r.reconStatus === input.reconStatus);
      if (input.tiabCustomerId) rows = rows.filter((r) => r.tiabCustomerId === input.tiabCustomerId);
      if (input.linked === true) rows = rows.filter((r) => r.internalServiceExternalId);
      if (input.linked === false) rows = rows.filter((r) => !r.internalServiceExternalId);

      return {
        total: rows.length,
        rows: rows.slice(offset, offset + input.pageSize),
      };
    }),

  getServiceDetail: protectedProcedure
    .input(z.object({ tiabServiceId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [tiabSvc] = await db!
        .select()
        .from(tiabServices)
        .where(eq(tiabServices.tiabServiceId, input.tiabServiceId))
        .limit(1);

      if (!tiabSvc) return null;

      // Load linked internal service if any
      let internalService = null;
      if (tiabSvc.internalServiceExternalId) {
        const [svc] = await db!
          .select()
          .from(internalServices)
          .where(eq(internalServices.externalId, tiabSvc.internalServiceExternalId))
          .limit(1);
        internalService = svc ?? null;
      }

      // Load linked TIAB customer
      const [tiabCustomer] = await db!
        .select()
        .from(tiabCustomers)
        .where(eq(tiabCustomers.tiabCustomerId, tiabSvc.tiabCustomerId))
        .limit(1);

      // Load recent transactions
      const transactions = await db!
        .select()
        .from(tiabTransactions)
        .where(eq(tiabTransactions.tiabServiceId, input.tiabServiceId))
        .orderBy(desc(tiabTransactions.transactionDate))
        .limit(12);

      // Load recon issues
      const reconIssues = await db!
        .select()
        .from(tiabReconIssues)
        .where(and(eq(tiabReconIssues.tiabServiceId, input.tiabServiceId), eq(tiabReconIssues.status, "open")))
        .orderBy(desc(tiabReconIssues.createdAt));

      return { tiabSvc, tiabCustomer: tiabCustomer ?? null, internalService, transactions, reconIssues };
    }),

  // -------------------------------------------------------------------------
  // Live API — Data Pool
  // -------------------------------------------------------------------------
  getDataPool: protectedProcedure
    .input(z.object({ tiabServiceId: z.string() }))
    .query(async ({ input }) => {
      return TiabAPI.getDataPool(input.tiabServiceId);
    }),

  updateDataLimit: protectedProcedure
    .input(z.object({ tiabServiceId: z.string(), limitGb: z.number().positive() }))
    .mutation(async ({ input }) => {
      await TiabAPI.updateDataLimit(input.tiabServiceId, input.limitGb);
      return { success: true };
    }),

  transferToPool: protectedProcedure
    .input(z.object({ tiabServiceId: z.string(), targetPoolId: z.string() }))
    .mutation(async ({ input }) => {
      await TiabAPI.transferServiceToPool(input.tiabServiceId, input.targetPoolId);
      return { success: true };
    }),

  disconnectPool: protectedProcedure
    .input(z.object({ tiabServiceId: z.string() }))
    .mutation(async ({ input }) => {
      await TiabAPI.disconnectDataPool(input.tiabServiceId);
      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // Live API — eSIM
  // -------------------------------------------------------------------------
  getEsimDetails: protectedProcedure
    .input(z.object({ tiabServiceId: z.string() }))
    .query(async ({ input }) => {
      return TiabAPI.getEsimDetails(input.tiabServiceId);
    }),

  manageEsim: protectedProcedure
    .input(
      z.object({
        tiabServiceId: z.string(),
        action: z.enum(["suspend", "activate", "reset", "replace"]),
      })
    )
    .mutation(async ({ input }) => {
      await TiabAPI.manageEsim(input.tiabServiceId, input.action);
      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // Live API — Notification Settings
  // -------------------------------------------------------------------------
  getNotificationSettings: protectedProcedure
    .input(z.object({ tiabCustomerId: z.string() }))
    .query(async ({ input }) => {
      return TiabAPI.getNotificationSettings(input.tiabCustomerId);
    }),

  updateNotificationSettings: protectedProcedure
    .input(
      z.object({
        tiabCustomerId: z.string(),
        settings: z.object({
          usagePercentThreshold: z.number().optional(),
          dollarThreshold: z.number().optional(),
          roamingAlertEnabled: z.boolean().optional(),
          billShockEnabled: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      await TiabAPI.updateNotificationSettings(input.tiabCustomerId, input.settings);
      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // Reconciliation
  // -------------------------------------------------------------------------
  runReconciliation: protectedProcedure
    .input(z.object({ billingPeriod: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const period = input.billingPeriod ?? new Date().toISOString().substring(0, 7); // YYYY-MM

      // Get all TIAB services
      const tiabSvcs = await db!.select().from(tiabServices);
      // Get all internal mobile services (data-mobile category)
      const internalMobile = await db!
        .select()
        .from(internalServices)
        .where(eq(internalServices.serviceCategory, "data-mobile"));

      const issues: Array<typeof tiabReconIssues.$inferInsert> = [];

      // Check 1: TIAB services with no internal match
      for (const svc of tiabSvcs) {
        if (!svc.internalServiceExternalId && svc.status === "Active") {
          issues.push({
            tiabServiceId: svc.tiabServiceId,
            tiabCustomerId: svc.tiabCustomerId,
            billingPeriod: period,
            issueType: "missing_service",
            severity: "high",
            description: `Active TIAB service (MSISDN: ${svc.msisdn ?? "unknown"}, SIM: ${svc.simSerial ?? "unknown"}) has no matching internal service record.`,
            expectedValue: "Linked internal service",
            actualValue: "No link",
            status: "open",
          });
        }
      }

      // Check 2: Internal mobile services with no TIAB match
      for (const svc of internalMobile) {
        if (svc.simSerialNumber) {
          const tiabMatch = tiabSvcs.find(
            (t) =>
              t.simSerial === svc.simSerialNumber ||
              (svc.phoneNumber && t.msisdn === svc.phoneNumber)
          );
          if (!tiabMatch) {
            issues.push({
              internalServiceExternalId: svc.externalId,
              internalCustomerExternalId: svc.customerExternalId ?? undefined,
              billingPeriod: period,
              issueType: "missing_service",
              severity: "medium",
              description: `Internal mobile service (${svc.externalId}, SIM: ${svc.simSerialNumber}) has no matching TIAB service record.`,
              expectedValue: "TIAB service record",
              actualValue: "No TIAB record found",
              status: "open",
            });
          }
        }
      }

      // Check 3: Status mismatches
      for (const svc of tiabSvcs) {
        if (svc.internalServiceExternalId) {
          const internal = internalMobile.find((s) => s.externalId === svc.internalServiceExternalId);
          if (internal) {
            const tiabActive = svc.status === "Active";
            const internalActive = internal.status === "active";
            if (tiabActive !== internalActive) {
              issues.push({
                tiabServiceId: svc.tiabServiceId,
                tiabCustomerId: svc.tiabCustomerId,
                internalServiceExternalId: svc.internalServiceExternalId,
                internalCustomerExternalId: internal.customerExternalId ?? undefined,
                billingPeriod: period,
                issueType: "sim_state_mismatch",
                severity: "medium",
                description: `Service status mismatch. TIAB: ${svc.status}, Internal: ${internal.status}`,
                expectedValue: svc.status ?? "Active",
                actualValue: internal.status ?? "unknown",
                status: "open",
              });
            }
          }
        }
      }

      // Upsert issues (avoid duplicates for same service+period+type)
      let created = 0;
      for (const issue of issues) {
        // Check if already exists
        const existing = await db!
          .select({ id: tiabReconIssues.id })
          .from(tiabReconIssues)
          .where(
            and(
              issue.tiabServiceId ? eq(tiabReconIssues.tiabServiceId, issue.tiabServiceId) : isNull(tiabReconIssues.tiabServiceId),
              eq(tiabReconIssues.billingPeriod, period),
              eq(tiabReconIssues.issueType, issue.issueType),
              eq(tiabReconIssues.status, "open")
            )
          )
          .limit(1);

        if (existing.length === 0) {
          await db!.insert(tiabReconIssues).values(issue);
          created++;
        }
      }

      return {
        success: true,
        billingPeriod: period,
        issuesFound: issues.length,
        issuesCreated: created,
        breakdown: {
          missingTiabServices: issues.filter((i) => i.issueType === "missing_service" && !i.tiabServiceId).length,
          missingInternalServices: issues.filter((i) => i.issueType === "missing_service" && i.tiabServiceId).length,
          statusMismatches: issues.filter((i) => i.issueType === "sim_state_mismatch").length,
        },
      };
    }),

  getReconIssues: protectedProcedure
    .input(
      z.object({
        status: z.string().default("open"),
        issueType: z.string().optional(),
        severity: z.string().optional(),
        billingPeriod: z.string().optional(),
        page: z.number().default(0),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      let rows = await db!
        .select()
        .from(tiabReconIssues)
        .orderBy(desc(tiabReconIssues.createdAt));

      if (input.status) rows = rows.filter((r) => r.status === input.status);
      if (input.issueType) rows = rows.filter((r) => r.issueType === input.issueType);
      if (input.severity) rows = rows.filter((r) => r.severity === input.severity);
      if (input.billingPeriod) rows = rows.filter((r) => r.billingPeriod === input.billingPeriod);

      const offset = input.page * input.pageSize;
      return {
        total: rows.length,
        rows: rows.slice(offset, offset + input.pageSize),
      };
    }),

  resolveReconIssue: protectedProcedure
    .input(
      z.object({
        issueId: z.number(),
        status: z.enum(["manually_resolved", "dismissed", "auto_remediated"]),
        resolutionNotes: z.string().optional(),
        resolvedBy: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db!
        .update(tiabReconIssues)
        .set({
          status: input.status,
          resolutionNotes: input.resolutionNotes ?? null,
          resolvedAt: new Date(),
          resolvedBy: input.resolvedBy ?? ctx.user?.name ?? "unknown",
        })
        .where(eq(tiabReconIssues.id, input.issueId));
      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // Linking
  // -------------------------------------------------------------------------
  linkService: protectedProcedure
    .input(
      z.object({
        tiabServiceId: z.string(),
        internalServiceExternalId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!
        .update(tiabServices)
        .set({
          internalServiceExternalId: input.internalServiceExternalId,
          reconStatus: "matched",
        })
        .where(eq(tiabServices.tiabServiceId, input.tiabServiceId));
      return { success: true };
    }),

  linkCustomer: protectedProcedure
    .input(
      z.object({
        tiabCustomerId: z.string(),
        internalCustomerExternalId: z.string(),
        matchType: z.string().default("manual"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!
        .update(tiabCustomers)
        .set({
          internalCustomerExternalId: input.internalCustomerExternalId,
          matchType: input.matchType,
          matchConfidence: "100.00",
        })
        .where(eq(tiabCustomers.tiabCustomerId, input.tiabCustomerId));
      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // Supplier Invoices (100998-xxx)
  // -------------------------------------------------------------------------
  getSupplierInvoices: protectedProcedure
    .input(
      z.object({
        page: z.number().default(0),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db!
        .select()
        .from(tiabSupplierInvoices)
        .orderBy(desc(tiabSupplierInvoices.invoiceDate))
        .limit(input.pageSize)
        .offset(input.page * input.pageSize);
      const [countRow] = await db!.select({ count: sql<number>`count(*)` }).from(tiabSupplierInvoices);
      return { total: Number(countRow?.count ?? 0), rows };
    }),

  getSupplierInvoiceDetail: protectedProcedure
    .input(z.object({ invoiceNumber: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [invoice] = await db!
        .select()
        .from(tiabSupplierInvoices)
        .where(eq(tiabSupplierInvoices.invoiceNumber, input.invoiceNumber))
        .limit(1);
      if (!invoice) return null;
      const lineItems = await db!
        .select()
        .from(tiabSupplierInvoiceLineItems)
        .where(eq(tiabSupplierInvoiceLineItems.invoiceId, invoice.id));
      return { invoice, lineItems };
    }),

  getSupplierInvoiceSummary: protectedProcedure.query(async () => {
    const db = await getDb();
    const invoices = await db!.select().from(tiabSupplierInvoices).orderBy(tiabSupplierInvoices.billingMonth);
    return invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceReference: inv.invoiceReference,
      billingMonth: inv.billingMonth,
      invoiceDate: inv.invoiceDate,
      totalExGst: Number(inv.totalExGst),
      totalIncGst: Number(inv.totalIncGst),
      status: inv.status,
    }));
  }),

  // -------------------------------------------------------------------------
  // Octane Customer Links
  // -------------------------------------------------------------------------
  getOctaneLinks: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        matchType: z.string().optional(),
        isZambreroService: z.boolean().optional(),
        page: z.number().default(0),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      let rows = await db!.select().from(octaneCustomerLinks).orderBy(octaneCustomerLinks.octaneCustomerName);

      if (input.search) {
        const s = input.search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.octaneCustomerName?.toLowerCase().includes(s) ||
            r.octaneServiceName?.toLowerCase().includes(s) ||
            r.internalCustomerName?.toLowerCase().includes(s) ||
            r.msisdn?.includes(s)
        );
      }
      if (input.matchType) rows = rows.filter((r) => r.matchType === input.matchType);
      if (input.isZambreroService !== undefined)
        rows = rows.filter((r) => Boolean(r.isZambreroService) === input.isZambreroService);

      const offset = input.page * input.pageSize;
      return { total: rows.length, rows: rows.slice(offset, offset + input.pageSize) };
    }),

  updateOctaneLink: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        internalCustomerExternalId: z.string().optional(),
        internalCustomerName: z.string().optional(),
        matchType: z.string().optional(),
        matchNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db!
        .update(octaneCustomerLinks)
        .set({
          internalCustomerExternalId: input.internalCustomerExternalId ?? null,
          internalCustomerName: input.internalCustomerName ?? null,
          matchType: input.matchType ?? "manual",
          matchConfidence: "100.00",
          matchNotes: input.matchNotes ?? null,
          confirmedBy: ctx.user?.name ?? "unknown",
          confirmedAt: new Date(),
        })
        .where(eq(octaneCustomerLinks.id, input.id));
      return { success: true };
    }),

  getOctaneLinkStats: protectedProcedure.query(async () => {
    const db = await getDb();
    const all = await db!.select().from(octaneCustomerLinks);
    const total = all.length;
    const matched = all.filter((r) => r.matchType !== "unmatched" && r.internalCustomerExternalId).length;
    const zambrero = all.filter((r) => r.isZambreroService === 1).length;
    const zambreroMatched = all.filter((r) => r.isZambreroService === 1 && r.internalCustomerExternalId).length;
    const nonZambrero = all.filter((r) => r.isZambreroService === 0).length;
    const nonZambreroMatched = all.filter((r) => r.isZambreroService === 0 && r.internalCustomerExternalId).length;
    return { total, matched, unmatched: total - matched, zambrero, zambreroMatched, nonZambrero, nonZambreroMatched };
  }),

  // -------------------------------------------------------------------------
  // Summary stats for dashboard
  // -------------------------------------------------------------------------
  getSummary: protectedProcedure.query(async () => {
    const db = await getDb();
    const [customers, services, openIssues, recentSync] = await Promise.all([
      db!.select({ count: sql<number>`count(*)` }).from(tiabCustomers),
      db!.select({ count: sql<number>`count(*)` }).from(tiabServices),
      db!
        .select({ count: sql<number>`count(*)` })
        .from(tiabReconIssues)
        .where(eq(tiabReconIssues.status, "open")),
      db!.select().from(tiabSyncLog).orderBy(desc(tiabSyncLog.startedAt)).limit(1),
    ]);

    const [activeServices, linkedServices, linkedCustomers] = await Promise.all([
      db!.select({ count: sql<number>`count(*)` }).from(tiabServices).where(eq(tiabServices.status, "Active")),
      db!.select({ count: sql<number>`count(*)` }).from(tiabServices).where(sql`internalServiceExternalId IS NOT NULL AND internalServiceExternalId != ''`),
      db!.select({ count: sql<number>`count(*)` }).from(tiabCustomers).where(sql`internalCustomerExternalId IS NOT NULL AND internalCustomerExternalId != ''`),
    ]);

    return {
      totalCustomers: Number(customers[0]?.count ?? 0),
      totalServices: Number(services[0]?.count ?? 0),
      activeServices: Number(activeServices[0]?.count ?? 0),
      linkedServices: Number(linkedServices[0]?.count ?? 0),
      linkedCustomers: Number(linkedCustomers[0]?.count ?? 0),
      openReconIssues: Number(openIssues[0]?.count ?? 0),
      lastSync: recentSync[0] ?? null,
    };
  }),
});
