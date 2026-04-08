/**
 * TP-Link Omada Cloud-Based Controller (CBC) API v6.1
 * Region: APAC (aps1-northbound-omada-controller.tplinkcloud.com)
 *
 * Auth: OAuth2 Client Credentials
 * - POST /openapi/authorize/token  → access_token (7200s) + refresh_token (30d)
 * - All requests: Authorization: AccessToken <access_token>
 * - Path prefix: /openapi/v1/{omadacId}/...
 */

import { ENV } from "../_core/env";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = "https://aps1-omada-northbound.tplinkcloud.com";

function getOmadaConfig() {
  const clientId = ENV.OMADA_CLIENT_ID;
  const clientSecret = ENV.OMADA_CLIENT_SECRET;
  const omadacId = ENV.OMADA_CONTROLLER_ID;
  if (!clientId || !clientSecret || !omadacId) {
    throw new Error(
      "Omada API credentials not configured. Set OMADA_CLIENT_ID, OMADA_CLIENT_SECRET, OMADA_CONTROLLER_ID."
    );
  }
  return { clientId, clientSecret, omadacId };
}

// ---------------------------------------------------------------------------
// Token cache (module-level singleton)
// ---------------------------------------------------------------------------
interface TokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

let tokenCache: TokenCache | null = null;

async function fetchNewToken(clientId: string, clientSecret: string, omadacId: string): Promise<TokenCache> {
  const res = await fetch(`${BASE_URL}/openapi/authorize/token?grant_type=client_credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ omadacId, client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Omada token fetch failed ${res.status}: ${text}`);
  }
  const json = await res.json() as {
    errorCode: number;
    msg: string;
    result?: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      refreshTokenExpiresIn: number;
      tokenType: string;
    };
  };
  if (json.errorCode !== 0 || !json.result) {
    throw new Error(`Omada token error ${json.errorCode}: ${json.msg}`);
  }
  return {
    accessToken: json.result.accessToken,
    refreshToken: json.result.refreshToken,
    expiresAt: Date.now() + (json.result.expiresIn - 60) * 1000, // 60s buffer
  };
}

async function refreshToken(clientId: string, clientSecret: string, omadacId: string, refreshTok: string): Promise<TokenCache> {
  const res = await fetch(`${BASE_URL}/openapi/authorize/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ omadacId, client_id: clientId, client_secret: clientSecret, refresh_token: refreshTok }),
  });
  if (!res.ok) {
    // Fall back to fresh token
    return fetchNewToken(clientId, clientSecret, omadacId);
  }
  const json = await res.json() as {
    errorCode: number;
    msg: string;
    result?: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
  };
  if (json.errorCode !== 0 || !json.result) {
    return fetchNewToken(clientId, clientSecret, omadacId);
  }
  return {
    accessToken: json.result.accessToken,
    refreshToken: json.result.refreshToken,
    expiresAt: Date.now() + (json.result.expiresIn - 60) * 1000,
  };
}

async function getAccessToken(): Promise<string> {
  const { clientId, clientSecret, omadacId } = getOmadaConfig();
  if (!tokenCache || Date.now() >= tokenCache.expiresAt) {
    if (tokenCache?.refreshToken) {
      tokenCache = await refreshToken(clientId, clientSecret, omadacId, tokenCache.refreshToken);
    } else {
      tokenCache = await fetchNewToken(clientId, clientSecret, omadacId);
    }
  }
  return tokenCache.accessToken;
}

// ---------------------------------------------------------------------------
// Generic request helper
// ---------------------------------------------------------------------------
async function omadaRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string | number> } = {}
): Promise<T> {
  const { omadacId } = getOmadaConfig();
  const accessToken = await getAccessToken();

  let url = `${BASE_URL}/openapi/v1/${omadacId}${path}`;
  if (options.params) {
    const qs = new URLSearchParams(
      Object.entries(options.params).map(([k, v]) => [k, String(v)])
    ).toString();
    url += `?${qs}`;
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `AccessToken=${accessToken}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Omada API ${options.method ?? "GET"} ${path} failed ${res.status}: ${text}`);
  }

  const json = await res.json() as { errorCode: number; msg: string; result?: T };
  if (json.errorCode !== 0) {
    // -44112 = access token expired / refresh token expired — clear cache and retry once with a fresh token
    if (json.errorCode === -44112 || json.errorCode === -44111) {
      tokenCache = null;
      const { clientId, clientSecret, omadacId: cId } = getOmadaConfig();
      const fresh = await fetchNewToken(clientId, clientSecret, cId);
      tokenCache = fresh;
      // Retry the request once with the new token
      const retryRes = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `AccessToken=${fresh.accessToken}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      if (!retryRes.ok) {
        const retryText = await retryRes.text();
        throw new Error(`Omada API retry failed ${retryRes.status}: ${retryText}`);
      }
      const retryJson = await retryRes.json() as { errorCode: number; msg: string; result?: T };
      if (retryJson.errorCode !== 0) {
        throw new Error(`Omada API error ${retryJson.errorCode}: ${retryJson.msg} (path: ${path})`);
      }
      return retryJson.result as T;
    }
    throw new Error(`Omada API error ${json.errorCode}: ${json.msg} (path: ${path})`);
  }
  return json.result as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface OmadaSiteInfo {
  siteId: string;
  name: string;
  region?: string;
  scenario?: string;
  timeZone?: string;
  deviceNum?: number;
  apNum?: number;
  switchNum?: number;
  gatewayNum?: number;
  clientNum?: number;
  healthScore?: number;
  healthStatus?: string; // 'good' | 'warning' | 'bad'
  alertNum?: number;
}

