/**
 * SasBoss / Access4 REST API — server-side integration
 *
 * Authentication (per official SASBOSS API Specification v22102025 + Joel TAC confirmation):
 *   Step 1: GET https://api.sasboss.com.au:10000/token/?apiUser=xxxx&apiPass=xxxxxx
 *           Returns { apiUser, token, roleType }
 *   Step 2: Include in all subsequent request headers:
 *           X-Token: <token>
 *           X-API-User: <apiUser>
 *
 * API Endpoints (ANZ region):
 *   Provisioning API: https://api.sasboss.com.au:10000/provisioning/
 *   Billing API:      https://api.sasboss.com.au:10001/billing/
 *
 * IP Whitelist (confirmed by Joel, Access4 TAC — 2026-03-31):
 *   103.250.128.21  — Development / Sandbox
 *   34.96.50.131    — Production
 *
 * Reseller ID: 2815 (confirmed by Joel, Access4 TAC)
 *
 * Rate limits: 60 calls/minute, 5000 calls/day
 *
 * ICS (iCall Suite) API:
 *   Authentication: Basic Auth
 *   Base URL: https://ics.webuc.com.au/
 *   Requires a Tollring account — contact PGM/Solutions Consultant to set up.
 */

import { ENV } from "../_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SasBossEnterprise {
  enterpriseId: string;
  enterpriseName: string;
  externalServiceRefId: string;
  externalBillingRefId: string;
  defaultDomain: string;
  callPackProductId: string;
  status: string;
}

export interface SasBossServiceAccount {
  serviceId: string;
  enterpriseId: string;
  enterpriseName: string;
  serviceRefId: string;
  productId: string;
  productName: string;
  productType: string;
  monthlyRecurring: number;
  status: string;
  createdAt: string;
}

export interface SasBossDIDNumber {
  didNumber: string;
  enterpriseId: string;
  enterpriseName: string;
  serviceRefId: string;
  groupId: string;
  groupName: string;
  status: string;
  numberType: string;
}

export interface SasBossProduct {
  productId: string;
  productType: string;
  productName: string;
  itemType: string;
  chargeFrequency: string;
  // PAYG pricing tier
  chargeRecurringFee: number;        // wholesale / partner buy price (PAYG)
  rrpRecurringFee: number;           // RRP / partner sell price (PAYG)
  nfrRecurringFee: number | null;    // Not For Resale price (PAYG)
  // Bundled pricing tier
  chargeBundledRecurringFee: number | null;
  rrpBundledRecurringFee: number | null;
  nfrBundledRecurringFee: number | null;
  // Unlimited pricing tier
  chargeUnlimitedRecurringFee: number | null;
  rrpUnlimitedRecurringFee: number | null;
  nfrUnlimitedRecurringFee: number | null;
  chargeGstRate: number;
  productStatus: string;
  isLegacy: string;
  integrationRefId: string | null;
  servicePackClassType: string | null;
  serviceSubClass: string | null;
  addOn: boolean;
}

export interface SasBossInvoiceItem {
  enterpriseId: string;
  enterpriseName: string;
  productId: string;
  serviceId: string;
  serviceRefId: string;
  didNumber: string;
  itemDescription: string;
  periodStart: string;
  periodEnd: string;
  quantity: number;
  unitPrice: number;
  totalExGst: number;
  totalIncGst: number;
  glAccount: string;
  itemCode: string;
}

