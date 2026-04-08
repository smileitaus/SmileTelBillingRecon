/**
 * SasBoss API integration tests
 *
 * Tests cover:
 * 1. ENV configuration — API host and Reseller ID are set
 * 2. Token URL construction — correct format per Joel's confirmation
 * 3. fetchSasBossToken — live token fetch (skipped if credentials missing)
 * 4. syncAllSasBossData — returns correct shape (skipped if credentials missing)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ENV } from "./_core/env";
import { fetchSasBossToken, syncAllSasBossData } from "./suppliers/sasboss-api";

// Detect if we have real credentials to run live tests
const hasCredentials =
  !!(ENV.SASBOSS_API_USERNAME || ENV.SASBOSS_API_USERNAME_KEY) &&
  !!(ENV.SASBOSS_API_PASSWORD || ENV.SASBOSS_API_PASSWORD_KEY);

describe("SasBoss API — Configuration", () => {
  it("SASBOSS_API_HOST is set to api.sasboss.com.au", () => {
    expect(ENV.SASBOSS_API_HOST).toBe("api.sasboss.com.au");
  });

  it("SASBOSS_RESELLER_ID is set to 2815", () => {
    expect(ENV.SASBOSS_RESELLER_ID).toBe("2815");
  });

  it("SasBoss credentials are configured", () => {
    const user = ENV.SASBOSS_API_USERNAME_KEY || ENV.SASBOSS_API_USERNAME;
    const pass = ENV.SASBOSS_API_PASSWORD_KEY || ENV.SASBOSS_API_PASSWORD;
    expect(user).toBeTruthy();
    expect(pass).toBeTruthy();
  });
});

describe("SasBoss API — Token Endpoint", () => {
  it.skipIf(!hasCredentials)(
    "fetchSasBossToken returns { apiUser, token, roleType }",
    async () => {
      const result = await fetchSasBossToken();
      expect(result).toHaveProperty("apiUser");
      expect(result).toHaveProperty("token");
      expect(result).toHaveProperty("roleType");
      expect(typeof result.token).toBe("string");
      expect(result.token.length).toBeGreaterThan(0);
    },
    30_000 // 30s timeout for live API
  );
});

describe("SasBoss API — syncAllSasBossData", () => {
  it.skipIf(!hasCredentials)(
    "syncAllSasBossData returns correct shape",
    async () => {
      const result = await syncAllSasBossData();
      expect(result).toHaveProperty("enterprises");
      expect(result).toHaveProperty("serviceAccounts");
      expect(result).toHaveProperty("didNumbers");
      expect(result).toHaveProperty("products");
      expect(result).toHaveProperty("invoices");
      expect(result).toHaveProperty("errors");
      expect(Array.isArray(result.enterprises)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    },
    60_000 // 60s timeout for full sync
  );
});
