/**
 * Vocus Wholesale Portal Scraper
 * --------------------------------
 * Server-side headless browser scraper that logs into the Vocus Members Portal,
 * extracts Mobile SIM and NBN service data, updates the database, and runs
 * auto-matching against SmileTel customer/service records.
 *
 * Designed to run as a weekly scheduled job. The 2FA step sends an owner
 * notification so the operator can provide the OTP via the admin UI.
 *
 * Credentials are read from environment variables:
 *   VOCUS_SP_USERNAME  — portal login username
 *   VOCUS_SP_PASSWORD  — portal login password
 */

import puppeteer, { Browser, Page } from "puppeteer-core";
import { getDb } from "./db";
import {
  vocusMobileServices,
  vocusNbnServices,
  vocusBuckets,
  vocusSyncLog,
} from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

const PORTAL_URL = "https://members.vocus.com.au";
const CHROMIUM_PATH = "/usr/bin/chromium-browser";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MobileServiceRow {
  id: string;
  status: string;
  scope: string; // 'standard' | '4g-backup'
  planId?: string;
  realm?: string;
  sim?: string;
  simType?: string;
  msn?: string;
  puk?: string;
  customerName?: string;
  anniversaryDay?: number;
  bucketId?: string;
  label?: string;
  locationReference?: string;
  activationDate?: string;
  rawJson?: string;
}

interface NbnServiceRow {
  id: string;
  status: string;
  planId?: string;
  realm?: string;
  username?: string;
  avcId?: string;
  locId?: string;
  technology?: string;
  speedTier?: string;
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  customerName?: string;
  ipAddress?: string;
  poiName?: string;
  anniversaryDay?: number;
  activationDate?: string;
  rawJson?: string;
}

interface BucketData {
  bucketId: string;
  bucketType: string;
  realm: string;
  dataQuotaMb?: number;
  dataUsedMb?: number;
  voiceQuotaMin?: number;
  voiceUsedMin?: number;
  smsQuota?: number;
  smsUsed?: number;
  isOverQuota: boolean;
  overageDataMb?: number;
  simCount?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMb(str: string | undefined): number | undefined {
  if (!str) return undefined;
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return undefined;
  // If the string contains "GB" convert to MB
  if (str.toUpperCase().includes("GB")) return Math.round(n * 1024);
  return Math.round(n);
}

function parsePercent(str: string | undefined): number | undefined {
  if (!str) return undefined;
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? undefined : n;
}

// Simple Levenshtein-based similarity (0–1)
function similarity(a: string, b: string): number {
  a = a.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  b = b.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  if (a === b) return 1;
  if (!a || !b) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLen = longer.length;
  if (longerLen === 0) return 1;
  // Count matching words
  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));
  let matches = 0;
  aWords.forEach((w) => { if (bWords.has(w)) matches++; });
  return (2 * matches) / (aWords.size + bWords.size);
}

// ─── Browser helpers ──────────────────────────────────────────────────────────

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

/**
 * Extract a table from the page as an array of row objects.
 * Uses the first <tr> as headers.
 */
async function extractTable(page: Page, selector: string): Promise<Record<string, string>[]> {
  return page.evaluate((sel) => {
    const table = document.querySelector(sel);
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length < 2) return [];
    const headers = Array.from(rows[0].querySelectorAll("th,td")).map(
      (el) => (el as HTMLElement).innerText.trim()
    );
    return rows.slice(1).map((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map(
        (el) => (el as HTMLElement).innerText.trim()
      );
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
      return obj;
    });
  }, selector);
}

/**
 * Extract definition list or table fields from a detail page.
 */
async function extractDetailFields(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const result: Record<string, string> = {};
    // Try definition list
    const dts = document.querySelectorAll("dt");
    dts.forEach((dt) => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === "DD") {
        result[(dt as HTMLElement).innerText.trim()] = (dd as HTMLElement).innerText.trim();
      }
    });
    // Try table rows with th/td pairs
    document.querySelectorAll("tr").forEach((row) => {
      const th = row.querySelector("th");
      const td = row.querySelector("td");
      if (th && td) {
        result[(th as HTMLElement).innerText.trim()] = (td as HTMLElement).innerText.trim();
      }
    });
    return result;
  });
}

