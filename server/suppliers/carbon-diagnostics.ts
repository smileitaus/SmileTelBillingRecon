/**
 * Carbon API — Remote Diagnostics & Outage Monitoring
 *
 * Correct endpoint paths per official Carbon API documentation:
 *   GET  /tests/availability              — system-wide availability check (204 = available)
 *   GET  /tests/{service}/available       — per-service list of supported tests
 *   POST /tests/{service}/portreset       — port reset
 *   POST /tests/{service}/loopback        — loopback test
 *   POST /tests/{service}/linestate       — line state (FTTN/FTTB/FTTC)
 *   POST /tests/{service}/ntdstatus       — NTD status (FTTP/HFC)
 *   POST /tests/{service}/unidstatus      — UNI-D status (FTTP/HFC)
 *   POST /tests/{service}/dpustatus       — DPU status (FTTC)
 *   POST /tests/{service}/dpuportstatus   — DPU port status (FTTC)
 *   POST /tests/{service}/dpuportreset    — DPU port reset (FTTC)
 *   POST /tests/{service}/ncdportreset    — NCD port reset (FTTC)
 *   POST /tests/{service}/ncdreset        — NCD reset (FTTC)
 *   POST /tests/{service}/stability-profile — stability profile
 *   GET  /service/{service}/outages       — service outage data
 *
 * Each diagnostic operation:
 *   1. Checks system availability (GET /tests/availability → 204)
 *   2. Checks per-service available tests (GET /tests/{service}/available)
 *   3. Validates the requested test is in the available list
 *   4. Creates a carbon_diagnostic_runs row (status: queued)
 *   5. Calls the Carbon API POST endpoint
 *   6. Updates the row with the result (status: completed | failed)
 *   7. Returns the full run record
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { carbonDiagnosticRuns } from "../../drizzle/schema";

const CARBON_BASE_URL = "https://api.carbon.aussiebroadband.com.au";

// ─── Auth helpers with session cache ─────────────────────────────────────────
let _cachedCookie: string | null = null;
let _cookieExpiry = 0;
const COOKIE_TTL_MS = 20 * 60 * 1000; // 20 minutes

function getCarbonPassword(): string {
  const prefix = process.env.CARBON_PASSWORD_PREFIX;
  const suffix = process.env.CARBON_PASSWORD_SUFFIX;
  if (!prefix || !suffix) throw new Error("[CarbonDiag] CARBON_PASSWORD_PREFIX/SUFFIX not set");
  return `${prefix}$X${suffix}`;
}

async function getCarbonSession(): Promise<string> {
  if (_cachedCookie && Date.now() < _cookieExpiry) {
    return _cachedCookie;
  }
  const username = process.env.CARBON_USERNAME;
  if (!username) throw new Error("[CarbonDiag] CARBON_USERNAME not set");
  const res = await fetch(`${CARBON_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password: getCarbonPassword() }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[CarbonDiag] Login failed (${res.status}): ${body.substring(0, 200)}`);
  }
  const rawCookies = res.headers.get("set-cookie") || "";
  const cookieStr = rawCookies
    .split(",")
    .map((c: string) => c.trim().split(";")[0])
    .join("; ");
  if (!cookieStr) throw new Error("[CarbonDiag] No session cookie returned");
  _cachedCookie = cookieStr;
  _cookieExpiry = Date.now() + COOKIE_TTL_MS;
  return cookieStr;
}

/**
 * Check if the Carbon API testing system is currently available.
 * Always performs a fresh check — no server-side caching to avoid stale false-negatives.
 * Returns true if GET /tests/availability returns 204.
 */
export async function checkTestSystemAvailability(): Promise<{ available: boolean; checkedAt: number }> {
  try {
    const cookie = await getCarbonSession();
    const res = await fetch(`${CARBON_BASE_URL}/tests/availability`, {
      method: "GET",
      headers: { Accept: "application/json", cookie },
    });
    console.log(`[CarbonDiag] availability check → HTTP ${res.status}`);
    const available = res.status === 204;
    return { available, checkedAt: Date.now() };
  } catch (err) {
    console.error(`[CarbonDiag] availability check error:`, err);
    return { available: false, checkedAt: Date.now() };
  }
}

