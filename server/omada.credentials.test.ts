/**
 * Validates that the Omada API credentials are correctly configured
 * and that the Authorization header format (AccessToken=...) works.
 */
import { describe, it, expect } from "vitest";

describe("Omada API credentials", () => {
  it("should have all required Omada env vars set", () => {
    expect(process.env.OMADA_CLIENT_ID).toBeTruthy();
    expect(process.env.OMADA_CLIENT_SECRET).toBeTruthy();
    expect(process.env.OMADA_CONTROLLER_ID).toBeTruthy();
    expect(process.env.OMADA_BASE_URL).toBeTruthy();
  });

  it("should successfully obtain an access token from the Omada API", async () => {
    const clientId = process.env.OMADA_CLIENT_ID!;
    const clientSecret = process.env.OMADA_CLIENT_SECRET!;
    const omadacId = process.env.OMADA_CONTROLLER_ID!;
    const baseUrl = process.env.OMADA_BASE_URL ?? "https://aps1-omada-northbound.tplinkcloud.com";

    const res = await fetch(`${baseUrl}/openapi/authorize/token?grant_type=client_credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ omadacId, client_id: clientId, client_secret: clientSecret }),
    });

    expect(res.ok).toBe(true);
    const json = await res.json() as { errorCode: number; msg: string; result?: { accessToken: string } };
    expect(json.errorCode).toBe(0);
    expect(json.result?.accessToken).toBeTruthy();
  }, 15000);

  it("should list sites using AccessToken= header format", async () => {
    const clientId = process.env.OMADA_CLIENT_ID!;
    const clientSecret = process.env.OMADA_CLIENT_SECRET!;
    const omadacId = process.env.OMADA_CONTROLLER_ID!;
    const baseUrl = process.env.OMADA_BASE_URL ?? "https://aps1-omada-northbound.tplinkcloud.com";

    // Get token
    const tokenRes = await fetch(`${baseUrl}/openapi/authorize/token?grant_type=client_credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ omadacId, client_id: clientId, client_secret: clientSecret }),
    });
    const tokenData = await tokenRes.json() as { errorCode: number; result?: { accessToken: string } };
    const accessToken = tokenData.result!.accessToken;

    // List sites with correct AccessToken= format
    const sitesRes = await fetch(`${baseUrl}/openapi/v1/${omadacId}/sites?pageSize=10&page=1`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `AccessToken=${accessToken}`,
      },
    });
    const sitesData = await sitesRes.json() as {
      errorCode: number;
      result?: { data: Array<{ siteId: string; name: string }> };
    };

    expect(sitesData.errorCode).toBe(0);
    expect(sitesData.result?.data).toBeDefined();
    expect(sitesData.result!.data.length).toBeGreaterThan(0);
    console.log("Sites found:", sitesData.result!.data.map((s) => s.name).join(", "));
  }, 15000);
});
