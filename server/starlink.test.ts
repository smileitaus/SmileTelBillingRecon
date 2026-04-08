/**
 * Starlink Integration Tests
 * Tests for the fuzzy customer matching engine and API client utilities.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Fuzzy Matcher Tests ───────────────────────────────────────────────────────

// We test the matching logic directly by importing the module.
// The DB calls are mocked so no real database is needed.

vi.mock("../server/_core/db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

describe("Starlink fuzzy customer matching", () => {
  describe("normaliseAddress", () => {
    it("strips punctuation and lowercases", async () => {
      const { normaliseAddress } = await import("./starlink/fuzzyMatch");
      expect(normaliseAddress("123 Main St, Sydney NSW 2000")).toBe(
        "123 main st sydney nsw 2000"
      );
    });

    it("lowercases and strips punctuation from addresses", async () => {
      const { normaliseAddress } = await import("./starlink/fuzzyMatch");
      // The function lowercases and strips non-alphanumeric chars
      expect(normaliseAddress("45 Church Rd, NSW 2000")).toContain("church");
      expect(normaliseAddress("45 Church Rd, NSW 2000")).toContain("nsw");
      expect(normaliseAddress("10 King St.")).toContain("king");
    });

    it("handles empty string", async () => {
      const { normaliseAddress } = await import("./starlink/fuzzyMatch");
      expect(normaliseAddress("")).toBe("");
    });
  });

  describe("normaliseName", () => {
    it("removes common business suffixes", async () => {
      const { normaliseName } = await import("./starlink/fuzzyMatch");
      // normalise strips pty, ltd and punctuation then trims
      const r1 = normaliseName("Smith & Sons Pty Ltd");
      expect(r1).toContain("smith");
      expect(r1).toContain("sons");
      expect(r1).not.toContain("pty");
      expect(r1).not.toContain("ltd");

      const r2 = normaliseName("ABC Holdings Pty. Ltd.");
      expect(r2).toContain("abc");
      expect(r2).toContain("holdings");
      expect(r2).not.toContain("pty");
      expect(r2).not.toContain("ltd");
    });

    it("strips punctuation and lowercases", async () => {
      const { normaliseName } = await import("./starlink/fuzzyMatch");
      // apostrophes become spaces, then collapsed
      const r = normaliseName("O'Brien's Cafe");
      expect(r).toContain("brien");
      expect(r).toContain("cafe");
      expect(r).toBe(r.toLowerCase());
    });

    it("handles empty string", async () => {
      const { normaliseName } = await import("./starlink/fuzzyMatch");
      expect(normaliseName("")).toBe("");
    });
  });

  describe("tokenOverlapScore", () => {
    it("returns 1.0 for identical strings", async () => {
      const { tokenOverlapScore } = await import("./starlink/fuzzyMatch");
      expect(tokenOverlapScore("hello world", "hello world")).toBe(1);
    });

    it("returns 0 for completely different strings", async () => {
      const { tokenOverlapScore } = await import("./starlink/fuzzyMatch");
      expect(tokenOverlapScore("abc def", "xyz uvw")).toBe(0);
    });

    it("returns partial score for partial overlap", async () => {
      const { tokenOverlapScore } = await import("./starlink/fuzzyMatch");
      const score = tokenOverlapScore("hello world foo", "hello world bar");
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it("handles empty strings without throwing", async () => {
      const { tokenOverlapScore } = await import("./starlink/fuzzyMatch");
      expect(tokenOverlapScore("", "")).toBe(0);
    });
  });
});

// ── API Client Tests ──────────────────────────────────────────────────────────

describe("Starlink API client", () => {
  describe("getStarlinkToken", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("calls the OIDC token endpoint with client_credentials grant", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "tok123", expires_in: 3600 }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { getStarlinkToken } = await import("./starlink/apiClient");
      const token = await getStarlinkToken("my-client-id", "my-secret");

      expect(token).toBe("tok123");
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("oidc");
      expect(opts.method).toBe("POST");
      // body is a stringified URLSearchParams
      expect(opts.body).toContain("grant_type=client_credentials");
      expect(opts.body).toContain("client_id=my-client-id");

      vi.unstubAllGlobals();
    });

    it("throws on non-OK token response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });
      vi.stubGlobal("fetch", mockFetch);

      const { getStarlinkToken } = await import("./starlink/apiClient");
      await expect(getStarlinkToken("bad-id", "bad-secret")).rejects.toThrow(/401/);

      vi.unstubAllGlobals();
    });
  });

  describe("starlinkRequest helper", () => {
    it("attaches Authorization Bearer header", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { starlinkRequest } = await import("./starlink/apiClient");
      // starlinkRequest(method, path, token)
      await starlinkRequest("GET", "/enterprise/v1/account/test/service-lines", "fake-token");

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers?.Authorization).toBe("Bearer fake-token");

      vi.unstubAllGlobals();
    });

    it("throws on non-OK API response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      });
      vi.stubGlobal("fetch", mockFetch);

      const { starlinkRequest } = await import("./starlink/apiClient");
      await expect(
        starlinkRequest("GET", "/enterprise/v1/account/test/service-lines", "tok")
      ).rejects.toThrow(/403/);

      vi.unstubAllGlobals();
    });
  });
});