// ─── Test detail fetch (GET /tests/{serviceId}/{testId}) ─────────────────────
/**
 * Fetch the full test detail including output fields.
 * The correct endpoint is GET /tests/{serviceId}/{testId}.
 * Poll this until status is Completed or Failed to get populated output.
 */
async function getTestDetail(
  carbonServiceId: string,
  testId: number
): Promise<Record<string, unknown> | null> {
  try {
    const cookie = await getCarbonSession();
    const res = await fetch(`${CARBON_BASE_URL}/tests/${carbonServiceId}/${testId}`, {
      method: "GET",
      headers: { Accept: "application/json", cookie },
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Poll GET /tests/{serviceId}/{testId} until the test completes or times out.
 * Returns the final test data with populated output fields.
 */
async function pollTestUntilComplete(
  carbonServiceId: string,
  testId: number,
  maxWaitMs = 120_000,
  intervalMs = 5_000
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));
    const detail = await getTestDetail(carbonServiceId, testId);
    if (!detail) return null;
    const status = detail.status as string;
    if (status === "Completed" || status === "Failed") {
      return detail;
    }
  }
  // Timed out — return the last known state
  return await getTestDetail(carbonServiceId, testId);
}

// ─── List service tests (GET /tests/{serviceId}) ──────────────────────────────
export interface ServiceTestSummary {
  id: number;
  type: string;
  status: string;
  result: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  service_id: number;
}

/**
 * List all historical tests for a Carbon service.
 * Returns the most recent tests first.
 */
export async function listServiceTests(carbonServiceId: string): Promise<ServiceTestSummary[]> {
  try {
    const cookie = await getCarbonSession();
    const res = await fetch(`${CARBON_BASE_URL}/tests/${carbonServiceId}`, {
      method: "GET",
      headers: { Accept: "application/json", cookie },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data as ServiceTestSummary[] : [];
  } catch (err) {
    console.error(`[CarbonDiag] listServiceTests error for ${carbonServiceId}:`, err);
    return [];
  }
}

// ─── Per-service available tests ──────────────────────────────────────────────
export interface AvailableTest {
  name: string;
  summary: string;
  description: string;
  link: string;
}

/**
 * Get the list of diagnostic tests available for a specific Carbon service.
 * Returns an empty array if the service is not found or has no available tests.
 */
export async function getAvailableTestsForService(carbonServiceId: string): Promise<AvailableTest[]> {
  try {
    const cookie = await getCarbonSession();
    const res = await fetch(`${CARBON_BASE_URL}/tests/${carbonServiceId}/available`, {
      method: "GET",
      headers: { Accept: "application/json", cookie },
    });
    if (res.status === 404) return [];
    if (!res.ok) {
      console.warn(`[CarbonDiag] getAvailableTests returned ${res.status} for service ${carbonServiceId}`);
      return [];
    }
    const data = await res.json() as AvailableTest[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[CarbonDiag] getAvailableTests error for service ${carbonServiceId}:`, err);
    return [];
  }
}

// ─── Test name → endpoint path mapping ───────────────────────────────────────
const TEST_ENDPOINT_MAP: Record<string, string> = {
  "Check Connection": "service-health-summary",
  "Line State": "linestate",
  "Loopback": "loopback",
  "Port Reset": "portreset",
  "Stability Profile": "stability-profile",
  "NTD Status": "ntdstatus",
  "UNI-D Status": "unidstatus",
  "DPU Status": "dpustatus",
  "DPU Port Status": "dpuportstatus",
  "DPU Port Reset": "dpuportreset",
  "NCD Port Reset": "ncdportreset",
  "NCD Reset": "ncdreset",
};

// ─── Types ───────────────────────────────────────────────────────────────────
export type DiagnosticType =
  | "port_reset"
  | "loopback_test"
  | "stability_profile"
  | "line_state"
  | "ntd_status"
  | "unid_status"
  | "dpu_status"
  | "dpu_port_status"
  | "dpu_port_reset"
  | "ncd_port_reset"
  | "ncd_reset"
  | "check_connection";

export interface DiagnosticRunResult {
  id: number;
  serviceExternalId: string;
  carbonServiceId: string;
  diagnosticType: DiagnosticType;
  profileName: string | null;
  status: "queued" | "running" | "completed" | "failed";
  resultSummary: string | null;
  resultJson: string | null;
  errorMessage: string | null;
  triggeredBy: string;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function createRunRecord(
  serviceExternalId: string,
  carbonServiceId: string,
  customerExternalId: string | null,
  diagnosticType: DiagnosticType,
  triggeredBy: string,
  profileName?: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("[CarbonDiag] DB not available");
  const [result] = await db.insert(carbonDiagnosticRuns).values({
    serviceExternalId,
    carbonServiceId,
    customerExternalId,
    diagnosticType,
    profileName: profileName ?? null,
    status: "queued",
    triggeredBy,
    startedAt: new Date(),
  });
  return (result as unknown as { insertId: number }).insertId;
}

async function completeRunRecord(
  id: number,
  status: "completed" | "failed",
  resultSummary: string,
  resultJson: string | null,
  errorMessage: string | null,
  startTime: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(carbonDiagnosticRuns)
    .set({
      status,
      resultSummary,
      resultJson,
      errorMessage,
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
    })
    .where(eq(carbonDiagnosticRuns.id, id));
}

// ─── Result summary builder ───────────────────────────────────────────────────
function buildResultSummary(testName: string, data: Record<string, unknown>, statusCode: number): string {
  // Carbon API wraps structured data under an `output` key:
  // { id, type, status, result, output: { ... }, created_at, updated_at, completed_at }
  const output = (data.output as Record<string, unknown>) ?? {};
  const topResult = data.result as string | null | undefined;
  const topStatus = data.status as string | undefined;
  switch (testName) {
    case "Port Reset":
    case "DPU Port Reset":
    case "NCD Port Reset":
    case "NCD Reset": {
      const status = topStatus ?? "InProgress";
      return `${testName} initiated (status: ${status}). The device will reset within 30–60 seconds.`;
    }
    case "Loopback": {
      const result = topResult ?? topStatus;
      return `Loopback test completed. Result: ${result ?? "see details"}.`;
    }
    case "Line State": {
      const syncRate = output.currentSyncRate as Record<string, unknown> | undefined;
      const syncDown = syncRate?.downstream;
      const syncUp = syncRate?.upstream;
      const stability = output.serviceStability;
      const dslMode = output.dslMode;
      let s = `Line State test completed.`;
      if (dslMode) s += ` Mode: ${dslMode}.`;
      if (stability) s += ` Stability: ${stability}.`;
      if (syncDown !== undefined) s += ` Sync ↓${syncDown}/↑${syncUp} kbps.`;
      return s;
    }
    case "NTD Status": {
      const linkState = output.linkState;
      const uptime = output.uptime;
      const flaps = output.totalFlaps;
      let s = `NTD Status check completed.`;
      if (linkState) s += ` Link: ${linkState}.`;
      if (uptime !== undefined) s += ` Uptime: ${uptime}s.`;
      if (flaps !== undefined) s += ` Flaps: ${flaps}.`;
      return s;
    }
    case "UNI-D Status": {
      const opState = output.operationalState;
      const linkState = output.linkState;
      let s = `UNI-D Status check completed.`;
      if (opState) s += ` Operational: ${opState}.`;
      if (linkState) s += ` Link: ${linkState}.`;
      return s;
    }
    case "DPU Status": {
      const opState = output.operationalState;
      return `DPU Status check completed. Operational state: ${opState ?? "unknown"}.`;
    }
    case "DPU Port Status": {
      const syncState = output.syncState;
      const opState = output.operationalState;
      const lineRate = output.accessLineRate;
      let s = `DPU Port Status check completed.`;
      if (syncState) s += ` Sync: ${syncState}.`;
      if (opState) s += ` Operational: ${opState}.`;
      if (lineRate) s += ` Line rate: ${lineRate}.`;
      return s;
    }
    case "Service Health Summary":
    case "Check Connection": {
      const result = topResult ?? topStatus;
      return `${testName} completed. Result: ${result ?? "see details"}.`;
    }
    case "Stability Profile": {
      const result = topResult ?? topStatus;
      return `Stability Profile test completed. Result: ${result ?? "see details"}.`;
    }
    default:
      return `${testName} completed (HTTP ${statusCode}).`;
  }
}

// ─── Generic test runner ──────────────────────────────────────────────────────
/**
 * Run any diagnostic test by name after pre-flight checks.
 * Validates system availability and per-service test availability before calling the API.
 */
export async function runDiagnosticTest(
  serviceExternalId: string,
  carbonServiceId: string,
  customerExternalId: string | null,
  testName: string,
  triggeredBy: string,
  extraBody?: Record<string, unknown>
): Promise<DiagnosticRunResult> {
  const db = await getDb();
  if (!db) throw new Error("[CarbonDiag] DB not available");

  // Step 1: Check system availability
  const { available } = await checkTestSystemAvailability();
  if (!available) {
    throw new Error("The Carbon API testing system is currently unavailable. Please try again later.");
  }

  // Step 2: Check per-service available tests
  const availableTests = await getAvailableTestsForService(carbonServiceId);
  const testEntry = availableTests.find(t => t.name === testName);
  if (!testEntry) {
    const availableNames = availableTests.map(t => t.name).join(", ") || "none";
    throw new Error(`The test "${testName}" is not available for this service. Available tests: ${availableNames}`);
  }

  // Step 3: Resolve endpoint path
  const endpointSuffix = TEST_ENDPOINT_MAP[testName];
  if (!endpointSuffix) {
    throw new Error(`Unknown test name: "${testName}". Cannot resolve endpoint path.`);
  }

  // Step 4: Map test name to diagnostic type
  const typeMap: Record<string, DiagnosticType> = {
    "Check Connection": "check_connection",
    "Line State": "line_state",
    "Loopback": "loopback_test",
    "Port Reset": "port_reset",
    "Stability Profile": "stability_profile",
    "NTD Status": "ntd_status",
    "UNI-D Status": "unid_status",
    "DPU Status": "dpu_status",
    "DPU Port Status": "dpu_port_status",
    "DPU Port Reset": "dpu_port_reset",
    "NCD Port Reset": "ncd_port_reset",
    "NCD Reset": "ncd_reset",
  };
  const diagnosticType: DiagnosticType = typeMap[testName] ?? "check_connection";

  const startTime = Date.now();
  const runId = await createRunRecord(
    serviceExternalId,
    carbonServiceId,
    customerExternalId,
    diagnosticType,
    triggeredBy
  );

  try {
    const cookie = await getCarbonSession();
    await db.update(carbonDiagnosticRuns).set({ status: "running" }).where(eq(carbonDiagnosticRuns.id, runId));

    const res = await fetch(`${CARBON_BASE_URL}/tests/${carbonServiceId}/${endpointSuffix}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        cookie,
      },
      body: extraBody ? JSON.stringify(extraBody) : undefined,
    });

    const responseText = await res.text();
    let responseData: Record<string, unknown> = {};
    try { responseData = JSON.parse(responseText); } catch { /* ignore */ }

    if (!res.ok) {
      const errMsg = `Carbon API returned ${res.status}: ${responseText.substring(0, 500)}`;
      await completeRunRecord(runId, "failed", `${testName} failed`, null, errMsg, startTime);
    } else {
      // The Carbon API processes tests asynchronously — the POST response has null output fields.
      // Poll GET /tests/{serviceId}/{testId} until the test completes to get the populated output.
      const testId = responseData.id as number | undefined;
      let finalData = responseData;
      if (testId) {
        const initialStatus = responseData.status as string;
        if (initialStatus !== "Completed" && initialStatus !== "Failed") {
          const polled = await pollTestUntilComplete(carbonServiceId, testId);
          if (polled) finalData = polled;
        }
      }
      const summary = buildResultSummary(testName, finalData, res.status);
      await completeRunRecord(runId, "completed", summary, JSON.stringify(finalData), null, startTime);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await completeRunRecord(runId, "failed", `${testName} failed due to an error`, null, errMsg, startTime);
  }

  const rows = await db.select().from(carbonDiagnosticRuns).where(eq(carbonDiagnosticRuns.id, runId)).limit(1);
  return rows[0] as DiagnosticRunResult;
}

// ─── Legacy wrappers (backwards compatibility) ────────────────────────────────
export async function runPortReset(
  serviceExternalId: string,
  carbonServiceId: string,
  customerExternalId: string | null,
  triggeredBy: string
): Promise<DiagnosticRunResult> {
  return runDiagnosticTest(serviceExternalId, carbonServiceId, customerExternalId, "Port Reset", triggeredBy);
}

export async function runLoopbackTest(
  serviceExternalId: string,
  carbonServiceId: string,
  customerExternalId: string | null,
  triggeredBy: string
): Promise<DiagnosticRunResult> {
  return runDiagnosticTest(serviceExternalId, carbonServiceId, customerExternalId, "Loopback", triggeredBy);
}

export const STABILITY_PROFILES = ["FAST", "STABLE", "INTERLEAVED", "DEFAULT"] as const;
export type StabilityProfile = typeof STABILITY_PROFILES[number];

export async function runStabilityProfileChange(
  serviceExternalId: string,
  carbonServiceId: string,
  customerExternalId: string | null,
  profileName: StabilityProfile,
  triggeredBy: string
): Promise<DiagnosticRunResult> {
  return runDiagnosticTest(
    serviceExternalId,
    carbonServiceId,
    customerExternalId,
    "Stability Profile",
    triggeredBy,
    { profile: profileName }
  );
}

// ─── Service Outages ──────────────────────────────────────────────────────────
export interface OutageEvent {
  reference: string;
  title: string;
  summary: string;
  start_time: string;
  end_time: string;
  restored_at: string;
  last_updated: string;
}

export interface NbnOutage {
  created: string;
  status: string;
  comments: string;
  updated_at: string;
}

export interface ScheduledOutage {
  start_date: string;
  end_date: string;
  duration: number; // minutes
}

export interface ServiceOutages {
  networkEvents: OutageEvent[];
  aussieOutages: OutageEvent[];
  currentNbnOutages: NbnOutage[];
  scheduledNbnOutages: ScheduledOutage[];
  resolvedScheduledNbnOutages: ScheduledOutage[];
  resolvedNbnOutages: NbnOutage[];
}

/**
 * Get all outage data for a specific Carbon service.
 * Returns empty arrays for all categories if the service is not found or the API fails.
 */
export async function getServiceOutages(carbonServiceId: string): Promise<ServiceOutages> {
  const empty: ServiceOutages = {
    networkEvents: [],
    aussieOutages: [],
    currentNbnOutages: [],
    scheduledNbnOutages: [],
    resolvedScheduledNbnOutages: [],
    resolvedNbnOutages: [],
  };
  try {
    const cookie = await getCarbonSession();
    const res = await fetch(`${CARBON_BASE_URL}/service/${carbonServiceId}/outages`, {
      method: "GET",
      headers: { Accept: "application/json", cookie },
    });
    if (res.status === 404) return empty;
    if (!res.ok) {
      console.warn(`[CarbonDiag] getServiceOutages returned ${res.status} for service ${carbonServiceId}`);
      return empty;
    }
    const data = await res.json() as Partial<ServiceOutages>;
    return {
      networkEvents: data.networkEvents ?? [],
      aussieOutages: data.aussieOutages ?? [],
      currentNbnOutages: data.currentNbnOutages ?? [],
      scheduledNbnOutages: data.scheduledNbnOutages ?? [],
      resolvedScheduledNbnOutages: data.resolvedScheduledNbnOutages ?? [],
      resolvedNbnOutages: data.resolvedNbnOutages ?? [],
    };
  } catch (err) {
    console.error(`[CarbonDiag] getServiceOutages error for service ${carbonServiceId}:`, err);
    return empty;
  }
}

// ─── Query helpers ────────────────────────────────────────────────────────────
export async function getDiagnosticHistory(serviceExternalId: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(carbonDiagnosticRuns)
    .where(eq(carbonDiagnosticRuns.serviceExternalId, serviceExternalId))
    .orderBy(carbonDiagnosticRuns.startedAt)
    .limit(limit);
}

export async function getDiagnosticRun(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(carbonDiagnosticRuns)
    .where(eq(carbonDiagnosticRuns.id, id))
    .limit(1);
  return rows[0] ?? null;
}
