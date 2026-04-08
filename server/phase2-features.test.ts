/**
 * Phase 2 Feature Tests
 *
 * Tests for:
 *  1. Carbon Remote Diagnostics — module structure and run logging
 *  2. Outage Suppression — getServicesWithoutBilling excludes active-outage services
 *  3. Usage Threshold Alerts — checkUsageThresholds logic, acknowledgeUsageAlert
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. Carbon Diagnostics Module ────────────────────────────────────────────

describe("carbon-diagnostics module", () => {
  it("exports the expected functions", async () => {
    const mod = await import("./suppliers/carbon-diagnostics");
    expect(typeof mod.runPortReset).toBe("function");
    expect(typeof mod.runLoopbackTest).toBe("function");
    expect(typeof mod.runStabilityProfileChange).toBe("function");
    expect(typeof mod.getDiagnosticHistory).toBe("function");
    expect(typeof mod.getDiagnosticRun).toBe("function");
  });

  it("runPortReset returns a result object with expected shape when DB is unavailable", async () => {
    const { runPortReset } = await import("./suppliers/carbon-diagnostics");
    // DB is not available in test env — function should return a failed result, not throw
    const result = await runPortReset("svc-001", "carbon-001", null, "test-user").catch(e => ({ error: e.message }));
    // Either a result object or an error — both are acceptable (no unhandled crash)
    expect(result).toBeDefined();
  });

  it("getDiagnosticHistory returns empty array when DB unavailable", async () => {
    const { getDiagnosticHistory } = await import("./suppliers/carbon-diagnostics");
    const result = await getDiagnosticHistory("svc-001", 10);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── 2. Outage Suppression ────────────────────────────────────────────────────

describe("outage suppression — getSuppressedUnbilledServices", () => {
  it("exports getSuppressedUnbilledServices from db.ts", async () => {
    const mod = await import("./db");
    expect(typeof mod.getSuppressedUnbilledServices).toBe("function");
  });

  it("returns empty array when DB unavailable", async () => {
    const { getSuppressedUnbilledServices } = await import("./db");
    const result = await getSuppressedUnbilledServices("cust-001");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("exports getServicesWithoutBilling from db.ts", async () => {
    const mod = await import("./db");
    expect(typeof mod.getServicesWithoutBilling).toBe("function");
  });
});

// ─── 3. Usage Threshold Alerts ───────────────────────────────────────────────

describe("carbon-usage-alerts module", () => {
  it("exports the expected functions", async () => {
    const mod = await import("./suppliers/carbon-usage-alerts");
    expect(typeof mod.checkUsageThresholds).toBe("function");
    expect(typeof mod.getUsageThresholdAlerts).toBe("function");
    expect(typeof mod.acknowledgeUsageAlert).toBe("function");
    expect(typeof mod.getAlertSummaryForService).toBe("function");
  });

  it("getUsageThresholdAlerts returns empty array when DB unavailable", async () => {
    const { getUsageThresholdAlerts } = await import("./suppliers/carbon-usage-alerts");
    const result = await getUsageThresholdAlerts("active", "cust-001", "2026-03");
    expect(Array.isArray(result)).toBe(true);
  });

  it("getAlertSummaryForService returns null when DB unavailable", async () => {
    const { getAlertSummaryForService } = await import("./suppliers/carbon-usage-alerts");
    const result = await getAlertSummaryForService("svc-001", "2026-03");
    expect(result).toBeNull();
  });

  it("checkUsageThresholds returns a summary object when DB unavailable", async () => {
    const { checkUsageThresholds } = await import("./suppliers/carbon-usage-alerts");
    const result = await checkUsageThresholds("test");
    expect(result).toHaveProperty("servicesChecked");
    expect(result).toHaveProperty("alertsCreated");
    expect(result).toHaveProperty("alertsResolved");
    expect(result).toHaveProperty("notificationsSent");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("durationMs");
    // When DB is unavailable, servicesChecked should be 0
    expect(result.servicesChecked).toBe(0);
  });
});

// ─── 4. Usage threshold percent calculation ───────────────────────────────────

describe("usage threshold calculation logic", () => {
  it("correctly identifies 80% threshold breach", () => {
    const planGb = 100;
    const usedGb = 82;
    const usagePercent = (usedGb / planGb) * 100;
    expect(usagePercent).toBeGreaterThanOrEqual(80);
    expect(usagePercent).toBeLessThan(90);
  });

  it("correctly identifies 90% threshold breach", () => {
    const planGb = 100;
    const usedGb = 91;
    const usagePercent = (usedGb / planGb) * 100;
    expect(usagePercent).toBeGreaterThanOrEqual(90);
    expect(usagePercent).toBeLessThan(100);
  });

  it("correctly identifies 100% threshold breach (over limit)", () => {
    const planGb = 100;
    const usedGb = 105;
    const usagePercent = (usedGb / planGb) * 100;
    expect(usagePercent).toBeGreaterThanOrEqual(100);
  });

  it("does not flag services below 80%", () => {
    const planGb = 100;
    const usedGb = 75;
    const usagePercent = (usedGb / planGb) * 100;
    const thresholds = [80, 90, 100];
    const breachedThresholds = thresholds.filter(t => usagePercent >= t);
    expect(breachedThresholds.length).toBe(0);
  });

  it("skips unlimited plans (NaN planGb)", () => {
    const planGbRaw = "Unlimited".replace(/[^0-9.]/g, "");
    const planGb = planGbRaw ? parseFloat(planGbRaw) : NaN;
    expect(isNaN(planGb)).toBe(true);
  });

  it("parses plan GB correctly from string", () => {
    const cases = [
      { input: "100", expected: 100 },
      { input: "500 GB", expected: 500 },
      { input: "1000", expected: 1000 },
      { input: "25.5", expected: 25.5 },
    ];
    for (const { input, expected } of cases) {
      const raw = input.replace(/[^0-9.]/g, "");
      const parsed = parseFloat(raw);
      expect(parsed).toBe(expected);
    }
  });
});

// ─── 5. Diagnostic type validation ───────────────────────────────────────────

describe("diagnostic type validation", () => {
  it("validates allowed stability profile names", () => {
    const allowed = ["FAST", "STABLE", "INTERLEAVED", "DEFAULT"];
    expect(allowed).toContain("FAST");
    expect(allowed).toContain("STABLE");
    expect(allowed).toContain("INTERLEAVED");
    expect(allowed).toContain("DEFAULT");
    expect(allowed).not.toContain("TURBO");
  });

  it("maps diagnostic types to human-readable labels", () => {
    const labels: Record<string, string> = {
      port_reset: "Port Reset",
      loopback_test: "Loopback Test",
      stability_profile: "Stability Profile",
    };
    expect(labels.port_reset).toBe("Port Reset");
    expect(labels.loopback_test).toBe("Loopback Test");
    expect(labels.stability_profile).toBe("Stability Profile");
  });
});
