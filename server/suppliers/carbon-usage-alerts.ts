/**
 * Carbon API — Usage Threshold Alerts
 *
 * Runs after each usage sync (or on demand) to check whether any ABB service
 * has exceeded a data usage threshold. Default threshold: 80% of plan allowance.
 *
 * Algorithm:
 *   1. Load all services that have a carbonServiceId and a dataPlanGb set
 *   2. Load the latest usage snapshot for the current billing period
 *   3. Calculate usagePercent = totalGb / planGb * 100
 *   4. For each threshold level (80, 90, 100):
 *      - If usagePercent >= threshold AND no existing alert for this service/period/threshold:
 *        * Insert a usage_threshold_alerts row
 *        * Send an owner notification (once per threshold breach per billing period)
 *   5. Mark previously active alerts as resolved when usage drops below threshold
 *      (e.g. after a plan reset at the start of a new billing period)
 *
 * Plan allowance source:
 *   - services.dataPlanGb (string field, e.g. "100", "500", "Unlimited")
 *   - If dataPlanGb is "Unlimited" or unparseable, skip threshold check for that service
 */

import { eq, and, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  services,
  serviceUsageSnapshots,
  usageThresholdAlerts,
} from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";

// Threshold levels to check (in ascending order)
const THRESHOLDS = [80, 90, 100] as const;
type ThresholdLevel = typeof THRESHOLDS[number];

// ─── Main check function ──────────────────────────────────────────────────────

