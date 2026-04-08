/**
 * retailBundles.ts — tRPC router for Retail Internet Bundles
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Drizzle execute(sql.raw()) returns [rows, fields] tuple — unwrap to just rows */
function unwrapRows(result: any): any[] {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
}

function parseBundleRow(row: any) {
  return {
    id: row.id,
    oneBillAccountNumber: row.oneBillAccountNumber,
    customerExternalId: row.customerExternalId ?? null,
    customerName: row.customerName ?? null,
    subscriberName: row.subscriberName,
    rawBundleComponents: row.rawBundleComponents,
    hasInternet: Boolean(row.hasInternet),
    hasSim: Boolean(row.hasSim),
    hasVoip: Boolean(row.hasVoip),
    hasHardware: Boolean(row.hasHardware),
    hasSupport: Boolean(row.hasSupport),
    isByod: Boolean(row.isByod),
    legacyProductName: row.legacyProductName,
    standardProductName: row.standardProductName ?? '',
    retailPriceExGst: Number(row.retailPriceExGst),
    matchConfidence: row.matchConfidence ?? 'none',
    matchMethod: row.matchMethod ?? '',
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    totalCostExGst: row.totalCostExGst != null ? Number(row.totalCostExGst) : null,
    grossProfit: row.totalCostExGst != null ? Number(row.retailPriceExGst) - Number(row.totalCostExGst) : null,
    marginPercent: row.totalCostExGst != null && Number(row.retailPriceExGst) > 0
      ? ((Number(row.retailPriceExGst) - Number(row.totalCostExGst)) / Number(row.retailPriceExGst)) * 100
      : null,
    costInputCount: row.costInputCount != null ? Number(row.costInputCount) : 0,
  };
}

