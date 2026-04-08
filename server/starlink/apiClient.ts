/**
 * Starlink Enterprise API v2 Client — Full Coverage
 *
 * Authentication: OIDC Client Credentials flow
 * Base URL: https://web-api.starlink.com
 *
 * Endpoints covered:
 *   Accounts   — list, data usage (billing cycle query)
 *   Address    — list, create, update, get, check capacity
 *   ServiceLine — list, get, create, deactivate, rename, change product,
 *                 top-up (one-time + recurring), opt-in/out, public IP,
 *                 billing cycle usage (all + partial), available products
 *   UserTerminal — list, add/remove account, add/remove service line, reboot, batch config
 *   Router     — get, reboot, configs (list/create/get/update), batch config
 */

const STARLINK_BASE = "https://web-api.starlink.com";
const OIDC_TOKEN_URL = "https://id.starlink.com/oidc/token";

// ─── Token cache ──────────────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}
const tokenCache = new Map<string, TokenCache>();

export async function getStarlinkToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = tokenCache.get(clientId);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.accessToken;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const resp = await fetch(OIDC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Starlink OIDC token error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  const entry: TokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  tokenCache.set(clientId, entry);
  return entry.accessToken;
}

// ─── Generic HTTP helpers ─────────────────────────────────────────────────────

export async function starlinkRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  token: string,
  body?: unknown
): Promise<T> {
  const resp = await fetch(`${STARLINK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Starlink API ${resp.status} ${method} ${path}: ${text}`);
  }

  // Some DELETE endpoints return 204 No Content
  if (resp.status === 204) return {} as T;
  return resp.json() as Promise<T>;
}

const get = <T>(path: string, token: string) => starlinkRequest<T>("GET", path, token);
const post = <T>(path: string, token: string, body?: unknown) => starlinkRequest<T>("POST", path, token, body);
const put = <T>(path: string, token: string, body?: unknown) => starlinkRequest<T>("PUT", path, token, body);
const del = <T>(path: string, token: string, body?: unknown) => starlinkRequest<T>("DELETE", path, token, body);

// ─── Type definitions ─────────────────────────────────────────────────────────

export interface StarlinkApiAccount {
  accountNumber: string;
  accountName: string;
  regionCode?: string;
  defaultServiceAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    countryCode?: string;
  };
}

export interface StarlinkApiAddress {
  addressReferenceId: string;
  formatted?: string;
  addressLines?: string[];
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  countryCode?: string;
  metadata?: Record<string, unknown>;
}

export interface StarlinkApiServiceLine {
  serviceLineNumber: string;
  accountNumber: string;
  nickname?: string;
  active: boolean;
  productReferenceId?: string;
  addressReferenceId?: string;
  publicIp?: string;
  dataBlocksSummary?: {
    recurringBlocks?: number;
    oneTimeBlocks?: number;
    totalGbRemaining?: number;
  };
}

export interface StarlinkApiProduct {
  productReferenceId: string;
  name?: string;
  description?: string;
  dataLimitGb?: number;
  isTopUpPlan?: boolean;
  monthlyPriceUsd?: number;
}

export interface StarlinkApiTerminal {
  userTerminalId: string;
  deviceId?: string;
  kitSerialNumber?: string;
  dishSerialNumber?: string;
  accountNumber: string;
  serviceLineNumber?: string;
  online?: boolean;
  signalQuality?: number;
  downlinkThroughputMbps?: number;
  uplinkThroughputMbps?: number;
  lastSeenAt?: string;
  softwareVersion?: string;
  hardwareVersion?: string;
  utcOffsetSeconds?: number;
}

export interface StarlinkApiRouter {
  routerId: string;
  accountNumber: string;
  serialNumber?: string;
  hardwareVersion?: string;
  softwareVersion?: string;
  online?: boolean;
  lastSeenAt?: string;
}

export interface StarlinkApiRouterConfig {
  configId: string;
  name?: string;
  settings?: Record<string, unknown>;
}