export async function checkUsageThresholds(triggeredBy = "scheduled"): Promise<{
  servicesChecked: number;
  alertsCreated: number;
  alertsResolved: number;
  notificationsSent: number;
  errors: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  const db = await getDb();
  if (!db) throw new Error("[UsageAlerts] DB not available");

  const billingPeriod = new Date().toISOString().substring(0, 7); // e.g. '2026-03'

  // Load all ABB services with a carbonServiceId and a numeric dataPlanGb
  const abbServices = await db
    .select({
      externalId: services.externalId,
      carbonServiceId: services.carbonServiceId,
      customerExternalId: services.customerExternalId,
      customerName: services.customerName,
      planName: services.planName,
      locationAddress: services.locationAddress,
      dataPlanGb: services.dataPlanGb,
    })
    .from(services)
    .where(
      and(
        eq(services.status, "active"),
        isNotNull(services.carbonServiceId),
        ne(services.carbonServiceId, ""),
        isNotNull(services.dataPlanGb),
        ne(services.dataPlanGb, ""),
        ne(services.dataPlanGb, "Unlimited"),
        ne(services.dataPlanGb, "unlimited"),
        ne(services.dataPlanGb, "N/A"),
      )
    );

  if (abbServices.length === 0) {
    return { servicesChecked: 0, alertsCreated: 0, alertsResolved: 0, notificationsSent: 0, errors: 0, durationMs: Date.now() - startTime };
  }

  let alertsCreated = 0;
  let alertsResolved = 0;
  let notificationsSent = 0;
  let errors = 0;

  for (const svc of abbServices) {
    try {
      // Parse plan allowance
      const planGbRaw = svc.dataPlanGb?.replace(/[^0-9.]/g, "");
      const planGb = planGbRaw ? parseFloat(planGbRaw) : NaN;
      if (isNaN(planGb) || planGb <= 0) continue;

      // Load latest usage snapshot for this billing period
      const snapshots = await db
        .select({
          totalGb: serviceUsageSnapshots.totalGb,
          downloadGb: serviceUsageSnapshots.downloadGb,
          uploadGb: serviceUsageSnapshots.uploadGb,
          daysTotal: serviceUsageSnapshots.daysTotal,
          daysRemaining: serviceUsageSnapshots.daysRemaining,
        })
        .from(serviceUsageSnapshots)
        .where(
          and(
            eq(serviceUsageSnapshots.serviceExternalId, svc.externalId),
            eq(serviceUsageSnapshots.billingPeriod, billingPeriod)
          )
        )
        .limit(1);

      if (snapshots.length === 0) continue;
      const snap = snapshots[0];
      const usedGb = parseFloat(String(snap.totalGb ?? 0));
      const usagePercent = (usedGb / planGb) * 100;

      // Check each threshold level
      for (const threshold of THRESHOLDS) {
        const breached = usagePercent >= threshold;

        // Check if an alert already exists for this service/period/threshold
        const existingAlerts = await db
          .select({ id: usageThresholdAlerts.id, status: usageThresholdAlerts.status, notificationSent: usageThresholdAlerts.notificationSent })
          .from(usageThresholdAlerts)
          .where(
            and(
              eq(usageThresholdAlerts.serviceExternalId, svc.externalId),
              eq(usageThresholdAlerts.billingPeriod, billingPeriod),
              eq(usageThresholdAlerts.thresholdPercent, threshold)
            )
          )
          .limit(1);

        if (breached) {
          if (existingAlerts.length === 0) {
            // Create new alert
            await db.insert(usageThresholdAlerts).values({
              serviceExternalId: svc.externalId,
              carbonServiceId: svc.carbonServiceId || null,
              customerExternalId: svc.customerExternalId || null,
              billingPeriod,
              thresholdPercent: threshold,
              usedGb: usedGb.toFixed(3),
              planGb: planGb.toFixed(3),
              usagePercent: usagePercent.toFixed(2),
              status: "active",
              notificationSent: 0,
            });
            alertsCreated++;

            // Send owner notification (fire-and-forget, don't block on failure)
            try {
              const daysInfo = snap.daysRemaining != null
                ? ` (${snap.daysRemaining} day${snap.daysRemaining === 1 ? "" : "s"} remaining in billing period)`
                : "";
              const notifTitle = `⚠️ Usage Alert: ${threshold}% threshold reached`;
              const notifContent = [
                `**Service:** ${svc.planName || svc.externalId}`,
                `**Customer:** ${svc.customerName || svc.customerExternalId || "Unknown"}`,
                `**Address:** ${svc.locationAddress || "—"}`,
                `**Usage:** ${usedGb.toFixed(1)} GB of ${planGb} GB (${usagePercent.toFixed(1)}%)${daysInfo}`,
                `**Billing Period:** ${billingPeriod}`,
                `**Threshold:** ${threshold}%`,
                ``,
                `This service has consumed ${threshold}% or more of its monthly data allowance. Please review whether the customer needs a plan upgrade or usage management.`,
              ].join("\n");

              const sent = await notifyOwner({ title: notifTitle, content: notifContent });
              if (sent) {
                await db
                  .update(usageThresholdAlerts)
                  .set({ notificationSent: 1, notificationSentAt: new Date() })
                  .where(
                    and(
                      eq(usageThresholdAlerts.serviceExternalId, svc.externalId),
                      eq(usageThresholdAlerts.billingPeriod, billingPeriod),
                      eq(usageThresholdAlerts.thresholdPercent, threshold)
                    )
                  );
                notificationsSent++;
              }
            } catch (notifErr) {
              console.warn(`[UsageAlerts] Notification failed for ${svc.externalId}:`, notifErr);
            }
          } else {
            // Alert exists — update usage figures
            await db
              .update(usageThresholdAlerts)
              .set({
                usedGb: usedGb.toFixed(3),
                usagePercent: usagePercent.toFixed(2),
                status: "active",
              })
              .where(eq(usageThresholdAlerts.id, existingAlerts[0].id));
          }
        } else {
          // Not breached — if there was an active alert, resolve it
          if (existingAlerts.length > 0 && existingAlerts[0].status === "active") {
            await db
              .update(usageThresholdAlerts)
              .set({ status: "resolved" })
              .where(eq(usageThresholdAlerts.id, existingAlerts[0].id));
            alertsResolved++;
          }
        }
      }
    } catch (err) {
      console.error(`[UsageAlerts] Error checking service ${svc.externalId}:`, err);
      errors++;
    }
  }

  return {
    servicesChecked: abbServices.length,
    alertsCreated,
    alertsResolved,
    notificationsSent,
    errors,
    durationMs: Date.now() - startTime,
  };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getUsageThresholdAlerts(
  status?: string,
  customerExternalId?: string,
  billingPeriod?: string
) {
  const db = await getDb();
  if (!db) return [];

  const period = billingPeriod || new Date().toISOString().substring(0, 7);
  const conditions = [eq(usageThresholdAlerts.billingPeriod, period)];

  if (status) {
    conditions.push(eq(usageThresholdAlerts.status, status));
  }
  if (customerExternalId) {
    conditions.push(eq(usageThresholdAlerts.customerExternalId, customerExternalId));
  }

  // Join with services to get display info
  const rows = await db
    .select({
      id: usageThresholdAlerts.id,
      serviceExternalId: usageThresholdAlerts.serviceExternalId,
      carbonServiceId: usageThresholdAlerts.carbonServiceId,
      customerExternalId: usageThresholdAlerts.customerExternalId,
      billingPeriod: usageThresholdAlerts.billingPeriod,
      thresholdPercent: usageThresholdAlerts.thresholdPercent,
      usedGb: usageThresholdAlerts.usedGb,
      planGb: usageThresholdAlerts.planGb,
      usagePercent: usageThresholdAlerts.usagePercent,
      status: usageThresholdAlerts.status,
      notificationSent: usageThresholdAlerts.notificationSent,
      notificationSentAt: usageThresholdAlerts.notificationSentAt,
      acknowledgedBy: usageThresholdAlerts.acknowledgedBy,
      acknowledgedAt: usageThresholdAlerts.acknowledgedAt,
      createdAt: usageThresholdAlerts.createdAt,
      // Service info
      planName: services.planName,
      customerName: services.customerName,
      locationAddress: services.locationAddress,
      provider: services.provider,
    })
    .from(usageThresholdAlerts)
    .leftJoin(services, eq(services.externalId, usageThresholdAlerts.serviceExternalId))
    .where(and(...conditions))
    .orderBy(sql`${usageThresholdAlerts.usagePercent} DESC`);

  return rows.map(r => ({
    ...r,
    usedGb: parseFloat(String(r.usedGb)),
    planGb: r.planGb ? parseFloat(String(r.planGb)) : null,
    usagePercent: parseFloat(String(r.usagePercent)),
  }));
}

export async function acknowledgeUsageAlert(alertId: number, acknowledgedBy: string) {
  const db = await getDb();
  if (!db) throw new Error("[UsageAlerts] DB not available");
  await db
    .update(usageThresholdAlerts)
    .set({ status: "acknowledged", acknowledgedBy, acknowledgedAt: new Date() })
    .where(eq(usageThresholdAlerts.id, alertId));
  return { success: true };
}

export async function getAlertSummaryForService(serviceExternalId: string, billingPeriod?: string) {
  const db = await getDb();
  if (!db) return null;
  const period = billingPeriod || new Date().toISOString().substring(0, 7);
  const rows = await db
    .select()
    .from(usageThresholdAlerts)
    .where(
      and(
        eq(usageThresholdAlerts.serviceExternalId, serviceExternalId),
        eq(usageThresholdAlerts.billingPeriod, period),
        eq(usageThresholdAlerts.status, "active")
      )
    )
    .orderBy(sql`${usageThresholdAlerts.thresholdPercent} DESC`)
    .limit(1);
  return rows[0] ?? null;
}
