/**
 * TIAB / Octane (Inabox) REST API v2 Client
 * Portal: https://benzine.telcoinabox.com/tiab/
 * Docs:   https://octane-api.apidog.io/doc-399363
 *
 * Auth: HTTP Basic Authentication (username:password, Base64 encoded)
 * Base URL: https://benzine.telcoinabox.com/tiab/api/v2
 *
 * NOTE: The test environment (benzine) is IP-whitelisted.
 * Sandbox IP 47.129.135.112 must be added via Assist Portal before API calls succeed.
 *
 * All paginated endpoints accept: page (0-indexed), pageSize (default 20, max 100)
 * All responses wrap data in: { data: { list: [], total: N } } or { data: {...} }
 */

import { ENV } from "../_core/env";

// ---------------------------------------------------------------------------
// Config & Auth
// ---------------------------------------------------------------------------

function getAuthHeader(): string {
  const { TIAB_API_USERNAME, TIAB_API_PASSWORD } = ENV;
  if (!TIAB_API_USERNAME || !TIAB_API_PASSWORD) {
    throw new Error("TIAB API credentials not configured. Set TIAB_API_USERNAME and TIAB_API_PASSWORD.");
  }
  return "Basic " + Buffer.from(`${TIAB_API_USERNAME}:${TIAB_API_PASSWORD}`).toString("base64");
}

function getBaseUrl(): string {
  return ENV.TIAB_API_BASE_URL.replace(/\/$/, "") + "/api/v2";
}

// ---------------------------------------------------------------------------
// HTTP helpers with retry/backoff
// ---------------------------------------------------------------------------

interface TiabResponse<T> {
  data: T;
  message?: string;
  status?: number;
}

interface PagedList<T> {
  list: T[];
  total: number;
}

async function tiabRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  retries = 3
): Promise<T> {
  const url = getBaseUrl() + path;
  const headers: Record<string, string> = {
    Authorization: getAuthHeader(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (res.status === 401) {
        throw new Error(
          "TIAB API: 401 Unauthorized. Check credentials or IP whitelist (sandbox IP: 47.129.135.112)."
        );
      }
      if (res.status === 403) {
        throw new Error(
          "TIAB API: 403 Forbidden. IP may not be whitelisted. Sandbox IP: 47.129.135.112."
        );
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`TIAB API ${res.status} ${res.statusText}: ${text.substring(0, 200)}`);
      }

      const json = (await res.json()) as TiabResponse<T>;
      return json.data;
    } catch (err) {
      lastError = err as Error;
      if (
        (err as Error).message.includes("401") ||
        (err as Error).message.includes("403")
      ) {
        throw err; // Don't retry auth errors
      }
    }
  }
  throw lastError ?? new Error("TIAB API request failed after retries");
}

// Fetch all pages of a paginated endpoint
async function tiabFetchAll<T>(
  path: string,
  params: Record<string, string | number> = {},
  pageSize = 100
): Promise<T[]> {
  const results: T[] = [];
  let page = 0;
  let total = Infinity;

  while (results.length < total) {
    const queryParams = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      page: String(page),
      pageSize: String(pageSize),
    });
    const data = await tiabRequest<PagedList<T>>("GET", `${path}?${queryParams}`);
    if (!data || !Array.isArray(data.list)) break;
    results.push(...data.list);
    total = data.total ?? results.length;
    page++;
    if (data.list.length < pageSize) break; // Last page
  }

  return results;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TiabCustomer {
  customerId: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  abn?: string;
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
  status?: string;
  createdDate?: string;
  updatedDate?: string;
  [key: string]: unknown;
}

export interface TiabService {
  serviceId: string;
  customerId: string;
  planId?: string;
  planName?: string;
  status?: string; // Active | Suspended | Ceased
  serviceType?: string;
  msisdn?: string;
  simSerial?: string;
  imei?: string;
  activationDate?: string;
  suspensionDate?: string;
  cessationDate?: string;
  dataPoolId?: string;
  [key: string]: unknown;
}

export interface TiabPlan {
  planId: string;
  planName: string;
  planType?: string;
  description?: string;
  baseCharge?: number;
  dataAllowanceGb?: number;
  voiceAllowanceMinutes?: number;
  smsAllowance?: number;
  contractTerm?: number;
  status?: string;
  [key: string]: unknown;
}

export interface TiabTransaction {
  transactionId: string;
  customerId: string;
  serviceId?: string;
  transactionType?: string; // bill | payment | adjustment | credit
  amount?: number;
  gst?: number;
  description?: string;
  transactionDate?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  status?: string;
  [key: string]: unknown;
}

export interface TiabDataPool {
  poolId: string;
  poolName?: string;
  customerId?: string;
  totalCapacityGb?: number;
  usedGb?: number;
  remainingGb?: number;
  memberCount?: number;
  members?: Array<{ serviceId: string; msisdn?: string }>;
  [key: string]: unknown;
}

export interface TiabNotificationSettings {
  serviceId: string;
  usagePercentThreshold?: number;
  dollarThreshold?: number;
  roamingAlertEnabled?: boolean;
  billShockEnabled?: boolean;
  [key: string]: unknown;
}

export interface TiabEsimDetails {
  serviceId: string;
  eid?: string;
  profileStatus?: string; // active | suspended | replaced | unprovisioned
  activationDate?: string;
  deviceId?: string;
  replacementHistory?: Array<{ oldEid: string; newEid: string; date: string }>;
  [key: string]: unknown;
}

