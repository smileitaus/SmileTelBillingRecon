# Omada & Carbon API — Replit Integration Guide

**Purpose:** This document is the definitive reference for configuring, troubleshooting, and verifying the TP-Link Omada Cloud-Based Controller (CBC) API and the ABB Carbon API in the Replit environment. Both integrations are fully implemented in the Manus codebase; failures in Replit are almost always caused by missing or incorrectly named environment variables.

---

## Table of Contents

1. [Omada API](#1-omada-api)
   - 1.1 [What It Does](#11-what-it-does)
   - 1.2 [Required Secrets](#12-required-secrets)
   - 1.3 [Authentication Flow](#13-authentication-flow)
   - 1.4 [Common Failure Modes](#14-common-failure-modes)
   - 1.5 [Verification Steps](#15-verification-steps)
   - 1.6 [UI Features & Where to Find Them](#16-ui-features--where-to-find-them)
2. [Carbon API (ABB)](#2-carbon-api-abb)
   - 2.1 [What It Does](#21-what-it-does)
   - 2.2 [Required Secrets](#22-required-secrets)
   - 2.3 [Authentication Flow](#23-authentication-flow)
   - 2.4 [Password Assembly — Critical Detail](#24-password-assembly--critical-detail)
   - 2.5 [Common Failure Modes](#25-common-failure-modes)
   - 2.6 [Verification Steps](#26-verification-steps)
   - 2.7 [UI Features & Where to Find Them](#27-ui-features--where-to-find-them)
3. [Running the Vitest Credential Checks](#3-running-the-vitest-credential-checks)
4. [Database Tables Used](#4-database-tables-used)
5. [Quick Diagnostics Checklist](#5-quick-diagnostics-checklist)

---

## 1. Omada API

### 1.1 What It Does

The Omada integration connects to the **TP-Link Omada Cloud-Based Controller (CBC) APAC northbound API** at `https://aps1-omada-northbound.tplinkcloud.com`. It provides:

- A full list of all Omada network sites managed under the SmileTel organisation
- Per-site WAN status (IP, connection state, uptime)
- Device inventory per site (APs, switches, gateways)
- Active client list per site, including per-client traffic (used for the "Top Clients by Traffic" panel)
- Client block/unblock actions
- Auto-matching of Omada sites to SmileTel customers by name similarity (Jaro-Winkler + token overlap)
- Manual site-to-customer linking via the Supplier Integrations page and the Omada Fleet page

The integration is implemented in `server/suppliers/omada.ts` and exposed via `trpc.billing.omada.*` procedures.

### 1.2 Required Secrets

The Omada API requires **three** secrets. In Replit, these must be set in the **Secrets** panel (not `.env` files). The secret names differ between Manus and Replit due to the Manus platform using legacy variable names.

| Replit Secret Name | Manus Secret Name | Description |
|---|---|---|
| `OMADA_CLIENT_ID` | `SmileTelCLIENTID` | OAuth2 Client ID from the Omada Developer Portal |
| `OMADA_CLIENT_SECRET` | `CLIENTSECRET` | OAuth2 Client Secret from the Omada Developer Portal |
| `OMADA_CONTROLLER_ID` | `OMADA_CONTROLLER_ID` | The `omadacId` — the unique ID of the SmileTel Omada organisation/controller |

> **Critical note for Replit:** The `env.ts` file reads `SmileTelCLIENTID` first and falls back to `OMADA_CLIENT_ID`. In Replit, set the secrets as `OMADA_CLIENT_ID` and `OMADA_CLIENT_SECRET` (the fallback names). Do **not** use `SmileTelCLIENTID` or `CLIENTSECRET` in Replit — those are Manus-specific names that will not be present.

The relevant section of `server/_core/env.ts`:

```ts
OMADA_CLIENT_ID: process.env.SmileTelCLIENTID ?? process.env.OMADA_CLIENT_ID ?? "",
OMADA_CLIENT_SECRET: process.env.CLIENTSECRET ?? process.env.OMADA_CLIENT_SECRET ?? "",
OMADA_CONTROLLER_ID: process.env.OMADA_CONTROLLER_ID ?? "",
```

### 1.3 Authentication Flow

The Omada CBC API uses **OAuth2 Client Credentials** with a non-standard `Authorization` header format. Understanding this is essential for debugging.

**Step 1 — Obtain access token:**

```
POST https://aps1-omada-northbound.tplinkcloud.com/openapi/authorize/token?grant_type=client_credentials
Content-Type: application/json

{
  "omadacId": "<OMADA_CONTROLLER_ID>",
  "client_id": "<OMADA_CLIENT_ID>",
  "client_secret": "<OMADA_CLIENT_SECRET>"
}
```

A successful response returns `errorCode: 0` with `result.accessToken` (valid for 7,200 seconds / 2 hours) and `result.refreshToken` (valid for 30 days).

**Step 2 — All subsequent requests:**

```
GET https://aps1-omada-northbound.tplinkcloud.com/openapi/v1/<omadacId>/sites?pageSize=10&page=1
Authorization: AccessToken=<accessToken>
```

> **The `Authorization` header format is `AccessToken=<token>` — NOT `Bearer <token>`.** This is the single most common cause of 401 errors when developers test the API manually with tools like Postman or curl.

**Token refresh:** When the access token expires (or the API returns error code `-44112` or `-44111`), the server automatically clears the in-memory token cache and fetches a fresh token. The token is cached in a module-level singleton (`tokenCache`) for the lifetime of the server process — it does **not** persist to the database.

### 1.4 Common Failure Modes

| Symptom | Root Cause | Fix |
|---|---|---|
| `Omada API credentials not configured` error in server logs | One or more of the three env vars is missing or empty | Add all three secrets to Replit Secrets panel |
| `Omada token fetch failed 401` | `OMADA_CLIENT_ID` or `OMADA_CLIENT_SECRET` is wrong | Verify values in Omada Developer Portal |
| `Omada token error -44100` | `OMADA_CONTROLLER_ID` is wrong or the client app is not authorised for this controller | Verify `omadacId` in the Omada portal under Organisation Settings |
| `Omada API GET /sites failed 403` | Client app does not have the required API scopes | In the Omada Developer Portal, ensure the app has `Sites:Read`, `Devices:Read`, `Clients:Read` scopes |
| Sync returns 0 sites | Credentials are valid but the controller has no sites, or the `omadacId` points to the wrong organisation | Confirm the controller ID matches the SmileTel production organisation |
| `Authorization: Bearer ...` in manual test fails | Using wrong header format | Use `Authorization: AccessToken=<token>` (no "Bearer") |
| Token works in Manus but not Replit | Replit is using `SmileTelCLIENTID`/`CLIENTSECRET` names that don't exist | Set `OMADA_CLIENT_ID` and `OMADA_CLIENT_SECRET` in Replit Secrets |

### 1.5 Verification Steps

**Step 1 — Confirm env vars are present.** In the Replit shell:

```bash
node -e "console.log('CLIENT_ID:', !!process.env.OMADA_CLIENT_ID, '| SECRET:', !!process.env.OMADA_CLIENT_SECRET, '| CONTROLLER:', !!process.env.OMADA_CONTROLLER_ID)"
```

All three should print `true`. If any prints `false`, add the missing secret.

**Step 2 — Test token fetch directly:**

```bash
curl -s -X POST \
  "https://aps1-omada-northbound.tplinkcloud.com/openapi/authorize/token?grant_type=client_credentials" \
  -H "Content-Type: application/json" \
  -d "{\"omadacId\":\"$OMADA_CONTROLLER_ID\",\"client_id\":\"$OMADA_CLIENT_ID\",\"client_secret\":\"$OMADA_CLIENT_SECRET\"}" \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('errorCode:', j.errorCode, '| token present:', !!j.result?.accessToken)"
```

Expected output: `errorCode: 0 | token present: true`

**Step 3 — Run the vitest credential test:**

```bash
cd /home/ubuntu/SmileTelBillingRecon  # or Replit project root
pnpm test server/omada.credentials.test.ts
```

All three tests must pass. The third test (`should list sites using AccessToken= header format`) confirms end-to-end connectivity including the correct header format.

**Step 4 — Trigger a sync from the UI.** Navigate to **Supplier Integrations** → scroll to the **TP-Link Omada** section → click **Sync Sites**. The response toast should show the number of sites synced. If it shows an error, check the server logs for the specific API error message.

### 1.6 UI Features & Where to Find Them

| Feature | Location | tRPC Procedure |
|---|---|---|
| Sync all sites from Omada API | Supplier Integrations page → Omada section | `trpc.billing.omada.syncSites` |
| View all sites with WAN/device/client counts | Omada Fleet page (`/omada-fleet`) | `trpc.billing.omada.listSites` |
| Link a site to a customer | Omada Fleet page → site row → Link button | `trpc.billing.omada.linkSiteToCustomer` |
| Unlink a site | Omada Fleet page → site row → Unlink | `trpc.billing.omada.unlinkSite` |
| Network status panel on customer page | Customer Detail page → Omada Network card (only shown when a site is linked) | `trpc.billing.omada.getSiteByCustomer` |
| Top clients by traffic | Customer Detail → Omada Network card → expand | `trpc.billing.omada.getTopClients` |
| Block/unblock a client MAC | Customer Detail → Omada Network card → client row | `trpc.billing.omada.blockClient` / `unblockClient` |
| List all sites with customer links | Supplier Integrations → Omada panel | `trpc.billing.omada.listAllSites` |

The **Omada Network card** on the Customer Detail page is only rendered when `omada_sites.customerExternalId` matches the customer. If a customer has an Omada site but the card is not showing, run a sync first and then manually link the site to the customer via the Supplier Integrations page.

---

## 2. Carbon API (ABB)

### 2.1 What It Does

The Carbon API integration connects to **Aussie Broadband's Carbon wholesale portal API** at `https://api.carbon.aussiebroadband.com.au`. It provides:

- A full paginated list of all ABB/Carbon services (broadband, NBN, FTTC, etc.) with monthly costs
- Service cost sync — updates `services.monthlyCost` and `services.carbonServiceId` for all matched ABB services
- Remote diagnostic tests per service: Line State, Loopback, NCD Reset (FTTC), Port Reset, Stability Profile change
- Per-service outage data: network events, Aussie outages, NBN outages (current, scheduled, resolved)
- Data usage snapshots per service (download/upload MB, remaining, days in period)
- Usage threshold alerts at 80%, 90%, and 100% of plan allowance — with owner email notifications

The integration is split across three server files:
- `server/suppliers/carbon-diagnostics.ts` — diagnostic tests and outage data
- `server/suppliers/carbon-outage-usage.ts` — outage sync and usage sync
- `server/suppliers/carbon-usage-alerts.ts` — threshold alert engine
- `server/db.ts` — `getCarbonServicesCached()` — paginated service list with DB cache

### 2.2 Required Secrets

The Carbon API requires **three** secrets. All three must be set in the Replit Secrets panel.

| Secret Name | Description |
|---|---|
| `CARBON_USERNAME` | ABB Carbon portal login username (email address) |
| `CARBON_PASSWORD_PREFIX` | First part of the password (everything before `$X`) |
| `CARBON_PASSWORD_SUFFIX` | Last part of the password (everything after `$X`) |

### 2.3 Authentication Flow

The Carbon API uses **session cookie authentication** — there is no API key or OAuth token. Every server process must log in first and then pass the returned session cookie with every subsequent request.

**Login:**

```
POST https://api.carbon.aussiebroadband.com.au/login
Content-Type: application/json
Accept: application/json

{ "username": "<CARBON_USERNAME>", "password": "<assembled_password>" }
```

A successful login returns HTTP 200 with a `set-cookie` header. The server extracts all cookie name=value pairs and concatenates them into a single `cookie` header string for subsequent requests.

**Subsequent requests:**

```
GET https://api.carbon.aussiebroadband.com.au/carbon/services?page=1&per_page=100
Accept: application/json
cookie: <session_cookie_string>
```

The session cookie is cached in memory for **20 minutes** (`COOKIE_TTL_MS = 20 * 60 * 1000`). After expiry, the server automatically re-authenticates on the next request.

### 2.4 Password Assembly — Critical Detail

> **This is the most common cause of Carbon API failures in Replit.**

The Carbon password contains a `$` character. Most secret management systems (including Replit) strip or escape `$` signs from environment variable values. To work around this, the password is split into two parts stored in separate secrets, and the server reassembles them at runtime.

The assembly formula is:

```
CARBON_PASSWORD = CARBON_PASSWORD_PREFIX + "$X" + CARBON_PASSWORD_SUFFIX
```

The literal string `$X` is hardcoded in the server — it is **not** stored in any secret. Only the prefix and suffix are stored.

The assembled password is 18 characters long and contains exactly one `$` sign. The vitest test in `server/carbon-api.test.ts` validates this:

```ts
it("assembles the 18-character password from split secrets", () => {
  const password = getCarbonPassword();
  expect(password.length).toBe(18);
  expect(password).toContain("$");
});
```

**To set the secrets correctly in Replit:**

1. Take the full Carbon password (obtain from the Manus Secrets panel or from Angus).
2. Find the `$X` substring within it.
3. Everything before `$X` → set as `CARBON_PASSWORD_PREFIX`.
4. Everything after `$X` → set as `CARBON_PASSWORD_SUFFIX`.
5. Do **not** include `$X` itself in either secret.

**Example (illustrative only — not the real password):**

If the full password were `abc$Xdef123`, then:
- `CARBON_PASSWORD_PREFIX` = `abc`
- `CARBON_PASSWORD_SUFFIX` = `def123`
- The server assembles: `abc` + `$X` + `def123` = `abc$Xdef123` ✓

### 2.5 Common Failure Modes

| Symptom | Root Cause | Fix |
|---|---|---|
| `CARBON_PASSWORD_PREFIX or CARBON_PASSWORD_SUFFIX not set` | Either secret is missing from Replit Secrets | Add both secrets |
| `Carbon API login failed (401)` | Wrong username or password | Verify `CARBON_USERNAME` and re-check the prefix/suffix split |
| `Carbon API login failed (429)` | ABB rate-limiting — too many login attempts in a short period | Wait 5–10 minutes before retrying; the 20-minute session cache prevents this under normal operation |
| `No session cookie returned` | ABB login endpoint returned 200 but with no `set-cookie` header | This is an ABB-side issue; retry after a few minutes |
| Carbon sync returns 0 services | Login succeeded but the account has no services, or the account is not a wholesale reseller account | Confirm the `CARBON_USERNAME` is the SmileTel wholesale ABB account |
| Diagnostic tests show "System unavailable" | `GET /tests/availability` returned non-204 | ABB maintenance window; retry later |
| Diagnostic test returns 400 | The requested test type is not available for this service | The UI pre-checks `GET /tests/{service}/available` — only tests in that list are shown. If a test appears greyed out, it is not supported for that service type |
| `getCarbonServicesCached` returns stale data | Cache TTL has not expired (default: 4 hours) | Call with `forceRefresh: true` via the Supplier Integrations → ABB Carbon → Sync button |

### 2.6 Verification Steps

**Step 1 — Confirm env vars are present:**

```bash
node -e "console.log('USERNAME:', !!process.env.CARBON_USERNAME, '| PREFIX:', !!process.env.CARBON_PASSWORD_PREFIX, '| SUFFIX:', !!process.env.CARBON_PASSWORD_SUFFIX)"
```

All three should print `true`.

**Step 2 — Verify password assembly:**

```bash
node -e "
const prefix = process.env.CARBON_PASSWORD_PREFIX;
const suffix = process.env.CARBON_PASSWORD_SUFFIX;
const pwd = prefix + '\$X' + suffix;
console.log('Password length:', pwd.length, '(expected: 18)');
console.log('Contains \$:', pwd.includes('\$'));
"
```

Expected: `Password length: 18 (expected: 18)` and `Contains $: true`.

**Step 3 — Test login directly:**

```bash
node -e "
const u = process.env.CARBON_USERNAME;
const p = process.env.CARBON_PASSWORD_PREFIX + '\$X' + process.env.CARBON_PASSWORD_SUFFIX;
fetch('https://api.carbon.aussiebroadband.com.au/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username: u, password: p })
}).then(r => {
  console.log('HTTP status:', r.status);
  console.log('Cookie present:', !!r.headers.get('set-cookie'));
}).catch(e => console.error('Error:', e.message));
"
```

Expected: `HTTP status: 200` and `Cookie present: true`.

**Step 4 — Run the vitest integration test:**

```bash
pnpm test server/carbon-api.test.ts
```

All four tests must pass. Note that the test suite performs a single login in `beforeAll` and reuses the session cookie across all tests to avoid triggering ABB rate-limiting (HTTP 429).

**Step 5 — Trigger a sync from the UI.** Navigate to **Supplier Integrations** → scroll to the **ABB Carbon API** section → click **Sync Costs**. The response toast should show the number of services synced and the number of cost updates applied.

### 2.7 UI Features & Where to Find Them

| Feature | Location | tRPC Procedure |
|---|---|---|
| Sync all Carbon service costs to DB | Supplier Integrations → ABB Carbon section | `trpc.billing.syncCarbonCosts` |
| View cache status (age, service count) | Supplier Integrations → ABB Carbon section | `trpc.billing.carbonCacheStatus` |
| Remote diagnostics panel | Service Detail page → any ABB service with a `carbonServiceId` | `trpc.billing.runDiagnosticTest` |
| Check system availability | Service Detail → Diagnostics panel (auto-checked on open) | `trpc.billing.checkTestSystemAvailability` |
| List available tests for a service | Service Detail → Diagnostics panel (auto-loaded) | `trpc.billing.getAvailableTests` |
| View diagnostic run history | Service Detail → Diagnostics panel → History tab | `trpc.billing.getDiagnosticHistory` |
| Outage monitor dashboard | Outage Monitor page (`/outage-monitor`) | `trpc.billing.getActiveOutages` |
| Sync outages from Carbon API | Outage Monitor page → Sync button | `trpc.billing.syncCarbonOutages` |
| Sync usage data | Outage Monitor page → Sync Usage button | `trpc.billing.syncCarbonUsage` |
| Usage threshold alerts | Usage Alerts page (`/usage-alerts`) | `trpc.billing.getUsageThresholdAlerts` |
| Run threshold check manually | Usage Alerts page → Check Now button | `trpc.billing.checkUsageThresholds` |
| Re-verify service against Carbon API | Service Detail → Re-verify button | `trpc.billing.reverifyWithCarbonApi` |

The **Carbon Diagnostics Panel** (`CarbonDiagnosticsPanel.tsx`) is only rendered on the Service Detail page when `services.carbonServiceId` is non-null and non-empty. If the panel is not showing for an ABB service, run a Carbon cost sync first — the sync populates `carbonServiceId` from the Carbon API's service ID.

---

## 3. Running the Vitest Credential Checks

Both integrations have dedicated vitest test files that serve as live credential validators. Run these in the Replit shell to confirm connectivity end-to-end without touching the UI.

```bash
# Omada — 3 tests: env vars present, token fetch, site list
pnpm test server/omada.credentials.test.ts

# Carbon — 4 tests: password assembly, login, page 1 services, full cache fetch
pnpm test server/carbon-api.test.ts
```

> **Important:** The Carbon test suite makes real API calls to ABB and will trigger a login. Run it at most once per 5 minutes to avoid rate-limiting. The test reuses a single session cookie across all four tests to minimise login calls.

If either test suite fails, the error message will identify the exact failure point (env var missing, HTTP status code, API error code) and point directly to the fix.

---

## 4. Database Tables Used

Both integrations write to the database. If the tables are missing in the Replit TiDB cluster, the integrations will fail with SQL errors rather than API errors.

| Table | Integration | Purpose |
|---|---|---|
| `omada_sites` | Omada | One row per Omada site; stores siteId, name, WAN IP, status, device/client counts, customer link |
| `omada_device_cache` | Omada | Cached device records per site, linked to `services.externalId` |
| `carbon_api_cache` | Carbon | Single-row cache of the full Carbon service list JSON; TTL-based |
| `carbon_diagnostic_runs` | Carbon | Audit log of every diagnostic test run (type, status, result, duration) |
| `service_usage_snapshots` | Carbon | Monthly usage snapshots per service (download/upload MB, remaining) |
| `usage_threshold_alerts` | Carbon | Active and resolved usage threshold breach records |

Verify these tables exist in TiDB:

```sql
SHOW TABLES LIKE 'omada%';
SHOW TABLES LIKE 'carbon%';
SHOW TABLES LIKE 'service_usage%';
SHOW TABLES LIKE 'usage_threshold%';
```

If any are missing, apply the latest schema from the production DB snapshot:

```bash
# In Replit shell — apply the latest production snapshot
mysql -h gateway01.ap-southeast-1.prod.aws.tidbcloud.com -P 4000 \
  -u AZiGyyVLNGDziTi.root -p smiletelrecon \
  --ssl-mode=REQUIRED < db-snapshots/production_latest.sql
```

---

## 5. Quick Diagnostics Checklist

Use this checklist when either integration is not working in Replit.

### Omada

- [ ] `OMADA_CLIENT_ID` is set in Replit Secrets (not `SmileTelCLIENTID`)
- [ ] `OMADA_CLIENT_SECRET` is set in Replit Secrets (not `CLIENTSECRET`)
- [ ] `OMADA_CONTROLLER_ID` is set in Replit Secrets
- [ ] Token fetch curl test returns `errorCode: 0`
- [ ] `pnpm test server/omada.credentials.test.ts` — all 3 tests pass
- [ ] Supplier Integrations → Omada → Sync Sites returns a site count > 0
- [ ] `omada_sites` table exists and has rows after sync

### Carbon

- [ ] `CARBON_USERNAME` is set in Replit Secrets
- [ ] `CARBON_PASSWORD_PREFIX` is set (no `$` character in the value itself)
- [ ] `CARBON_PASSWORD_SUFFIX` is set (no `$` character in the value itself)
- [ ] Password assembly node test shows length 18 and `Contains $: true`
- [ ] Login curl test returns HTTP 200 with cookie present
- [ ] `pnpm test server/carbon-api.test.ts` — all 4 tests pass
- [ ] Supplier Integrations → ABB Carbon → Sync Costs returns service count > 0
- [ ] `carbon_api_cache` table exists and has a row after sync
- [ ] ABB service in Service Detail shows the Carbon Diagnostics panel
