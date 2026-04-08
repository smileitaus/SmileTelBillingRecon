/**
 * Carbon API — Outage Monitor & Usage Sync
 *
 * Outage polling: Fetches outage data for all ABB services every 15 minutes.
 *   - Calls GET /service/{id}/outages for each service with a carbonServiceId
 *   - Upserts into service_outages table
 *   - Marks previously-active outages as resolved when they no longer appear
 *
 * Usage sync: Fetches current billing period usage for all ABB services nightly.
 *   - Calls GET /broadband/{id}/usage for each service
 *   - Upserts into service_usage_snapshots table (one row per service per billing period)
 */

import { eq, and, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import { services, serviceOutages, serviceUsageSnapshots } from "../../drizzle/schema";

const CARBON_BASE_URL = "https://api.carbon.aussiebroadband.com.au";

// ─── Auth helpers (reuse same pattern as db.ts) ──────────────────────────────

function getCarbonPassword(): string {
  const prefix = process.env.CARBON_PASSWORD_PREFIX;
  const suffix = process.env.CARBON_PASSWORD_SUFFIX;
  if (!prefix || !suffix) throw new Error("[CarbonOutage] CARBON_PASSWORD_PREFIX/SUFFIX not set");
  return `${prefix}$X${suffix}`;
}

async function carbonLogin(): Promise<string> {
  const username = process.env.CARBON_USERNAME;
  if (!username) throw new Error("[CarbonOutage] CARBON_USERNAME not set");
  const res = await fetch(`${CARBON_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password: getCarbonPassword() }),
  });
  if (!res.ok) throw new Error(`[CarbonOutage] Login failed (${res.status})`);
  const rawCookies = res.headers.get("set-cookie") || "";
  const cookieStr = rawCookies
    .split(",")
    .map((c: string) => c.trim().split(";")[0])
    .join("; ");
  if (!cookieStr) throw new Error("[CarbonOutage] No session cookie returned");
  return cookieStr;
}

// ─── Outage types from Carbon API ────────────────────────────────────────────

interface CarbonOutageItem {
  id?: string | number;
  type?: string;
  title?: string;
  description?: string;
  status?: string;
  severity?: string;
  start_time?: string;
  end_time?: string;
  estimated_resolution?: string;
  [key: string]: unknown;
}

interface CarbonOutageResponse {
  networkEvents?: CarbonOutageItem[];
  aussieOutages?: CarbonOutageItem[];
  currentNbnOutages?: CarbonOutageItem[];
  scheduledNbnOutages?: CarbonOutageItem[];
  resolvedNbnOutages?: CarbonOutageItem[];
  resolvedScheduledNbnOutages?: CarbonOutageItem[];
}

// ─── Usage types from Carbon API ─────────────────────────────────────────────

interface CarbonUsageResponse {
  downloadedMb?: number;
  uploadedMb?: number;
  remainingMb?: number;
  daysTotal?: number;
  daysRemaining?: number;
  national?: number;
  mobile?: number;
  international?: number;
  sms?: number;
  [key: string]: unknown;
}

// ─── Outage Sync ─────────────────────────────────────────────────────────────

export async function syncCarbonOutages(triggeredBy = "scheduled"): Promise<{
  servicesChecked: number;
  outagesFound: number;
  outagesCreated: number;
  outagesResolved: number;
  errors: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  const db = await getDb();
  if (!db) throw new Error("[CarbonOutage] DB not available");

  // Get all ABB services that have a carbonServiceId
  const abbServices = await db
    .select({
      externalId: services.externalId,
      carbonServiceId: services.carbonServiceId,
      customerExternalId: services.customerExternalId,
    })
    .from(services)
    .where(
      and(
        eq(services.status, "active"),
        isNotNull(services.carbonServiceId),
        ne(services.carbonServiceId, "")
      )
    );

  if (abbServices.length === 0) {
    return { servicesChecked: 0, outagesFound: 0, outagesCreated: 0, outagesResolved: 0, errors: 0, durationMs: Date.now() - startTime };
  }

  let cookie: string;
  try {
    cookie = await carbonLogin();
  } catch (err) {
    throw new Error(`[CarbonOutage] Auth failed: ${err}`);
  }

  let outagesFound = 0;
  let outagesCreated = 0;
  let outagesResolved = 0;
  let errors = 0;

  // Track which outage IDs are still active (for resolving stale ones)
  const seenOutageKeys = new Set<string>();

  for (const svc of abbServices) {
    try {
      // Rate limit: 200ms delay between requests to avoid 429s
      await new Promise(r => setTimeout(r, 200));
      const res = await fetch(
        `${CARBON_BASE_URL}/service/${svc.carbonServiceId}/outages`,
        { headers: { Accept: "application/json", cookie } }
      );
      if (!res.ok) {
        if (res.status === 404) continue; // service not found in Carbon — skip
        errors++;
        continue;
      }
      const data = (await res.json()) as CarbonOutageResponse;

      // Flatten all outage categories into a single list
      // Use Array.isArray() to guard against null/object responses from the API
      const toItems = (arr: unknown, type: string) =>
        Array.isArray(arr) ? arr.map((i: CarbonOutageItem) => ({ item: i, type })) : [];
      const allOutages: Array<{ item: CarbonOutageItem; type: string }> = [
        ...toItems(data.networkEvents, "networkEvent"),
        ...toItems(data.aussieOutages, "aussieOutage"),
        ...toItems(data.currentNbnOutages, "currentNbnOutage"),
        ...toItems(data.scheduledNbnOutages, "scheduledNbnOutage"),
        ...toItems(data.resolvedNbnOutages, "resolvedNbnOutage"),
        ...toItems(data.resolvedScheduledNbnOutages, "resolvedScheduledNbnOutage"),
      ];

      outagesFound += allOutages.length;

      for (const { item, type } of allOutages) {
        const outageId = item.id ? String(item.id) : null;
        const isResolved = type.startsWith("resolved");
        const status = isResolved ? "resolved" : type === "scheduledNbnOutage" ? "scheduled" : "active";

        // Unique key for deduplication: service + outageId (or title if no id)
        const dedupeKey = `${svc.externalId}:${outageId || item.title || type}`;
        seenOutageKeys.add(dedupeKey);

        // Check if this outage already exists
        const existing = await db
          .select({ id: serviceOutages.id, status: serviceOutages.status })
          .from(serviceOutages)
          .where(
            and(
              eq(serviceOutages.serviceExternalId, svc.externalId),
              outageId
                ? eq(serviceOutages.outageId, outageId)
                : eq(serviceOutages.outageType, type)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update lastSeenAt and status
          await db
            .update(serviceOutages)
            .set({
              lastSeenAt: new Date(),
              status,
              ...(isResolved && !existing[0].status.startsWith("resolved")
                ? { resolvedAt: new Date() }
                : {}),
            })
            .where(eq(serviceOutages.id, existing[0].id));
        } else {
          // Insert new outage
          await db.insert(serviceOutages).values({
            serviceExternalId: svc.externalId,
            carbonServiceId: svc.carbonServiceId || null,
            customerExternalId: svc.customerExternalId || null,
            outageType: type,
            outageId,
            title: item.title ? String(item.title).substring(0, 511) : null,
            description: item.description ? String(item.description) : null,
            status,
            severity: item.severity ? String(item.severity) : null,
            startTime: item.start_time ? new Date(item.start_time) : null,
            endTime: item.end_time ? new Date(item.end_time) : null,
            estimatedResolution: item.estimated_resolution
              ? new Date(item.estimated_resolution)
              : null,
            rawJson: JSON.stringify(item),
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          });
          outagesCreated++;
        }
      }
    } catch (err) {
      console.error(`[CarbonOutage] Error checking service ${svc.externalId}:`, err);
      errors++;
    }
  }

  // Mark any previously-active outages that weren't seen this run as resolved
  // (Only for services we actually checked successfully)
  const checkedServiceIds = abbServices.map((s) => s.externalId);
  if (checkedServiceIds.length > 0) {
    const staleResult = await db
      .update(serviceOutages)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(
        and(
          inArray(serviceOutages.serviceExternalId, checkedServiceIds),
          eq(serviceOutages.status, "active"),
          // lastSeenAt older than 20 minutes (missed at least one poll cycle)
          sql`${serviceOutages.lastSeenAt} < DATE_SUB(NOW(), INTERVAL 20 MINUTE)`
        )
      );
    outagesResolved = (staleResult as unknown as { affectedRows?: number }[])[0]
      ? ((staleResult as unknown as { affectedRows?: number }[])[0].affectedRows ?? 0)
      : 0;
  }

  return {
    servicesChecked: abbServices.length,
    outagesFound,
    outagesCreated,
    outagesResolved,
    errors,
    durationMs: Date.now() - startTime,
  };
}

// ─── Usage Sync ───────────────────────────────────────────────────────────────

export async function syncCarbonUsage(triggeredBy = "scheduled"): Promise<{
  servicesChecked: number;
  snapshotsCreated: number;
  snapshotsUpdated: number;
  errors: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  const db = await getDb();
  if (!db) throw new Error("[CarbonUsage] DB not available");

  const abbServices = await db
    .select({
      externalId: services.externalId,
      carbonServiceId: services.carbonServiceId,
      customerExternalId: services.customerExternalId,
    })
    .from(services)
    .where(
      and(
        eq(services.status, "active"),
        isNotNull(services.carbonServiceId),
        ne(services.carbonServiceId, "")
      )
    );

  if (abbServices.length === 0) {
    return { servicesChecked: 0, snapshotsCreated: 0, snapshotsUpdated: 0, errors: 0, durationMs: Date.now() - startTime };
  }

  let cookie: string;
  try {
    cookie = await carbonLogin();
  } catch (err) {
    throw new Error(`[CarbonUsage] Auth failed: ${err}`);
  }

  const billingPeriod = new Date().toISOString().substring(0, 7); // e.g. '2026-03'
  let snapshotsCreated = 0;
  let snapshotsUpdated = 0;
  let errors = 0;

  for (const svc of abbServices) {
    try {
      // Rate limit: 200ms delay between requests to avoid 429s
      await new Promise(r => setTimeout(r, 200));
      const res = await fetch(
        `${CARBON_BASE_URL}/broadband/${svc.carbonServiceId}/usage`,
        { headers: { Accept: "application/json", cookie } }
      );
      if (!res.ok) {
        if (res.status === 404) continue;
        errors++;
        continue;
      }
      const data = (await res.json()) as CarbonUsageResponse;

      const downloadGb = ((data.downloadedMb ?? 0) / 1024).toFixed(3);
      const uploadGb = ((data.uploadedMb ?? 0) / 1024).toFixed(3);
      const totalGb = (parseFloat(downloadGb) + parseFloat(uploadGb)).toFixed(3);

      // Check for existing snapshot this billing period
      const existing = await db
        .select({ id: serviceUsageSnapshots.id })
        .from(serviceUsageSnapshots)
        .where(
          and(
            eq(serviceUsageSnapshots.serviceExternalId, svc.externalId),
            eq(serviceUsageSnapshots.billingPeriod, billingPeriod)
          )
        )
        .limit(1);

      const snapshotData = {
        downloadGb,
        uploadGb,
        totalGb,
        daysTotal: data.daysTotal ?? null,
        daysRemaining: data.daysRemaining ?? null,
        nationalMinutes: data.national != null ? String(data.national) : null,
        mobileMinutes: data.mobile != null ? String(data.mobile) : null,
        internationalMinutes: data.international != null ? String(data.international) : null,
        smsCount: data.sms ?? null,
        rawJson: JSON.stringify(data),
        fetchedAt: new Date(),
      };

      if (existing.length > 0) {
        await db
          .update(serviceUsageSnapshots)
          .set(snapshotData)
          .where(eq(serviceUsageSnapshots.id, existing[0].id));
        snapshotsUpdated++;
      } else {
        await db.insert(serviceUsageSnapshots).values({
          serviceExternalId: svc.externalId,
          carbonServiceId: svc.carbonServiceId || null,
          customerExternalId: svc.customerExternalId || null,
          billingPeriod,
          ...snapshotData,
        });
        snapshotsCreated++;
      }
    } catch (err) {
      console.error(`[CarbonUsage] Error syncing usage for ${svc.externalId}:`, err);
      errors++;
    }
  }

  return {
    servicesChecked: abbServices.length,
    snapshotsCreated,
    snapshotsUpdated,
    errors,
    durationMs: Date.now() - startTime,
  };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getActiveOutages(customerExternalId?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(serviceOutages.status, "active")];
  if (customerExternalId) {
    conditions.push(eq(serviceOutages.customerExternalId, customerExternalId));
  }
  return db
    .select()
    .from(serviceOutages)
    .where(and(...conditions))
    .orderBy(sql`${serviceOutages.firstSeenAt} DESC`)
    .limit(200);
}

export async function getOutageHistory(serviceExternalId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(serviceOutages)
    .where(eq(serviceOutages.serviceExternalId, serviceExternalId))
    .orderBy(sql`${serviceOutages.firstSeenAt} DESC`)
    .limit(50);
}

export async function getUsageSnapshot(serviceExternalId: string, billingPeriod?: string) {
  const db = await getDb();
  if (!db) return null;
  const period = billingPeriod || new Date().toISOString().substring(0, 7);
  const rows = await db
    .select()
    .from(serviceUsageSnapshots)
    .where(
      and(
        eq(serviceUsageSnapshots.serviceExternalId, serviceExternalId),
        eq(serviceUsageSnapshots.billingPeriod, period)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getCustomerUsageSnapshots(customerExternalId: string, billingPeriod?: string) {
  const db = await getDb();
  if (!db) return [];
  const period = billingPeriod || new Date().toISOString().substring(0, 7);
  return db
    .select()
    .from(serviceUsageSnapshots)
    .where(
      and(
        eq(serviceUsageSnapshots.customerExternalId, customerExternalId),
        eq(serviceUsageSnapshots.billingPeriod, period)
      )
    );
}