function parseCostInput(row: any) {
  return {
    id: row.id,
    bundleId: row.bundleId,
    slotType: row.slotType,
    label: row.label,
    monthlyCostExGst: Number(row.monthlyCostExGst),
    costSource: row.costSource,
    linkedServiceId: row.linkedServiceId ?? null,
    linkedServiceExternalId: row.linkedServiceExternalId ?? null,
    linkedServicePlanName: row.linkedServicePlanName ?? null,
    linkedServiceType: row.linkedServiceType ?? null,
    notes: row.notes ?? null,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

export const retailBundlesRouter = router({

  // ── List bundles ────────────────────────────────────────────────────────────
  listBundles: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(50),
      search: z.string().optional(),
      matchConfidence: z.enum(['exact', 'high', 'medium', 'low', 'none', 'all']).default('all'),
      hasVoip: z.boolean().optional(),
      hasHardware: z.boolean().optional(),
      isByod: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const offset = (input.page - 1) * input.pageSize;

      let whereClauses = ['rb.isActive = 1'];

      if (input.matchConfidence !== 'all') {
        whereClauses.push(`rb.matchConfidence = '${input.matchConfidence}'`);
      }
      if (input.hasVoip !== undefined) {
        whereClauses.push(`rb.hasVoip = ${input.hasVoip ? 1 : 0}`);
      }
      if (input.hasHardware !== undefined) {
        whereClauses.push(`rb.hasHardware = ${input.hasHardware ? 1 : 0}`);
      }
      if (input.isByod !== undefined) {
        whereClauses.push(`rb.isByod = ${input.isByod ? 1 : 0}`);
      }

      const searchClause = input.search
        ? `AND (rb.subscriberName LIKE '%${input.search.replace(/'/g, "''")}%' OR rb.oneBillAccountNumber LIKE '%${input.search.replace(/'/g, "''")}%' OR rb.legacyProductName LIKE '%${input.search.replace(/'/g, "''")}%' OR rb.standardProductName LIKE '%${input.search.replace(/'/g, "''")}%')`
        : '';

      const where = `WHERE ${whereClauses.join(' AND ')} ${searchClause}`;

      const rows = await db!.execute(sql.raw(`
        SELECT rb.*,
               c.name AS customerName,
               COALESCE(ci.totalCostExGst, 0) AS totalCostExGst,
               COALESCE(ci.costInputCount, 0) AS costInputCount
        FROM retail_bundles rb
        LEFT JOIN customers c ON rb.customerExternalId = c.externalId
        LEFT JOIN (
          SELECT bundleId,
                 SUM(CASE WHEN isActive = 1 THEN monthlyCostExGst ELSE 0 END) AS totalCostExGst,
                 COUNT(CASE WHEN isActive = 1 THEN 1 END) AS costInputCount
          FROM retail_bundle_cost_inputs
          GROUP BY bundleId
        ) ci ON ci.bundleId = rb.id
        ${where}
        ORDER BY rb.subscriberName ASC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `));

      const countRows = await db!.execute(sql.raw(`
        SELECT COUNT(DISTINCT rb.id) AS total
        FROM retail_bundles rb
        ${where}
      `));

      const total = Number(unwrapRows(countRows)[0]?.total ?? 0);

      return {
        items: unwrapRows(rows).map(parseBundleRow),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  // ── Get bundle detail ───────────────────────────────────────────────────────
  getBundleDetail: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const bundleRows = await db!.execute(sql.raw(`
        SELECT rb.*,
               c.name AS customerName,
               c.businessName AS customerBusinessName,
               c.siteAddress AS customerAddress,
               COALESCE(ci.totalCostExGst, 0) AS totalCostExGst,
               COALESCE(ci.costInputCount, 0) AS costInputCount
        FROM retail_bundles rb
        LEFT JOIN customers c ON rb.customerExternalId = c.externalId
        LEFT JOIN (
          SELECT bundleId,
                 SUM(CASE WHEN isActive = 1 THEN monthlyCostExGst ELSE 0 END) AS totalCostExGst,
                 COUNT(CASE WHEN isActive = 1 THEN 1 END) AS costInputCount
          FROM retail_bundle_cost_inputs
          GROUP BY bundleId
        ) ci ON ci.bundleId = rb.id
        WHERE rb.id = ${input.id}
      `));

      const bundle = unwrapRows(bundleRows)[0];
      if (!bundle) throw new Error('Bundle not found');

      const inputs = await db!.execute(sql.raw(`
        SELECT rci.*,
               s.planName AS linkedServicePlanName,
               s.serviceType AS linkedServiceType
        FROM retail_bundle_cost_inputs rci
        LEFT JOIN services s ON rci.linkedServiceId = s.id
        WHERE rci.bundleId = ${input.id} AND rci.isActive = 1
        ORDER BY rci.slotType, rci.id
      `));

      return {
        ...parseBundleRow(bundle),
        customerBusinessName: bundle.customerBusinessName ?? null,
        customerAddress: bundle.customerAddress ?? null,
        costInputs: unwrapRows(inputs).map(parseCostInput),
      };
    }),

  // ── Summary stats ───────────────────────────────────────────────────────────
  getSummary: protectedProcedure
    .query(async () => {
      const db = await getDb();

      const statsRows = await db!.execute(sql.raw(`
        SELECT
          COUNT(DISTINCT rb.id) AS totalBundles,
          SUM(CASE WHEN rb.customerExternalId IS NOT NULL THEN 1 ELSE 0 END) AS matchedBundles,
          SUM(CASE WHEN rb.customerExternalId IS NULL THEN 1 ELSE 0 END) AS unmatchedBundles,
          SUM(CASE WHEN rb.matchConfidence = 'exact' THEN 1 ELSE 0 END) AS exactMatches,
          SUM(CASE WHEN rb.matchConfidence IN ('high','medium','low') THEN 1 ELSE 0 END) AS fuzzyMatches,
          SUM(CASE WHEN rb.isByod = 1 THEN 1 ELSE 0 END) AS byodBundles,
          SUM(CASE WHEN rb.hasVoip = 1 THEN 1 ELSE 0 END) AS voipBundles,
          SUM(CASE WHEN rb.hasHardware = 1 AND rb.isByod = 0 THEN 1 ELSE 0 END) AS hardwareBundles,
          AVG(rb.retailPriceExGst) AS avgRetailPrice,
          SUM(rb.retailPriceExGst) AS totalRetailRevenue
        FROM retail_bundles rb
        WHERE rb.isActive = 1
      `));
      const stats = unwrapRows(statsRows)[0] ?? {};

      const costRows = await db!.execute(sql.raw(`
        SELECT
          COUNT(*) AS totalCostInputs,
          SUM(rci.monthlyCostExGst) AS totalCostBase,
          SUM(CASE WHEN rci.costSource = 'service_link' THEN 1 ELSE 0 END) AS linkedInputs,
          SUM(CASE WHEN rci.costSource = 'default' THEN 1 ELSE 0 END) AS defaultInputs,
          SUM(CASE WHEN rci.costSource = 'manual' THEN 1 ELSE 0 END) AS manualInputs
        FROM retail_bundle_cost_inputs rci
        INNER JOIN retail_bundles rb ON rci.bundleId = rb.id
        WHERE rci.isActive = 1 AND rb.isActive = 1
      `));
      const costStats = unwrapRows(costRows)[0] ?? {};

      const marginRows = await db!.execute(sql.raw(`
        SELECT
          AVG(bundle_margin.margin) AS avgMargin,
          SUM(CASE WHEN bundle_margin.margin < 10 THEN 1 ELSE 0 END) AS criticalMarginCount,
          SUM(CASE WHEN bundle_margin.margin >= 10 AND bundle_margin.margin < 20 THEN 1 ELSE 0 END) AS warningMarginCount,
          SUM(CASE WHEN bundle_margin.margin >= 20 THEN 1 ELSE 0 END) AS healthyMarginCount
        FROM (
          SELECT rb.id,
                 rb.retailPriceExGst,
                 COALESCE(SUM(rci.monthlyCostExGst), 0) AS totalCost,
                 CASE WHEN rb.retailPriceExGst > 0
                   THEN ((rb.retailPriceExGst - COALESCE(SUM(rci.monthlyCostExGst), 0)) / rb.retailPriceExGst) * 100
                   ELSE 0
                 END AS margin
          FROM retail_bundles rb
          LEFT JOIN retail_bundle_cost_inputs rci ON rci.bundleId = rb.id AND rci.isActive = 1
          WHERE rb.isActive = 1
          GROUP BY rb.id, rb.retailPriceExGst
        ) AS bundle_margin
      `));
      const marginStats = unwrapRows(marginRows)[0] ?? {};

      return {
        totalBundles: Number(stats.totalBundles ?? 0),
        matchedBundles: Number(stats.matchedBundles ?? 0),
        unmatchedBundles: Number(stats.unmatchedBundles ?? 0),
        exactMatches: Number(stats.exactMatches ?? 0),
        fuzzyMatches: Number(stats.fuzzyMatches ?? 0),
        byodBundles: Number(stats.byodBundles ?? 0),
        voipBundles: Number(stats.voipBundles ?? 0),
        hardwareBundles: Number(stats.hardwareBundles ?? 0),
        avgRetailPrice: Number(stats.avgRetailPrice ?? 0),
        totalRetailRevenue: Number(stats.totalRetailRevenue ?? 0),
        totalCostInputs: Number(costStats.totalCostInputs ?? 0),
        totalCostBase: Number(costStats.totalCostBase ?? 0),
        linkedInputs: Number(costStats.linkedInputs ?? 0),
        defaultInputs: Number(costStats.defaultInputs ?? 0),
        manualInputs: Number(costStats.manualInputs ?? 0),
        avgMargin: marginStats.avgMargin != null ? Number(marginStats.avgMargin) : null,
        criticalMarginCount: Number(marginStats.criticalMarginCount ?? 0),
        warningMarginCount: Number(marginStats.warningMarginCount ?? 0),
        healthyMarginCount: Number(marginStats.healthyMarginCount ?? 0),
      };
    }),

  // ── Update cost input ───────────────────────────────────────────────────────
  updateCostInput: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      label: z.string().min(1).max(256).optional(),
      monthlyCostExGst: z.number().min(0).optional(),
      notes: z.string().max(1000).optional(),
      costSource: z.enum(['default', 'manual', 'service_link', 'carbon', 'pricebook']).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const sets: string[] = [];

      if (input.label !== undefined) sets.push(`label = '${input.label.replace(/'/g, "''")}'`);
      if (input.monthlyCostExGst !== undefined) {
        sets.push(`monthlyCostExGst = ${input.monthlyCostExGst.toFixed(4)}`);
        if (!input.costSource) sets.push(`costSource = 'manual'`);
      }
      if (input.notes !== undefined) sets.push(`notes = '${(input.notes ?? '').replace(/'/g, "''")}'`);
      if (input.costSource !== undefined) sets.push(`costSource = '${input.costSource}'`);

      if (sets.length === 0) return { success: true };

      await db!.execute(sql.raw(`UPDATE retail_bundle_cost_inputs SET ${sets.join(', ')} WHERE id = ${input.id}`));
      return { success: true };
    }),

  // ── Add cost input ──────────────────────────────────────────────────────────
  addCostInput: protectedProcedure
    .input(z.object({
      bundleId: z.number().int(),
      slotType: z.enum(['internet', 'sim_4g', 'hardware', 'sip_channel', 'support', 'other']),
      label: z.string().min(1).max(256),
      monthlyCostExGst: z.number().min(0),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const notesVal = input.notes ? `'${input.notes.replace(/'/g, "''")}'` : 'NULL';
      const result = await db!.execute(sql.raw(`
        INSERT INTO retail_bundle_cost_inputs (bundleId, slotType, label, monthlyCostExGst, costSource, notes, isActive)
        VALUES (${input.bundleId}, '${input.slotType}', '${input.label.replace(/'/g, "''")}', ${input.monthlyCostExGst.toFixed(4)}, 'manual', ${notesVal}, 1)
      `));
      return { id: (result as any).insertId, success: true };
    }),

  // ── Remove cost input ───────────────────────────────────────────────────────
  removeCostInput: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.execute(sql.raw(`UPDATE retail_bundle_cost_inputs SET isActive = 0 WHERE id = ${input.id}`));
      return { success: true };
    }),

  // ── Assign service to cost slot (drag-drop) ─────────────────────────────────
  assignServiceSlot: protectedProcedure
    .input(z.object({
      costInputId: z.number().int(),
      serviceId: z.number().int(),
      serviceExternalId: z.string(),
      monthlyCostExGst: z.number().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      let cost = input.monthlyCostExGst;
      if (cost === undefined) {
        const svcRows = await db!.execute(sql.raw(`SELECT monthlyCost FROM services WHERE id = ${input.serviceId}`));
        const svc = unwrapRows(svcRows)[0];
        cost = svc ? Number(svc.monthlyCost) : 0;
      }
      await db!.execute(sql.raw(`
        UPDATE retail_bundle_cost_inputs
        SET linkedServiceId = ${input.serviceId},
            linkedServiceExternalId = '${input.serviceExternalId.replace(/'/g, "''")}',
            monthlyCostExGst = ${cost.toFixed(4)},
            costSource = 'service_link'
        WHERE id = ${input.costInputId}
      `));
      return { success: true };
    }),

  // ── Unassign service from cost slot ─────────────────────────────────────────
  unassignServiceSlot: protectedProcedure
    .input(z.object({ costInputId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.execute(sql.raw(`
        UPDATE retail_bundle_cost_inputs
        SET linkedServiceId = NULL, linkedServiceExternalId = NULL, costSource = 'manual'
        WHERE id = ${input.costInputId}
      `));
      return { success: true };
    }),

  // ── Update bundle metadata ──────────────────────────────────────────────────
  updateBundle: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      standardProductName: z.string().max(256).optional(),
      customerExternalId: z.string().max(128).nullable().optional(),
      matchConfidence: z.enum(['exact', 'high', 'medium', 'low', 'none']).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const sets: string[] = [];

      if (input.standardProductName !== undefined)
        sets.push(`standardProductName = '${input.standardProductName.replace(/'/g, "''")}'`);
      if (input.customerExternalId !== undefined) {
        sets.push(input.customerExternalId
          ? `customerExternalId = '${input.customerExternalId.replace(/'/g, "''")}'`
          : `customerExternalId = NULL`);
        if (!input.matchConfidence)
          sets.push(`matchConfidence = '${input.customerExternalId ? 'exact' : 'none'}'`);
      }
      if (input.matchConfidence !== undefined)
        sets.push(`matchConfidence = '${input.matchConfidence}'`);

      if (sets.length === 0) return { success: true };
      await db!.execute(sql.raw(`UPDATE retail_bundles SET ${sets.join(', ')} WHERE id = ${input.id}`));
      return { success: true };
    }),

  // ── Get services for slot picker ─────────────────────────────────────────────
  getServicesForSlot: protectedProcedure
    .input(z.object({
      bundleId: z.number().int(),
      slotType: z.string(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const bundleRows = await db!.execute(sql.raw(`SELECT customerExternalId FROM retail_bundles WHERE id = ${input.bundleId}`));
      const bundle = unwrapRows(bundleRows)[0];

      const serviceTypeMap: Record<string, string[]> = {
        internet: ['Internet', 'NBN', 'Fixed Wireless', 'FTTP', 'FTTN', 'HFC'],
        sim_4g: ['Mobile', '4G', 'SIM', 'Mobile Broadband'],
        hardware: ['Hardware', 'Equipment'],
        sip_channel: ['Voice', 'SIP', 'VOIP', 'VoIP'],
        support: ['Support', 'Managed Services'],
        other: [],
      };

      const types = serviceTypeMap[input.slotType] ?? [];
      const whereClauses = [`s.status = 'active'`];

      if (bundle?.customerExternalId) {
        whereClauses.push(`s.customerExternalId = '${bundle.customerExternalId}'`);
      }
      if (types.length > 0) {
        whereClauses.push(`(${types.map(t => `s.serviceType LIKE '%${t}%'`).join(' OR ')})`);
      }
      if (input.search) {
        const q = input.search.replace(/'/g, "''");
        whereClauses.push(`(s.planName LIKE '%${q}%' OR s.serviceType LIKE '%${q}%' OR s.externalId LIKE '%${q}%')`);
      }

      const rows = await db!.execute(sql.raw(`
        SELECT s.id, s.externalId, s.serviceType, s.planName, s.monthlyCost, s.provider, s.carbonPlanName
        FROM services s
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY s.serviceType, s.planName
        LIMIT 50
      `));

      return unwrapRows(rows).map(r => ({
        id: r.id,
        externalId: r.externalId,
        serviceType: r.serviceType,
        planName: r.planName ?? '',
        monthlyCost: Number(r.monthlyCost),
        provider: r.provider ?? '',
        carbonPlanName: r.carbonPlanName ?? '',
      }));
    }),

  // ── Get unmatched bundles ────────────────────────────────────────────────────
  getUnmatchedBundles: protectedProcedure
    .query(async () => {
      const db = await getDb();
      const rows = await db!.execute(sql.raw(`
        SELECT rb.*,
               COALESCE(ci.totalCostExGst, 0) AS totalCostExGst,
               COALESCE(ci.costInputCount, 0) AS costInputCount
        FROM retail_bundles rb
        LEFT JOIN (
          SELECT bundleId,
                 SUM(CASE WHEN isActive = 1 THEN monthlyCostExGst ELSE 0 END) AS totalCostExGst,
                 COUNT(CASE WHEN isActive = 1 THEN 1 END) AS costInputCount
          FROM retail_bundle_cost_inputs
          GROUP BY bundleId
        ) ci ON ci.bundleId = rb.id
        WHERE rb.customerExternalId IS NULL AND rb.isActive = 1
        ORDER BY rb.subscriberName
      `));
      return unwrapRows(rows).map(parseBundleRow);
    }),

  // ── Search customers for manual re-matching ──────────────────────────────────
  searchCustomersForMatch: protectedProcedure
    .input(z.object({ query: z.string().min(2) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const q = input.query.replace(/'/g, "''");
      const rows = await db!.execute(sql.raw(`
        SELECT externalId, name, businessName, siteAddress
        FROM customers
        WHERE name LIKE '%${q}%' OR businessName LIKE '%${q}%'
        ORDER BY name
        LIMIT 20
      `));
      return unwrapRows(rows);
    }),

  // ── Resolve live wholesale cost for a service ───────────────────────────────
  // Priority: carbonMonthlyCost → TIAB plan baseCharge → Vocus planCost → $15 default
  resolveServiceCost: protectedProcedure
    .input(z.object({
      serviceId: z.number().int(),
      slotType: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      // Fetch the service record with all cost-bearing fields
      const svcRows = await db!.execute(sql.raw(`
        SELECT s.id, s.externalId, s.serviceType, s.planName, s.monthlyCost,
               s.carbonMonthlyCost, s.carbonServiceId, s.carbonPlanName,
               s.provider, s.simSerialNumber, s.phoneNumber,
               s.supplierName
        FROM services s
        WHERE s.id = ${input.serviceId}
      `));
      const svc = unwrapRows(svcRows)[0];
      if (!svc) return { cost: 0, source: 'unknown' as const, detail: 'Service not found' };

      const isNbn = ['internet', 'nbn', 'fixed wireless', 'fttp', 'fttn', 'hfc', 'fttc', 'fttb']
        .some(t => (svc.serviceType ?? '').toLowerCase().includes(t));
      const isSim = ['mobile', '4g', 'sim', 'mbb']
        .some(t => (svc.serviceType ?? '').toLowerCase().includes(t));

      // 1. Carbon live cost (NBN/internet services)
      if (isNbn && svc.carbonMonthlyCost && Number(svc.carbonMonthlyCost) > 0) {
        return {
          cost: Number(svc.carbonMonthlyCost),
          source: 'carbon' as const,
          detail: `Carbon API: ${svc.carbonPlanName || svc.planName || 'NBN service'}`,
        };
      }

      // 2. TIAB plan baseCharge (SIM services matched via msisdn or simSerial)
      if (isSim && (svc.phoneNumber || svc.simSerialNumber)) {
        const phone = (svc.phoneNumber ?? '').replace(/\D/g, '');
        const simSerial = (svc.simSerialNumber ?? '').trim();
        let tiabCostRows: any[] = [];

        if (phone) {
          tiabCostRows = (await db!.execute(sql.raw(`
            SELECT tp.baseCharge, tp.planName
            FROM tiab_services ts
            INNER JOIN tiab_plans tp ON ts.planId = tp.tiabPlanId
            WHERE ts.msisdn = '${phone}' AND ts.status = 'Active'
            LIMIT 1
          `))); tiabCostRows = unwrapRows(tiabCostRows);
        }
        if (tiabCostRows.length === 0 && simSerial) {
          tiabCostRows = (await db!.execute(sql.raw(`
            SELECT tp.baseCharge, tp.planName
            FROM tiab_services ts
            INNER JOIN tiab_plans tp ON ts.planId = tp.tiabPlanId
            WHERE ts.simSerial = '${simSerial.replace(/'/g, "''")}' AND ts.status = 'Active'
            LIMIT 1
          `))); tiabCostRows = unwrapRows(tiabCostRows);
        }

        if (tiabCostRows.length > 0 && tiabCostRows[0].baseCharge && Number(tiabCostRows[0].baseCharge) > 0) {
          return {
            cost: Number(tiabCostRows[0].baseCharge),
            source: 'tiab' as const,
            detail: `TIAB: ${tiabCostRows[0].planName || 'SIM plan'}`,
          };
        }
      }

      // 3. Vocus planCost (Vocus mobile services matched via phone number)
      if (isSim && svc.phoneNumber) {
        const phone = (svc.phoneNumber ?? '').replace(/\D/g, '');
        if (phone) {
          const vocusRows = await db!.execute(sql.raw(`
            SELECT planCost, label
            FROM vocus_mobile_services
            WHERE msn = '${phone}' AND planCost > 0
            LIMIT 1
          `));
          const vocusSvc = unwrapRows(vocusRows)[0];
          if (vocusSvc && Number(vocusSvc.planCost) > 0) {
            return {
              cost: Number(vocusSvc.planCost),
              source: 'vocus' as const,
              detail: `Vocus: ${vocusSvc.label || 'Mobile SIM'}`,
            };
          }
        }
      }

      // 4. Fallback: use existing monthlyCost on the service record if set
      if (svc.monthlyCost && Number(svc.monthlyCost) > 0) {
        return {
          cost: Number(svc.monthlyCost),
          source: 'service_record' as const,
          detail: `Service record: ${svc.planName || svc.serviceType}`,
        };
      }

      // 5. Default: $15 for SIM, $0 for everything else
      if (isSim) {
        return { cost: 15.00, source: 'default_sim' as const, detail: '4G SIM default ($15.00/month)' };
      }

      return { cost: 0, source: 'unknown' as const, detail: 'No cost data available' };
    }),

  // ── Enhanced assignServiceSlot with live cost resolution ────────────────────
  assignServiceSlotWithLiveCost: protectedProcedure
    .input(z.object({
      costInputId: z.number().int(),
      serviceId: z.number().int(),
      serviceExternalId: z.string(),
      slotType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Fetch the service record
      const svcRows = await db!.execute(sql.raw(`
        SELECT s.id, s.externalId, s.serviceType, s.planName, s.monthlyCost,
               s.carbonMonthlyCost, s.carbonPlanName, s.provider,
               s.simSerialNumber, s.phoneNumber
        FROM services s
        WHERE s.id = ${input.serviceId}
      `));
      const svc = unwrapRows(svcRows)[0];
      if (!svc) throw new Error('Service not found');

      const isNbn = ['internet', 'nbn', 'fixed wireless', 'fttp', 'fttn', 'hfc', 'fttc', 'fttb']
        .some(t => (svc.serviceType ?? '').toLowerCase().includes(t));
      const isSim = ['mobile', '4g', 'sim', 'mbb']
        .some(t => (svc.serviceType ?? '').toLowerCase().includes(t));

      let resolvedCost = 0;
      let costSource = 'service_link';

      // Priority 1: Carbon live cost
      if (isNbn && svc.carbonMonthlyCost && Number(svc.carbonMonthlyCost) > 0) {
        resolvedCost = Number(svc.carbonMonthlyCost);
        costSource = 'carbon';
      }
      // Priority 2: TIAB plan baseCharge
      else if (isSim && (svc.phoneNumber || svc.simSerialNumber)) {
        const phone = (svc.phoneNumber ?? '').replace(/\D/g, '');
        const simSerial = (svc.simSerialNumber ?? '').trim();
        let tiabRows: any[] = [];

        if (phone) {
          tiabRows = unwrapRows(await db!.execute(sql.raw(`
            SELECT tp.baseCharge FROM tiab_services ts
            INNER JOIN tiab_plans tp ON ts.planId = tp.tiabPlanId
            WHERE ts.msisdn = '${phone}' AND ts.status = 'Active' LIMIT 1
          `)));
        }
        if (tiabRows.length === 0 && simSerial) {
          tiabRows = unwrapRows(await db!.execute(sql.raw(`
            SELECT tp.baseCharge FROM tiab_services ts
            INNER JOIN tiab_plans tp ON ts.planId = tp.tiabPlanId
            WHERE ts.simSerial = '${simSerial.replace(/'/g, "''")}' AND ts.status = 'Active' LIMIT 1
          `)));
        }
        if (tiabRows.length > 0 && Number(tiabRows[0].baseCharge) > 0) {
          resolvedCost = Number(tiabRows[0].baseCharge);
          costSource = 'tiab';
        }
      }
      // Priority 3: Vocus planCost
      if (resolvedCost === 0 && isSim && svc.phoneNumber) {
        const phone = (svc.phoneNumber ?? '').replace(/\D/g, '');
        if (phone) {
          const vocusRows = await db!.execute(sql.raw(`
            SELECT planCost FROM vocus_mobile_services WHERE msn = '${phone}' AND planCost > 0 LIMIT 1
          `));
          const v = unwrapRows(vocusRows)[0];
          if (v && Number(v.planCost) > 0) {
            resolvedCost = Number(v.planCost);
            costSource = 'vocus';
          }
        }
      }
      // Priority 4: existing monthlyCost
      if (resolvedCost === 0 && Number(svc.monthlyCost) > 0) {
        resolvedCost = Number(svc.monthlyCost);
        costSource = 'service_link';
      }
      // Priority 5: SIM default
      if (resolvedCost === 0 && isSim) {
        resolvedCost = 15.00;
        costSource = 'default_sim';
      }

      await db!.execute(sql.raw(`
        UPDATE retail_bundle_cost_inputs
        SET linkedServiceId = ${input.serviceId},
            linkedServiceExternalId = '${input.serviceExternalId.replace(/'/g, "''")}',
            monthlyCostExGst = ${resolvedCost.toFixed(4)},
            costSource = '${costSource}'
        WHERE id = ${input.costInputId}
      `));

      return { success: true, resolvedCost, costSource };
    }),

  // ── Export margin report data ────────────────────────────────────────────────
  exportMarginReport: protectedProcedure
    .input(z.object({
      marginFilter: z.enum(['all', 'critical', 'warning', 'healthy']).default('all'),
      groupBy: z.enum(['bundle_type', 'customer', 'none']).default('bundle_type'),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const rows = await db!.execute(sql.raw(`
        SELECT
          rb.id,
          rb.oneBillAccountNumber,
          rb.subscriberName,
          rb.legacyProductName,
          rb.standardProductName,
          rb.retailPriceExGst,
          rb.hasInternet, rb.hasSim, rb.hasVoip, rb.hasHardware, rb.hasSupport, rb.isByod,
          rb.matchConfidence,
          rb.customerExternalId,
          c.name AS customerName,
          COALESCE(ci.totalCostExGst, 0) AS totalCostExGst,
          ci.costBreakdown,
          COALESCE(ci.carbonSlots, 0) AS carbonSlots,
          COALESCE(ci.tiabSlots, 0) AS tiabSlots,
          COALESCE(ci.vocusSlots, 0) AS vocusSlots,
          COALESCE(ci.defaultSlots, 0) AS defaultSlots,
          COALESCE(ci.manualSlots, 0) AS manualSlots
        FROM retail_bundles rb
        LEFT JOIN customers c ON rb.customerExternalId = c.externalId
        LEFT JOIN (
          SELECT bundleId,
                 SUM(CASE WHEN isActive = 1 THEN monthlyCostExGst ELSE 0 END) AS totalCostExGst,
                 GROUP_CONCAT(
                   CONCAT(slotType, ':', label, ':', monthlyCostExGst, ':', costSource)
                   ORDER BY slotType SEPARATOR '|'
                 ) AS costBreakdown,
                 SUM(CASE WHEN isActive = 1 AND costSource = 'carbon' THEN 1 ELSE 0 END) AS carbonSlots,
                 SUM(CASE WHEN isActive = 1 AND costSource = 'tiab' THEN 1 ELSE 0 END) AS tiabSlots,
                 SUM(CASE WHEN isActive = 1 AND costSource = 'vocus' THEN 1 ELSE 0 END) AS vocusSlots,
                 SUM(CASE WHEN isActive = 1 AND costSource = 'default' THEN 1 ELSE 0 END) AS defaultSlots,
                 SUM(CASE WHEN isActive = 1 AND costSource = 'manual' THEN 1 ELSE 0 END) AS manualSlots
          FROM retail_bundle_cost_inputs
          GROUP BY bundleId
        ) ci ON ci.bundleId = rb.id
        WHERE rb.isActive = 1
        ORDER BY rb.subscriberName
      `));

      const items = unwrapRows(rows).map(r => {
        const retail = Number(r.retailPriceExGst);
        const cost = Number(r.totalCostExGst);
        const gp = retail - cost;
        const margin = retail > 0 ? (gp / retail) * 100 : null;
        const marginClass = margin === null ? 'unknown'
          : margin < 10 ? 'critical'
          : margin < 20 ? 'warning'
          : 'healthy';

        // Parse cost breakdown
        const costBreakdown: Array<{ slotType: string; label: string; cost: number; source: string }> = [];
        if (r.costBreakdown) {
          for (const part of r.costBreakdown.split('|')) {
            const [slotType, label, costStr, source] = part.split(':');
            if (slotType && costStr) {
              costBreakdown.push({ slotType, label: label || slotType, cost: Number(costStr), source: source || 'default' });
            }
          }
        }

        // Determine bundle type from components
        const bundleType = r.hasSim && r.hasVoip && r.hasInternet ? 'Full Bundle (NBN+SIM+VOIP)'
          : r.hasSim && r.hasInternet && !r.hasVoip ? 'NBN+SIM Bundle'
          : r.hasSim && !r.hasInternet ? 'MBB Bundle'
          : r.hasInternet && !r.hasSim ? 'Internet Only'
          : 'Other';

        return {
          id: r.id,
          oneBillAccountNumber: r.oneBillAccountNumber,
          subscriberName: r.subscriberName,
          customerName: r.customerName ?? r.subscriberName,
          legacyProductName: r.legacyProductName,
          standardProductName: r.standardProductName ?? '',
          bundleType,
          retailPriceExGst: retail,
          totalCostExGst: cost,
          grossProfit: gp,
          marginPercent: margin,
          marginClass,
          isByod: Boolean(r.isByod),
          hasVoip: Boolean(r.hasVoip),
          hasHardware: Boolean(r.hasHardware),
          matchConfidence: r.matchConfidence,
          costBreakdown,
          carbonSlots: Number(r.carbonSlots ?? 0),
          tiabSlots: Number(r.tiabSlots ?? 0),
          vocusSlots: Number(r.vocusSlots ?? 0),
          defaultSlots: Number(r.defaultSlots ?? 0),
          manualSlots: Number(r.manualSlots ?? 0),
        };
      });

      // Apply margin filter
      const filtered = input.marginFilter === 'all'
        ? items
        : items.filter(i => i.marginClass === input.marginFilter);

      // Group if requested
      let grouped: Record<string, typeof items> | null = null;
      if (input.groupBy !== 'none') {
        grouped = {};
        for (const item of filtered) {
          const key = input.groupBy === 'bundle_type' ? item.bundleType : (item.customerName || 'Unknown');
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(item);
        }
      }

      // Summary stats
      const totalRevenue = filtered.reduce((s, i) => s + i.retailPriceExGst, 0);
      const totalCost = filtered.reduce((s, i) => s + i.totalCostExGst, 0);
      const totalGP = totalRevenue - totalCost;
      const avgMargin = filtered.length > 0
        ? filtered.filter(i => i.marginPercent !== null).reduce((s, i) => s + (i.marginPercent ?? 0), 0) / filtered.filter(i => i.marginPercent !== null).length
        : null;

      return {
        items: filtered,
        grouped,
        summary: {
          totalBundles: filtered.length,
          totalRevenue,
          totalCost,
          totalGP,
          avgMargin,
          criticalCount: filtered.filter(i => i.marginClass === 'critical').length,
          warningCount: filtered.filter(i => i.marginClass === 'warning').length,
          healthyCount: filtered.filter(i => i.marginClass === 'healthy').length,
        },
      };
    }),

  /**
   * Returns the retail bundle record + all active cost inputs for a customer.
   * Used by the Reconciliation Board to show fixed bundle costs alongside supplier services.
   */
  getBundleCostInputsForCustomer: protectedProcedure
    .input(z.object({ customerExternalId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const safeId = input.customerExternalId.replace(/'/g, "''");

      const bundleRows = await db!.execute(sql.raw(
        `SELECT rb.id, rb.subscriberName, rb.legacyProductName, rb.standardProductName,
                rb.retailPriceExGst, rb.isByod, rb.hasVoip, rb.hasHardware,
                rb.hasSim, rb.hasInternet, rb.oneBillAccountNumber,
                rb.matchConfidence, rb.customerExternalId
         FROM retail_bundles rb
         WHERE rb.customerExternalId = '${safeId}' AND rb.isActive = 1
         LIMIT 1`
      ));
      const bundleArr = unwrapRows(bundleRows);
      const bundle = bundleArr[0] as any;
      if (!bundle) return null;
      const bundleId = parseInt(String(bundle.id), 10);
      if (isNaN(bundleId)) return null;

      const inputRows = await db!.execute(sql.raw(
        `SELECT rci.id, rci.slotType, rci.label, rci.monthlyCostExGst, rci.costSource,
                rci.linkedServiceId, rci.notes,
                s.externalId AS linkedServiceExternalId,
                s.planName AS linkedServicePlanName,
                s.serviceType AS linkedServiceType
         FROM retail_bundle_cost_inputs rci
         LEFT JOIN services s ON rci.linkedServiceId = s.id
         WHERE rci.bundleId = ${bundleId} AND rci.isActive = 1
         ORDER BY rci.slotType, rci.id`
      ));
      const rawInputs = unwrapRows(inputRows);

      const SLOT_ICONS: Record<string, string> = {
        internet: 'wifi',
        sim_4g: 'smartphone',
        hardware: 'hard-drive',
        sip_channel: 'phone',
        support: 'headphones',
        other: 'package',
      };

      const costInputs = rawInputs.map((r: any) => ({
        id: parseInt(String(r.id), 10),
        slotType: r.slotType as string,
        label: r.label as string,
        monthlyCostExGst: parseFloat(String(r.monthlyCostExGst)) || 0,
        costSource: r.costSource as string,
        linkedServiceExternalId: r.linkedServiceExternalId as string | null,
        linkedServicePlanName: r.linkedServicePlanName as string | null,
        linkedServiceType: r.linkedServiceType as string | null,
        icon: SLOT_ICONS[r.slotType as string] ?? 'package',
        notes: r.notes as string | null,
      }));

      const totalFixedCost = costInputs.reduce((s: number, i: any) => s + i.monthlyCostExGst, 0);

      return {
        bundleId: bundleId,
        subscriberName: bundle.subscriberName as string,
        legacyProductName: bundle.legacyProductName as string,
        standardProductName: bundle.standardProductName as string | null,
        retailPriceExGst: parseFloat(String(bundle.retailPriceExGst)) || 0,
        oneBillAccountNumber: bundle.oneBillAccountNumber as string | null,
        isByod: Boolean(bundle.isByod),
        hasVoip: Boolean(bundle.hasVoip),
        hasHardware: Boolean(bundle.hasHardware),
        hasSim: Boolean(bundle.hasSim),
        hasInternet: Boolean(bundle.hasInternet),
        matchConfidence: bundle.matchConfidence as string,
        costInputs,
        totalFixedCost,
      };
    }),

  // ── Re-link bundle to a different customer ──────────────────────────────────
  relinkBundle: protectedProcedure
    .input(z.object({
      bundleId: z.number().int(),
      customerExternalId: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');

      const safeCustomerId = input.customerExternalId
        ? `'${input.customerExternalId.replace(/'/g, "''")}'`
        : 'NULL';

      await db!.execute(sql.raw(
        `UPDATE retail_bundles SET customerExternalId = ${safeCustomerId}, updatedAt = NOW() WHERE id = ${input.bundleId}`
      ));

      // Return the updated bundle row so the UI can refresh immediately
      const rows = await db!.execute(sql.raw(
        `SELECT rb.id, rb.subscriberName, rb.customerExternalId, c.name AS customerName
         FROM retail_bundles rb
         LEFT JOIN customers c ON rb.customerExternalId = c.externalId
         WHERE rb.id = ${input.bundleId} LIMIT 1`
      ));
      const row = unwrapRows(rows)[0];
      return {
        bundleId: input.bundleId,
        customerExternalId: row?.customerExternalId ?? null,
        customerName: row?.customerName ?? null,
      };
    }),

  // ── Search retail_offering customers for the re-link dropdown ───────────────
  searchCustomersForBundle: protectedProcedure
    .input(z.object({ query: z.string().default('') }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const safeQ = input.query.replace(/'/g, "''");
      const likeClause = safeQ ? `AND (c.name LIKE '%${safeQ}%' OR c.externalId LIKE '%${safeQ}%')` : '';

      const rows = await db!.execute(sql.raw(
        `SELECT c.externalId, c.name,
                (SELECT COUNT(*) FROM billing_items bi WHERE bi.customerExternalId = c.externalId) AS billingItemCount,
                (SELECT COUNT(*) FROM retail_bundles rb WHERE rb.customerExternalId = c.externalId) AS bundleCount
         FROM customers c
         WHERE c.customerType = 'retail_offering'
         ${likeClause}
         ORDER BY c.name
         LIMIT 100`
      ));

      return unwrapRows(rows).map((r: any) => ({
        externalId: r.externalId as string,
        name: r.name as string,
        billingItemCount: Number(r.billingItemCount ?? 0),
        bundleCount: Number(r.bundleCount ?? 0),
      }));
    }),
});