export interface TiabOrder {
  orderId: string;
  customerId: string;
  serviceId?: string;
  orderType?: string; // activation | modification | suspension | cancellation | port-in
  status?: string; // pending | processing | completed | failed
  createdDate?: string;
  completedDate?: string;
  planId?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Customer API
// ---------------------------------------------------------------------------

export async function listCustomers(params?: {
  status?: string;
  search?: string;
}): Promise<TiabCustomer[]> {
  return tiabFetchAll<TiabCustomer>("/customer", params as Record<string, string>);
}

export async function getCustomer(customerId: string): Promise<TiabCustomer> {
  return tiabRequest<TiabCustomer>("GET", `/customer/${customerId}`);
}

// ---------------------------------------------------------------------------
// Service API
// ---------------------------------------------------------------------------

export async function listServices(params?: {
  customerId?: string;
  status?: string;
  serviceType?: string;
}): Promise<TiabService[]> {
  return tiabFetchAll<TiabService>("/service", params as Record<string, string>);
}

export async function getService(serviceId: string): Promise<TiabService> {
  return tiabRequest<TiabService>("GET", `/service/${serviceId}`);
}

export async function listServicesByCustomer(customerId: string): Promise<TiabService[]> {
  return tiabFetchAll<TiabService>("/service", { customerId });
}

// ---------------------------------------------------------------------------
// Plan API
// ---------------------------------------------------------------------------

export async function listPlans(params?: {
  planType?: string;
  status?: string;
}): Promise<TiabPlan[]> {
  return tiabFetchAll<TiabPlan>("/plan", params as Record<string, string>);
}

export async function getPlan(planId: string): Promise<TiabPlan> {
  return tiabRequest<TiabPlan>("GET", `/plan/${planId}`);
}

// ---------------------------------------------------------------------------
// Transaction API
// ---------------------------------------------------------------------------

export async function listTransactions(params?: {
  customerId?: string;
  serviceId?: string;
  fromDate?: string;
  toDate?: string;
  transactionType?: string;
}): Promise<TiabTransaction[]> {
  return tiabFetchAll<TiabTransaction>("/transaction", params as Record<string, string>);
}

export async function listTransactionsByCustomer(
  customerId: string,
  fromDate?: string,
  toDate?: string
): Promise<TiabTransaction[]> {
  const params: Record<string, string> = { customerId };
  if (fromDate) params.fromDate = fromDate;
  if (toDate) params.toDate = toDate;
  return tiabFetchAll<TiabTransaction>("/transaction", params);
}

// ---------------------------------------------------------------------------
// Mobile API — Notification Settings
// ---------------------------------------------------------------------------

export async function getNotificationSettings(
  customerId: string
): Promise<TiabNotificationSettings[]> {
  return tiabRequest<TiabNotificationSettings[]>(
    "GET",
    `/customer/${customerId}/notification-settings`
  );
}

export async function updateNotificationSettings(
  customerId: string,
  settings: Partial<TiabNotificationSettings>
): Promise<void> {
  await tiabRequest<unknown>("POST", `/customer/${customerId}/notification-settings`, settings);
}

// ---------------------------------------------------------------------------
// Mobile API — Data Pool
// ---------------------------------------------------------------------------

export async function getDataPool(serviceId: string): Promise<TiabDataPool> {
  return tiabRequest<TiabDataPool>("GET", `/service/${serviceId}/data-pool`);
}

export async function updateDataLimit(
  serviceId: string,
  limitGb: number
): Promise<void> {
  await tiabRequest<unknown>("POST", `/service/${serviceId}/data-limit`, { limitGb });
}

export async function transferServiceToPool(
  serviceId: string,
  targetPoolId: string
): Promise<void> {
  await tiabRequest<unknown>("POST", `/service/${serviceId}/transfer-pool`, { targetPoolId });
}

export async function disconnectDataPool(serviceId: string): Promise<void> {
  await tiabRequest<unknown>("POST", `/service/${serviceId}/disconnect-pool`, {});
}

// ---------------------------------------------------------------------------
// Mobile API — eSIM
// ---------------------------------------------------------------------------

export async function getEsimDetails(serviceId: string): Promise<TiabEsimDetails> {
  return tiabRequest<TiabEsimDetails>("POST", `/mobile/esim/details`, { serviceId });
}

export async function manageEsim(
  serviceId: string,
  action: "suspend" | "activate" | "reset" | "replace"
): Promise<void> {
  await tiabRequest<unknown>("POST", `/mobile/esim/manage`, { serviceId, action });
}

// ---------------------------------------------------------------------------
// Order API
// ---------------------------------------------------------------------------

export async function listOrders(params?: {
  customerId?: string;
  serviceId?: string;
  status?: string;
  orderType?: string;
}): Promise<TiabOrder[]> {
  return tiabFetchAll<TiabOrder>("/order", params as Record<string, string>);
}

// ---------------------------------------------------------------------------
// Connectivity test
// ---------------------------------------------------------------------------

export async function testConnectivity(): Promise<{
  ok: boolean;
  message: string;
  customerCount?: number;
}> {
  try {
    const data = await tiabRequest<PagedList<TiabCustomer>>(
      "GET",
      "/customer?page=0&pageSize=1"
    );
    return {
      ok: true,
      message: `Connected. Total customers: ${data.total ?? "unknown"}`,
      customerCount: data.total,
    };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message,
    };
  }
}
