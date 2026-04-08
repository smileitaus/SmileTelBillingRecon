import { describe, it, expect, beforeAll } from "vitest";

/**
 * Carbon API integration tests.
 *
 * A single login is performed in beforeAll to avoid ABB rate-limiting (429).
 * The session cookie is passed to getCarbonServicesCached so it reuses the
 * same session rather than logging in again.
 */

const CARBON_BASE_URL = "https://api.carbon.aussiebroadband.com.au";

function getCarbonPassword(): string {
  const prefix = process.env.CARBON_PASSWORD_PREFIX;
  const suffix = process.env.CARBON_PASSWORD_SUFFIX;
  if (!prefix || !suffix) throw new Error("CARBON_PASSWORD_PREFIX or CARBON_PASSWORD_SUFFIX not set");
  return `${prefix}$X${suffix}`;
}

// Shared session cookie — populated once in beforeAll
let sessionCookie = "";

describe("Carbon API", () => {
  beforeAll(async () => {
    const username = process.env.CARBON_USERNAME;
    const password = getCarbonPassword();
    const res = await fetch(`${CARBON_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Carbon API login failed (${res.status}): ${body.substring(0, 200)}`);
    }
    const rawCookies = res.headers.get("set-cookie") || "";
    sessionCookie = rawCookies.split(",").map((c) => c.trim().split(";")[0]).join("; ");
    console.log("[beforeAll] Carbon API login OK. Cookie present:", !!sessionCookie);
  }, 20000);

  it("assembles the 18-character password from split secrets", () => {
    const password = getCarbonPassword();
    expect(password.length).toBe(18);
    expect(password).toContain("$");
    expect(password.startsWith("HK#v3X44dUE")).toBe(true);
    expect(password.endsWith("%(Xj}")).toBe(true);
  });

  it("login produced a valid session cookie", () => {
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie.length).toBeGreaterThan(10);
  });

  it("fetches page 1 of services and returns the expected shape", async () => {
    const svcRes = await fetch(`${CARBON_BASE_URL}/carbon/services?page=1&per_page=100`, {
      headers: { "Accept": "application/json", "cookie": sessionCookie },
    });
    expect(svcRes.ok).toBe(true);
    const data = await svcRes.json();
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.meta.current_page).toBe(1);
    expect(data.meta.last_page).toBeGreaterThanOrEqual(1);
    expect(data.meta.total).toBeGreaterThan(0);
    const first = data.data[0];
    expect(typeof first.id).toBe("number");
    expect(typeof first.status).toBe("string");
    expect(typeof first.monthly_cost_cents).toBe("number");
    console.log(`[test] Total Carbon services: ${data.meta.total} across ${data.meta.last_page} pages`);
    console.log(`[test] First: id=${first.id}, status=${first.status}, cost=$${(first.monthly_cost_cents / 100).toFixed(2)}, plan=${first.plan?.name ?? "none"}`);
  }, 15000);

  it("getCarbonServicesCached fetches all pages and caches in DB (force refresh, reuses session)", async () => {
    const { getCarbonServicesCached } = await import("./db");
    // Pass the existing session cookie to avoid a second login (rate limit prevention)
    const result = await getCarbonServicesCached(true, sessionCookie);
    expect(Array.isArray(result.services)).toBe(true);
    expect(result.services.length).toBeGreaterThan(0);
    expect(result.fromCache).toBe(false);
    expect(result.fetchedAt).toBeInstanceOf(Date);
    console.log(`[test] Live fetch: ${result.services.length} services, fetchedAt: ${result.fetchedAt.toISOString()}`);
  }, 60000);

  it("getCarbonServicesCached returns from cache on second call within TTL", async () => {
    const { getCarbonServicesCached } = await import("./db");
    // No cookie needed — should read from DB cache, no API call
    const result = await getCarbonServicesCached(false);
    expect(Array.isArray(result.services)).toBe(true);
    expect(result.services.length).toBeGreaterThan(0);
    expect(result.fromCache).toBe(true);
    console.log(`[test] Cache hit: ${result.services.length} services, age: ${Math.round((Date.now() - result.fetchedAt.getTime()) / 1000)}s`);
  }, 15000);
});