export interface StarlinkApiUsageBillingCycle {
  serviceLineNumber?: string;
  startDate?: string;
  endDate?: string;
  priorityDownloadBytesUsed?: number;
  priorityUploadBytesUsed?: number;
  standardDownloadBytesUsed?: number;
  standardUploadBytesUsed?: number;
  mobileDownloadBytesUsed?: number;
  mobileUploadBytesUsed?: number;
  overageDownloadBytesUsed?: number;
  overageUploadBytesUsed?: number;
  totalDownloadBytesUsed?: number;
  totalUploadBytesUsed?: number;
}

export interface StarlinkApiUsageDaily {
  date?: string;
  priorityDownloadBytesUsed?: number;
  priorityUploadBytesUsed?: number;
  standardDownloadBytesUsed?: number;
  standardUploadBytesUsed?: number;
  mobileDownloadBytesUsed?: number;
  mobileUploadBytesUsed?: number;
}

export interface StarlinkApiCapacityCheck {
  available: boolean;
  reason?: string;
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function listAccounts(token: string): Promise<StarlinkApiAccount[]> {
  const data = await get<{ accounts?: StarlinkApiAccount[] }>("/public/v1/accounts", token);
  return data.accounts ?? [];
}

/**
 * Get data usage across all service lines for an account for a billing period.
 * billingPeriod: 'YYYY-MM'
 */
export async function getAccountDataUsage(
  token: string,
  accountNumber: string,
  billingPeriod: string
): Promise<StarlinkApiUsageBillingCycle[]> {
  const [year, month] = billingPeriod.split("-");
  const startDate = `${year}-${month}-01`;
  const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().slice(0, 10);

  try {
    const data = await post<{ dataUsages?: StarlinkApiUsageBillingCycle[] }>(
      `/public/v1/accounts/${accountNumber}/billing-cycles/query`,
      token,
      { startDate, endDate }
    );
    return data.dataUsages ?? [];
  } catch {
    return [];
  }
}

// ─── Addresses ────────────────────────────────────────────────────────────────

export async function listAddresses(token: string, accountNumber: string): Promise<StarlinkApiAddress[]> {
  const data = await get<{ addresses?: StarlinkApiAddress[] }>(
    `/public/v1/account/${accountNumber}/addresses`,
    token
  );
  return data.addresses ?? [];
}

export async function getAddress(
  token: string,
  accountNumber: string,
  addressReferenceId: string
): Promise<StarlinkApiAddress | null> {
  try {
    const data = await get<{ address?: StarlinkApiAddress }>(
      `/public/v1/account/${accountNumber}/addresses/${addressReferenceId}`,
      token
    );
    return data.address ?? null;
  } catch {
    return null;
  }
}

export async function checkAddressCapacity(
  token: string,
  accountNumber: string,
  addressPayload: Record<string, unknown>
): Promise<StarlinkApiCapacityCheck> {
  const data = await post<StarlinkApiCapacityCheck>(
    `/public/v1/account/${accountNumber}/addresses/check-capacity`,
    token,
    addressPayload
  );
  return data;
}

// ─── Service Lines ────────────────────────────────────────────────────────────

export async function listServiceLines(
  token: string,
  accountNumber: string
): Promise<StarlinkApiServiceLine[]> {
  const data = await get<{ serviceLines?: StarlinkApiServiceLine[] }>(
    `/public/v1/account/${accountNumber}/service-lines`,
    token
  );
  return data.serviceLines ?? [];
}

export async function getServiceLine(
  token: string,
  accountNumber: string,
  serviceLineNumber: string
): Promise<StarlinkApiServiceLine | null> {
  try {
    const data = await get<{ serviceLine?: StarlinkApiServiceLine }>(
      `/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}`,
      token
    );
    return data.serviceLine ?? null;
  } catch {
    return null;
  }
}

export async function deactivateServiceLine(
  token: string,
  accountNumber: string,
  serviceLineNumber: string
): Promise<void> {
  await del(`/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}`, token);
}

export async function updateServiceLineNickname(
  token: string,
  accountNumber: string,
  serviceLineNumber: string,
  nickname: string
): Promise<void> {
  await put(
    `/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}/nickname`,
    token,
    { nickname }
  );
}

export async function setServiceLinePublicIp(
  token: string,
  accountNumber: string,
  serviceLineNumber: string,
  enable: boolean
): Promise<void> {
  await put(
    `/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}/public-ip`,
    token,
    { enable }
  );
}

/**
 * Add a one-time top-up data block to a service line.
 * dataBlockType: e.g. 'GB_50', 'GB_100' — depends on plan
 */
export async function addTopUpData(
  token: string,
  accountNumber: string,
  serviceLineNumber: string,
  dataBlockType: string
): Promise<void> {
  await post(
    `/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}/top-up-data`,
    token,
    { dataBlockType }
  );
}

/**
 * Set recurring data blocks on a service line (top-up plan).
 */
export async function setRecurringDataBlocks(
  token: string,
  accountNumber: string,
  serviceLineNumber: string,
  recurringBlocks: number
): Promise<void> {
  await put(
    `/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}/recurring-data`,
    token,
    { recurringBlocks }
  );
}

/**
 * Opt a service line in to a program.
 */
export async function optInServiceLine(
  token: string,
  accountNumber: string,
  serviceLineNumber: string
): Promise<void> {
  await post(
    `/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}/opt-in`,
    token
  );
}

/**
 * Opt a service line out of a program.
 */
export async function optOutServiceLine(
  token: string,
  accountNumber: string,
  serviceLineNumber: string
): Promise<void> {
  await del(
    `/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}/opt-out`,
    token
  );
}

/**
 * Get all billing cycle usage for a service line.
 */
export async function getServiceLineBillingCycles(
  token: string,
  accountNumber: string,
  serviceLineNumber: string
): Promise<StarlinkApiUsageBillingCycle[]> {
  try {
    const data = await get<{ dataUsages?: StarlinkApiUsageBillingCycle[] }>(
      `/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}/billing-cycle/all`,
      token
    );
    return data.dataUsages ?? [];
  } catch {
    return [];
  }
}

/**
 * Get partial period usage for a service line.
 */
export async function getServiceLinePartialPeriods(
  token: string,
  accountNumber: string,
  serviceLineNumber: string
): Promise<StarlinkApiUsageDaily[]> {
  try {
    const data = await get<{ dataUsages?: StarlinkApiUsageDaily[] }>(
      `/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}/billing-cycle/partial-periods`,
      token
    );
    return data.dataUsages ?? [];
  } catch {
    return [];
  }
}

/**
 * Get available products for a service line.
 */
export async function getAvailableProducts(
  token: string,
  accountNumber: string
): Promise<StarlinkApiProduct[]> {
  try {
    const data = await get<{ products?: StarlinkApiProduct[] }>(
      `/public/v1/account/${accountNumber}/service-lines/available-products`,
      token
    );
    return data.products ?? [];
  } catch {
    return [];
  }
}

/**
 * Change the product/plan on a service line.
 */
export async function updateServiceLineProduct(
  token: string,
  accountNumber: string,
  serviceLineNumber: string,
  productReferenceId: string
): Promise<void> {
  await put(
    `/public/v1/account/${accountNumber}/service-lines/${serviceLineNumber}/product/${productReferenceId}`,
    token
  );
}

// ─── User Terminals ───────────────────────────────────────────────────────────

export async function listTerminals(
  token: string,
  accountNumber: string
): Promise<StarlinkApiTerminal[]> {
  const data = await get<{ userTerminals?: StarlinkApiTerminal[] }>(
    `/public/v1/account/${accountNumber}/user-terminals`,
    token
  );
  return data.userTerminals ?? [];
}

export async function rebootTerminal(
  token: string,
  accountNumber: string,
  deviceId: string
): Promise<void> {
  await post(`/public/v1/account/${accountNumber}/user-terminals/${deviceId}/reboot`, token);
}

export async function addTerminalToServiceLine(
  token: string,
  accountNumber: string,
  userTerminalId: string,
  serviceLineNumber: string
): Promise<void> {
  await post(
    `/public/v1/account/${accountNumber}/user-terminals/${userTerminalId}/${serviceLineNumber}`,
    token
  );
}

export async function removeTerminalFromServiceLine(
  token: string,
  accountNumber: string,
  userTerminalId: string,
  serviceLineNumber: string
): Promise<void> {
  await del(
    `/public/v1/account/${accountNumber}/user-terminals/${userTerminalId}/${serviceLineNumber}`,
    token
  );
}

export async function removeTerminalFromAccount(
  token: string,
  accountNumber: string,
  deviceId: string
): Promise<void> {
  await del(`/public/v1/account/${accountNumber}/user-terminals/${deviceId}`, token);
}

// ─── Routers ──────────────────────────────────────────────────────────────────

export async function getRouter(
  token: string,
  accountNumber: string,
  routerId: string
): Promise<StarlinkApiRouter | null> {
  try {
    const data = await get<{ router?: StarlinkApiRouter }>(
      `/public/v1/account/${accountNumber}/routers/${routerId}`,
      token
    );
    return data.router ?? null;
  } catch {
    return null;
  }
}

export async function rebootRouter(
  token: string,
  accountNumber: string,
  routerId: string
): Promise<void> {
  await post(`/public/v1/account/${accountNumber}/routers/${routerId}/reboot`, token);
}

export async function listRouterConfigs(
  token: string,
  accountNumber: string
): Promise<StarlinkApiRouterConfig[]> {
  try {
    const data = await get<{ configs?: StarlinkApiRouterConfig[] }>(
      `/public/v1/account/${accountNumber}/routers/configs`,
      token
    );
    return data.configs ?? [];
  } catch {
    return [];
  }
}

// ─── Credential helpers ───────────────────────────────────────────────────────

export function getCredentials(
  accountSlug?: string
): { clientId: string; clientSecret: string } | null {
  const suffix = accountSlug
    ? `_${accountSlug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`
    : "";
  const clientId =
    process.env[`STARLINK_CLIENT_ID${suffix}`] || process.env.STARLINK_CLIENT_ID;
  const clientSecret =
    process.env[`STARLINK_CLIENT_SECRET${suffix}`] || process.env.STARLINK_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getConfiguredAccountNumbers(): string[] {
  const raw = process.env.STARLINK_ACCOUNT_NUMBERS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isStarlinkConfigured(): boolean {
  return !!(process.env.STARLINK_CLIENT_ID && process.env.STARLINK_CLIENT_SECRET);
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

export function bytesToGb(bytes?: number): number {
  if (!bytes) return 0;
  return Math.round((bytes / 1_073_741_824) * 1000) / 1000;
}

export function formatAddress(
  addr?: StarlinkApiAccount["defaultServiceAddress"]
): string {
  if (!addr) return "";
  const parts = [
    ...(addr.addressLines ?? []),
    addr.locality,
    addr.administrativeArea,
    addr.postalCode,
    addr.countryCode,
  ].filter(Boolean);
  return parts.join(", ");
}

/** Convenience: get a token using the default (single) credentials */
export async function getDefaultToken(): Promise<string | null> {
  const creds = getCredentials();
  if (!creds) return null;
  return getStarlinkToken(creds.clientId, creds.clientSecret);
}

// Legacy compat for getServiceLineUsage (used by sync)
export async function getServiceLineUsage(
  token: string,
  accountNumber: string,
  serviceLineNumber: string,
  billingPeriod: string
): Promise<StarlinkApiUsageBillingCycle | null> {
  const cycles = await getServiceLineBillingCycles(token, accountNumber, serviceLineNumber);
  const [year, month] = billingPeriod.split("-");
  const prefix = `${year}-${month}`;
  return cycles.find((c) => c.startDate?.startsWith(prefix)) ?? null;
}
