/**
 * Termination Router
 * Handles bulk archiving of services from supplier termination lists.
 * Services are set to status='archived' and hidden from active workflows
 * but remain in the database for dispute resolution.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { services, terminationBatches } from "../../drizzle/schema";
import { eq, inArray, sql, and, ne } from "drizzle-orm";

function generateBatchId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TERM-${ts}-${rand}`;
}

export const terminationRouter = router({

  /**
   * Bulk archive services from a termination list.
   * Accepts an array of phone numbers (normalised 10-digit strings with leading 0).
   */
  bulkArchive: protectedProcedure
    .input(z.object({
      phoneNumbers: z.array(z.string()).min(1).max(500),
      sourceFile: z.string().default(""),
      supplierName: z.string().default("Telstra"),
      terminationConfirmedDate: z.string().default(""),
      dryRun: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const userName = ctx.user?.name || ctx.user?.email || "system";
      const batchId = generateBatchId();
      const now = new Date();

      const normPhones = input.phoneNumbers.map(p => {
        const s = p.replace(/\s+/g, "");
        if (s.length === 9 && s[0] !== "0") return "0" + s;
        return s;
      });

      const matchedServices = await db
        .select({
          id: services.id,
          externalId: services.externalId,
          phoneNumber: services.phoneNumber,
          status: services.status,
          customerName: services.customerName,
          planName: services.planName,
          supplierAccount: services.supplierAccount,
        })
        .from(services)
        .where(
          and(
            inArray(services.phoneNumber, normPhones),
            ne(services.status, "archived")
          )
        );

      const matchedPhones = new Set(matchedServices.map(s => s.phoneNumber));
      const notFoundPhones = normPhones.filter(p => !matchedPhones.has(p));

      if (input.dryRun) {
        return {
          batchId,
          dryRun: true,
          totalRequested: normPhones.length,
          willArchive: matchedServices.length,
          notFound: notFoundPhones.length,
          notFoundPhones,
          matchedServices: matchedServices.map(s => ({
            externalId: s.externalId,
            phoneNumber: s.phoneNumber,
            currentStatus: s.status,
            customerName: s.customerName,
            planName: s.planName,
          })),
        };
      }

      if (matchedServices.length > 0) {
        const externalIds = matchedServices.map(s => s.externalId);
        await db
          .update(services)
          .set({
            status: "archived",
            archivedAt: now,
            terminationBatchId: batchId,
            terminationListSource: input.sourceFile,
            terminationConfirmedDate: input.terminationConfirmedDate,
            terminationNote: `Archived via bulk termination batch ${batchId} on ${now.toISOString().slice(0, 10)}. Source: ${input.sourceFile}. Processed by: ${userName}.`,
          })
          .where(inArray(services.externalId, externalIds));
      }

      const discrepancyNotes = notFoundPhones.length > 0
        ? `${notFoundPhones.length} phone numbers from the termination list were not found in the database: ${notFoundPhones.join(", ")}`
        : null;

      await db.insert(terminationBatches).values({
        batchId,
        sourceFile: input.sourceFile,
        supplierName: input.supplierName,
        totalServices: normPhones.length,
        archivedCount: matchedServices.length,
        notFoundCount: notFoundPhones.length,
        discrepancyNotes,
        processedBy: userName,
        processedAt: now,
      });

      return {
        batchId,
        dryRun: false,
        totalRequested: normPhones.length,
        archived: matchedServices.length,
        notFound: notFoundPhones.length,
        notFoundPhones,
        message: `Successfully archived ${matchedServices.length} services. ${notFoundPhones.length} not found.`,
      };
    }),

  listBatches: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db
        .select()
        .from(terminationBatches)
        .orderBy(sql`${terminationBatches.processedAt} DESC`);
    }),

  getBatchServices: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db
        .select({
          externalId: services.externalId,
          phoneNumber: services.phoneNumber,
          planName: services.planName,
          customerName: services.customerName,
          supplierAccount: services.supplierAccount,
          archivedAt: services.archivedAt,
          terminationNote: services.terminationNote,
        })
        .from(services)
        .where(eq(services.terminationBatchId, input.batchId))
        .orderBy(services.phoneNumber);
    }),

  restoreService: protectedProcedure
    .input(z.object({
      serviceExternalId: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const userName = ctx.user?.name || ctx.user?.email || "system";
      await db
        .update(services)
        .set({
          status: "active",
          archivedAt: null,
          terminationNote: `Restored from archived status on ${new Date().toISOString().slice(0, 10)} by ${userName}. Reason: ${input.reason || "not specified"}.`,
        })
        .where(eq(services.externalId, input.serviceExternalId));
      return { success: true };
    }),

  getFlaggedNotArchived: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = await db.execute(sql`
        SELECT externalId, phoneNumber, planName, customerName, supplierAccount,
               blitzAccountNumber, updatedAt
        FROM services
        WHERE status = 'flagged_for_termination'
          AND (terminationBatchId IS NULL OR terminationBatchId = '')
          AND supplierName = 'Telstra'
        ORDER BY phoneNumber
      `);
      return (rows as any[])[0] as any[];
    }),

  getDiscrepancyReport: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [batch] = await db
        .select()
        .from(terminationBatches)
        .where(eq(terminationBatches.batchId, input.batchId));

      if (!batch) throw new Error(`Batch ${input.batchId} not found`);

      const archivedRows = await db.execute(sql`
        SELECT externalId, phoneNumber, planName, customerName, supplierAccount,
               blitzAccountNumber, archivedAt, terminationNote, monthlyCost
        FROM services
        WHERE terminationBatchId = ${input.batchId}
        ORDER BY phoneNumber
      `);
      const archived = (archivedRows as any[])[0] as any[];

      const notFoundPhones: string[] = batch.discrepancyNotes
        ? batch.discrepancyNotes
            .replace(/^\d+ phone numbers from the termination list were not found in the database: /, "")
            .split(", ")
            .filter(Boolean)
        : [];

      return { batch, archived, notFoundPhones };
    }),
});

