/**
 * Vocus Mobile Bucket Quota Alert System
 * ----------------------------------------
 * Checks the latest bucket usage snapshot in the database and sends:
 *   1. A platform owner notification (via Manus notifyOwner — in-app only)
 *
 * NOTE: The SendGrid email channel has been intentionally disabled.
 * Email was generating duplicate Halo tickets (angusbs@smileit.com.au).
 * In-app owner notifications remain active.
 *
 * Thresholds: 70% (medium), 90% (high), 100%+ (critical / over-quota)
 *
 * Called daily at 8am AEST from the scheduled jobs runner in server/_core/index.ts.
 * Can also be triggered manually via the tRPC vocus.checkQuotaAlerts procedure.
 */

import { getDb } from "./db";
import { vocusBuckets } from "../drizzle/schema";
import { desc } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
// sendEmail intentionally disabled — was generating duplicate Halo tickets via angusbs@smileit.com.au
// import { sendEmail, buildAlertEmail } from "./_core/email";

// Alert thresholds (percentage of quota used)
const THRESHOLDS = [
  { pct: 100, label: "OVER QUOTA", emoji: "🚨", urgency: "CRITICAL" as const },
  { pct: 90,  label: "90% Used",   emoji: "⚠️",  urgency: "HIGH" as const },
  { pct: 70,  label: "70% Used",   emoji: "📊",  urgency: "MEDIUM" as const },
];

const ALERT_EMAIL = "notifications@smiletel.com.au";

export interface QuotaAlertResult {
  bucketsChecked: number;
  alertsSent: number;
  alerts: Array<{
    bucketDomain: string;
    bucketType: string;
    usedGb: number;
    quotaGb: number;
    pctUsed: number;
    threshold: string;
    notified: boolean;
    emailSent: boolean;
  }>;
  checkedAt: string;
}

export async function checkVocusQuotaAlerts(): Promise<QuotaAlertResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("[VocusQuotaAlert] Database not available");
  }

  // Get the latest snapshot for each bucket domain
  const allBuckets = await db
    .select()
    .from(vocusBuckets)
    .orderBy(desc(vocusBuckets.snapshotDate));

  // Deduplicate: keep only the most recent snapshot per bucket domain
  const latestByDomain = new Map<string, typeof allBuckets[0]>();
  for (const bucket of allBuckets) {
    const key = `${bucket.realm}:${bucket.bucketType}`;
    if (!latestByDomain.has(key)) {
      latestByDomain.set(key, bucket);
    }
  }

  const result: QuotaAlertResult = {
    bucketsChecked: latestByDomain.size,
    alertsSent: 0,
    alerts: [],
    checkedAt: new Date().toISOString(),
  };

  const checkedAtStr = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }) + " AEST";

  for (const bucket of Array.from(latestByDomain.values())) {
    const usedGb = parseFloat(String(bucket.dataUsedMb ?? 0)) / 1024;
    const quotaGb = (bucket.dataQuotaMb ?? 0) / 1024;

    if (quotaGb <= 0) continue; // Skip buckets with no quota set

    const pctUsed = (usedGb / quotaGb) * 100;

    // Find the highest threshold breached
    const breached = THRESHOLDS.find((t) => pctUsed >= t.pct);
    if (!breached) continue;

    const bucketLabel =
      bucket.bucketType === "standard_mobile"
        ? "Standard Mobile"
        : bucket.bucketType === "4g_backup"
        ? "4G Backup"
        : bucket.bucketType === "STANDARD-POSTPAID"
        ? "STANDARD-POSTPAID"
        : (bucket.bucketType ?? "Unknown");

    const overageGb = Math.max(0, usedGb - quotaGb).toFixed(2);
    const remainingGb = Math.max(0, quotaGb - usedGb).toFixed(2);

    const emailTitle = `${breached.emoji} Vocus ${bucketLabel} Bucket — ${breached.label}`;

    const bodyLines = [
      `**Bucket:** ${bucketLabel} (${bucket.realm})`,
      `**Usage:** ${usedGb.toFixed(2)} GB of ${quotaGb.toFixed(0)} GB (${pctUsed.toFixed(1)}%)`,
      pctUsed >= 100
        ? `**Overage:** ${overageGb} GB over quota — additional charges may apply`
        : `**Remaining:** ${remainingGb} GB`,
      `**SIM Count:** ${bucket.simCount ?? "—"}`,
    ];

    const actionLine =
      breached.pct >= 100
        ? "⚡ Action required: Log into the Vocus Members Portal and increase the bucket quota for next month to avoid excess charges."
        : breached.pct >= 90
        ? "⚡ Action recommended: Consider increasing the bucket quota for next month before the billing period ends."
        : "ℹ️ Monitor usage closely. At current rate, quota may be exceeded before month end.";

    // Email channel disabled — was generating duplicate Halo tickets.
    // Only in-app owner notification is sent.
    const emailSent = false;

    // Send platform owner notification (in-app only)
    let notified = false;
    try {
      const content = [
        `**Bucket:** ${bucketLabel} (${bucket.realm})`,
        `**Usage:** ${usedGb.toFixed(2)} GB of ${quotaGb.toFixed(0)} GB (${pctUsed.toFixed(1)}%)`,
        pctUsed >= 100
          ? `**Overage:** ${overageGb} GB over quota — additional charges may apply`
          : `**Remaining:** ${remainingGb} GB`,
        ``,
        `**Urgency:** ${breached.urgency}`,
        ``,
        actionLine,
        ``,
        `Checked at: ${checkedAtStr}`,
      ].join("\n");
      notified = await notifyOwner({ title: emailTitle, content });
      console.log(`[VocusQuotaAlert] In-app notification sent for ${bucketLabel} (email channel disabled).`);
    } catch (err) {
      console.warn(`[VocusQuotaAlert] Owner notify failed for ${bucketLabel}:`, err);
    }

    console.log(
      `[VocusQuotaAlert] ${breached.emoji} ${bucketLabel}: ${pctUsed.toFixed(1)}% used ` +
      `(${usedGb.toFixed(2)}/${quotaGb}GB) — ${breached.label} — email: ${emailSent} notified: ${notified}`
    );

    result.alerts.push({
      bucketDomain: bucket.realm ?? "",
      bucketType: bucket.bucketType ?? "",
      usedGb,
      quotaGb,
      pctUsed,
      threshold: breached.label,
      notified: notified || emailSent,
      emailSent,
    });

    if (notified || emailSent) result.alertsSent++;
  }

  return result;
}
