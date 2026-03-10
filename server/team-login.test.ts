import { describe, expect, it } from "vitest";

describe("team-login", () => {
  it("TEAM_ACCESS_PASSWORD environment variable is set", () => {
    // The secret is injected at runtime; verify the env mechanism works
    const password = process.env.TEAM_ACCESS_PASSWORD;
    // In test environment the secret may not be available, but the key should exist in env config
    expect(typeof password).toBe("string");
  });

  it("ENV object exposes teamAccessPassword", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV).toHaveProperty("teamAccessPassword");
    expect(typeof ENV.teamAccessPassword).toBe("string");
  });
});
