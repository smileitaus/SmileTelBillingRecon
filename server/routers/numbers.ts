import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { phoneNumbers, services, customers, supplierSyncLog } from "../../drizzle/schema";
import { eq, and, or, like, desc, sql, isNull } from "drizzle-orm";
import { syncCommsCodeNumbers } from "../suppliers/commscode";
import { syncNetSIPNumbers } from "../suppliers/netsip";
import { syncAllSasBossData } from "../suppliers/sasboss-api";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("1800") && digits.length === 10) {
    return `1800 ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.startsWith("1300") && digits.length === 10) {
    return `1300 ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.startsWith("13") && digits.length === 6) {
    return `13 ${digits.slice(2, 4)} ${digits.slice(4)}`;
  }
  if (digits.startsWith("04") && digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return raw;
}

function classifyNumber(digits: string): string {
  if (digits.startsWith("1800")) return "tollfree";
  if (digits.startsWith("1300") || digits.startsWith("13")) return "local";
  if (digits.startsWith("04")) return "mobile";
  if (digits.startsWith("0")) return "geographic";
  if (digits.startsWith("+")) return "international";
  return "other";
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const numbersRouter = router({
  // List numbers with optional filters — now includes connectionId (VBU ID) from linked service
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      provider: z.string().optional(),
      numberType: z.string().optional(),
      status: z.string().optional(),
      customerExternalId: z.string().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(500).default(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const offset = (input.page - 1) * input.pageSize;

      // Build WHERE conditions — also search connectionId from linked service via subquery
      const conditions: ReturnType<typeof like>[] = [];
      if (input.search) {
        const s = `%${input.search}%`;
        conditions.push(
          or(
            like(phoneNumbers.number, s),
            like(phoneNumbers.numberDisplay, s),
            like(phoneNumbers.customerName, s),
            like(phoneNumbers.servicePlanName, s),
            like(phoneNumbers.providerServiceCode, s),
            // Also search connectionId from the linked service record
            sql`EXISTS (
              SELECT 1 FROM services sv
              WHERE sv.externalId = ${phoneNumbers.serviceExternalId}
              AND sv.connectionId LIKE ${s}
            )`,
          ) as any
        );
      }
      if (input.provider) conditions.push(eq(phoneNumbers.provider, input.provider) as any);
      if (input.numberType) conditions.push(eq(phoneNumbers.numberType, input.numberType) as any);
      if (input.status) conditions.push(eq(phoneNumbers.status, input.status) as any);
      if (input.customerExternalId) conditions.push(eq(phoneNumbers.customerExternalId, input.customerExternalId) as any);

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Join services to pull connectionId (VBU ID) alongside each number
      const [rows, countResult] = await Promise.all([
        db.select({
          // All phone_numbers columns
          id: phoneNumbers.id,
          number: phoneNumbers.number,
          numberDisplay: phoneNumbers.numberDisplay,
          numberType: phoneNumbers.numberType,
          provider: phoneNumbers.provider,
          status: phoneNumbers.status,
          customerExternalId: phoneNumbers.customerExternalId,
          customerName: phoneNumbers.customerName,
          serviceExternalId: phoneNumbers.serviceExternalId,
          servicePlanName: phoneNumbers.servicePlanName,
          monthlyCost: phoneNumbers.monthlyCost,
          monthlyRevenue: phoneNumbers.monthlyRevenue,
          providerServiceCode: phoneNumbers.providerServiceCode,
          notes: phoneNumbers.notes,
          dataSource: phoneNumbers.dataSource,
          lastSyncedAt: phoneNumbers.lastSyncedAt,
          createdAt: phoneNumbers.createdAt,
          updatedAt: phoneNumbers.updatedAt,
          // Joined from services
          connectionId: services.connectionId,
          linkedSupplierName: services.supplierName,
          linkedLocationAddress: services.locationAddress,
        })
          .from(phoneNumbers)
          .leftJoin(services, eq(services.externalId, phoneNumbers.serviceExternalId))
          .where(whereClause)
          .orderBy(phoneNumbers.provider, phoneNumbers.customerName, phoneNumbers.number)
          .limit(input.pageSize)
          .offset(offset),
        db.select({ count: sql<number>`COUNT(*)` }).from(phoneNumbers).where(whereClause),
      ]);

      return {
        numbers: rows,
        total: Number(countResult[0]?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // Summary stats for the header cards
  summary: protectedProcedure.query(async () => {
    const db = await getDb();
      if (!db) throw new Error("DB unavailable");
    const rows = await db.select({
      provider: phoneNumbers.provider,
      numberType: phoneNumbers.numberType,
      status: phoneNumbers.status,
      count: sql<number>`COUNT(*)`,
      totalCost: sql<number>`SUM(monthlyCost)`,
    })
      .from(phoneNumbers)
      .groupBy(phoneNumbers.provider, phoneNumbers.numberType, phoneNumbers.status);

    const total = rows.reduce((s, r) => s + Number(r.count), 0);
    const totalCost = rows.reduce((s, r) => s + Number(r.totalCost ?? 0), 0);
    const byProvider = rows.reduce((acc, r) => {
      if (!acc[r.provider]) acc[r.provider] = { count: 0, cost: 0 };
      acc[r.provider].count += Number(r.count);
      acc[r.provider].cost += Number(r.totalCost ?? 0);
      return acc;
    }, {} as Record<string, { count: number; cost: number }>);
    const byType = rows.reduce((acc, r) => {
      if (!acc[r.numberType]) acc[r.numberType] = 0;
      acc[r.numberType] += Number(r.count);
      return acc;
    }, {} as Record<string, number>);

    const providers = await db.selectDistinct({ provider: phoneNumbers.provider }).from(phoneNumbers);
    const lastSync = await db.select({ lastSyncedAt: phoneNumbers.lastSyncedAt })
      .from(phoneNumbers)
      .orderBy(desc(phoneNumbers.lastSyncedAt))
      .limit(1);

    return {
      total,
      totalCost,
      byProvider,
      byType,
      providers: providers.map(p => p.provider),
      lastSyncedAt: lastSync[0]?.lastSyncedAt ?? null,
    };
  }),

  // Add a single number manually
  add: protectedProcedure
    .input(z.object({
      number: z.string().min(6),
      provider: z.string().min(1),
      customerExternalId: z.string().optional(),
      customerName: z.string().optional(),
      serviceExternalId: z.string().optional(),
      servicePlanName: z.string().optional(),
      monthlyCost: z.number().min(0).default(0),
      monthlyRevenue: z.number().min(0).default(0),
      providerServiceCode: z.string().optional(),
      notes: z.string().optional(),
      status: z.string().default("active"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const digits = input.number.replace(/\D/g, "");
      await db.insert(phoneNumbers).values({
        number: digits,
        numberDisplay: formatNumber(digits),
        numberType: classifyNumber(digits),
        provider: input.provider,
        status: input.status,
        customerExternalId: input.customerExternalId ?? "",
        customerName: input.customerName ?? "",
        serviceExternalId: input.serviceExternalId ?? "",
        servicePlanName: input.servicePlanName ?? "",
        monthlyCost: String(input.monthlyCost),
        monthlyRevenue: String(input.monthlyRevenue),
        providerServiceCode: input.providerServiceCode ?? "",
        notes: input.notes ?? "",
        dataSource: "manual",
        lastSyncedAt: new Date(),
      });
      return { success: true };
    }),

  // Update a number record
  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      customerExternalId: z.string().optional(),
      customerName: z.string().optional(),
      serviceExternalId: z.string().optional(),
      servicePlanName: z.string().optional(),
      monthlyCost: z.number().min(0).optional(),
      monthlyRevenue: z.number().min(0).optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...rest } = input;
      const updates: Record<string, any> = {};
      if (rest.customerExternalId !== undefined) updates.customerExternalId = rest.customerExternalId;
      if (rest.customerName !== undefined) updates.customerName = rest.customerName;
      if (rest.serviceExternalId !== undefined) updates.serviceExternalId = rest.serviceExternalId;
      if (rest.servicePlanName !== undefined) updates.servicePlanName = rest.servicePlanName;
      if (rest.monthlyCost !== undefined) updates.monthlyCost = String(rest.monthlyCost);
      if (rest.monthlyRevenue !== undefined) updates.monthlyRevenue = String(rest.monthlyRevenue);
      if (rest.status !== undefined) updates.status = rest.status;
      if (rest.notes !== undefined) updates.notes = rest.notes;
      await db.update(phoneNumbers).set(updates).where(eq(phoneNumbers.id, id));
      return { success: true };
    }),

  // Delete a number
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(phoneNumbers).where(eq(phoneNumbers.id, input.id));
      return { success: true };
    }),

  // Bulk import numbers (used by sync scripts)
  bulkImport: protectedProcedure
    .input(z.object({
      numbers: z.array(z.object({
        number: z.string(),
        provider: z.string(),
        customerName: z.string().optional(),
        customerExternalId: z.string().optional(),
        serviceExternalId: z.string().optional(),
        servicePlanName: z.string().optional(),
        monthlyCost: z.number().optional(),
        monthlyRevenue: z.number().optional(),
        providerServiceCode: z.string().optional(),
        notes: z.string().optional(),
        dataSource: z.string().optional(),
        status: z.string().optional(),
      })),
      provider: z.string(),
      replaceExisting: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      if (input.replaceExisting) {
        await db.delete(phoneNumbers).where(eq(phoneNumbers.provider, input.provider));
      }

      let inserted = 0;
      let skipped = 0;

      for (const n of input.numbers) {
        const digits = n.number.replace(/\D/g, "");
        if (!digits) { skipped++; continue; }

        // Check if already exists for this provider
        const existing = await db.select({ id: phoneNumbers.id })
          .from(phoneNumbers)
          .where(and(eq(phoneNumbers.number, digits), eq(phoneNumbers.provider, input.provider)))
          .limit(1);

        if (existing.length > 0 && !input.replaceExisting) {
          // Update existing
          await db.update(phoneNumbers).set({
            customerName: n.customerName ?? "",
            customerExternalId: n.customerExternalId ?? "",
            serviceExternalId: n.serviceExternalId ?? "",
            servicePlanName: n.servicePlanName ?? "",
            monthlyCost: String(n.monthlyCost ?? 0),
            monthlyRevenue: String(n.monthlyRevenue ?? 0),
            providerServiceCode: n.providerServiceCode ?? "",
            notes: n.notes ?? "",
            status: n.status ?? "active",
            dataSource: n.dataSource ?? "manual",
            lastSyncedAt: new Date(),
          }).where(eq(phoneNumbers.id, existing[0].id));
          skipped++;
        } else {
          await db.insert(phoneNumbers).values({
            number: digits,
            numberDisplay: formatNumber(digits),
            numberType: classifyNumber(digits),
            provider: input.provider,
            status: n.status ?? "active",
            customerExternalId: n.customerExternalId ?? "",
            customerName: n.customerName ?? "",
            serviceExternalId: n.serviceExternalId ?? "",
            servicePlanName: n.servicePlanName ?? "",
            monthlyCost: String(n.monthlyCost ?? 0),
            monthlyRevenue: String(n.monthlyRevenue ?? 0),
            providerServiceCode: n.providerServiceCode ?? "",
            notes: n.notes ?? "",
            dataSource: n.dataSource ?? "manual",
            lastSyncedAt: new Date(),
          });
          inserted++;
        }
      }

      return { success: true, inserted, skipped };
    }),

  // Sync CommsCode numbers by scraping the portal
  syncCommsCode: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const { numbers, pagesScraped, error } = await syncCommsCodeNumbers();

    if (error) throw new Error(error);
    if (numbers.length === 0) return { success: true, inserted: 0, updated: 0, pagesScraped };

    let inserted = 0;
    let updated = 0;

    for (const n of numbers) {
      const digits = n.number.replace(/\D/g, "");
      if (!digits) continue;

      const existing = await db.select({ id: phoneNumbers.id })
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.number, digits), eq(phoneNumbers.provider, "CommsCode")))
        .limit(1);

      if (existing.length > 0) {
        await db.update(phoneNumbers).set({
          customerName: n.customerName,
          providerServiceCode: n.providerServiceCode,
          notes: n.notes,
          status: n.status,
          dataSource: "commsCode",
          lastSyncedAt: new Date(),
        }).where(eq(phoneNumbers.id, existing[0].id));
        updated++;
      } else {
        await db.insert(phoneNumbers).values({
          number: digits,
          numberDisplay: formatNumber(digits),
          numberType: classifyNumber(digits),
          provider: "CommsCode",
          status: n.status,
          customerExternalId: "",
          customerName: n.customerName,
          serviceExternalId: "",
          servicePlanName: "",
          monthlyCost: "0",
          monthlyRevenue: "0",
          providerServiceCode: n.providerServiceCode,
          notes: n.notes,
          dataSource: "commsCode",
          lastSyncedAt: new Date(),
        });
        inserted++;
      }
    }

    // After sync, attempt to auto-link unlinked numbers to services by customer name
    const unlinked = await db.select({
      id: phoneNumbers.id,
      customerName: phoneNumbers.customerName,
    })
      .from(phoneNumbers)
      .where(
        and(
          eq(phoneNumbers.provider, "CommsCode"),
          or(isNull(phoneNumbers.serviceExternalId), eq(phoneNumbers.serviceExternalId, ""))
        )
      );

    let linked = 0;
    for (const num of unlinked) {
      if (!num.customerName) continue;
      const match = await db.select({
        externalId: services.externalId,
        customerExternalId: services.customerExternalId,
        customerName: services.customerName,
        monthlyCost: services.monthlyCost,
        monthlyRevenue: services.monthlyRevenue,
      })
        .from(services)
        .where(like(services.customerName, `%${num.customerName}%`))
        .limit(1);

      if (match.length > 0) {
        await db.update(phoneNumbers).set({
          serviceExternalId: match[0].externalId,
          customerExternalId: match[0].customerExternalId ?? "",
          monthlyCost: String(match[0].monthlyCost ?? 0),
          monthlyRevenue: String(match[0].monthlyRevenue ?? 0),
        }).where(eq(phoneNumbers.id, num.id));
        linked++;
      }
    }

    // Log to supplier_sync_log
    await db.insert(supplierSyncLog).values({
      integration: 'commsCode',
      status: 'success',
      summary: `CommsCode sync: ${inserted} inserted, ${updated} updated, ${linked} linked`,
      servicesFound: numbers.length,
      servicesCreated: inserted,
      servicesUpdated: updated,
      recordsProcessed: numbers.length,
      triggeredBy: 'manual',
      completedAt: new Date(),
    });
    return { success: true, inserted, updated, linked, pagesScraped };
  }),

  // Sync NetSIP / Over the Wire numbers by fetching from the OTW portal
  syncNetSIP: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const { numbers, source, error } = await syncNetSIPNumbers();

    if (error) throw new Error(`NetSIP sync failed (${source}): ${error}`);
    if (numbers.length === 0) return { success: true, inserted: 0, updated: 0, linked: 0, source };

    let inserted = 0;
    let updated = 0;

    for (const n of numbers) {
      const digits = n.number.replace(/\D/g, "");
      if (!digits) continue;

      const existing = await db.select({ id: phoneNumbers.id })
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.number, digits), eq(phoneNumbers.provider, "NetSIP")))
        .limit(1);

      if (existing.length > 0) {
        await db.update(phoneNumbers).set({
          customerName: n.customerName,
          providerServiceCode: n.sipId,
          notes: n.notes,
          status: n.status,
          dataSource: "netsip",
          lastSyncedAt: new Date(),
        }).where(eq(phoneNumbers.id, existing[0].id));
        updated++;
      } else {
        await db.insert(phoneNumbers).values({
          number: digits,
          numberDisplay: formatNumber(digits),
          numberType: classifyNumber(digits),
          provider: "NetSIP",
          status: n.status,
          customerExternalId: "",
          customerName: n.customerName,
          serviceExternalId: "",
          servicePlanName: "",
          monthlyCost: "0",
          monthlyRevenue: "0",
          providerServiceCode: n.sipId,
          notes: n.notes,
          dataSource: "netsip",
          lastSyncedAt: new Date(),
        });
        inserted++;
      }
    }

    // After sync, attempt to auto-link unlinked NetSIP numbers to services by customer name
    const unlinked = await db.select({
      id: phoneNumbers.id,
      customerName: phoneNumbers.customerName,
    })
      .from(phoneNumbers)
      .where(
        and(
          eq(phoneNumbers.provider, "NetSIP"),
          or(isNull(phoneNumbers.serviceExternalId), eq(phoneNumbers.serviceExternalId, ""))
        )
      );

    let linked = 0;
    for (const num of unlinked) {
      if (!num.customerName || num.customerName === "Smile IT") continue;
      const match = await db.select({
        externalId: services.externalId,
        customerExternalId: services.customerExternalId,
        customerName: services.customerName,
        monthlyCost: services.monthlyCost,
        monthlyRevenue: services.monthlyRevenue,
      })
        .from(services)
        .where(like(services.customerName, `%${num.customerName}%`))
        .limit(1);

      if (match.length > 0) {
        await db.update(phoneNumbers).set({
          serviceExternalId: match[0].externalId,
          customerExternalId: match[0].customerExternalId ?? "",
          monthlyCost: String(match[0].monthlyCost ?? 0),
          monthlyRevenue: String(match[0].monthlyRevenue ?? 0),
        }).where(eq(phoneNumbers.id, num.id));
        linked++;
      }
    }

    // Log to supplier_sync_log
    await db.insert(supplierSyncLog).values({
      integration: 'netSip',
      status: 'success',
      summary: `NetSIP sync: ${inserted} inserted, ${updated} updated, ${linked} linked (source: ${source})`,
      servicesFound: numbers.length,
      servicesCreated: inserted,
      servicesUpdated: updated,
      recordsProcessed: numbers.length,
      triggeredBy: 'manual',
      completedAt: new Date(),
    });
    return { success: true, inserted, updated, linked, source };
  }),

  // Auto-link unlinked numbers to services by customer name (all providers)
  autoLinkByCustomer: protectedProcedure
    .input(z.object({ provider: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const conditions: any[] = [
        or(isNull(phoneNumbers.serviceExternalId), eq(phoneNumbers.serviceExternalId, "")),
      ];
      if (input.provider) conditions.push(eq(phoneNumbers.provider, input.provider));

      const unlinked = await db.select({
        id: phoneNumbers.id,
        customerName: phoneNumbers.customerName,
        provider: phoneNumbers.provider,
      })
        .from(phoneNumbers)
        .where(and(...conditions));

      let linked = 0;
      let skipped = 0;

      for (const num of unlinked) {
        if (!num.customerName || num.customerName === "Smile IT") { skipped++; continue; }
        const match = await db.select({
          externalId: services.externalId,
          customerExternalId: services.customerExternalId,
          customerName: services.customerName,
          monthlyCost: services.monthlyCost,
          monthlyRevenue: services.monthlyRevenue,
        })
          .from(services)
          .where(like(services.customerName, `%${num.customerName.split(" ")[0]}%`))
          .limit(1);

        if (match.length > 0) {
          await db.update(phoneNumbers).set({
            serviceExternalId: match[0].externalId,
            customerExternalId: match[0].customerExternalId ?? "",
            monthlyCost: String(match[0].monthlyCost ?? 0),
            monthlyRevenue: String(match[0].monthlyRevenue ?? 0),
          }).where(eq(phoneNumbers.id, num.id));
          linked++;
        } else {
          skipped++;
        }
      }

      return { success: true, linked, skipped, total: unlinked.length };
    }),

  // Sync Channel Haus numbers from existing services/billing_items data
  syncChannelHaus: protectedProcedure.mutation(async () => {
    const db = await getDb();
      if (!db) throw new Error("DB unavailable");

    // Extract numbers from Channel Haus services that have a phoneNumber field
    const chServices = await db.select({
      externalId: services.externalId,
      planName: services.planName,
      phoneNumber: services.phoneNumber,
      customerName: services.customerName,
      customerExternalId: services.customerExternalId,
      monthlyCost: services.monthlyCost,
      monthlyRevenue: services.monthlyRevenue,
    })
      .from(services)
      .where(
        and(
          eq(services.supplierName, "ChannelHaus"),
          sql`${services.phoneNumber} != '' AND ${services.phoneNumber} IS NOT NULL`
        )
      );

    let inserted = 0;
    let skipped = 0;

    for (const svc of chServices) {
      const digits = (svc.phoneNumber ?? "").replace(/\D/g, "");
      if (!digits || digits.length < 6) { skipped++; continue; }

      const existing = await db.select({ id: phoneNumbers.id })
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.number, digits), eq(phoneNumbers.provider, "Channel Haus")))
        .limit(1);

      if (existing.length > 0) {
        await db.update(phoneNumbers).set({
          customerName: svc.customerName ?? "",
          customerExternalId: svc.customerExternalId ?? "",
          serviceExternalId: svc.externalId,
          servicePlanName: svc.planName ?? "",
          monthlyCost: String(svc.monthlyCost ?? 0),
          monthlyRevenue: String(svc.monthlyRevenue ?? 0),
          providerServiceCode: svc.planName ?? "",
          dataSource: "channelhaus_services",
          lastSyncedAt: new Date(),
        }).where(eq(phoneNumbers.id, existing[0].id));
        skipped++;
      } else {
        await db.insert(phoneNumbers).values({
          number: digits,
          numberDisplay: formatNumber(digits),
          numberType: classifyNumber(digits),
          provider: "Channel Haus",
          status: "active",
          customerExternalId: svc.customerExternalId ?? "",
          customerName: svc.customerName ?? "",
          serviceExternalId: svc.externalId,
          servicePlanName: svc.planName ?? "",
          monthlyCost: String(svc.monthlyCost ?? 0),
          monthlyRevenue: String(svc.monthlyRevenue ?? 0),
          providerServiceCode: svc.planName ?? "",
          dataSource: "channelhaus_services",
          lastSyncedAt: new Date(),
        });
        inserted++;
      }
    }

    // Log to supplier_sync_log
    await db.insert(supplierSyncLog).values({
      integration: 'channelHaus',
      status: 'success',
      summary: `Channel Haus sync: ${inserted} inserted, ${skipped} skipped`,
      servicesFound: chServices.length,
      servicesCreated: inserted,
      servicesUpdated: skipped,
      recordsProcessed: chServices.length,
      triggeredBy: 'manual',
      completedAt: new Date(),
    });
    return { success: true, inserted, skipped, total: chServices.length };
  }),

  // ── Sync SasBoss / Access4 via REST API ────────────────────────────────────
  syncSasBoss: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const now = Date.now();

    // Call the SasBoss API (requires IP whitelist + API credentials)
    const result = await syncAllSasBossData();

    if (result.errors.length > 0 && result.enterprises.length === 0 &&
        result.serviceAccounts.length === 0 && result.didNumbers.length === 0) {
      throw new Error(`SasBoss API unavailable: ${result.errors.join("; ")}`);
    }

    let enterprisesUpserted = 0;
    let servicesUpserted = 0;
    let didNumbersUpserted = 0;
    let productsUpserted = 0;

    // ── 1. Upsert enterprises ──────────────────────────────────────────────
    for (const ent of result.enterprises) {
      await db.execute(sql`
        INSERT INTO sasboss_enterprises
          (enterprise_id, enterprise_name, external_service_ref_id, external_billing_ref_id,
           default_domain, call_pack_product_id, created_at, updated_at)
        VALUES
          (${ent.enterpriseId}, ${ent.enterpriseName}, ${ent.externalServiceRefId},
           ${ent.externalBillingRefId}, ${ent.defaultDomain}, ${ent.callPackProductId},
           ${now}, ${now})
        ON DUPLICATE KEY UPDATE
          enterprise_name = VALUES(enterprise_name),
          external_service_ref_id = VALUES(external_service_ref_id),
          external_billing_ref_id = VALUES(external_billing_ref_id),
          default_domain = VALUES(default_domain),
          call_pack_product_id = VALUES(call_pack_product_id),
          updated_at = ${now}
      `);
      enterprisesUpserted++;
    }

    // ── 2. Upsert service accounts ─────────────────────────────────────────
    for (const svc of result.serviceAccounts) {
      await db.execute(sql`
        INSERT INTO sasboss_services
          (service_id, enterprise_id, enterprise_name, service_ref_id, product_id,
           product_name, product_type, monthly_recurring, status, created_at, updated_at)
        VALUES
          (${svc.serviceId}, ${svc.enterpriseId}, ${svc.enterpriseName}, ${svc.serviceRefId},
           ${svc.productId}, ${svc.productName}, ${svc.productType}, ${svc.monthlyRecurring},
           ${svc.status}, ${now}, ${now})
        ON DUPLICATE KEY UPDATE
          enterprise_name = VALUES(enterprise_name),
          service_ref_id = VALUES(service_ref_id),
          product_name = VALUES(product_name),
          monthly_recurring = VALUES(monthly_recurring),
          status = VALUES(status),
          updated_at = ${now}
      `);
      servicesUpserted++;
    }

    // ── 3. Upsert DID numbers ──────────────────────────────────────────────
    for (const did of result.didNumbers) {
      const digits = did.didNumber.replace(/\D/g, "");
      if (!digits || digits.length < 6) continue;

      // Upsert into sasboss_did_inventory
      await db.execute(sql`
        INSERT INTO sasboss_did_inventory
          (did_number, enterprise_id, enterprise_name, service_ref_id,
           group_id, group_name, status, number_type, created_at, updated_at)
        VALUES
          (${digits}, ${did.enterpriseId}, ${did.enterpriseName}, ${did.serviceRefId},
           ${did.groupId}, ${did.groupName}, ${did.status}, ${did.numberType}, ${now}, ${now})
        ON DUPLICATE KEY UPDATE
          enterprise_id = VALUES(enterprise_id),
          enterprise_name = VALUES(enterprise_name),
          service_ref_id = VALUES(service_ref_id),
          status = VALUES(status),
          updated_at = ${now}
      `);
      didNumbersUpserted++;

      // Also upsert into phone_numbers table
      const existingPn = await db.select({ id: phoneNumbers.id })
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.number, digits), eq(phoneNumbers.provider, "SasBoss")))
        .limit(1);

      const pnData = {
        number: digits,
        numberDisplay: formatNumber(digits),
        numberType: classifyNumber(digits),
        provider: "SasBoss" as const,
        status: did.status === "active" ? "active" as const : "terminated" as const,
        customerName: did.enterpriseName,
        providerServiceCode: did.serviceRefId || digits,
        notes: `SasBoss DID (Enterprise ${did.enterpriseId})`,
        dataSource: "sasboss_api",
        lastSyncedAt: new Date(),
      };

      if (existingPn.length > 0) {
        await db.update(phoneNumbers).set(pnData).where(eq(phoneNumbers.id, existingPn[0].id));
      } else {
        await db.insert(phoneNumbers).values(pnData);
      }
    }

    // ── 4. Upsert products / pricebook ────────────────────────────────────
    for (const prod of result.products) {
      await db.execute(sql`
        INSERT INTO sasboss_pricebook
          (product_id, product_type, product_name, item_type, charge_frequency,
           wholesale_price, rrp_price, nfr_price, gst_rate, product_status,
           is_legacy, integration_ref_id, created_at, updated_at)
        VALUES
          (${prod.productId}, ${prod.productType}, ${prod.productName}, ${prod.itemType},
           ${prod.chargeFrequency}, ${prod.chargeRecurringFee}, ${prod.rrpRecurringFee},
           ${prod.nfrRecurringFee}, ${prod.chargeGstRate}, ${prod.productStatus},
           ${prod.isLegacy}, ${prod.integrationRefId}, ${now}, ${now})
        ON DUPLICATE KEY UPDATE
          product_name = VALUES(product_name),
          wholesale_price = VALUES(wholesale_price),
          rrp_price = VALUES(rrp_price),
          nfr_price = VALUES(nfr_price),
          product_status = VALUES(product_status),
          updated_at = ${now}
      `);
      productsUpserted++;
    }

    // Log to supplier_sync_log
    await db.insert(supplierSyncLog).values({
      integration: 'sasBoss',
      status: result.errors.length > 0 ? 'partial' : 'success',
      summary: `SasBoss sync: ${enterprisesUpserted} enterprises, ${servicesUpserted} services, ${didNumbersUpserted} DIDs, ${productsUpserted} products${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`,
      servicesFound: result.serviceAccounts.length,
      servicesCreated: servicesUpserted,
      servicesUpdated: 0,
      recordsProcessed: result.enterprises.length + result.serviceAccounts.length + result.didNumbers.length,
      errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
      triggeredBy: 'manual',
      completedAt: new Date(),
    });
    return {
      success: true,
      enterprisesUpserted,
      servicesUpserted,
      didNumbersUpserted,
      productsUpserted,
      apiErrors: result.errors,
    };
  }),
});
