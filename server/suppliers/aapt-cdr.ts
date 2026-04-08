/**
 * aapt-cdr.ts
 * AAPT CDR (Call Detail Record) FTP sync module.
 *
 * Downloads the daily CDR billing file from the AAPT FTP server, parses it,
 * and upserts usage billing items into the billing_items table for reconciliation.
 *
 * FTP access setup:
 *   1. Email customeroperations@corp.aapt.com.au requesting CDR files and FTP access
 *   2. Provide SmileTel's static egress IP address for whitelisting
 *   3. Set AAPT_FTP_HOST, AAPT_FTP_USER, AAPT_FTP_PASS in project secrets
 *   4. Optionally set AAPT_FTP_PATH (default: '/cdr/') and AAPT_FTP_PORT (default: 21)
 *
 * CDR file format (AAPT standard CSV):
 *   AccountNumber, ServiceId, CallDate, CallTime, Duration, Destination,
 *   CallType, ChargeAmount, GST, TotalCharge, Description
 *
 * Each CDR file covers one billing day. Files are named by date: YYYYMMDD.csv
 * Usage items are aggregated per service per day and stored as billing_items
 * with category='usage' and billingPlatform='AAPT'.
 *
 * FRONTIER LINK API (AAPT fixed services):
 *   Contact: DL_Frontier_Link_Technical_Support@tpgtelecom.com.au
 *   This is a separate API for AAPT fixed broadband service inventory.
 *   See server/suppliers/aapt-frontier.ts (future implementation).
 */

import * as ftp from "basic-ftp";
import { Readable } from "stream";
import { getDb } from "../db";
import { billingItems, supplierSyncLog, services } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AaptCdrRow {
  accountNumber: string;
  serviceId: string;       // AAPT service/circuit ID
  callDate: string;        // YYYY-MM-DD
  callTime: string;        // HH:MM:SS
  duration: number;        // seconds
  destination: string;
  callType: string;        // 'Local' | 'National' | 'Mobile' | 'International' | 'Data'
  chargeAmount: number;    // ex GST
  gst: number;
  totalCharge: number;     // inc GST
  description: string;
}

export interface AaptCdrSyncResult {
  logId: number;
  status: "success" | "error" | "partial" | "no_new_files";
  summary: string;
  filesProcessed: number;
  recordsProcessed: number;
  billingItemsCreated: number;
  billingItemsUpdated: number;
  errors: string[];
  durationMs: number;
}

// ── CDR File Parser ───────────────────────────────────────────────────────────

/**
 * Parse an AAPT CDR CSV file content into structured rows.
 * Handles both comma and pipe-delimited formats.
 */
export function parseAaptCdrContent(content: string, filename: string): AaptCdrRow[] {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect delimiter
  const delimiter = lines[0].includes("|") ? "|" : ",";

  // Skip header row if present
  const startIdx = lines[0].toLowerCase().includes("account") || lines[0].toLowerCase().includes("service") ? 1 : 0;
  const rows: AaptCdrRow[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const fields = lines[i].split(delimiter).map(f => f.trim().replace(/^"|"$/g, ""));
    if (fields.length < 8) continue;

    try {
      rows.push({
        accountNumber: fields[0] || "",
        serviceId: fields[1] || "",
        callDate: fields[2] || "",
        callTime: fields[3] || "",
        duration: parseFloat(fields[4]) || 0,
        destination: fields[5] || "",
        callType: fields[6] || "Voice",
        chargeAmount: parseFloat(fields[7]) || 0,
        gst: parseFloat(fields[8]) || 0,
        totalCharge: parseFloat(fields[9]) || 0,
        description: fields[10] || fields[6] || "AAPT CDR",
      });
    } catch {
      // Skip malformed rows
    }
  }

  return rows;
}

/**
 * Aggregate CDR rows by service and billing period (month).
 * Returns one aggregated record per service per month.
 */
function aggregateCdrByService(rows: AaptCdrRow[], billingMonth: string): Map<string, {
  serviceId: string;
  accountNumber: string;
  totalCharge: number;
  callCount: number;
  callTypes: Set<string>;
}> {
  const map = new Map<string, {
    serviceId: string;
    accountNumber: string;
    totalCharge: number;
    callCount: number;
    callTypes: Set<string>;
  }>();

  for (const row of rows) {
    if (!row.serviceId) continue;
    const key = `${row.serviceId}::${billingMonth}`;
    const existing = map.get(key);
    if (existing) {
      existing.totalCharge += row.totalCharge;
      existing.callCount++;
      existing.callTypes.add(row.callType);
    } else {
      map.set(key, {
        serviceId: row.serviceId,
        accountNumber: row.accountNumber,
        totalCharge: row.totalCharge,
        callCount: 1,
        callTypes: new Set([row.callType]),
      });
    }
  }

  return map;
}

// ── FTP Download ──────────────────────────────────────────────────────────────

/**
 * Connect to the AAPT FTP server and download CDR files for the given date range.
 * Returns a map of filename → file content string.
 */
