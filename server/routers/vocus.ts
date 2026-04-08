/**
 * Vocus Wholesale Portal — tRPC Router
 * Provides endpoints for Mobile SIM, NBN services, bucket quotas, and sync log.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { vocusMobileServices, vocusNbnServices, vocusBuckets, vocusSyncLog, VocusMobileService, VocusNbnService, VocusBucket } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

export const vocusRouter = router({
  // ─────────────────────────────────────────────────────────────────────────
  // Mobile Services
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * List all mobile SIM services with optional filtering.
   */
  listMobile: protectedProcedure
    .input(z.object({
      serviceScope: z.enum(["STANDARD-POSTPAID", "DATA-HOSTED", "all"]).default("all"),
      serviceStatus: z.enum(["active", "inactive", "all"]).default("all"),
      search: z.string().optional(),
      limit: z.number().min(1).max(500).default(200),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.serviceScope !== "all") {
        conditions.push(eq(vocusMobileServices.serviceScope, input.serviceScope));
      }
      if (input.serviceStatus !== "all") {
        conditions.push(eq(vocusMobileServices.serviceStatus, input.serviceStatus));
      }

      let rows = await db.select().from(vocusMobileServices)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(vocusMobileServices.lastSyncedAt))
        .limit(input.limit)
        .offset(input.offset);

      // Apply search filter in memory (small dataset)
      if (input.search) {
        const q = input.search.toLowerCase();
        rows = rows.filter((r: VocusMobileService) =>
          r.customerName?.toLowerCase().includes(q) ||
          r.msn?.toLowerCase().includes(q) ||
          r.sim?.toLowerCase().includes(q) ||
          r.label?.toLowerCase().includes(q) ||
          r.vocusServiceId.toLowerCase().includes(q)
        );
      }

      return rows;
    }),

  /**
   * Get a single mobile service by Vocus service ID.
   */
  getMobile: protectedProcedure
    .input(z.object({ vocusServiceId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db.select().from(vocusMobileServices)
        .where(eq(vocusMobileServices.vocusServiceId, input.vocusServiceId));
      return row ?? null;
    }),

  /**
   * Link a Vocus mobile service to an internal service record.
   */
  linkMobileToService: protectedProcedure
    .input(z.object({
      vocusServiceId: z.string(),
      internalServiceExternalId: z.string(),
      matchType: z.enum(["msn", "sim", "manual"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(vocusMobileServices)
        .set({
          internalServiceExternalId: input.internalServiceExternalId,
          matchType: input.matchType,
          matchConfidence: "1.00",
          updatedAt: new Date(),
        })
        .where(eq(vocusMobileServices.vocusServiceId, input.vocusServiceId));
      return { success: true };
    }),

  /**
   * Unlink a Vocus mobile service from its internal service.
   */
  unlinkMobile: protectedProcedure
    .input(z.object({ vocusServiceId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(vocusMobileServices)
        .set({
          internalServiceExternalId: null,
          matchType: null,
          matchConfidence: null,
          updatedAt: new Date(),
        })
        .where(eq(vocusMobileServices.vocusServiceId, input.vocusServiceId));
      return { success: true };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // NBN Services
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * List all NBN services with optional filtering.
   */
  listNbn: protectedProcedure
    .input(z.object({
      serviceStatus: z.enum(["active", "inactive", "all"]).default("all"),
      search: z.string().optional(),
      limit: z.number().min(1).max(500).default(200),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.serviceStatus !== "all") {
        conditions.push(eq(vocusNbnServices.serviceStatus, input.serviceStatus));
      }

      let rows = await db.select().from(vocusNbnServices)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(vocusNbnServices.lastSyncedAt))
        .limit(input.limit)
        .offset(input.offset);

      // Apply search filter in memory
      if (input.search) {
        const q = input.search.toLowerCase();
        rows = rows.filter((r: VocusNbnService) =>
          r.customerName?.toLowerCase().includes(q) ||
          r.address?.toLowerCase().includes(q) ||
          r.avcId?.toLowerCase().includes(q) ||
          r.username?.toLowerCase().includes(q) ||
          r.vocusServiceId.toLowerCase().includes(q)
        );
      }

      return rows;
    }),

  /**
   * Get a single NBN service by Vocus service ID.
   */
  getNbn: protectedProcedure
    .input(z.object({ vocusServiceId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db.select().from(vocusNbnServices)
        .where(eq(vocusNbnServices.vocusServiceId, input.vocusServiceId));
      return row ?? null;
    }),

  /**
   * Link a Vocus NBN service to an internal service record.
   */
  linkNbnToService: protectedProcedure
    .input(z.object({
      vocusServiceId: z.string(),
      internalServiceExternalId: z.string(),
      matchType: z.enum(["avc", "address", "username", "manual"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(vocusNbnServices)
        .set({
          internalServiceExternalId: input.internalServiceExternalId,
          matchType: input.matchType,
          matchConfidence: "1.00",
          updatedAt: new Date(),
        })
        .where(eq(vocusNbnServices.vocusServiceId, input.vocusServiceId));
      return { success: true };
    }),

  /**
   * Unlink a Vocus NBN service from its internal service.
   */
  unlinkNbn: protectedProcedure
    .input(z.object({ vocusServiceId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(vocusNbnServices)
        .set({
          internalServiceExternalId: null,
          matchType: null,
          matchConfidence: null,
          updatedAt: new Date(),
        })
        .where(eq(vocusNbnServices.vocusServiceId, input.vocusServiceId));
      return { success: true };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Buckets
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all bucket quota snapshots.
   */
  listBuckets: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(vocusBuckets)
        .orderBy(desc(vocusBuckets.lastSyncedAt));
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Summary / Dashboard Stats
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get summary statistics for the Vocus dashboard widget.
   */
  getSummary: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return null;
      const allMobile = await db.select().from(vocusMobileServices);
      const allNbn = await db.select().from(vocusNbnServices);
      const allBuckets = await db.select().from(vocusBuckets);

      const activeMobile = allMobile.filter((r: VocusMobileService) => r.serviceStatus === 'active');
      const inactiveMobile = allMobile.filter((r: VocusMobileService) => r.serviceStatus === 'inactive');
      const stdMobile = activeMobile.filter((r: VocusMobileService) => r.serviceScope === 'STANDARD-POSTPAID');
      const backup4g = activeMobile.filter((r: VocusMobileService) => r.serviceScope === 'DATA-HOSTED');

      const activeNbn = allNbn.filter((r: VocusNbnService) => r.serviceStatus === 'active');
      const inactiveNbn = allNbn.filter((r: VocusNbnService) => r.serviceStatus === 'inactive');

      const unmatchedMobile = activeMobile.filter((r: VocusMobileService) => !r.internalServiceExternalId);
      const unmatchedNbn = activeNbn.filter((r: VocusNbnService) => !r.internalServiceExternalId);

      const overQuotaBuckets = allBuckets.filter((r: VocusBucket) => r.isOverQuota);

      return {
        mobile: {
          total: allMobile.length,
          active: activeMobile.length,
          inactive: inactiveMobile.length,
          standardPostpaid: stdMobile.length,
          dataHosted: backup4g.length,
          unmatched: unmatchedMobile.length,
        },
        nbn: {
          total: allNbn.length,
          active: activeNbn.length,
          inactive: inactiveNbn.length,
          unmatched: unmatchedNbn.length,
        },
        buckets: allBuckets.map((b: typeof allBuckets[0]) => ({
          bucketId: b.bucketId,
          realm: b.realm,
          bucketType: b.bucketType,
          dataQuotaGb: b.dataQuotaMb ? Math.round(b.dataQuotaMb / 1024) : null,
          dataUsedGb: b.dataUsedMb ? parseFloat((Number(b.dataUsedMb) / 1024).toFixed(2)) : null,
          isOverQuota: b.isOverQuota,
          overageGb: b.overageDataMb ? parseFloat((Number(b.overageDataMb) / 1024).toFixed(2)) : null,
          simCount: b.simCount,
          snapshotDate: b.snapshotDate,
        })),
        overQuotaCount: overQuotaBuckets.length,
        lastSyncedAt: allMobile[0]?.lastSyncedAt ?? null,
      };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Sync Log
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get recent sync log entries.
   */
  getSyncLog: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(vocusSyncLog)
        .orderBy(desc(vocusSyncLog.startedAt))
        .limit(input.limit);
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Sync Control
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Submit the 2FA OTP for an in-progress Vocus sync.
   * The sync job waits on a global Promise resolver; this mutation resolves it.
   */
  submitSyncOtp: protectedProcedure
    .input(z.object({ otp: z.string().min(4).max(10) }))
    .mutation(async ({ input }) => {
      const resolver = (global as any).__vocusSyncOtpResolve;
      if (typeof resolver === 'function') {
        resolver(input.otp);
        return { success: true, message: 'OTP submitted — sync will continue.' };
      }
      return { success: false, message: 'No sync is currently waiting for an OTP.' };
    }),

  /**
   * Trigger a manual full sync immediately (admin only).
   * Runs in the background; returns the sync log ID.
   */
  triggerManualSync: protectedProcedure
    .input(z.object({ bucketsOnly: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      // Kick off async — don't await
      (async () => {
        try {
          const { runVocusSync } = await import('../vocusScraper');
          const getOtp = (): Promise<string> =>
            new Promise((resolve) => {
              (global as any).__vocusSyncOtpResolve = resolve;
              setTimeout(() => resolve('TIMEOUT'), 10 * 60 * 1000);
            });
          const result = await runVocusSync({ getOtp, bucketsOnly: input.bucketsOnly });
          console.log(`[VocusSync] Manual sync complete: syncLogId=${result.syncLogId}`);
        } catch (err) {
          console.error('[VocusSync] Manual sync failed:', err);
        }
      })();
      return { success: true, message: 'Vocus sync started in background. Check the sync log for progress.' };
    }),

  /**
   * Check if a sync is currently waiting for an OTP.
   */
  /**
   * Manually trigger the quota alert check.
   * Checks all bucket snapshots and sends owner notifications for any threshold breaches.
   */
  checkQuotaAlerts: protectedProcedure
    .mutation(async () => {
      const { checkVocusQuotaAlerts } = await import('../vocusQuotaAlerts');
      return checkVocusQuotaAlerts();
    }),

  getSyncOtpStatus: protectedProcedure
    .query(() => {
      const waiting = typeof (global as any).__vocusSyncOtpResolve === 'function';
      return { waitingForOtp: waiting };
    }),

  /**
   * Send a test alert email to notifications@smiletel.com.au
   * to verify the SendGrid integration is working correctly.
   */
  sendTestAlert: protectedProcedure
    .mutation(async () => {
      const { sendEmail, buildAlertEmail } = await import('../_core/email');
      const checkedAt = new Date().toLocaleString('en-AU', {
        timeZone: 'Australia/Brisbane',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }) + ' AEST';

      const html = buildAlertEmail({
        title: '✅ SmileTel Billing Recon — Test Alert',
        urgency: 'LOW',
        bodyLines: [
          'This is a **manual test alert** triggered from the SmileTel Billing Recon portal.',
          '',
          'If you received this email, the SendGrid integration is correctly configured and operational.',
          '',
          `**Sent by:** ${checkedAt}`,
        ],
        actionLine: 'No action required — this is a test only.',
        checkedAt,
      });

      const ok = await sendEmail({
        to: 'notifications@smiletel.com.au',
        subject: '✅ SmileTel Billing Recon — Test Alert',
        html,
      });

      if (!ok) throw new Error('Email send failed — check SendGrid configuration');
      return { sent: true, to: 'notifications@smiletel.com.au', sentAt: new Date().toISOString() };
    }),
});
