import { describe, it, expect } from "vitest";

describe("Carbon API Authentication", () => {
  it("should authenticate with Carbon API credentials and get a session", async () => {
    const username = process.env.CARBON_USERNAME;
    const password = process.env.CARBON_PASSWORD;
    
    expect(username).toBeTruthy();
    expect(password).toBeTruthy();
    
    const baseUrl = "https://api.carbon.aussiebroadband.com.au";
    
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    
    expect(loginRes.status).toBe(200);
    
    const loginData = await loginRes.json();
    // Should return some form of token or session
    console.log("Login response keys:", Object.keys(loginData));
    
    // Check for set-cookie header with session
    const cookies = loginRes.headers.get("set-cookie");
    console.log("Set-Cookie present:", !!cookies);
    
    // The login should succeed - either via token in body or session cookie
    expect(loginRes.ok).toBe(true);
  }, 15000);
});