async function downloadCdrFiles(options: {
  host: string;
  user: string;
  password: string;
  port?: number;
  remotePath?: string;
  dateFrom?: string;  // YYYYMMDD
  dateTo?: string;    // YYYYMMDD
}): Promise<Map<string, string>> {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  const files = new Map<string, string>();

  try {
    await client.access({
      host: options.host,
      user: options.user,
      password: options.password,
      port: options.port || 21,
      secure: false, // AAPT FTP uses plain FTP; set to true if FTPS is available
    });

    const remotePath = options.remotePath || "/cdr/";
    await client.cd(remotePath);

    const fileList = await client.list();
    const csvFiles = fileList.filter(f => f.name.endsWith(".csv") || f.name.endsWith(".txt"));

    for (const file of csvFiles) {
      // Filter by date range if provided
      if (options.dateFrom || options.dateTo) {
        const dateMatch = file.name.match(/(\d{8})/);
        if (dateMatch) {
          const fileDate = dateMatch[1];
          if (options.dateFrom && fileDate < options.dateFrom) continue;
          if (options.dateTo && fileDate > options.dateTo) continue;
        }
      }

      // Download file content into memory
      const chunks: Buffer[] = [];
      const writable = new (require("stream").Writable)({
        write(chunk: Buffer, _enc: string, cb: () => void) {
          chunks.push(chunk);
          cb();
        },
      });

      await client.downloadTo(writable, file.name);
      files.set(file.name, Buffer.concat(chunks).toString("utf-8"));
    }
  } finally {
    client.close();
  }

  return files;
}

// ── Main sync function ────────────────────────────────────────────────────────

/**
 * Downloads and processes AAPT CDR files, creating/updating billing_items
 * for voice usage charges. Designed to run daily (nightly scheduled job).
 *
 * @param triggeredBy - 'scheduled' | 'manual' | 'system'
 * @param dateFrom    - Optional start date filter YYYYMMDD (default: yesterday)
 * @param dateTo      - Optional end date filter YYYYMMDD (default: yesterday)
 */