export interface OmadaWanStatus {
  siteId: string;
  wanPortInfos?: Array<{
    portName?: string;
    ipType?: string;
    ip?: string;
    status?: number; // 0=disconnected, 1=connected
    uptime?: number; // seconds
    rxBytes?: number;
    txBytes?: number;
    isp?: string;
  }>;
}

export interface OmadaDevice {
  mac: string;
  name?: string;
  type?: string; // 'gateway' | 'ap' | 'switch'
  model?: string;
  firmwareVersion?: string;
  status?: number; // 0=disconnected, 1=connected, 2=pending, 3=isolated
  uptime?: number;
  cpuUtil?: number;
  memUtil?: number;
  ip?: string;
  clientNum?: number;
}

export interface OmadaClient {
  mac: string;
  name?: string;
  hostName?: string;
  ip?: string;
  ssid?: string;
  apName?: string;
  port?: string;
  networkName?: string;
  radioId?: number;
  signalLevel?: number;
  signalRank?: number;
  rxRate?: number;
  txRate?: number;
  activity?: number; // bytes/s
  trafficDown?: number; // bytes total
  trafficUp?: number;
  uptime?: number;
  connectDevType?: string; // 'wireless' | 'wired'
  blocked?: boolean;
  authorized?: boolean;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * List all sites in the controller.
 */
export async function listOmadaSites(): Promise<OmadaSiteInfo[]> {
  const result = await omadaRequest<{ data: OmadaSiteInfo[] }>("/sites", {
    params: { pageSize: 1000, page: 1 },
  });
  return result.data ?? [];
}

/**
 * Get a single site's detail.
 */
export async function getOmadaSiteDetail(siteId: string): Promise<OmadaSiteInfo> {
  return omadaRequest<OmadaSiteInfo>(`/sites/${siteId}`);
}

/**
 * Get WAN status for a site.
 * The CBC northbound API does not expose a dedicated WAN endpoint;
 * WAN information is derived from the gateway device's publicIp and status fields.
 */
export async function getOmadaWanStatus(siteId: string): Promise<OmadaWanStatus> {
  try {
    const devices = await listOmadaDevices(siteId);
    const gateway = devices.find((d) => d.type === "gateway");
    if (!gateway) return { siteId, wanPortInfos: [] };
    return {
      siteId,
      wanPortInfos: [
        {
          portName: "WAN",
          ip: (gateway as OmadaDevice & { publicIp?: string }).publicIp ?? gateway.ip,
          status: gateway.status === 1 ? 1 : 0,
          uptime: typeof gateway.uptime === "string"
            ? parseUptimeString(gateway.uptime as unknown as string)
            : (gateway.uptime ?? 0),
        },
      ],
    };
  } catch {
    return { siteId, wanPortInfos: [] };
  }
}

/** Parse Omada uptime string like "39day(s) 12h 40m 25s" into seconds */
function parseUptimeString(uptime: string): number {
  if (!uptime) return 0;
  let seconds = 0;
  const days = uptime.match(/(\d+)\s*day/);
  const hours = uptime.match(/(\d+)\s*h/);
  const mins = uptime.match(/(\d+)\s*m/);
  const secs = uptime.match(/(\d+)\s*s/);
  if (days) seconds += parseInt(days[1]) * 86400;
  if (hours) seconds += parseInt(hours[1]) * 3600;
  if (mins) seconds += parseInt(mins[1]) * 60;
  if (secs) seconds += parseInt(secs[1]);
  return seconds;
}

/**
 * List all devices at a site.
 */
export async function listOmadaDevices(siteId: string): Promise<OmadaDevice[]> {
  const result = await omadaRequest<{ data: OmadaDevice[] }>(`/sites/${siteId}/devices`, {
    params: { pageSize: 200, page: 1 },
  });
  return result.data ?? [];
}

/**
 * List active clients at a site.
 * CBC northbound API uses GET (not POST) for the clients endpoint.
 */
export async function listOmadaClients(siteId: string, options?: { startTime?: number; endTime?: number }): Promise<OmadaClient[]> {
  const params: Record<string, string | number> = { pageSize: 200, page: 1 };
  if (options?.startTime) params.startTime = options.startTime;
  if (options?.endTime) params.endTime = options.endTime;
  const result = await omadaRequest<{ data: OmadaClient[]; clientStat?: { total?: number } }>(`/sites/${siteId}/clients`, {
    params,
  });
  return result.data ?? [];
}

/**
 * Get client count for a site (lightweight — fetches page 1 with size 1 and reads clientStat).
 */
export async function getOmadaClientCount(siteId: string): Promise<number> {
  try {
    const result = await omadaRequest<{ clientStat?: { total?: number } }>(`/sites/${siteId}/clients`, {
      params: { pageSize: 1, page: 1 },
    });
    return result.clientStat?.total ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Block a client by MAC address at a site.
 */
export async function blockOmadaClient(siteId: string, mac: string): Promise<void> {
  await omadaRequest<unknown>(`/sites/${siteId}/cmd/clients/block`, {
    method: "POST",
    body: { macs: [mac] },
  });
}

/**
 * Unblock a client by MAC address at a site.
 */
export async function unblockOmadaClient(siteId: string, mac: string): Promise<void> {
  await omadaRequest<unknown>(`/sites/${siteId}/cmd/clients/unblock`, {
    method: "POST",
    body: { macs: [mac] },
  });
}

/**
 * Get site-level statistics (traffic summary).
 */
export async function getOmadaSiteStats(siteId: string): Promise<{
  rxBytes?: number;
  txBytes?: number;
  rxPackets?: number;
  txPackets?: number;
}> {
  try {
    return await omadaRequest<{ rxBytes?: number; txBytes?: number }>(`/sites/${siteId}/statistic`);
  } catch {
    return {};
  }
}

/**
 * Auto-match Omada sites to SmileTel customers by name similarity.
 * Returns array of { omadaSiteId, omadaSiteName, customerExternalId, confidence }
 */
export function autoMatchSitesToCustomers(
  sites: OmadaSiteInfo[],
  customers: Array<{ externalId: string; name: string; businessName?: string | null }>
): Array<{
  omadaSiteId: string;
  omadaSiteName: string;
  customerExternalId: string | null;
  confidence: number;
}> {
  function normalize(s: string): string {
    return s
      .toLowerCase()
      .replace(/\bpty\b|\bltd\b|\bthe\b|\brestaurant\b|\bcafe\b|\bbar\b/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function similarity(a: string, b: string): number {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return 1.0;
    if (na.includes(nb) || nb.includes(na)) return 0.85;
    // Token overlap
    const ta = new Set(na.split(" ").filter((t) => t.length > 2));
    const tb = new Set(nb.split(" ").filter((t) => t.length > 2));
    const intersection = Array.from(ta).filter((t) => tb.has(t)).length;
    const union = new Set([...Array.from(ta), ...Array.from(tb)]).size;
    return union > 0 ? intersection / union : 0;
  }

  return sites.map((site) => {
    let bestCustomer: string | null = null;
    let bestScore = 0;

    for (const c of customers) {
      const nameScore = similarity(site.name, c.name);
      const bizScore = c.businessName ? similarity(site.name, c.businessName) : 0;
      const score = Math.max(nameScore, bizScore);
      if (score > bestScore) {
        bestScore = score;
        bestCustomer = c.externalId;
      }
    }

    return {
      omadaSiteId: site.siteId,
      omadaSiteName: site.name,
      customerExternalId: bestScore >= 0.6 ? bestCustomer : null,
      confidence: Math.round(bestScore * 100) / 100,
    };
  });
}
