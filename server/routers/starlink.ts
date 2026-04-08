/**
 * Starlink tRPC Router — Full API Coverage
 *
 * Procedures:
 *  starlink.status               → credential check + summary counts
 *  starlink.listAccounts         → all synced accounts with match/usage status
 *  starlink.syncAll              → pull latest from Starlink API (accounts, lines, terminals, usage)
 *  starlink.runAutoMatch         → fuzzy match all unmatched accounts
 *  starlink.manualMatch          → manually assign customer to account
 *  starlink.unmatch              → remove customer assignment
 *  starlink.previewMatch         → preview fuzzy match candidates
 *
 *  starlink.serviceLines.list    → service lines for an account
 *  starlink.serviceLines.get     → single service line detail
 *  starlink.serviceLines.deactivate   → deactivate a service line
 *  starlink.serviceLines.rename       → update nickname
 *  starlink.serviceLines.topUp        → one-time data top-up
 *  starlink.serviceLines.setRecurring → set recurring data blocks
 *  starlink.serviceLines.optIn        → opt in
 *  starlink.serviceLines.optOut       → opt out
 *  starlink.serviceLines.setPublicIp  → enable/disable public IP
 *  starlink.serviceLines.changeProduct → change plan/product
 *  starlink.serviceLines.availableProducts → list available products
 *  starlink.serviceLines.billingCycles → all billing cycle usage
 *  starlink.serviceLines.partialPeriods → current partial period usage
 *
 *  starlink.terminals.list       → terminals for an account
 *  starlink.terminals.reboot     → reboot a terminal
 *  starlink.terminals.addToServiceLine    → assign terminal to service line
 *  starlink.terminals.removeFromServiceLine → unassign terminal
 *  starlink.terminals.removeFromAccount   → remove terminal from account
 *
 *  starlink.addresses.list       → addresses for an account
 *  starlink.addresses.checkCapacity → check service availability at address
 *
 *  starlink.routers.configs      → list router configs
 *  starlink.routers.reboot       → reboot a router
 *
 *  starlink.usage.byAccount      → aggregated usage for an account/period
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  starlinkAccounts,
  starlinkServiceLines,
  starlinkTerminals,
  starlinkUsage,
  starlinkInvoices,
  starlinkInvoiceLines,
  customers,
} from "../../drizzle/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import {
  isStarlinkConfigured,
  getCredentials,
  getStarlinkToken,
  getDefaultToken,
  getConfiguredAccountNumbers,
  listAccounts,
  listServiceLines,
  getServiceLine,
  deactivateServiceLine,
  updateServiceLineNickname,
  addTopUpData,
  setRecurringDataBlocks,
  optInServiceLine,
  optOutServiceLine,
  setServiceLinePublicIp,
  updateServiceLineProduct,
  getAvailableProducts,
  getServiceLineBillingCycles,
  getServiceLinePartialPeriods,
  getAccountDataUsage,
  listTerminals,
  rebootTerminal,
  addTerminalToServiceLine,
  removeTerminalFromServiceLine,
  removeTerminalFromAccount,
  listAddresses,
  checkAddressCapacity,
  listRouterConfigs,
  rebootRouter,
  formatAddress,
  bytesToGb,
  getServiceLineUsage,
} from "../starlink/apiClient";
import { findBestCustomerMatch, runAutoMatch } from "../starlink/fuzzyMatch";

// ─── Helper: get token or throw ───────────────────────────────────────────────

async function requireToken(): Promise<string> {
  const creds = getCredentials();
  if (!creds) throw new Error("Starlink credentials not configured. Please add STARLINK_CLIENT_ID and STARLINK_CLIENT_SECRET via the Secrets panel.");
  return getStarlinkToken(creds.clientId, creds.clientSecret);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const starlinkRouter = router({

  // ── Status & Summary ────────────────────────────────────────────────────────

  status: protectedProcedure.query(async () => {
    const configured = isStarlinkConfigured();
    const db = await getDb();
    if (!db) return { configured, accountCount: 0, terminalCount: 0, matchedCount: 0, serviceLineCount: 0 };

    const [acctRows, termRows, slRows] = await Promise.all([
      db.select({ id: starlinkAccounts.id, customerExternalId: starlinkAccounts.customerExternalId }).from(starlinkAccounts),
      db.select({ id: starlinkTerminals.id }).from(starlinkTerminals),
      db.select({ id: starlinkServiceLines.id }).from(starlinkServiceLines),
    ]);

    return {
      configured,
      accountCount: acctRows.length,
      terminalCount: termRows.length,
      serviceLineCount: slRows.length,
      matchedCount: acctRows.filter((a) => a.customerExternalId).length,
    };
  }),

  // ── Accounts ────────────────────────────────────────────────────────────────

  listAccounts: protectedProcedure
    .input(z.object({
      matchStatus: z.enum(["all", "matched", "unmatched", "suggested"]).default("all"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(starlinkAccounts).orderBy(desc(starlinkAccounts.updatedAt));
      return rows.filter((r) => {
        if (input.matchStatus === "matched") return !!r.customerExternalId;
        if (input.matchStatus === "unmatched") return !r.customerExternalId && (!r.matchConfidence || r.matchConfidence < 60);
        if (input.matchStatus === "suggested") return !r.customerExternalId && r.matchConfidence !== null && r.matchConfidence !== undefined && r.matchConfidence >= 60 && r.matchConfidence < 85;
        return true;
      });
    }),

  syncAll: protectedProcedure
    .input(z.object({
      billingPeriod: z.string().default(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      }),
    }))
    .mutation(async ({ input }) => {
      const creds = getCredentials();
      if (!creds) return { success: false, error: "Starlink credentials not configured.", accountsSynced: 0, terminalsSynced: 0, serviceLinesSynced: 0, usageRecordsSynced: 0 };

      const db = await getDb();
      if (!db) return { success: false, error: "Database unavailable", accountsSynced: 0, terminalsSynced: 0, serviceLinesSynced: 0, usageRecordsSynced: 0 };

      let token: string;
      try {
        token = await getStarlinkToken(creds.clientId, creds.clientSecret);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Auth failed: ${msg}`, accountsSynced: 0, terminalsSynced: 0, serviceLinesSynced: 0, usageRecordsSynced: 0 };
      }

      const configuredAccounts = getConfiguredAccountNumbers();
      let apiAccounts = await listAccounts(token);
      if (configuredAccounts.length > 0) {
        apiAccounts = apiAccounts.filter((a) => configuredAccounts.includes(a.accountNumber));
      }

      let accountsSynced = 0, terminalsSynced = 0, serviceLinesSynced = 0, usageRecordsSynced = 0;

      for (const apiAcct of apiAccounts) {
        const address = formatAddress(apiAcct.defaultServiceAddress);

        // Upsert account
        const existing = await db.select({ id: starlinkAccounts.id }).from(starlinkAccounts)
          .where(eq(starlinkAccounts.accountNumber, apiAcct.accountNumber)).limit(1);

        if (existing.length > 0) {
          await db.update(starlinkAccounts).set({ nickname: apiAcct.accountName, serviceAddress: address, lastSyncedAt: new Date() })
            .where(eq(starlinkAccounts.accountNumber, apiAcct.accountNumber));
        } else {
          await db.insert(starlinkAccounts).values({ accountNumber: apiAcct.accountNumber, nickname: apiAcct.accountName, serviceAddress: address, status: "active", lastSyncedAt: new Date() });
        }
        accountsSynced++;

        // Sync service lines
        const serviceLines = await listServiceLines(token, apiAcct.accountNumber);
        for (const sl of serviceLines) {
          const slExisting = await db.select({ id: starlinkServiceLines.id }).from(starlinkServiceLines)
            .where(eq(starlinkServiceLines.serviceLineNumber, sl.serviceLineNumber)).limit(1);

          const slData = {
            nickname: sl.nickname,
            status: sl.active ? "active" : "inactive",
            productReferenceId: sl.productReferenceId,
            addressReferenceId: sl.addressReferenceId,
            publicIp: sl.publicIp,
            lastSyncedAt: new Date(),
          };

          if (slExisting.length > 0) {
            await db.update(starlinkServiceLines).set(slData).where(eq(starlinkServiceLines.serviceLineNumber, sl.serviceLineNumber));
          } else {
            await db.insert(starlinkServiceLines).values({ serviceLineNumber: sl.serviceLineNumber, accountNumber: sl.accountNumber, ...slData });
          }
          serviceLinesSynced++;

          // Sync usage
          const usage = await getServiceLineUsage(token, apiAcct.accountNumber, sl.serviceLineNumber, input.billingPeriod);
          if (usage) {
            const priorityGb = bytesToGb((usage.priorityDownloadBytesUsed ?? 0) + (usage.priorityUploadBytesUsed ?? 0));
            const standardGb = bytesToGb((usage.standardDownloadBytesUsed ?? 0) + (usage.standardUploadBytesUsed ?? 0));
            const mobileGb = bytesToGb((usage.mobileDownloadBytesUsed ?? 0) + (usage.mobileUploadBytesUsed ?? 0));
            const overageGb = bytesToGb((usage.overageDownloadBytesUsed ?? 0) + (usage.overageUploadBytesUsed ?? 0));
            const totalGb = priorityGb + standardGb + mobileGb;

            const usageExisting = await db.select({ id: starlinkUsage.id }).from(starlinkUsage)
              .where(and(eq(starlinkUsage.serviceLineNumber, sl.serviceLineNumber), eq(starlinkUsage.billingPeriod, input.billingPeriod))).limit(1);

            const usageData = { priorityGbUsed: String(priorityGb), standardGbUsed: String(standardGb), mobileGbUsed: String(mobileGb), totalGbUsed: String(totalGb), overageGbUsed: String(overageGb) };

            if (usageExisting.length > 0) {
              await db.update(starlinkUsage).set(usageData).where(eq(starlinkUsage.id, usageExisting[0].id));
            } else {
              await db.insert(starlinkUsage).values({ serviceLineNumber: sl.serviceLineNumber, accountNumber: apiAcct.accountNumber, billingPeriod: input.billingPeriod, ...usageData });
            }
            usageRecordsSynced++;
          }
        }

        // Sync terminals
        const terminals = await listTerminals(token, apiAcct.accountNumber);
        for (const t of terminals) {
          const deviceId = t.deviceId || t.userTerminalId;
          if (!deviceId) continue;

          const tExisting = await db.select({ id: starlinkTerminals.id }).from(starlinkTerminals)
            .where(eq(starlinkTerminals.deviceId, deviceId)).limit(1);

          const termData = {
            userTerminalId: t.userTerminalId,
            accountNumber: t.accountNumber,
            serviceLineNumber: t.serviceLineNumber,
            kitSerialNumber: t.kitSerialNumber,
            dishSerialNumber: t.dishSerialNumber,
            online: t.online ? 1 : 0,
            signalQuality: t.signalQuality,
            downlinkThroughputMbps: t.downlinkThroughputMbps ? String(t.downlinkThroughputMbps) : null,
            uplinkThroughputMbps: t.uplinkThroughputMbps ? String(t.uplinkThroughputMbps) : null,
            lastSeenAt: t.lastSeenAt ? new Date(t.lastSeenAt) : null,
            lastSyncedAt: new Date(),
          };

          if (tExisting.length > 0) {
            await db.update(starlinkTerminals).set(termData).where(eq(starlinkTerminals.deviceId, deviceId));
          } else {
            await db.insert(starlinkTerminals).values({ deviceId, ...termData });
          }
          terminalsSynced++;
        }
      }

      return { success: true, accountsSynced, terminalsSynced, serviceLinesSynced, usageRecordsSynced, error: null };
    }),

  runAutoMatch: protectedProcedure.mutation(async () => runAutoMatch()),

  manualMatch: protectedProcedure
    .input(z.object({ accountNumber: z.string(), customerExternalId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [cust] = await db.select({ name: customers.name }).from(customers).where(eq(customers.externalId, input.customerExternalId)).limit(1);
      if (!cust) throw new Error("Customer not found");
      await db.update(starlinkAccounts).set({ customerExternalId: input.customerExternalId, customerName: cust.name, matchConfidence: 100, matchMethod: "manual", matchedAt: new Date() })
        .where(eq(starlinkAccounts.accountNumber, input.accountNumber));
      return { success: true };
    }),

  unmatch: protectedProcedure
    .input(z.object({ accountNumber: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(starlinkAccounts).set({ customerExternalId: null, customerName: null, matchConfidence: null, matchMethod: null, matchedAt: null })
        .where(eq(starlinkAccounts.accountNumber, input.accountNumber));
      return { success: true };
    }),

  previewMatch: protectedProcedure
    .input(z.object({ accountNumber: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [acct] = await db.select().from(starlinkAccounts).where(eq(starlinkAccounts.accountNumber, input.accountNumber)).limit(1);
      if (!acct) return [];
      const match = await findBestCustomerMatch(acct.nickname || acct.accountNumber, acct.serviceAddress || "");
      return match ? [match] : [];
    }),

  // ── Service Lines ────────────────────────────────────────────────────────────

  serviceLines: router({
    list: protectedProcedure
      .input(z.object({ accountNumber: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(starlinkServiceLines).where(eq(starlinkServiceLines.accountNumber, input.accountNumber)).orderBy(desc(starlinkServiceLines.updatedAt));
      }),

    get: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string() }))
      .query(async ({ input }) => {
        const token = await requireToken();
        return getServiceLine(token, input.accountNumber, input.serviceLineNumber);
      }),

    deactivate: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await deactivateServiceLine(token, input.accountNumber, input.serviceLineNumber);
        // Update local DB
        const db = await getDb();
        if (db) await db.update(starlinkServiceLines).set({ status: "inactive" }).where(eq(starlinkServiceLines.serviceLineNumber, input.serviceLineNumber));
        return { success: true };
      }),

    rename: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string(), nickname: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await updateServiceLineNickname(token, input.accountNumber, input.serviceLineNumber, input.nickname);
        const db = await getDb();
        if (db) await db.update(starlinkServiceLines).set({ nickname: input.nickname }).where(eq(starlinkServiceLines.serviceLineNumber, input.serviceLineNumber));
        return { success: true };
      }),

    topUp: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string(), dataBlockType: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await addTopUpData(token, input.accountNumber, input.serviceLineNumber, input.dataBlockType);
        return { success: true };
      }),

    setRecurring: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string(), recurringBlocks: z.number().int().min(0) }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await setRecurringDataBlocks(token, input.accountNumber, input.serviceLineNumber, input.recurringBlocks);
        return { success: true };
      }),

    optIn: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await optInServiceLine(token, input.accountNumber, input.serviceLineNumber);
        return { success: true };
      }),

    optOut: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await optOutServiceLine(token, input.accountNumber, input.serviceLineNumber);
        return { success: true };
      }),

    setPublicIp: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string(), enable: z.boolean() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await setServiceLinePublicIp(token, input.accountNumber, input.serviceLineNumber, input.enable);
        // publicIp not stored in local schema — live API only
        return { success: true };
      }),

    changeProduct: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string(), productReferenceId: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await updateServiceLineProduct(token, input.accountNumber, input.serviceLineNumber, input.productReferenceId);
        const db = await getDb();
        if (db) await db.update(starlinkServiceLines).set({ productReferenceId: input.productReferenceId }).where(eq(starlinkServiceLines.serviceLineNumber, input.serviceLineNumber));
        return { success: true };
      }),

    availableProducts: protectedProcedure
      .input(z.object({ accountNumber: z.string() }))
      .query(async ({ input }) => {
        const token = await requireToken();
        return getAvailableProducts(token, input.accountNumber);
      }),

    billingCycles: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string() }))
      .query(async ({ input }) => {
        const token = await requireToken();
        const cycles = await getServiceLineBillingCycles(token, input.accountNumber, input.serviceLineNumber);
        return cycles.map((c) => ({
          ...c,
          priorityGb: bytesToGb((c.priorityDownloadBytesUsed ?? 0) + (c.priorityUploadBytesUsed ?? 0)),
          standardGb: bytesToGb((c.standardDownloadBytesUsed ?? 0) + (c.standardUploadBytesUsed ?? 0)),
          mobileGb: bytesToGb((c.mobileDownloadBytesUsed ?? 0) + (c.mobileUploadBytesUsed ?? 0)),
          overageGb: bytesToGb((c.overageDownloadBytesUsed ?? 0) + (c.overageUploadBytesUsed ?? 0)),
          totalGb: bytesToGb((c.totalDownloadBytesUsed ?? 0) + (c.totalUploadBytesUsed ?? 0)),
        }));
      }),

    partialPeriods: protectedProcedure
      .input(z.object({ accountNumber: z.string(), serviceLineNumber: z.string() }))
      .query(async ({ input }) => {
        const token = await requireToken();
        const periods = await getServiceLinePartialPeriods(token, input.accountNumber, input.serviceLineNumber);
        return periods.map((p) => ({
          ...p,
          priorityGb: bytesToGb((p.priorityDownloadBytesUsed ?? 0) + (p.priorityUploadBytesUsed ?? 0)),
          standardGb: bytesToGb((p.standardDownloadBytesUsed ?? 0) + (p.standardUploadBytesUsed ?? 0)),
          mobileGb: bytesToGb((p.mobileDownloadBytesUsed ?? 0) + (p.mobileUploadBytesUsed ?? 0)),
        }));
      }),
  }),

  // ── Terminals ────────────────────────────────────────────────────────────────

  terminals: router({
    list: protectedProcedure
      .input(z.object({ accountNumber: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(starlinkTerminals).where(eq(starlinkTerminals.accountNumber, input.accountNumber)).orderBy(desc(starlinkTerminals.updatedAt));
      }),

    reboot: protectedProcedure
      .input(z.object({ accountNumber: z.string(), deviceId: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await rebootTerminal(token, input.accountNumber, input.deviceId);
        return { success: true };
      }),

    addToServiceLine: protectedProcedure
      .input(z.object({ accountNumber: z.string(), userTerminalId: z.string(), serviceLineNumber: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await addTerminalToServiceLine(token, input.accountNumber, input.userTerminalId, input.serviceLineNumber);
        const db = await getDb();
        if (db) await db.update(starlinkTerminals).set({ serviceLineNumber: input.serviceLineNumber }).where(eq(starlinkTerminals.userTerminalId, input.userTerminalId));
        return { success: true };
      }),

    removeFromServiceLine: protectedProcedure
      .input(z.object({ accountNumber: z.string(), userTerminalId: z.string(), serviceLineNumber: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await removeTerminalFromServiceLine(token, input.accountNumber, input.userTerminalId, input.serviceLineNumber);
        const db = await getDb();
        if (db) await db.update(starlinkTerminals).set({ serviceLineNumber: null }).where(eq(starlinkTerminals.userTerminalId, input.userTerminalId));
        return { success: true };
      }),

    removeFromAccount: protectedProcedure
      .input(z.object({ accountNumber: z.string(), deviceId: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await removeTerminalFromAccount(token, input.accountNumber, input.deviceId);
        const db = await getDb();
        if (db) await db.update(starlinkTerminals).set({ accountNumber: "" }).where(eq(starlinkTerminals.deviceId, input.deviceId));
        return { success: true };
      }),
  }),

  // ── Addresses ────────────────────────────────────────────────────────────────

  addresses: router({
    list: protectedProcedure
      .input(z.object({ accountNumber: z.string() }))
      .query(async ({ input }) => {
        const token = await requireToken();
        return listAddresses(token, input.accountNumber);
      }),

    checkCapacity: protectedProcedure
      .input(z.object({
        accountNumber: z.string(),
        addressLines: z.array(z.string()),
        locality: z.string().optional(),
        administrativeArea: z.string().optional(),
        postalCode: z.string().optional(),
        countryCode: z.string().default("AU"),
      }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        const { accountNumber, ...addressPayload } = input;
        return checkAddressCapacity(token, accountNumber, addressPayload);
      }),
  }),

  // ── Routers ──────────────────────────────────────────────────────────────────

  routers: router({
    configs: protectedProcedure
      .input(z.object({ accountNumber: z.string() }))
      .query(async ({ input }) => {
        const token = await requireToken();
        return listRouterConfigs(token, input.accountNumber);
      }),

    reboot: protectedProcedure
      .input(z.object({ accountNumber: z.string(), routerId: z.string() }))
      .mutation(async ({ input }) => {
        const token = await requireToken();
        await rebootRouter(token, input.accountNumber, input.routerId);
        return { success: true };
      }),
  }),

  // ── Usage ─────────────────────────────────────────────────────────────────────

  usage: router({
    byAccount: protectedProcedure
      .input(z.object({
        accountNumber: z.string(),
        billingPeriod: z.string().default(() => {
          const now = new Date();
          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        }),
      }))
      .query(async ({ input }) => {
        const token = await requireToken();
        const usages = await getAccountDataUsage(token, input.accountNumber, input.billingPeriod);
        return usages.map((u) => ({
          ...u,
          priorityGb: bytesToGb((u.priorityDownloadBytesUsed ?? 0) + (u.priorityUploadBytesUsed ?? 0)),
          standardGb: bytesToGb((u.standardDownloadBytesUsed ?? 0) + (u.standardUploadBytesUsed ?? 0)),
          mobileGb: bytesToGb((u.mobileDownloadBytesUsed ?? 0) + (u.mobileUploadBytesUsed ?? 0)),
          overageGb: bytesToGb((u.overageDownloadBytesUsed ?? 0) + (u.overageUploadBytesUsed ?? 0)),
          totalGb: bytesToGb((u.totalDownloadBytesUsed ?? 0) + (u.totalUploadBytesUsed ?? 0)),
        }));
      }),

    cached: protectedProcedure
      .input(z.object({ accountNumber: z.string().optional(), billingPeriod: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        let query = db.select().from(starlinkUsage).$dynamic();
        if (input.accountNumber) {
          query = query.where(eq(starlinkUsage.accountNumber, input.accountNumber));
        }
        return query.orderBy(desc(starlinkUsage.billingPeriod));
      }),
  }),

  // ── Invoices ──────────────────────────────────────────────────────────────────
  invoices: router({
    list: protectedProcedure
      .input(z.object({ accountNumber: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        let query = db.select().from(starlinkInvoices).$dynamic();
        if (input.accountNumber) {
          query = query.where(eq(starlinkInvoices.accountNumber, input.accountNumber));
        }
        return query.orderBy(desc(starlinkInvoices.invoiceDate));
      }),

    lines: protectedProcedure
      .input(z.object({ invoiceNumber: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(starlinkInvoiceLines)
          .where(eq(starlinkInvoiceLines.invoiceNumber, input.invoiceNumber))
          .orderBy(starlinkInvoiceLines.id);
      }),

    upsert: protectedProcedure
      .input(z.object({
        invoiceNumber: z.string(),
        accountNumber: z.string(),
        invoiceDate: z.string(),
        billingPeriodStart: z.string(),
        billingPeriodEnd: z.string(),
        subtotalExGst: z.number(),
        totalGst: z.number(),
        totalIncGst: z.number(),
        paymentReceived: z.number().default(0),
        totalDue: z.number().default(0),
        status: z.string().default('paid'),
        pdfFilename: z.string().optional(),
        lines: z.array(z.object({
          serviceLineNumber: z.string().optional(),
          serviceNickname: z.string().optional(),
          kitSerial: z.string().optional(),
          productDescription: z.string(),
          qty: z.number().default(1),
          unitPriceExGst: z.number().optional(),
          totalGst: z.number().optional(),
          totalIncGst: z.number(),
          billingPeriodStart: z.string().optional(),
          billingPeriodEnd: z.string().optional(),
          lineType: z.string().default('service'),
        })).default([]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const existing = await db.select({ id: starlinkInvoices.id })
          .from(starlinkInvoices)
          .where(eq(starlinkInvoices.invoiceNumber, input.invoiceNumber))
          .limit(1);
        const invoiceData = {
          invoiceNumber: input.invoiceNumber,
          accountNumber: input.accountNumber,
          invoiceDate: input.invoiceDate,
          billingPeriodStart: input.billingPeriodStart,
          billingPeriodEnd: input.billingPeriodEnd,
          subtotalExGst: String(input.subtotalExGst),
          totalGst: String(input.totalGst),
          totalIncGst: String(input.totalIncGst),
          paymentReceived: String(input.paymentReceived),
          totalDue: String(input.totalDue),
          status: input.status,
          pdfFilename: input.pdfFilename,
        };
        if (existing.length > 0) {
          await db.update(starlinkInvoices).set(invoiceData)
            .where(eq(starlinkInvoices.invoiceNumber, input.invoiceNumber));
        } else {
          await db.insert(starlinkInvoices).values(invoiceData);
        }
        if (input.lines.length > 0) {
          await db.delete(starlinkInvoiceLines)
            .where(eq(starlinkInvoiceLines.invoiceNumber, input.invoiceNumber));
          for (const line of input.lines) {
            await db.insert(starlinkInvoiceLines).values({
              invoiceNumber: input.invoiceNumber,
              accountNumber: input.accountNumber,
              serviceLineNumber: line.serviceLineNumber,
              serviceNickname: line.serviceNickname,
              kitSerial: line.kitSerial,
              productDescription: line.productDescription,
              qty: line.qty,
              unitPriceExGst: line.unitPriceExGst !== undefined ? String(line.unitPriceExGst) : undefined,
              totalGst: line.totalGst !== undefined ? String(line.totalGst) : undefined,
              totalIncGst: String(line.totalIncGst),
              billingPeriodStart: line.billingPeriodStart,
              billingPeriodEnd: line.billingPeriodEnd,
              lineType: line.lineType,
            });
          }
        }
        return { success: true, invoiceNumber: input.invoiceNumber };
      }),

    delete: protectedProcedure
      .input(z.object({ invoiceNumber: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        await db.delete(starlinkInvoiceLines)
          .where(eq(starlinkInvoiceLines.invoiceNumber, input.invoiceNumber));
        await db.delete(starlinkInvoices)
          .where(eq(starlinkInvoices.invoiceNumber, input.invoiceNumber));
        return { success: true };
      }),
  }),
});