// ─── Termination Management Procedures ───────────────────────────────────────
// These support the new Termination Management page: list flagged services
// across all suppliers, bulk update status, and export.

export const terminationManagementRouter = router({

  /**
   * List all services in termination workflow states, optionally filtered by supplier.
   * Returns rich detail for each service to support supplier termination requests.
   */
  listFlagged: protectedProcedure
    .input(z.object({
      supplierName: z.string().optional(),
      status: z.array(z.string()).optional(), // filter by one or more statuses
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const rows = await db.execute(sql`
        SELECT
          s.id,
          s.externalId,
          s.serviceId,
          s.serviceType,
          s.serviceTypeDetail,
          s.serviceCategory,
          s.planName,
          s.status,
          s.supplierName,
          s.supplierAccount,
          s.phoneNumber,
          s.connectionId,
          s.avcId,
          s.locId,
          s.locationAddress,
          s.customerName,
          s.customerExternalId,
          s.monthlyCost,
          s.monthlyRevenue,
          s.technology,
          s.speedTier,
          s.nbnSla,
          s.carbonServiceId,
          s.carbonServiceType,
          s.carbonStatus,
          s.carbonAlias,
          s.aaptServiceId,
          s.aaptProductType,
          s.aaptYourId,
          s.aaptAccessId,
          s.aaptAccountNumber,
          s.blitzAccountNumber,
          s.blitzMroContract,
          s.blitzMroEndDate,
          s.blitzMroEtc,
          s.contractEndDate,
          s.serviceActivationDate,
          s.serviceEndDate,
          s.imei,
          s.simSerialNumber,
          s.deviceName,
          s.deviceType,
          s.userName,
          s.terminationNote,
          s.terminationRequestedAt,
          s.terminationRequestedBy,
          s.terminationConfirmedDate,
          s.terminationBatchId,
          s.archivedAt,
          s.discoveryNotes,
          s.updatedAt,
          c.siteAddress,
          c.contactName,
          c.contactPhone,
          c.contactEmail
        FROM services s
        LEFT JOIN customers c ON s.customerExternalId = c.externalId
        WHERE s.status IN ('flagged_for_termination', 'termination_requested', 'terminated')
          ${input.supplierName ? sql`AND s.supplierName = ${input.supplierName}` : sql``}
          ${input.status && input.status.length > 0 ? sql`AND s.status IN (${sql.join(input.status.map(st => sql`${st}`), sql`, `)})` : sql``}
        ORDER BY s.supplierName, s.supplierAccount, s.customerName, s.phoneNumber
      `);

      return (rows as any[])[0] as any[];
    }),

  /**
   * Get list of distinct suppliers that have services in termination states.
   */
  listSuppliers: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = await db.execute(sql`
        SELECT DISTINCT supplierName, COUNT(*) as serviceCount
        FROM services
        WHERE status IN ('flagged_for_termination', 'termination_requested', 'terminated')
        GROUP BY supplierName
        ORDER BY serviceCount DESC
      `);
      return (rows as any[])[0] as any[];
    }),

  /**
   * Bulk update status for a list of service externalIds.
   * Supports: flagged_for_termination → termination_requested → terminated → archived
   */
  bulkUpdateStatus: protectedProcedure
    .input(z.object({
      externalIds: z.array(z.string()).min(1).max(500),
      newStatus: z.enum(['flagged_for_termination', 'termination_requested', 'terminated', 'archived']),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const userName = ctx.user?.name || ctx.user?.email || "system";
      const now = new Date();
      const noteText = input.note || `Status updated to '${input.newStatus}' by ${userName} on ${now.toISOString().slice(0, 10)}`;

      const updateData: Record<string, any> = {
        status: input.newStatus,
        terminationNote: noteText,
        updatedAt: now,
      };

      if (input.newStatus === 'termination_requested') {
        updateData.terminationRequestedAt = now;
        updateData.terminationRequestedBy = userName;
      }

      if (input.newStatus === 'terminated' || input.newStatus === 'archived') {
        updateData.archivedAt = now;
      }

      await db
        .update(services)
        .set(updateData)
        .where(inArray(services.externalId, input.externalIds));

      return {
        success: true,
        updated: input.externalIds.length,
        newStatus: input.newStatus,
        updatedBy: userName,
      };
    }),

  /**
   * Get summary counts by status and supplier for the dashboard widget.
   */
  getSummary: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = await db.execute(sql`
        SELECT
          supplierName,
          status,
          COUNT(*) as count,
          SUM(monthlyCost) as totalMonthlyCost
        FROM services
        WHERE status IN ('flagged_for_termination', 'termination_requested', 'terminated')
        GROUP BY supplierName, status
        ORDER BY supplierName, status
      `);
      return (rows as any[])[0] as any[];
    }),
});
