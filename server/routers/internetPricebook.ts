/**
 * Internet Pricebook Router
 * Provides tRPC procedures for the SmileTel Internet Services Pricebook:
 *  - listVersions: list all imported pricebook versions
 *  - listItems: paginated/filtered list of pricebook items with margin data
 *  - importFromSpreadsheet: parse uploaded XLSX and seed a new version
 *  - validateCarbonCosts: fetch live Carbon API costs and update variance/flags
 *  - updateSellPrice: manual sell price override with audit trail
 *  - getLowMarginSummary: count and worst-margin items
 *  - deleteVersion: remove a version and its items
 */

import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { parseAndSeedInternetPricebook } from '../internet-pricebook-seed';


// ─── Carbon API helpers ───────────────────────────────────────────────────────
const CARBON_BASE_URL = 'https://api.carbon.aussiebroadband.com.au';

/**
 * Authenticate with Carbon API and return session cookie string.
 */
async function carbonLogin(): Promise<string> {
  const username = process.env.CARBON_USERNAME;
  const prefix = process.env.CARBON_PASSWORD_PREFIX;
  const suffix = process.env.CARBON_PASSWORD_SUFFIX;
  if (!username || !prefix || !suffix) throw new Error('[CarbonAPI] Missing Carbon credentials in env');
  const password = `${prefix}$X${suffix}`;
  const res = await fetch(`${CARBON_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`[CarbonAPI] Login failed (${res.status})`);
  const rawCookies = res.headers.get('set-cookie') || '';
  return rawCookies.split(',').map((c: string) => c.trim().split(';')[0]).join('; ');
}

/**
 * Fetch the median monthly_cost_cents for each Carbon plan name from live services.
 * Returns a map: planName → median cost in dollars (ex GST).
 */
async function fetchCarbonPlanCosts(): Promise<Map<string, number>> {
  let cookieStr: string;
  try { cookieStr = await carbonLogin(); } catch { return new Map(); }

  const allServices: Array<{ plan?: { name?: string }; monthly_cost_cents?: number }> = [];
  let page = 1;
  let lastPage = 1;

  do {
    const r = await fetch(`${CARBON_BASE_URL}/carbon/services?page=${page}&per_page=100`, {
      headers: { Accept: 'application/json', cookie: cookieStr },
    });
    if (!r.ok) break;
    const d = await r.json() as { data?: typeof allServices; meta?: { last_page?: number } };
    allServices.push(...(d.data ?? []));
    lastPage = d.meta?.last_page ?? page;
    page++;
  } while (page <= lastPage);

  // Group costs by plan name
  const costsByPlan = new Map<string, number[]>();
  for (const svc of allServices) {
    const name = svc.plan?.name;
    const cents = svc.monthly_cost_cents;
    if (!name || cents == null) continue;
    if (!costsByPlan.has(name)) costsByPlan.set(name, []);
    costsByPlan.get(name)!.push(cents);
  }

  // Compute median for each plan
  const result = new Map<string, number>();
  costsByPlan.forEach((costs, name) => {
    const sorted = [...costs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    result.set(name, median / 100); // convert cents to dollars
  });

  return result;
}

// ─── Low-margin flag helper ───────────────────────────────────────────────────
function computeLowMarginFlag(margin: number): number {
  if (margin < 0.10) return 2;  // critical
  if (margin < 0.20) return 1;  // warning
  return 0;
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const internetPricebookRouter = router({

  /** List all imported pricebook versions, newest first */
  listVersions: protectedProcedure.query(async () => {
    const db = await getDb();
    const rows = await db!.execute(sql`
      SELECT
        v.id,
        v.label,
        v.sourceFile,
        v.effectiveDate,
        v.importedAt,
        v.importedBy,
        v.notes,
        COUNT(i.id) AS itemCount,
        SUM(CASE WHEN i.lowMarginFlag > 0 THEN 1 ELSE 0 END) AS lowMarginCount,
        MAX(i.carbonValidatedAt) AS lastValidatedAt
      FROM internet_pricebook_versions v
      LEFT JOIN internet_pricebook_items i ON i.versionId = v.id
      GROUP BY v.id
      ORDER BY v.importedAt DESC
    `);
    return (rows as any[])[0] as Array<{
      id: number;
      label: string;
      sourceFile: string | null;
      effectiveDate: string;
      importedAt: string;
      importedBy: string | null;
      notes: string | null;
      itemCount: number;
      lowMarginCount: number;
      lastValidatedAt: string | null;
    }>;
  }),

  /** List pricebook items for a version with optional filters */
  listItems: protectedProcedure
    .input(z.object({
      versionId: z.number(),
      serviceType: z.string().optional(),
      supportTier: z.string().optional(),
      contractTerm: z.string().optional(),
      speedTier: z.string().optional(),
      zone: z.string().optional(),
      lowMarginOnly: z.boolean().optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(500).default(200),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      let where = `WHERE i.versionId = ${input.versionId}`;
      if (input.serviceType) where += ` AND i.serviceType = ${JSON.stringify(input.serviceType)}`;
      if (input.supportTier) where += ` AND i.supportTier = ${JSON.stringify(input.supportTier)}`;
      if (input.contractTerm) where += ` AND i.contractTerm = ${JSON.stringify(input.contractTerm)}`;
      if (input.zone) where += ` AND i.zone = ${JSON.stringify(input.zone)}`;
      if (input.lowMarginOnly) where += ` AND i.lowMarginFlag > 0`;
      if (input.speedTier) where += ` AND i.speedTier LIKE ${JSON.stringify('%' + input.speedTier + '%')}`;
      if (input.search) {
        const s = input.search.replace(/'/g, "''");
        where += ` AND (i.speedTier LIKE '%${s}%' OR i.dattoProductName LIKE '%${s}%' OR i.productCode LIKE '%${s}%')`;
      }

      const countRows = await db!.execute(sql.raw(`SELECT COUNT(*) AS total FROM internet_pricebook_items i ${where}`));
      const total = Number((countRows as any[])[0]?.[0]?.total ?? 0);

      const rows = await db!.execute(sql.raw(`
        SELECT
          i.id,
          i.versionId,
          i.productCode,
          i.speedTier,
          i.serviceType,
          i.supportTier,
          i.contractTerm,
          i.zone,
          i.supportNote,
          i.dattoProductName,
          i.wholesaleCost,
          i.sellPrice,
          i.grossProfit,
          i.marginPercent,
          i.carbonPlanName,
          i.carbonValidatedCost,
          i.carbonValidatedAt,
          i.costVariance,
          i.lowMarginFlag,
          i.lowMarginThreshold,
          i.sellPriceOverride,
          i.overrideNote,
          i.overriddenBy,
          i.overriddenAt,
          i.updatedAt
        FROM internet_pricebook_items i
        ${where}
        ORDER BY i.serviceType, i.speedTier, i.supportTier, i.contractTerm, i.zone
        LIMIT ${input.limit} OFFSET ${input.offset}
      `));

      return {
        total,
        items: (rows as any[])[0] as Array<{
          id: number;
          versionId: number;
          productCode: string;
          speedTier: string;
          serviceType: string;
          supportTier: string;
          contractTerm: string;
          zone: string;
          supportNote: string;
          dattoProductName: string;
          wholesaleCost: string;
          sellPrice: string;
          grossProfit: string;
          marginPercent: string;
          carbonPlanName: string;
          carbonValidatedCost: string | null;
          carbonValidatedAt: string | null;
          costVariance: string | null;
          lowMarginFlag: number;
          lowMarginThreshold: string;
          sellPriceOverride: string | null;
          overrideNote: string | null;
          overriddenBy: string | null;
          overriddenAt: string | null;
          updatedAt: string;
        }>,
      };
    }),

  /** Import a new pricebook version from an uploaded XLSX (base64-encoded) */
  importFromSpreadsheet: protectedProcedure
    .input(z.object({
      fileBase64: z.string(),
      fileName: z.string(),
      label: z.string().min(1),
      effectiveDate: z.string().min(1),  // ISO date e.g. "2025-05-01"
    }))
    .mutation(async ({ input, ctx }) => {
      const importedBy = ctx.user?.name || ctx.user?.email || 'Unknown';
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const result = await parseAndSeedInternetPricebook(
        buffer,
        input.label,
        input.effectiveDate,
        importedBy,
        input.fileName,
      );

      // Auto-validate against Carbon API after import (best-effort, non-blocking)
      // Run in background so the import response returns immediately
      setImmediate(async () => {
        try {
          const planCosts = await fetchCarbonPlanCosts();
          if (planCosts.size === 0) return;
          const db = await (await import('../db')).getDb();
          const rows = await db!.execute(sql.raw(`
            SELECT id, wholesaleCost, sellPrice, carbonPlanName
            FROM internet_pricebook_items
            WHERE versionId = ${result.versionId}
              AND carbonPlanName IS NOT NULL AND carbonPlanName != ''
          `));
          const items = (rows as any[])[0] as Array<{ id: number; wholesaleCost: string; sellPrice: string; carbonPlanName: string }>;
          const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
          for (const item of items) {
            const carbonCost = planCosts.get(item.carbonPlanName);
            if (carbonCost == null) continue;
            const spreadsheetCost = parseFloat(item.wholesaleCost);
            const variance = carbonCost - spreadsheetCost;
            const sellPrice = parseFloat(item.sellPrice);
            const gp = sellPrice - carbonCost;
            const margin = sellPrice > 0 ? gp / sellPrice : 0;
            const flag = computeLowMarginFlag(margin);
            await db!.execute(sql.raw(`
              UPDATE internet_pricebook_items
              SET carbonValidatedCost=${carbonCost.toFixed(4)}, carbonValidatedAt='${now}',
                  costVariance=${variance.toFixed(4)}, lowMarginFlag=${flag}, updatedAt='${now}'
              WHERE id=${item.id}
            `));
          }
          console.log(`[PricebookImport] Auto-validated ${items.length} items against Carbon API`);
        } catch (e) {
          console.warn('[PricebookImport] Auto-validation failed (non-fatal):', e);
        }
      });

      return result;
    }),

  /**
   * Validate wholesale costs against live Carbon API.
   * Updates carbonValidatedCost, costVariance, and lowMarginFlag for all items
   * in the specified version that have a carbonPlanName set.
   */
  validateCarbonCosts: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Fetch live Carbon plan costs
      const planCosts = await fetchCarbonPlanCosts();
      if (planCosts.size === 0) {
        return { updated: 0, error: 'Could not fetch Carbon API costs — check credentials' };
      }

      // Load all items for this version that have a carbon plan name
      const rows = await db!.execute(sql.raw(`
        SELECT id, wholesaleCost, sellPrice, carbonPlanName, marginPercent
        FROM internet_pricebook_items
        WHERE versionId = ${input.versionId}
          AND carbonPlanName IS NOT NULL
          AND carbonPlanName != ''
      `));
      const items = (rows as any[])[0] as Array<{
        id: number;
        wholesaleCost: string;
        sellPrice: string;
        carbonPlanName: string;
        marginPercent: string;
      }>;

      let updated = 0;
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      for (const item of items) {
        const carbonCost = planCosts.get(item.carbonPlanName);
        if (carbonCost == null) continue;

        const spreadsheetCost = parseFloat(item.wholesaleCost);
        const variance = carbonCost - spreadsheetCost;

        // Recompute margin using Carbon cost (more accurate)
        const sellPrice = parseFloat(item.sellPrice);
        const gp = sellPrice - carbonCost;
        const margin = sellPrice > 0 ? gp / sellPrice : 0;
        const flag = computeLowMarginFlag(margin);

        await db!.execute(sql.raw(`
          UPDATE internet_pricebook_items
          SET
            carbonValidatedCost = ${carbonCost.toFixed(4)},
            carbonValidatedAt   = '${now}',
            costVariance        = ${variance.toFixed(4)},
            lowMarginFlag       = ${flag},
            updatedAt           = '${now}'
          WHERE id = ${item.id}
        `));
        updated++;
      }

      return { updated, plansCovered: planCosts.size };
    }),

  /** Manual sell price override with audit trail */
  updateSellPrice: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      newSellPrice: z.number().positive(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const user = ctx.user?.name || ctx.user?.email || 'Unknown';
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // Load current item
      const rows = await db!.execute(sql.raw(`
        SELECT id, wholesaleCost, carbonValidatedCost
        FROM internet_pricebook_items
        WHERE id = ${input.itemId}
        LIMIT 1
      `));
      const item = (rows as any[])[0]?.[0] as { id: number; wholesaleCost: string; carbonValidatedCost: string | null } | undefined;
      if (!item) throw new Error('Item not found');

      // Use Carbon cost if available, else spreadsheet cost
      const costBasis = item.carbonValidatedCost
        ? parseFloat(item.carbonValidatedCost)
        : parseFloat(item.wholesaleCost);

      const gp = input.newSellPrice - costBasis;
      const margin = input.newSellPrice > 0 ? gp / input.newSellPrice : 0;
      const flag = computeLowMarginFlag(margin);

      await db!.execute(sql.raw(`
        UPDATE internet_pricebook_items
        SET
          sellPriceOverride = ${input.newSellPrice.toFixed(4)},
          sellPrice         = ${input.newSellPrice.toFixed(4)},
          grossProfit       = ${gp.toFixed(4)},
          marginPercent     = ${margin.toFixed(6)},
          lowMarginFlag     = ${flag},
          overrideNote      = ${input.note ? JSON.stringify(input.note) : 'NULL'},
          overriddenBy      = ${JSON.stringify(user)},
          overriddenAt      = '${now}',
          updatedAt         = '${now}'
        WHERE id = ${input.itemId}
      `));

      return { updated: 1, newMarginPercent: margin };
    }),

  /** Summary: count of low-margin items, worst margins, by service type */
  getLowMarginSummary: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const rows = await db!.execute(sql.raw(`
        SELECT
          serviceType,
          COUNT(*) AS totalItems,
          SUM(CASE WHEN lowMarginFlag = 1 THEN 1 ELSE 0 END) AS warningCount,
          SUM(CASE WHEN lowMarginFlag = 2 THEN 1 ELSE 0 END) AS criticalCount,
          MIN(CAST(marginPercent AS DECIMAL(8,6))) AS worstMargin,
          AVG(CAST(marginPercent AS DECIMAL(8,6))) AS avgMargin,
          MAX(CAST(marginPercent AS DECIMAL(8,6))) AS bestMargin
        FROM internet_pricebook_items
        WHERE versionId = ${input.versionId}
        GROUP BY serviceType
        ORDER BY worstMargin ASC
      `));

      const byType = (rows as any[])[0] as Array<{
        serviceType: string;
        totalItems: number;
        warningCount: number;
        criticalCount: number;
        worstMargin: string;
        avgMargin: string;
        bestMargin: string;
      }>;

      // Overall totals
      const totalRows = await db!.execute(sql.raw(`
        SELECT
          COUNT(*) AS totalItems,
          SUM(CASE WHEN lowMarginFlag = 1 THEN 1 ELSE 0 END) AS warningCount,
          SUM(CASE WHEN lowMarginFlag = 2 THEN 1 ELSE 0 END) AS criticalCount,
          MIN(CAST(marginPercent AS DECIMAL(8,6))) AS worstMargin,
          AVG(CAST(marginPercent AS DECIMAL(8,6))) AS avgMargin
        FROM internet_pricebook_items
        WHERE versionId = ${input.versionId}
      `));
      const totals = (totalRows as any[])[0]?.[0] as {
        totalItems: number;
        warningCount: number;
        criticalCount: number;
        worstMargin: string;
        avgMargin: string;
      };

      return { byType, totals };
    }),

  /** Delete a pricebook version and all its items */
  deleteVersion: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.execute(sql.raw(`DELETE FROM internet_pricebook_items WHERE versionId = ${input.versionId}`));
      await db!.execute(sql.raw(`DELETE FROM internet_pricebook_versions WHERE id = ${input.versionId}`));
      return { deleted: true };
    }),

  /** Get distinct filter values for the UI dropdowns */
  getFilterOptions: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db!.execute(sql.raw(`
        SELECT DISTINCT serviceType, supportTier, contractTerm, zone
        FROM internet_pricebook_items
        WHERE versionId = ${input.versionId}
        ORDER BY serviceType, supportTier, contractTerm, zone
      `));
      const items = (rows as any[])[0] as Array<{
        serviceType: string;
        supportTier: string;
        contractTerm: string;
        zone: string;
      }>;
      const unique = <T>(arr: T[]) => arr.filter((v, i, a) => a.indexOf(v) === i).sort();
      return {
        serviceTypes: unique(items.map(i => i.serviceType)),
        supportTiers: unique(items.map(i => i.supportTier)),
        contractTerms: unique(items.map(i => i.contractTerm)),
        zones: unique(items.map(i => i.zone)),
      };
    }),
});
