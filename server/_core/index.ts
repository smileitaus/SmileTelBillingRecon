import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import multer from "multer";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Team password login endpoint
  app.post("/api/team-login", async (req, res) => {
    try {
      const { password, name, email } = req.body;
      const { ENV: envVars } = await import("./env");
      const { sdk: sdkInstance } = await import("./sdk");
      const { getSessionCookieOptions } = await import("./cookies");
      const { COOKIE_NAME, ONE_YEAR_MS } = await import("../../shared/const");
      const dbModule = await import("../db");

      if (!envVars.teamAccessPassword) {
        return res.status(500).json({ error: "Team access not configured" });
      }

      if (password !== envVars.teamAccessPassword) {
        return res.status(401).json({ error: "Invalid password" });
      }

      // Create a team user with a deterministic openId based on email
      const teamOpenId = `team_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;

      await dbModule.upsertUser({
        openId: teamOpenId,
        name: name || email.split("@")[0],
        email: email,
        loginMethod: "team_password",
        lastSignedIn: new Date(),
      });

      // Create a session token
      const token = await sdkInstance.createSessionToken(teamOpenId, {
        expiresInMs: ONE_YEAR_MS,
        name: name || email.split("@")[0],
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("[Team Login] Error:", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  // Temporary: Save DataGate Feb 2026 data from browser extraction
  app.post('/api/save-datagate-feb', async (req, res) => {
    try {
      const { writeFileSync } = await import('fs');
      const { join } = await import('path');
      const filePath = join(process.cwd(), 'datagate_feb2026.json');
      writeFileSync(filePath, JSON.stringify(req.body, null, 2));
      const data = req.body.data || [];
      const totalTx = data.reduce((s: number, c: any) => s + (c.transactions?.length || 0), 0);
      console.log(`[DataGate] Saved Feb 2026: ${data.length} customers, ${totalTx} transactions`);
      res.json({ ok: true, customers: data.length, transactions: totalTx });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Starlink invoice PDF parser endpoint
  const invoiceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
  app.post("/api/starlink/parse-invoice", invoiceUpload.single("pdf"), async (req: any, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "No PDF file provided" }); return; }
      const { execSync } = await import("child_process");
      const { writeFileSync, unlinkSync, readFileSync } = await import("fs");
      const { join } = await import("path");
      const tmpIn = join("/tmp", `inv_${Date.now()}.pdf`);
      const tmpOut = join("/tmp", `inv_${Date.now()}.txt`);
      writeFileSync(tmpIn, req.file.buffer);
      execSync(`pdftotext -layout "${tmpIn}" "${tmpOut}"`);
      const text = readFileSync(tmpOut, "utf8");
      unlinkSync(tmpIn);
      unlinkSync(tmpOut);
      const { parseStarlinkInvoiceText } = await import("../starlink/parseInvoice");
      const parsed = parseStarlinkInvoiceText(text);
      if (!parsed.invoiceNumber) { res.status(422).json({ error: "Could not extract invoice number from PDF" }); return; }
      res.json(parsed);
    } catch (e: any) {
      console.error("[parse-invoice]", e);
      res.status(500).json({ error: e.message || "Parse failed" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

// ── Scheduled Jobs ────────────────────────────────────────────────────────────
// Delayed start to allow the server to fully initialise before running jobs
setTimeout(async () => {
  try {
    // Carbon Outage Monitor — poll every 60 minutes (rate-limit friendly; 226 services × 200ms = ~45s per cycle)
    const runOutageSync = async () => {
      try {
        const { syncCarbonOutages } = await import('../suppliers/carbon-outage-usage');
        const result = await syncCarbonOutages('scheduled');
        if (result.outagesFound > 0 || result.outagesCreated > 0) {
          console.log(`[CarbonOutage] ${result.servicesChecked} checked, ${result.outagesFound} found, ${result.outagesCreated} new, ${result.outagesResolved} resolved (${result.durationMs}ms)`);
        }
      } catch (err) {
        console.error('[CarbonOutage] Scheduled sync failed:', err);
      }
    };
    await runOutageSync();
    setInterval(runOutageSync, 60 * 60 * 1000); // every 60 minutes

    // Carbon Usage Sync — run nightly at 2am server time
    let lastUsageSyncDate = '';
    const runUsageSync = async () => {
      const now = new Date();
      const today = now.toISOString().substring(0, 10);
      const hour = now.getHours();
      if (hour === 2 && lastUsageSyncDate !== today) {
        lastUsageSyncDate = today;
        try {
          const { syncCarbonUsage } = await import('../suppliers/carbon-outage-usage');
          const result = await syncCarbonUsage('scheduled');
          console.log(`[CarbonUsage] Nightly sync: ${result.servicesChecked} services, ${result.snapshotsCreated} created, ${result.snapshotsUpdated} updated (${result.durationMs}ms)`);
        } catch (err) {
          console.error('[CarbonUsage] Nightly sync failed:', err);
        }
      }
    };
    setInterval(runUsageSync, 60 * 60 * 1000); // check every hour

    // Omada Network Sync — refresh WAN/device/client data every hour
    const runOmadaSync = async () => {
      try {
        const { listOmadaSites, listOmadaDevices, getOmadaClientCount } = await import('../suppliers/omada');
        const { getDb } = await import('../db');
        const { omadaSites } = await import('../../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return;
        const liveSites = await listOmadaSites();
        // Load existing to preserve manual links
        const existingSites = await db.select({
          omadaSiteId: omadaSites.omadaSiteId,
          customerExternalId: omadaSites.customerExternalId,
          matchType: omadaSites.matchType,
          matchConfidence: omadaSites.matchConfidence,
        }).from(omadaSites);
        const existingMap = new Map(existingSites.map((s) => [s.omadaSiteId, s]));
        let updated = 0;
        for (const site of liveSites) {
          try {
            const [devices, clientCount] = await Promise.all([
              listOmadaDevices(site.siteId),
              getOmadaClientCount(site.siteId),
            ]);
            const gateway = devices.find((d) => d.type === 'gateway');
            const gw = gateway as typeof gateway & { publicIp?: string };
            const rawUptime: unknown = gateway ? (gateway as unknown as Record<string, unknown>).uptime : undefined;
            let wanUptimeSeconds: number | null = null;
            if (typeof rawUptime === 'string') {
              let secs = 0;
              const dm = rawUptime.match(/(\d+)\s*day/); if (dm) secs += parseInt(dm[1]) * 86400;
              const hm = rawUptime.match(/(\d+)\s*h/); if (hm) secs += parseInt(hm[1]) * 3600;
              const mm = rawUptime.match(/(\d+)\s*m/); if (mm) secs += parseInt(mm[1]) * 60;
              const sm = rawUptime.match(/(\d+)\s*s/); if (sm) secs += parseInt(sm[1]);
              wanUptimeSeconds = secs;
            } else if (typeof rawUptime === 'number') {
              wanUptimeSeconds = rawUptime;
            }
            const existing = existingMap.get(site.siteId);
            const isManualLink = existing?.matchType === 'manual';
            const values = {
              omadaSiteId: site.siteId,
              omadaSiteName: site.name,
              customerExternalId: isManualLink ? existing!.customerExternalId : (existing?.customerExternalId ?? null),
              matchType: isManualLink ? 'manual' : (existing?.matchType ?? 'unmatched'),
              matchConfidence: isManualLink ? existing!.matchConfidence : (existing?.matchConfidence ?? null),
              wanIp: gw?.publicIp ?? gw?.ip ?? null,
              wanStatus: gateway ? (gateway.status === 1 ? 'connected' : 'disconnected') : null,
              wanUptimeSeconds,
              deviceCount: devices.length,
              apCount: devices.filter((d) => d.type === 'ap').length,
              switchCount: devices.filter((d) => d.type === 'switch').length,
              gatewayCount: devices.filter((d) => d.type === 'gateway').length,
              clientCount,
              lastSyncedAt: new Date(),
            };
            await db.insert(omadaSites).values(values).onDuplicateKeyUpdate({ set: values });
            updated++;
          } catch { /* ignore per-site errors */ }
        }
        if (updated > 0) console.log(`[OmadaSync] Hourly sync: ${updated}/${liveSites.length} sites updated`);
      } catch (err) {
        console.error('[OmadaSync] Hourly sync failed:', err);
      }
    };
    // Run first sync 30 seconds after startup, then every hour
    setTimeout(runOmadaSync, 30000);
    setInterval(runOmadaSync, 60 * 60 * 1000); // every hour

    // ── Vocus Portal Weekly Sync ──────────────────────────────────────────────
    // Runs every Monday at 6:00 AM server time.
    // Requires 2FA — the sync will notify the owner via the notification system
    // and wait for an OTP to be submitted via the /api/vocus/sync-otp endpoint.
    let vocusSyncOtpResolve: ((otp: string) => void) | null = null;
    // Expose a global resolver so the tRPC endpoint can inject the OTP
    (global as any).__vocusSyncOtpResolve = (otp: string) => {
      if (vocusSyncOtpResolve) {
        vocusSyncOtpResolve(otp);
        vocusSyncOtpResolve = null;
      }
    };
    const getVocusOtp = (): Promise<string> =>
      new Promise((resolve) => {
        vocusSyncOtpResolve = resolve;
        // Auto-timeout after 10 minutes
        setTimeout(() => {
          if (vocusSyncOtpResolve) {
            vocusSyncOtpResolve = null;
            resolve('TIMEOUT');
          }
        }, 10 * 60 * 1000);
      });

    let lastVocusSyncDate = '';
    const runVocusSync = async () => {
      const now = new Date();
      const today = now.toISOString().substring(0, 10);
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
      const hour = now.getHours();
      // Run on Monday at 6am, once per day
      if (dayOfWeek === 1 && hour === 6 && lastVocusSyncDate !== today) {
        lastVocusSyncDate = today;
        try {
          const { runVocusSync: doSync } = await import('../vocusScraper');
          const result = await doSync({ getOtp: getVocusOtp });
          console.log(
            `[VocusSync] Weekly sync complete: ${result.mobileCreated + result.mobileUpdated} mobile, ` +
            `${result.nbnCreated + result.nbnUpdated} NBN, ${result.bucketsUpdated} buckets (${result.durationMs}ms)`
          );
        } catch (err) {
          console.error('[VocusSync] Weekly sync failed:', err);
        }
      }
    };
    setInterval(runVocusSync, 60 * 60 * 1000); // check every hour

    // ── Vocus Quota Alert — daily check at 8am AEST (UTC+10 = 22:00 UTC) ────────
    // Sends an owner notification when either mobile bucket exceeds 70% of quota.
    // Also alerts at 90% and 100% (over-quota) with escalating urgency.
    let lastQuotaAlertDate = '';
    const runQuotaAlert = async () => {
      const now = new Date();
      const today = now.toISOString().substring(0, 10);
      const hour = now.getHours();
      // Run once per day at 22:00 UTC (= 8am AEST)
      if (hour === 22 && lastQuotaAlertDate !== today) {
        lastQuotaAlertDate = today;
        try {
          const { checkVocusQuotaAlerts } = await import('../vocusQuotaAlerts');
          await checkVocusQuotaAlerts();
        } catch (err) {
          console.error('[VocusQuotaAlert] Daily check failed:', err);
        }
      }
    };
    // NOTE: The startup setTimeout has been removed.
    // It was causing duplicate alerts when the server restarted at 8am AEST —
    // both the setTimeout and the hourly setInterval would fire within the same
    // hour window, generating two notifications and two Halo tickets.
    // The hourly interval alone is sufficient: it checks the hour on each tick
    // and fires exactly once per day at 22:00 UTC (8am AEST).
    setInterval(runQuotaAlert, 60 * 60 * 1000); // check every hour, fires at 22:00 UTC only
  } catch (err) {
    console.error('[ScheduledJobs] Failed to start scheduled jobs:', err);
  }
}, 10000); // 10 second delay after server start
