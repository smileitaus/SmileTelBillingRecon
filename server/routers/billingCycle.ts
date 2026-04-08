import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeriodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function prevPeriodKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return fmtPeriodKey(d);
}

function extractRows(result: any): any[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? result[0] : result;
  }
  return result.rows || [];
}

// ── Router ────────────────────────────────────────────────────────────────────

export const billingCycleRouter = router({
  // List all billing periods (most recent first)
  listPeriods: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const result = await db.execute(sql`SELECT * FROM billing_periods ORDER BY periodKey DESC`) as any;
    return extractRows(result);
  }),

  // Get a billing period
  getPeriod: protectedProcedure
    .input(z.object({ periodKey: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.execute(
        sql`SELECT * FROM billing_periods WHERE periodKey = ${input.periodKey}`
      ) as any;
      const rows = extractRows(result);
      return rows[0] || null;
    }),

  // Create a new billing period (or return existing)
  createPeriod: protectedProcedure
    .input(z.object({
      periodKey: z.string().regex(/^\d{4}-\d{2}$/),
      label: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(
        sql`INSERT IGNORE INTO billing_periods (periodKey, label, status) VALUES (${input.periodKey}, ${input.label}, 'pending')`
      );
      const result = await db.execute(
        sql`SELECT * FROM billing_periods WHERE periodKey = ${input.periodKey}`
      ) as any;
      return extractRows(result)[0];
    }),

  // Get checklist items for a period
  getChecklist: protectedProcedure
    .input(z.object({ periodKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const result = await db.execute(
        sql`SELECT * FROM recon_checklist_items WHERE periodKey = ${input.periodKey} ORDER BY sortOrder ASC`
      ) as any;
      return extractRows(result);
    }),

  // Mark a checklist item as uploaded/synced/pending/skipped
  markChecklistItem: protectedProcedure
    .input(z.object({
      periodKey: z.string(),
      itemKey: z.string(),
      status: z.enum(["pending", "uploaded", "synced", "skipped"]),
      uploadRef: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const uploadedAt = input.status !== "pending" ? new Date() : null;
      const uploadedBy = ctx.user.name || ctx.user.openId;
      await db.execute(sql`
        UPDATE recon_checklist_items 
        SET status = ${input.status},
            uploadedAt = ${uploadedAt},
            uploadedBy = ${uploadedBy},
            uploadRef = ${input.uploadRef ?? null},
            notes = ${input.notes ?? null},
            updatedAt = NOW()
        WHERE periodKey = ${input.periodKey} AND itemKey = ${input.itemKey}
      `);
      // Check if all required items are now complete
      const countResult = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM recon_checklist_items 
        WHERE periodKey = ${input.periodKey} AND isRequired = 1 AND status = 'pending'
      `) as any;
      const pendingCount = extractRows(countResult)[0]?.cnt ?? 0;
      if (pendingCount === 0) {
        await db.execute(sql`
          UPDATE billing_periods 
          SET checklistCompletedAt = NOW(), status = 'in_progress', updatedAt = NOW() 
          WHERE periodKey = ${input.periodKey}
        `);
      }
      return { success: true, pendingRequired: Number(pendingCount) };
    }),

  // Get supplier monthly snapshots for trend graphs
  getSupplierSnapshots: protectedProcedure
    .input(z.object({
      periodKeys: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      let result: any;
      if (input.periodKeys && input.periodKeys.length > 0) {
        // Use raw SQL for IN clause
        const keys = input.periodKeys.map(k => `'${k.replace(/[^0-9-]/g, "")}'`).join(",");
        result = await db.execute(
          sql.raw(`SELECT * FROM supplier_monthly_snapshots WHERE periodKey IN (${keys}) ORDER BY periodKey ASC, supplierName ASC`)
        ) as any;
      } else {
        result = await db.execute(
          sql`SELECT * FROM supplier_monthly_snapshots ORDER BY periodKey ASC, supplierName ASC`
        ) as any;
      }
      return extractRows(result);
    }),

  // Snapshot supplier costs for a period
  snapshotSupplierCosts: protectedProcedure
    .input(z.object({ periodKey: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const prev = prevPeriodKey(input.periodKey);

      const costsResult = await db.execute(sql`
        SELECT 
          COALESCE(provider, supplierName, supplierAccount, 'Unknown') as supplierName,
          COUNT(*) as serviceCount,
          ROUND(SUM(CAST(monthlyCost AS DECIMAL(10,2))), 2) as totalCostExGst,
          ROUND(SUM(CAST(monthlyCost AS DECIMAL(10,2))) * 1.1, 2) as totalCostIncGst
        FROM services 
        WHERE status = 'active' AND monthlyCost > 0
        GROUP BY COALESCE(provider, supplierName, supplierAccount, 'Unknown')
        ORDER BY totalCostExGst DESC
      `) as any;
      const supplierCosts = extractRows(costsResult);

      const prevResult = await db.execute(
        sql`SELECT supplierName, invoicedExGst FROM supplier_monthly_snapshots WHERE periodKey = ${prev}`
      ) as any;
      const prevMap = new Map(extractRows(prevResult).map((r: any) => [r.supplierName, r.invoicedExGst]));

      let inserted = 0;
      for (const row of supplierCosts) {
        const prevInvoiced = prevMap.get(row.supplierName);
        const prevVal = prevInvoiced ? parseFloat(prevInvoiced) : null;
        const currVal = parseFloat(row.totalCostExGst);
        let deltaExGst = null, deltaPct = null, deltaDirection = "new";
        if (prevVal !== null) {
          deltaExGst = Math.round((currVal - prevVal) * 100) / 100;
          deltaPct = Math.round((deltaExGst / prevVal) * 10000) / 100;
          deltaDirection = deltaExGst > 0.5 ? "up" : deltaExGst < -0.5 ? "down" : "flat";
        }
        await db.execute(sql`
          INSERT IGNORE INTO supplier_monthly_snapshots 
            (periodKey, supplierName, expectedCostExGst, expectedCostIncGst, serviceCount, prevPeriodKey, prevInvoicedExGst, deltaExGst, deltaPct, deltaDirection)
          VALUES (${input.periodKey}, ${row.supplierName}, ${row.totalCostExGst}, ${row.totalCostIncGst}, ${row.serviceCount}, ${prev}, ${prevVal}, ${deltaExGst}, ${deltaPct}, ${deltaDirection})
        `);
        inserted++;
      }
      return { inserted };
    }),

  // Get discrepancy alerts for a period
  getDiscrepancies: protectedProcedure
    .input(z.object({
      periodKey: z.string(),
      status: z.enum(["open", "acknowledged", "resolved", "all"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      let result: any;
      if (input.status && input.status !== "all") {
        result = await db.execute(sql`
          SELECT * FROM discrepancy_alerts 
          WHERE periodKey = ${input.periodKey} AND status = ${input.status}
          ORDER BY severity DESC, changePct DESC
        `) as any;
      } else {
        result = await db.execute(sql`
          SELECT * FROM discrepancy_alerts 
          WHERE periodKey = ${input.periodKey}
          ORDER BY severity DESC, changePct DESC
        `) as any;
      }
      return extractRows(result);
    }),

  // Run discrepancy detection for a period (compares invoiced vs previous month)
  runDiscrepancyDetection: protectedProcedure
    .input(z.object({ periodKey: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const prev = prevPeriodKey(input.periodKey);

      const currResult = await db.execute(
        sql`SELECT * FROM supplier_monthly_snapshots WHERE periodKey = ${input.periodKey}`
      ) as any;
      const prevResult = await db.execute(
        sql`SELECT * FROM supplier_monthly_snapshots WHERE periodKey = ${prev}`
      ) as any;

      const currSnaps = extractRows(currResult);
      const prevSnaps = extractRows(prevResult);
      const prevMap = new Map(prevSnaps.map((r: any) => [r.supplierName, r]));
      let alertsCreated = 0;

      for (const curr of currSnaps) {
        const prevSnap = prevMap.get(curr.supplierName);
        const currInvoiced = curr.invoicedExGst ? parseFloat(curr.invoicedExGst) : null;
        const prevInvoiced = prevSnap?.invoicedExGst ? parseFloat(prevSnap.invoicedExGst) : null;

        if (currInvoiced === null) {
          await db.execute(sql`
            INSERT IGNORE INTO discrepancy_alerts 
              (periodKey, supplierName, alertType, severity, reason)
            VALUES (${input.periodKey}, ${curr.supplierName}, 'invoice_missing', 'warning',
              ${`No invoice received from ${curr.supplierName} for ${input.periodKey}. Expected cost: $${curr.expectedCostExGst} ex GST.`})
          `);
          alertsCreated++;
          continue;
        }

        if (prevInvoiced !== null && prevInvoiced > 0) {
          const changePct = ((currInvoiced - prevInvoiced) / prevInvoiced) * 100;
          const changeAmt = Math.round((currInvoiced - prevInvoiced) * 100) / 100;

          if (Math.abs(changePct) >= 10) {
            const alertType = changePct > 0 ? "cost_increase" : "cost_decrease";
            const severity = Math.abs(changePct) >= 25 ? "critical" : "warning";
            let reason = `${curr.supplierName} invoice ${changePct > 0 ? "increased" : "decreased"} by ${Math.abs(changePct).toFixed(1)}% ($${Math.abs(changeAmt).toFixed(2)} ex GST) vs ${prev}. `;
            reason += `Previous: $${prevInvoiced.toFixed(2)} → Current: $${currInvoiced.toFixed(2)}.`;
            if (curr.serviceCount !== prevSnap?.serviceCount) {
              const diff = curr.serviceCount - (prevSnap?.serviceCount || 0);
              reason += ` Service count changed by ${diff > 0 ? "+" : ""}${diff}.`;
            }

            await db.execute(sql`
              INSERT IGNORE INTO discrepancy_alerts 
                (periodKey, supplierName, alertType, severity, prevAmountExGst, currAmountExGst, changeAmountExGst, changePct, reason)
              VALUES (${input.periodKey}, ${curr.supplierName}, ${alertType}, ${severity},
                ${prevInvoiced}, ${currInvoiced}, ${changeAmt}, ${Math.round(changePct * 100) / 100}, ${reason})
            `);
            alertsCreated++;
          }
        }
      }

      // Suppliers present last month but missing this month
      const currSuppliers = new Set(currSnaps.map((r: any) => r.supplierName));
      for (const prevSnap of prevSnaps) {
        if (!currSuppliers.has(prevSnap.supplierName) && prevSnap.invoicedExGst) {
          const reason = `${prevSnap.supplierName} had an invoice of $${parseFloat(prevSnap.invoicedExGst).toFixed(2)} ex GST in ${prev} but has no snapshot for ${input.periodKey}. Verify if this supplier is still active.`;
          await db.execute(sql`
            INSERT IGNORE INTO discrepancy_alerts 
              (periodKey, supplierName, alertType, severity, prevAmountExGst, reason)
            VALUES (${input.periodKey}, ${prevSnap.supplierName}, 'service_dropped', 'critical', ${prevSnap.invoicedExGst}, ${reason})
          `);
          alertsCreated++;
        }
      }

      return { alertsCreated };
    }),

  // Acknowledge or resolve a discrepancy alert
  acknowledgeAlert: protectedProcedure
    .input(z.object({
      alertId: z.number(),
      resolution: z.string().optional(),
      status: z.enum(["acknowledged", "resolved"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const by = ctx.user.name || ctx.user.openId;
      await db.execute(sql`
        UPDATE discrepancy_alerts 
        SET status = ${input.status}, acknowledgedBy = ${by}, acknowledgedAt = NOW(), 
            resolution = ${input.resolution ?? null}, updatedAt = NOW()
        WHERE id = ${input.alertId}
      `);
      return { success: true };
    }),

  // Send discrepancy email digest
  sendDiscrepancyEmail: protectedProcedure
    .input(z.object({ periodKey: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.execute(sql`
        SELECT * FROM discrepancy_alerts WHERE periodKey = ${input.periodKey} AND status = 'open' 
        ORDER BY severity DESC, changePct DESC
      `) as any;
      const alertList = extractRows(result);

      if (alertList.length === 0) return { sent: false, reason: "No open alerts" };

      const SENDGRID_API = process.env.SendGrid_API;
      if (!SENDGRID_API) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "SendGrid not configured" });

      const criticalCount = alertList.filter((a: any) => a.severity === "critical").length;
      const rows = alertList.map((a: any) => {
        const badge = a.severity === "critical"
          ? `<span style="background:#dc3545;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">CRITICAL</span>`
          : `<span style="background:#fd7e14;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">WARNING</span>`;
        const change = a.changePct !== null ? `${parseFloat(a.changePct) > 0 ? "+" : ""}${parseFloat(a.changePct).toFixed(1)}%` : "—";
        return `<tr><td style="padding:8px 10px;border-bottom:1px solid #f0f0f0">${badge}</td><td style="padding:8px 10px;border-bottom:1px solid #f0f0f0"><strong>${a.supplierName}</strong></td><td style="padding:8px 10px;border-bottom:1px solid #f0f0f0">${a.alertType.replace(/_/g, " ")}</td><td style="padding:8px 10px;border-bottom:1px solid #f0f0f0">${change}</td><td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#555">${a.reason || "—"}</td></tr>`;
      }).join("");

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:0}.wrapper{max-width:800px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}.header{background:#000;padding:24px 32px}.header h1{color:#fff;margin:0;font-size:20px;font-weight:700}.header p{color:#e95b2a;margin:4px 0 0;font-size:13px}.body{padding:28px 32px}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}th{background:#f8f8f8;text-align:left;padding:8px 10px;font-weight:600;color:#555;border-bottom:1px solid #e5e5e5}.footer{background:#f8f8f8;padding:16px 32px;font-size:12px;color:#888;border-top:1px solid #eee}</style></head><body><div class="wrapper"><div class="header"><h1>Lucid — Discrepancy Alert</h1><p>${input.periodKey} · ${alertList.length} alert${alertList.length !== 1 ? "s" : ""} (${criticalCount} critical)</p></div><div class="body"><p>The following supplier invoice discrepancies were detected for <strong>${input.periodKey}</strong>. Items marked CRITICAL require immediate attention.</p><table><tr><th>Severity</th><th>Supplier</th><th>Type</th><th>Change</th><th>Reason</th></tr>${rows}</table><p style="margin-top:20px;font-size:13px">Log in to Lucid to acknowledge or resolve these alerts.</p></div><div class="footer">Generated by Lucid on ${new Date().toLocaleDateString("en-AU")}. All amounts ex GST.</div></div></body></html>`;

      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { "Authorization": `Bearer ${SENDGRID_API}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: "angusbs@smiletel.com.au", name: "Angus" }] }],
          from: { email: "angusbs@smiletel.com.au", name: "Lucid — SmileTel Billing" },
          subject: `Lucid — ${alertList.length} Discrepancy Alert${alertList.length !== 1 ? "s" : ""} for ${input.periodKey}`,
          content: [{ type: "text/html", value: html }],
        }),
      });

      if (res.ok || res.status === 202) {
        await db.execute(sql`
          UPDATE discrepancy_alerts SET emailedAt = NOW() WHERE periodKey = ${input.periodKey} AND status = 'open'
        `);
        return { sent: true, alertCount: alertList.length };
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send email" });
    }),

  // Get revenue data for trend graph
  getRevenueSnapshots: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const result = await db.execute(sql`
      SELECT 
        DATE_FORMAT(invoiceDate, '%Y-%m') as periodKey,
        SUM(lineAmount) as totalRevenueExGst,
        COUNT(DISTINCT invoiceNumber) as invoiceCount,
        COUNT(*) as lineItemCount
      FROM billing_items
      GROUP BY DATE_FORMAT(invoiceDate, '%Y-%m')
      ORDER BY periodKey ASC
    `) as any;
    return extractRows(result);
  }),

  // Reset checklist for a new period
  resetChecklistForNewPeriod: protectedProcedure
    .input(z.object({ periodKey: z.string(), label: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.execute(sql`
        INSERT IGNORE INTO billing_periods (periodKey, label, status) VALUES (${input.periodKey}, ${input.label}, 'pending')
      `);

      // Get template from most recent previous period
      const templateResult = await db.execute(sql`
        SELECT * FROM recon_checklist_items 
        WHERE periodKey = (
          SELECT periodKey FROM billing_periods 
          WHERE periodKey < ${input.periodKey}
          ORDER BY periodKey DESC LIMIT 1
        )
        ORDER BY sortOrder ASC
      `) as any;
      const templateItems = extractRows(templateResult);

      let created = 0;
      for (const item of templateItems) {
        await db.execute(sql`
          INSERT IGNORE INTO recon_checklist_items 
            (periodKey, itemKey, category, supplierName, displayName, description, acceptedFormats, isRequired, isAutomatic, sortOrder)
          VALUES (${input.periodKey}, ${item.itemKey}, ${item.category}, ${item.supplierName}, ${item.displayName}, ${item.description}, ${item.acceptedFormats}, ${item.isRequired}, ${item.isAutomatic}, ${item.sortOrder})
        `);
        created++;
      }

      return { created, periodKey: input.periodKey };
    }),
});