export async function syncAaptCdrFiles(
  triggeredBy: string = "scheduled",
  dateFrom?: string,
  dateTo?: string,
): Promise<AaptCdrSyncResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startedAt = Date.now();
  const errors: string[] = [];

  // Default to yesterday if no date range provided
  if (!dateFrom) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dateFrom = yesterday.toISOString().slice(0, 10).replace(/-/g, "");
  }
  if (!dateTo) dateTo = dateFrom;

  // Create running log entry
  const [logInsert] = await db.insert(supplierSyncLog).values({
    integration: "aapt_cdr_ftp",
    status: "running",
    triggeredBy,
    startedAt: new Date(),
  });
  const logId = (logInsert as any).insertId as number;

  const ftpHost = process.env.AAPT_FTP_HOST;
  const ftpUser = process.env.AAPT_FTP_USER;
  const ftpPass = process.env.AAPT_FTP_PASS;
  const ftpPort = process.env.AAPT_FTP_PORT ? parseInt(process.env.AAPT_FTP_PORT) : 21;
  const ftpPath = process.env.AAPT_FTP_PATH || "/cdr/";

  if (!ftpHost || !ftpUser || !ftpPass) {
    const errMsg = "AAPT FTP credentials not configured. Email customeroperations@corp.aapt.com.au to request CDR FTP access, then set AAPT_FTP_HOST, AAPT_FTP_USER, AAPT_FTP_PASS in project secrets.";
    await db.update(supplierSyncLog)
      .set({ status: "error", errorMessage: errMsg, summary: "FTP credentials not set.", completedAt: new Date(), durationMs: Date.now() - startedAt })
      .where(eq(supplierSyncLog.id, logId));
    return { logId, status: "error", summary: errMsg, filesProcessed: 0, recordsProcessed: 0, billingItemsCreated: 0, billingItemsUpdated: 0, errors: [errMsg], durationMs: Date.now() - startedAt };
  }

  // Download CDR files
  let cdrFiles: Map<string, string>;
  try {
    cdrFiles = await downloadCdrFiles({
      host: ftpHost,
      user: ftpUser,
      password: ftpPass,
      port: ftpPort,
      remotePath: ftpPath,
      dateFrom,
      dateTo,
    });
  } catch (err: any) {
    const errMsg = `FTP connection failed: ${err.message}`;
    errors.push(errMsg);
    await db.update(supplierSyncLog)
      .set({ status: "error", errorMessage: errMsg, summary: `FTP error: ${errMsg}`, completedAt: new Date(), durationMs: Date.now() - startedAt })
      .where(eq(supplierSyncLog.id, logId));
    return { logId, status: "error", summary: errMsg, filesProcessed: 0, recordsProcessed: 0, billingItemsCreated: 0, billingItemsUpdated: 0, errors, durationMs: Date.now() - startedAt };
  }

  if (cdrFiles.size === 0) {
    const summary = `No CDR files found for date range ${dateFrom}–${dateTo}.`;
    await db.update(supplierSyncLog)
      .set({ status: "success", summary, completedAt: new Date(), durationMs: Date.now() - startedAt })
      .where(eq(supplierSyncLog.id, logId));
    return { logId, status: "no_new_files", summary, filesProcessed: 0, recordsProcessed: 0, billingItemsCreated: 0, billingItemsUpdated: 0, errors: [], durationMs: Date.now() - startedAt };
  }

  // Process each file
  let totalRecords = 0;
  let billingItemsCreated = 0;
  let billingItemsUpdated = 0;
  let filesProcessed = 0;

  for (const [filename, content] of Array.from(cdrFiles.entries())) {
    try {
      // Extract billing month from filename (YYYYMMDD.csv → YYYY-MM)
      const dateMatch = filename.match(/(\d{4})(\d{2})(\d{2})/);
      const billingMonth = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}` : new Date().toISOString().slice(0, 7);
      const fileDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : new Date().toISOString().slice(0, 10);

      const rows = parseAaptCdrContent(content, filename);
      totalRecords += rows.length;

      // Aggregate by service
      const aggregated = aggregateCdrByService(rows, billingMonth);

      for (const [key, agg] of Array.from(aggregated.entries())) {
        // Find matching service by AAPT service ID
        const matchingService = await db.select({ externalId: services.externalId, customerExternalId: services.customerExternalId })
          .from(services)
          .where(eq(services.aaptServiceId, agg.serviceId))
          .limit(1);

        const serviceExternalId = matchingService[0]?.externalId || "";
        const customerExternalId = matchingService[0]?.customerExternalId || "";

        // Build a stable externalId for deduplication
        const biExternalId = `AAPT-CDR-${agg.serviceId}-${billingMonth}`;
        const description = `AAPT Voice Usage — ${Array.from(agg.callTypes).join(", ")} (${agg.callCount} calls, ${billingMonth})`;

        // Upsert billing item
        const existing = await db.select({ id: billingItems.id })
          .from(billingItems)
          .where(eq(billingItems.externalId, biExternalId))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(billingItems).values({
            externalId: biExternalId,
            invoiceDate: fileDate,
            invoiceNumber: `AAPT-CDR-${billingMonth}`,
            contactName: customerExternalId || "AAPT Customer",
            description,
            quantity: "1.00",
            unitAmount: String(agg.totalCharge.toFixed(2)),
            lineAmount: String(agg.totalCharge.toFixed(2)),
            taxAmount: String((agg.totalCharge * 0.1).toFixed(2)),
            category: "usage",
            billingPlatform: "AAPT",
            customerExternalId,
            serviceExternalId,
            matchStatus: serviceExternalId ? "matched" : "unmatched",
            matchConfidence: serviceExternalId ? "high" : "",
          });
          billingItemsCreated++;
        } else {
          // Update amount (CDR may be revised)
          await db.update(billingItems)
            .set({
              lineAmount: String(agg.totalCharge.toFixed(2)),
              unitAmount: String(agg.totalCharge.toFixed(2)),
              description,
              serviceExternalId: serviceExternalId || undefined,
              customerExternalId: customerExternalId || undefined,
              matchStatus: serviceExternalId ? "matched" : "unmatched",
            })
            .where(eq(billingItems.externalId, biExternalId));
          billingItemsUpdated++;
        }

        // Update service monthlyRevenue if matched
        if (serviceExternalId) {
          await db.execute(sql`
            UPDATE services
            SET monthlyRevenue = (
              SELECT COALESCE(SUM(lineAmount), 0)
              FROM billing_items
              WHERE serviceExternalId = ${serviceExternalId}
            )
            WHERE externalId = ${serviceExternalId}
          `);
        }
      }

      filesProcessed++;
    } catch (err: any) {
      errors.push(`Error processing ${filename}: ${err.message}`);
    }
  }

  const durationMs = Date.now() - startedAt;
  const status = errors.length === 0 ? "success" : errors.length < cdrFiles.size ? "partial" : "error";
  const summary = `Processed ${filesProcessed} CDR files — ${totalRecords} records, ${billingItemsCreated} billing items created, ${billingItemsUpdated} updated, ${errors.length} errors. Duration: ${(durationMs / 1000).toFixed(1)}s`;

  await db.update(supplierSyncLog)
    .set({
      status,
      summary,
      recordsProcessed: totalRecords,
      servicesCreated: billingItemsCreated,
      servicesUpdated: billingItemsUpdated,
      errorMessage: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
      completedAt: new Date(),
      durationMs,
    })
    .where(eq(supplierSyncLog.id, logId));

  return { logId, status, summary, filesProcessed, recordsProcessed: totalRecords, billingItemsCreated, billingItemsUpdated, errors, durationMs };
}

/**
 * Get the last N sync log entries for the AAPT CDR FTP integration.
 */
export async function getAaptCdrSyncHistory(limit: number = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(supplierSyncLog)
    .where(eq(supplierSyncLog.integration, "aapt_cdr_ftp"))
    .orderBy(supplierSyncLog.startedAt)
    .limit(limit);
}

/**
 * Get the last sync log entry for any integration.
 */
export async function getLastSyncStatus(integration: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select()
    .from(supplierSyncLog)
    .where(eq(supplierSyncLog.integration, integration))
    .orderBy(supplierSyncLog.startedAt)
    .limit(1);
  return rows[0] || null;
}