// ─── Scraper steps ────────────────────────────────────────────────────────────

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto(`${PORTAL_URL}/index.php`, { waitUntil: "networkidle2" });
  await page.type('input[name="username"], input[type="text"]', username);
  await page.type('input[name="password"], input[type="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click('button[type="submit"], input[type="submit"]'),
  ]);
}

async function handle2FA(
  page: Page,
  syncLogId: number,
  getOtp: () => Promise<string>
): Promise<void> {
  const url = page.url();
  const content = await page.content();
  if (content.includes("verification") || content.includes("Verify") || url.includes("verify")) {
    console.log("[VocusScraper] 2FA required — notifying owner");
    await notifyOwner({
      title: "Vocus Portal Sync — 2FA Required",
      content: `The weekly Vocus portal sync (sync log #${syncLogId}) requires a 2FA verification code. Please check the email sent to the portal address and enter the code in the SmileTel admin panel under Vocus → Sync → Enter OTP.`,
    });
    const otp = await getOtp();
    const otpInput = await page.$('input[name="otp"], input[type="text"], input[name="code"]');
    if (otpInput) {
      await otpInput.type(otp);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }),
        page.click('button[type="submit"], input[type="submit"]'),
      ]);
    }
  }
}

async function scrapeServiceList(
  page: Page,
  url: string,
  status: "active" | "inactive"
): Promise<Record<string, string>[]> {
  await page.goto(url, { waitUntil: "networkidle2" });
  // Click the status tab if needed
  const tabSelector = status === "active" ? 'a[href*="active"], .active-tab' : 'a[href*="inactive"], .inactive-tab';
  try {
    const tab = await page.$(tabSelector);
    if (tab) {
      await tab.click();
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch { /* ignore */ }
  return extractTable(page, "table");
}

async function scrapeServiceDetail(
  page: Page,
  detailUrl: string
): Promise<Record<string, string>> {
  await page.goto(detailUrl, { waitUntil: "networkidle2" });
  return extractDetailFields(page);
}

// ─── Main sync function ───────────────────────────────────────────────────────

export interface VocusSyncOptions {
  /** Callback to retrieve the 2FA OTP. Should block until the code is available. */
  getOtp: () => Promise<string>;
  /** If true, only update bucket quota data (faster, no 2FA needed if session cached) */
  bucketsOnly?: boolean;
}

export interface VocusSyncResult {
  syncLogId: number;
  mobileCreated: number;
  mobileUpdated: number;
  nbnCreated: number;
  nbnUpdated: number;
  bucketsUpdated: number;
  matchesApplied: number;
  errors: string[];
  durationMs: number;
}

export async function runVocusSync(options: VocusSyncOptions): Promise<VocusSyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let mobileCreated = 0, mobileUpdated = 0, nbnCreated = 0, nbnUpdated = 0;
  let bucketsUpdated = 0, matchesApplied = 0;

  // Create sync log entry
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [syncLogResult] = await db.insert(vocusSyncLog).values({
    syncType: options.bucketsOnly ? "buckets" : "full",
    status: "running",
    triggeredBy: "scheduler",
  });
  const syncLogId = (syncLogResult as any).insertId as number;

  const username = process.env.VOCUS_SP_USERNAME || process.env.Vocus_SP_Username;
  const password = process.env.VOCUS_SP_PASSWORD || process.env.Vocus_SP_Password;

  if (!username || !password) {
    const msg = "VOCUS_SP_USERNAME or VOCUS_SP_PASSWORD not set";
    const db2 = await getDb();
    if (db2) await db2.update(vocusSyncLog)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date(), durationMs: Date.now() - startTime })
      .where(eq(vocusSyncLog.id, syncLogId));
    throw new Error(msg);
  }

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // ── Login ──
    console.log("[VocusScraper] Logging in...");
    await login(page, username, password);
    await handle2FA(page, syncLogId, options.getOtp);
    console.log("[VocusScraper] Logged in successfully");

    if (!options.bucketsOnly) {
      // ── Standard Mobile — Active ──
      console.log("[VocusScraper] Scraping Standard Mobile active...");
      const stdMobileActive = await scrapeServiceList(
        page,
        `${PORTAL_URL}/transaction_header.php`,
        "active"
      );
      // Navigate to the correct page
      await page.goto(`${PORTAL_URL}/transaction_header.php`, { waitUntil: "networkidle2" });
      // Click Mobile → Standard Mobile
      try {
        await page.click('a[href*="mobile"], button:contains("Mobile")');
        await new Promise((r) => setTimeout(r, 500));
        await page.click('a[href*="Standard Mobile"], a:contains("Standard Mobile")');
        await new Promise((r) => setTimeout(r, 1000));
      } catch { /* navigate directly */ }

      // Extract mobile services via JS evaluation
      const extractMobileRows = async (status: string): Promise<MobileServiceRow[]> => {
        return page.evaluate((s) => {
          const rows = Array.from(document.querySelectorAll("table tr")).slice(1);
          return rows.map((row) => {
            const cells = Array.from(row.querySelectorAll("td")).map(
              (td) => (td as HTMLElement).innerText.trim()
            );
            const link = row.querySelector("a");
            const id = link?.href?.match(/id=(\d+)/)?.[1] || "";
            return {
              id,
              status: s,
              scope: "standard",
              msn: cells[0] || "",
              sim: cells[1] || "",
              customerName: cells[2] || "",
              planId: cells[3] || "",
              anniversaryDay: parseInt(cells[4]) || undefined,
              rawJson: JSON.stringify(cells),
            };
          }).filter((r) => r.id);
        }, status);
      };

      // Navigate to Standard Mobile active list
      await page.goto(
        `${PORTAL_URL}/transaction_header.php`,
        { waitUntil: "networkidle2" }
      );

      // Use direct URL approach for reliability
      const mobileRealm = "mobile.smileit.com";
      const dataRealm = "data.smileit.com";

      // Scrape Standard Mobile active
      await page.goto(
        `${PORTAL_URL}/mobileuserlist.php?realm_domain=${mobileRealm}&record_status=active&realm_product=Standard+Mobile`,
        { waitUntil: "networkidle2" }
      );
      const stdActiveRows: MobileServiceRow[] = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table tr")).slice(1);
        return rows.map((row) => {
          const cells = Array.from(row.querySelectorAll("td")).map(
            (td) => (td as HTMLElement).innerText.trim()
          );
          const link = row.querySelector("a");
          const id = link?.href?.match(/id=(\d+)/)?.[1] || "";
          return {
            id, status: "active", scope: "standard",
            msn: cells[0], sim: cells[1], customerName: cells[2],
            planId: cells[3], realm: "mobile.smileit.com",
            rawJson: JSON.stringify({ cells }),
          };
        }).filter((r: any) => r.id);
      });

      // Scrape Standard Mobile inactive
      await page.goto(
        `${PORTAL_URL}/mobileuserlist.php?realm_domain=${mobileRealm}&record_status=inactive&realm_product=Standard+Mobile`,
        { waitUntil: "networkidle2" }
      );
      const stdInactiveRows: MobileServiceRow[] = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table tr")).slice(1);
        return rows.map((row) => {
          const cells = Array.from(row.querySelectorAll("td")).map(
            (td) => (td as HTMLElement).innerText.trim()
          );
          const link = row.querySelector("a");
          const id = link?.href?.match(/id=(\d+)/)?.[1] || "";
          return {
            id, status: "inactive", scope: "standard",
            msn: cells[0], sim: cells[1], customerName: cells[2],
            planId: cells[3], realm: "mobile.smileit.com",
            rawJson: JSON.stringify({ cells }),
          };
        }).filter((r: any) => r.id);
      });

      // Scrape 4G Backup active
      await page.goto(
        `${PORTAL_URL}/mobileuserlist.php?realm_domain=${dataRealm}&record_status=active&realm_product=4G+Backup`,
        { waitUntil: "networkidle2" }
      );
      const backupActiveRows: MobileServiceRow[] = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table tr")).slice(1);
        return rows.map((row) => {
          const cells = Array.from(row.querySelectorAll("td")).map(
            (td) => (td as HTMLElement).innerText.trim()
          );
          const link = row.querySelector("a");
          const id = link?.href?.match(/id=(\d+)/)?.[1] || "";
          return {
            id, status: "active", scope: "4g-backup",
            msn: cells[0], sim: cells[1], customerName: cells[2],
            planId: cells[3], realm: "data.smileit.com",
            rawJson: JSON.stringify({ cells }),
          };
        }).filter((r: any) => r.id);
      });

      // Scrape 4G Backup inactive
      await page.goto(
        `${PORTAL_URL}/mobileuserlist.php?realm_domain=${dataRealm}&record_status=inactive&realm_product=4G+Backup`,
        { waitUntil: "networkidle2" }
      );
      const backupInactiveRows: MobileServiceRow[] = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table tr")).slice(1);
        return rows.map((row) => {
          const cells = Array.from(row.querySelectorAll("td")).map(
            (td) => (td as HTMLElement).innerText.trim()
          );
          const link = row.querySelector("a");
          const id = link?.href?.match(/id=(\d+)/)?.[1] || "";
          return {
            id, status: "inactive", scope: "4g-backup",
            msn: cells[0], sim: cells[1], customerName: cells[2],
            planId: cells[3], realm: "data.smileit.com",
            rawJson: JSON.stringify({ cells }),
          };
        }).filter((r: any) => r.id);
      });

      const allMobileRows = [
        ...stdActiveRows, ...stdInactiveRows,
        ...backupActiveRows, ...backupInactiveRows,
      ];
      console.log(`[VocusScraper] Mobile rows: ${allMobileRows.length}`);

      // Upsert mobile services
      for (const row of allMobileRows) {
        if (!row.id) continue;
        const [existing] = await db.select({ id: vocusMobileServices.id })
          .from(vocusMobileServices)
          .where(eq(vocusMobileServices.vocusServiceId, row.id))
          .limit(1);
        const values = {
          vocusServiceId: row.id,
          serviceScope: row.scope,
          serviceStatus: row.status,
          planId: row.planId,
          realm: row.realm,
          sim: row.sim,
          msn: row.msn,
          customerName: row.customerName,
          rawJson: row.rawJson,
          lastSyncedAt: new Date(),
        };
        if (existing) {
          await db.update(vocusMobileServices).set(values).where(eq(vocusMobileServices.vocusServiceId, row.id));
          mobileUpdated++;
        } else {
          await db.insert(vocusMobileServices).values(values);
          mobileCreated++;
        }
      }

      // ── NBN Services ──
      console.log("[VocusScraper] Scraping NBN services...");
      const nbnRealm = "wba.rvcict.com.au";

      await page.goto(
        `${PORTAL_URL}/nbnuserlist.php?realm_domain=${nbnRealm}&record_status=active`,
        { waitUntil: "networkidle2" }
      );
      const nbnActiveRows: NbnServiceRow[] = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table tr")).slice(1);
        return rows.map((row) => {
          const cells = Array.from(row.querySelectorAll("td")).map(
            (td) => (td as HTMLElement).innerText.trim()
          );
          const link = row.querySelector("a");
          const id = link?.href?.match(/id=(\d+)/)?.[1] || "";
          return {
            id, status: "active", realm: "wba.rvcict.com.au",
            username: cells[0], planId: cells[1],
            rawJson: JSON.stringify({ cells }),
          };
        }).filter((r: any) => r.id);
      });

      await page.goto(
        `${PORTAL_URL}/nbnuserlist.php?realm_domain=${nbnRealm}&record_status=inactive`,
        { waitUntil: "networkidle2" }
      );
      const nbnInactiveRows: NbnServiceRow[] = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table tr")).slice(1);
        return rows.map((row) => {
          const cells = Array.from(row.querySelectorAll("td")).map(
            (td) => (td as HTMLElement).innerText.trim()
          );
          const link = row.querySelector("a");
          const id = link?.href?.match(/id=(\d+)/)?.[1] || "";
          return {
            id, status: "inactive", realm: "wba.rvcict.com.au",
            username: cells[0], planId: cells[1],
            rawJson: JSON.stringify({ cells }),
          };
        }).filter((r: any) => r.id);
      });

      const allNbnRows = [...nbnActiveRows, ...nbnInactiveRows];
      console.log(`[VocusScraper] NBN rows: ${allNbnRows.length}`);

      // Fetch NBN detail pages for AVC IDs (active only, batch of 10 at a time)
      const activeNbnIds = nbnActiveRows.map((r) => r.id).filter(Boolean);
      const nbnDetails: Record<string, Record<string, string>> = {};

      for (let i = 0; i < activeNbnIds.length; i += 5) {
        const batch = activeNbnIds.slice(i, i + 5);
        await Promise.all(
          batch.map(async (id) => {
            try {
              const detailPage = await browser!.newPage();
              await detailPage.goto(`${PORTAL_URL}/nbnuserlist.php?id=${id}`, {
                waitUntil: "networkidle2",
                timeout: 15000,
              });
              nbnDetails[id] = await extractDetailFields(detailPage);
              await detailPage.close();
            } catch (e) {
              errors.push(`NBN detail fetch failed for ${id}: ${e}`);
            }
          })
        );
        await new Promise((r) => setTimeout(r, 500));
      }

      // Upsert NBN services
      for (const row of allNbnRows) {
        if (!row.id) continue;
        const detail = nbnDetails[row.id] || {};
        const avcId = detail["NBN AVC"] || detail["AVC ID"] || detail["AVCID"] || row.avcId;
        const address = detail["Address"] || detail["Service Address"] || row.address;
        const [existing] = await db.select({ id: vocusNbnServices.id })
          .from(vocusNbnServices)
          .where(eq(vocusNbnServices.vocusServiceId, row.id))
          .limit(1);
        const values = {
          vocusServiceId: row.id,
          serviceStatus: row.status,
          planId: detail["Plan ID"] || row.planId,
          realm: row.realm,
          username: detail["Username"] || row.username,
          avcId,
          locId: detail["NBN Location ID"] || detail["Carrier ID"] || row.locId,
          technology: detail["Technology"] || detail["NBN Technology"] || row.technology,
          speedTier: detail["Speed Tier"] || detail["Line Size"] || row.speedTier,
          address,
          ipAddress: detail["IP Address"] || row.ipAddress,
          poiName: detail["NBN POI"] || row.poiName,
          activationDate: detail["Activation Date"] || row.activationDate,
          rawJson: JSON.stringify({ ...row, detail }),
          lastSyncedAt: new Date(),
        };
        if (existing) {
          await db.update(vocusNbnServices).set(values).where(eq(vocusNbnServices.vocusServiceId, row.id));
          nbnUpdated++;
        } else {
          await db.insert(vocusNbnServices).values(values);
          nbnCreated++;
        }
      }
    }

    // ── Bucket Quota ──
    console.log("[VocusScraper] Scraping bucket usage...");
    const buckets: BucketData[] = [];

    for (const { domain, bucketType, realm } of [
      { domain: "mobile.smileit.com", bucketType: "STANDARD-POSTPAID", realm: "mobile.smileit.com" },
      { domain: "data.smileit.com", bucketType: "DATA-HOSTED", realm: "data.smileit.com" },
    ]) {
      await page.goto(`${PORTAL_URL}/mobile_bucket_usage.php?domain=${domain}`, {
        waitUntil: "networkidle2",
      });
      const bucketData: BucketData = await page.evaluate(
        (bt, r) => {
          const result: any = { bucketId: r, bucketType: bt, realm: r, isOverQuota: false };
          document.querySelectorAll(".progress-bar, [class*='progress']").forEach((el) => {
            const text = (el as HTMLElement).innerText || "";
            const pct = parseFloat(text.replace(/[^0-9.]/g, ""));
            if (!isNaN(pct) && pct > 100) result.isOverQuota = true;
          });
          // Extract usage text
          const bodyText = document.body.innerText;
          const dataMatch = bodyText.match(/([\d.]+)\s*GB\s*used/i);
          const quotaMatch = bodyText.match(/Quota\s*([\d.]+)\s*GB/i);
          if (dataMatch) result.dataUsedMb = Math.round(parseFloat(dataMatch[1]) * 1024);
          if (quotaMatch) result.dataQuotaMb = Math.round(parseFloat(quotaMatch[1]) * 1024);
          if (result.dataUsedMb && result.dataQuotaMb && result.dataUsedMb > result.dataQuotaMb) {
            result.isOverQuota = true;
            result.overageDataMb = result.dataUsedMb - result.dataQuotaMb;
          }
          return result;
        },
        bucketType,
        realm
      );
      buckets.push(bucketData);
    }

    const today = new Date().toISOString().slice(0, 10);
    for (const bucket of buckets) {
      const [existing] = await db.select({ id: vocusBuckets.id })
        .from(vocusBuckets)
        .where(eq(vocusBuckets.bucketId, bucket.bucketId))
        .limit(1);
      const values = {
        bucketId: bucket.bucketId,
        bucketType: bucket.bucketType,
        realm: bucket.realm,
        dataQuotaMb: bucket.dataQuotaMb,
        dataUsedMb: bucket.dataUsedMb?.toString(),
        isOverQuota: bucket.isOverQuota,
        overageDataMb: bucket.overageDataMb?.toString(),
        snapshotDate: today,
        lastSyncedAt: new Date(),
      };
      if (existing) {
        await db.update(vocusBuckets).set(values).where(eq(vocusBuckets.bucketId, bucket.bucketId));
      } else {
        await db.insert(vocusBuckets).values(values);
      }
      bucketsUpdated++;

      // Alert if over quota
      if (bucket.isOverQuota) {
        const overageGb = bucket.overageDataMb ? (bucket.overageDataMb / 1024).toFixed(1) : "unknown";
        await notifyOwner({
          title: `Vocus ${bucket.realm} — Data Over Quota`,
          content: `The ${bucket.realm} bucket is over quota by ${overageGb} GB. Please increase the quota in the Vocus portal before the billing month closes.`,
        });
      }
    }

    // ── Update sync log ──
    const durationMs = Date.now() - startTime;
    await db.update(vocusSyncLog).set({
      status: "completed",
      recordsFetched: mobileCreated + mobileUpdated + nbnCreated + nbnUpdated,
      recordsCreated: mobileCreated + nbnCreated,
      recordsUpdated: mobileUpdated + nbnUpdated,
      recordsMatched: matchesApplied,
      completedAt: new Date(),
      durationMs,
    }).where(eq(vocusSyncLog.id, syncLogId));

    console.log(`[VocusScraper] Sync complete in ${durationMs}ms`);
    return {
      syncLogId,
      mobileCreated, mobileUpdated,
      nbnCreated, nbnUpdated,
      bucketsUpdated, matchesApplied,
      errors,
      durationMs,
    };
  } catch (error) {
    const msg = String(error);
    errors.push(msg);
    await db.update(vocusSyncLog).set({
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
    }).where(eq(vocusSyncLog.id, syncLogId));
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