export interface SasBossReseller {
  resellerId: string;
  resellerName: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// ANZ region ports: 10000 = Provisioning, 10001 = Billing
const PROV_BASE = () =>
  `https://${ENV.SASBOSS_API_HOST}:10000/provisioning`;

const BILL_BASE = () =>
  `https://${ENV.SASBOSS_API_HOST}:10001/billing`;

const TOKEN_BASE = () =>
  `https://${ENV.SASBOSS_API_HOST}:10000/token`;

// ─── Token cache ──────────────────────────────────────────────────────────────
let _cachedToken: string | null = null;
let _tokenFetchedAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes

function basicAuth(): string {
  const user = ENV.SASBOSS_API_USERNAME_KEY || ENV.SASBOSS_API_USERNAME;
  const pass = ENV.SASBOSS_API_PASSWORD_KEY || ENV.SASBOSS_API_PASSWORD;
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

/**
 * Fetch a SasBoss API token using the portal login credentials.
 * Tokens are cached for 50 minutes to avoid redundant requests.
 * Returns { apiUser, token, roleType }.
 */
export async function fetchSasBossToken(): Promise<{ apiUser: string; token: string; roleType: string }> {
  const user = ENV.SASBOSS_API_USERNAME_KEY || ENV.SASBOSS_API_USERNAME;
  const pass = ENV.SASBOSS_API_PASSWORD_KEY || ENV.SASBOSS_API_PASSWORD;
  if (!user || !pass) throw new Error("SasBoss credentials not configured");

  const url = `${TOKEN_BASE()}/?apiUser=${encodeURIComponent(user)}&apiPass=${encodeURIComponent(pass)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "SmileTelBillingRecon/1.0" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SasBoss token fetch failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { apiUser: string; token: string; roleType: string };
  if (!data.token) throw new Error("SasBoss token response missing 'token' field");
  _cachedToken = data.token;
  _tokenFetchedAt = Date.now();
  return data;
}

/**
 * Returns a cached token, refreshing if expired.
 */
async function getToken(): Promise<string> {
  if (_cachedToken && Date.now() - _tokenFetchedAt < TOKEN_TTL_MS) {
    return _cachedToken;
  }
  const { token } = await fetchSasBossToken();
  return token;
}

async function apiGet<T>(url: string): Promise<T> {
  // Official auth: X-Token + X-API-User headers (per SASBOSS API Specification)
  const user = ENV.SASBOSS_API_USERNAME_KEY || ENV.SASBOSS_API_USERNAME;
  const token = await getToken();

  const res = await fetch(url, {
    headers: {
      "X-Token": token,
      "X-API-User": user,
      Accept: "application/json",
      "User-Agent": "SmileTelBillingRecon/1.0",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SasBoss API ${res.status} at ${url}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Provisioning API ─────────────────────────────────────────────────────────

/**
 * GET /provisioning/reseller/{resellerId}/enterprise
 * Returns all enterprises (customers) under the reseller.
 */
export async function fetchEnterprises(): Promise<SasBossEnterprise[]> {
  const resellerId = ENV.SASBOSS_RESELLER_ID;
  if (!resellerId) throw new Error("SASBOSS_RESELLER_ID not configured");
  const data = await apiGet<any[]>(`${PROV_BASE()}/reseller/${resellerId}/enterprise`);
  return data.map((e: any) => ({
    enterpriseId: String(e.enterpriseId ?? e.enterprise_id ?? ""),
    enterpriseName: e.enterpriseName ?? e.enterprise_name ?? "",
    externalServiceRefId: e.externalServiceRefId ?? e.external_service_ref_id ?? "",
    externalBillingRefId: e.externalBillingRefId ?? e.external_billing_ref_id ?? "",
    defaultDomain: e.defaultDomain ?? e.default_domain ?? "",
    callPackProductId: String(e.callPackProductId ?? e.call_pack_product_id ?? ""),
    status: e.status ?? "active",
  }));
}

/**
 * GET /provisioning/reseller/{resellerId}/serviceaccount
 * Returns all service accounts across all enterprises.
 */
export async function fetchServiceAccounts(): Promise<SasBossServiceAccount[]> {
  const resellerId = ENV.SASBOSS_RESELLER_ID;
  if (!resellerId) throw new Error("SASBOSS_RESELLER_ID not configured");
  const data = await apiGet<any[]>(`${PROV_BASE()}/reseller/${resellerId}/serviceaccount`);
  return data.map((s: any) => ({
    serviceId: String(s.serviceId ?? s.service_id ?? ""),
    enterpriseId: String(s.enterpriseId ?? s.enterprise_id ?? ""),
    enterpriseName: s.enterpriseName ?? s.enterprise_name ?? "",
    serviceRefId: s.serviceRefId ?? s.service_ref_id ?? "",
    productId: String(s.productId ?? s.product_id ?? ""),
    productName: s.productName ?? s.product_name ?? "",
    productType: s.productType ?? s.product_type ?? "",
    monthlyRecurring: parseFloat(s.chargeRecurringFee ?? s.charge_recurring_fee ?? "0") || 0,
    status: s.status ?? "active",
    createdAt: s.createdAt ?? s.created_at ?? "",
  }));
}

/**
 * GET /provisioning/reseller/{resellerId}/didnumber
 * Returns all DID numbers under the reseller.
 */
export async function fetchDIDNumbers(): Promise<SasBossDIDNumber[]> {
  const resellerId = ENV.SASBOSS_RESELLER_ID;
  if (!resellerId) throw new Error("SASBOSS_RESELLER_ID not configured");
  const data = await apiGet<any[]>(`${PROV_BASE()}/reseller/${resellerId}/didnumber`);
  return data.map((d: any) => ({
    didNumber: String(d.didNumber ?? d.did_number ?? ""),
    enterpriseId: String(d.enterpriseId ?? d.enterprise_id ?? ""),
    enterpriseName: d.enterpriseName ?? d.enterprise_name ?? "",
    serviceRefId: d.serviceRefId ?? d.service_ref_id ?? "",
    groupId: String(d.groupId ?? d.group_id ?? ""),
    groupName: d.groupName ?? d.group_name ?? "",
    status: d.status ?? "active",
    numberType: d.numberType ?? d.number_type ?? "geographic",
  }));
}

// ─── Billing API ──────────────────────────────────────────────────────────────

/**
 * GET /billing/reseller/{resellerId}/product?productType=service-pack&productStatus=active
 * Returns all active products with pricing (wholesale + RRP).
 */
export async function fetchProducts(
  productType: "service-pack" | "call-pack" | "did-number" | "device" = "service-pack",
  productStatus: "active" | "inactive" = "active"
): Promise<SasBossProduct[]> {
  const resellerId = ENV.SASBOSS_RESELLER_ID;
  if (!resellerId) throw new Error("SASBOSS_RESELLER_ID not configured");
  const url = `${BILL_BASE()}/reseller/${resellerId}/product?productType=${productType}&productStatus=${productStatus}`;
  const data = await apiGet<any[]>(url);
  const parseNum = (v: any): number | null =>
    v != null && v !== "" ? parseFloat(String(v)) : null;
  return data.map((p: any) => ({
    productId: String(p.productId ?? p.product_id ?? ""),
    productType: p.productType ?? p.product_type ?? productType,
    productName: p.productName ?? p.product_name ?? "",
    itemType: p.itemType ?? p.item_type ?? "",
    chargeFrequency: p.chargeFrequency ?? p.charge_frequency ?? "monthly",
    // PAYG tier
    chargeRecurringFee: parseFloat(p.chargeRecurringFee ?? p.charge_recurring_fee ?? "0") || 0,
    rrpRecurringFee: parseFloat(p.rrpRecurringFee ?? p.rrp_recurring_fee ?? "0") || 0,
    nfrRecurringFee: parseNum(p.nfrRecurringFee ?? p.nfr_recurring_fee),
    // Bundled tier
    chargeBundledRecurringFee: parseNum(p.chargeBundledRecurringFee ?? p.charge_bundled_recurring_fee),
    rrpBundledRecurringFee: parseNum(p.rrpBundledRecurringFee ?? p.rrp_bundled_recurring_fee),
    nfrBundledRecurringFee: parseNum(p.nfrBundledRecurringFee ?? p.nfr_bundled_recurring_fee),
    // Unlimited tier
    chargeUnlimitedRecurringFee: parseNum(p.chargeUnlimitedRecurringFee ?? p.charge_unlimited_recurring_fee),
    rrpUnlimitedRecurringFee: parseNum(p.rrpUnlimitedRecurringFee ?? p.rrp_unlimited_recurring_fee),
    nfrUnlimitedRecurringFee: parseNum(p.nfrUnlimitedRecurringFee ?? p.nfr_unlimited_recurring_fee),
    chargeGstRate: parseFloat(p.chargeGstRate ?? p.charge_gst_rate ?? "0.1") || 0.1,
    productStatus: p.productStatus ?? p.product_status ?? productStatus,
    isLegacy: p.isLegacy ?? p.is_legacy ?? "no",
    integrationRefId: p.integrationRefId ?? p.integration_ref_id ?? null,
    servicePackClassType: p.servicePackClassType ?? p.service_pack_class_type ?? null,
    serviceSubClass: p.serviceSubClass ?? p.service_sub_class ?? null,
    addOn: p.addOn === "1" || p.addOn === 1 || p.add_on === "1",
  }));
}

/**
 * GET /billing/reseller/{resellerId}/invoice
 * Returns all invoices and payments for the reseller.
 */
export async function fetchResellerInvoices(): Promise<any[]> {
  const resellerId = ENV.SASBOSS_RESELLER_ID;
  if (!resellerId) throw new Error("SASBOSS_RESELLER_ID not configured");
  const data = await apiGet<{ invoices: any[] }>(`${BILL_BASE()}/reseller/${resellerId}/invoice`);
  return data.invoices ?? [];
}

/**
 * GET /billing/reseller/{resellerId}/invoice/{invoiceId}/item
 * Returns all line items for a specific invoice.
 */
export async function fetchInvoiceItems(invoiceId: string): Promise<SasBossInvoiceItem[]> {
  const resellerId = ENV.SASBOSS_RESELLER_ID;
  if (!resellerId) throw new Error("SASBOSS_RESELLER_ID not configured");
  const data = await apiGet<any[]>(
    `${BILL_BASE()}/reseller/${resellerId}/invoice/${invoiceId}/item`
  );
  return data.map((item: any) => ({
    enterpriseId: String(item.enterpriseId ?? item["Enterprise Id"] ?? ""),
    enterpriseName: item.enterpriseName ?? item["Enterprise Name"] ?? "",
    productId: String(item.productId ?? item["Product Id"] ?? ""),
    serviceId: String(item.serviceId ?? item["Service Id"] ?? ""),
    serviceRefId: item.serviceRefId ?? item["Service Ref Id"] ?? "",
    didNumber: String(item.didNumber ?? item["DID Number"] ?? ""),
    itemDescription: item.itemDescription ?? item["Item Description"] ?? "",
    periodStart: item.periodStart ?? item["Period Start"] ?? "",
    periodEnd: item.periodEnd ?? item["Period End"] ?? "",
    quantity: parseFloat(item.quantity ?? item["Quantity"] ?? "1") || 1,
    unitPrice: parseFloat(item.unitPrice ?? item["Unit Price"] ?? "0") || 0,
    totalExGst: parseFloat(item.totalExGst ?? item["Total (EX-GST)"] ?? "0") || 0,
    totalIncGst: parseFloat(item.totalIncGst ?? item["Total (INC-GST)"] ?? "0") || 0,
    glAccount: item.glAccount ?? item["GL Account"] ?? "",
    itemCode: item.itemCode ?? item["Item Code"] ?? "",
  }));
}

// ─── Full sync orchestrator ───────────────────────────────────────────────────

export interface SasBossSyncResult {
  enterprises: SasBossEnterprise[];
  serviceAccounts: SasBossServiceAccount[];
  didNumbers: SasBossDIDNumber[];
  products: SasBossProduct[];
  invoices: any[];
  errors: string[];
}

/**
 * Runs all SasBoss API fetches in parallel and returns a combined result.
 * Individual failures are captured in `errors` rather than throwing.
 */
export async function syncAllSasBossData(): Promise<SasBossSyncResult> {
  const errors: string[] = [];

  const [enterprises, serviceAccounts, didNumbers, products, invoices] = await Promise.all([
    fetchEnterprises().catch((e) => { errors.push(`enterprises: ${e.message}`); return [] as SasBossEnterprise[]; }),
    fetchServiceAccounts().catch((e) => { errors.push(`serviceAccounts: ${e.message}`); return [] as SasBossServiceAccount[]; }),
    fetchDIDNumbers().catch((e) => { errors.push(`didNumbers: ${e.message}`); return [] as SasBossDIDNumber[]; }),
    fetchProducts("service-pack", "active").catch((e) => { errors.push(`products: ${e.message}`); return [] as SasBossProduct[]; }),
    fetchResellerInvoices().catch((e) => { errors.push(`invoices: ${e.message}`); return [] as any[]; }),
  ]);

  return { enterprises, serviceAccounts, didNumbers, products, invoices, errors };
}
