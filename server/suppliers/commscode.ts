/**
 * CommsCode Number Manager — server-side sync helper
 *
 * Authenticates against the Struts-based portal, scrapes all service pages,
 * and returns a normalised list of numbers ready for upsert into phone_numbers.
 *
 * The portal uses a Java Struts form with a CSRF-like token baked into the
 * login page. We:
 *   1. GET /login to capture the session cookie + hidden field values
 *   2. POST /logincheck with clientId, email, password
 *   3. GET /services/index.action?max=200 to retrieve all services in one page
 *   4. Parse the HTML table rows
 */

import { ENV } from "../_core/env";

export interface CommsCodeNumber {
  number: string;           // raw DID, e.g. "1300192868"
  customerName: string;     // end-customer account name
  providerServiceCode: string; // service/alias label from portal
  status: "active" | "terminated";
  notes: string;
}

const BASE = ENV.COMMS_WEB_ADDRESS.replace(/\/$/, "");

/** Minimal cookie-jar for Node fetch */
function parseCookies(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map(h => h.split(";")[0])
    .join("; ");
}

/** Extract a hidden input value from HTML */
function extractHidden(html: string, name: string): string {
  const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, "i"))
    ?? html.match(new RegExp(`value="([^"]*)"[^>]*name="${name}"`, "i"));
  return m ? m[1] : "";
}

/** Parse one <tr> of the services table into a CommsCodeNumber */
function parseRow(cells: string[]): CommsCodeNumber | null {
  // Columns (0-indexed): DID | Account | Alias | Status | ...
  if (cells.length < 4) return null;
  const rawDid = cells[0].replace(/<[^>]+>/g, "").trim();
  const digits = rawDid.replace(/\D/g, "");
  if (!digits || digits.length < 6) return null;

  const customerName = cells[1].replace(/<[^>]+>/g, "").trim();
  const alias = cells[2].replace(/<[^>]+>/g, "").trim();
  const statusRaw = cells[3].replace(/<[^>]+>/g, "").trim().toLowerCase();

  return {
    number: digits,
    customerName: customerName || "Smile IT",
    providerServiceCode: alias || rawDid,
    status: statusRaw === "terminated" ? "terminated" : "active",
    notes: alias ? `${alias} (CommsCode)` : `CommsCode ${rawDid}`,
  };
}

/** Extract all <td> cell contents from a <tr> string */
function extractCells(row: string): string[] {
  const cells: string[] = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(row)) !== null) {
    cells.push(m[1]);
  }
  return cells;
}

export async function syncCommsCodeNumbers(): Promise<{
  numbers: CommsCodeNumber[];
  pagesScraped: number;
  error?: string;
}> {
  try {
    // ── Step 1: GET login page to capture session cookie ──────────────────────
    const loginPageRes = await fetch(`${BASE}/login`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LucidSync/1.0)" },
    });
    const loginCookies = parseCookies(loginPageRes.headers.getSetCookie?.() ?? []);
    const loginHtml = await loginPageRes.text();

    // Some Struts forms embed a token — grab it if present
    const struts_token = extractHidden(loginHtml, "struts.token") || extractHidden(loginHtml, "token");

    // ── Step 2: POST /logincheck ───────────────────────────────────────────────
    const formData = new URLSearchParams();
    formData.set("clientId", ENV.COMMS_ACCOUNT_CODE);
    formData.set("email", ENV.COMMS_LOGIN);
    formData.set("password", ENV.COMMS_PASSWORD);
    if (struts_token) formData.set("struts.token", struts_token);

    const loginRes = await fetch(`${BASE}/logincheck`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": loginCookies,
        "User-Agent": "Mozilla/5.0 (compatible; LucidSync/1.0)",
        "Referer": `${BASE}/login`,
      },
      body: formData.toString(),
      redirect: "manual",
    });

    // Collect session cookies from the login response
    const sessionCookies = parseCookies([
      ...loginCookies.split("; ").map(c => c),
      ...(loginRes.headers.getSetCookie?.() ?? []).map(h => h.split(";")[0]),
    ].filter(Boolean));

    // Follow redirect if needed
    let afterLoginUrl = loginRes.headers.get("location") ?? `${BASE}/services/index.action`;
    if (!afterLoginUrl.startsWith("http")) {
      afterLoginUrl = `${BASE}${afterLoginUrl}`;
    }

    // ── Step 3: Fetch services with max=200 to get all in one page ─────────────
    const servicesRes = await fetch(`${BASE}/services/index.action?max=200`, {
      headers: {
        "Cookie": sessionCookies,
        "User-Agent": "Mozilla/5.0 (compatible; LucidSync/1.0)",
        "Referer": afterLoginUrl,
      },
    });

    if (!servicesRes.ok) {
      return { numbers: [], pagesScraped: 0, error: `Services page returned ${servicesRes.status}` };
    }

    const html = await servicesRes.text();

    // Check we're actually logged in (not redirected back to login)
    if (html.includes("<title>Login</title>") || html.includes("Invalid username or password")) {
      return { numbers: [], pagesScraped: 0, error: "Authentication failed — check CommsCode credentials" };
    }

    // ── Step 4: Parse HTML table ───────────────────────────────────────────────
    const numbers: CommsCodeNumber[] = [];
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    const tbody = tbodyMatch ? tbodyMatch[1] : html;

    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(tbody)) !== null) {
      const cells = extractCells(rowMatch[1]);
      const parsed = parseRow(cells);
      if (parsed) numbers.push(parsed);
    }

    // If we got no rows but the page loaded, try pagination
    let pagesScraped = 1;
    if (numbers.length > 0) {
      // Check for additional pages
      const totalMatch = html.match(/Displaying\s+\d+\s*-\s*\d+\s+of\s+(\d+)/i);
      const total = totalMatch ? parseInt(totalMatch[1]) : numbers.length;
      if (total > numbers.length) {
        // Fetch remaining pages
        const pageSize = numbers.length;
        const totalPages = Math.ceil(total / pageSize);
        for (let page = 2; page <= Math.min(totalPages, 10); page++) {
          const pageRes = await fetch(`${BASE}/services/index.action?max=200&offset=${(page - 1) * pageSize}`, {
            headers: {
              "Cookie": sessionCookies,
              "User-Agent": "Mozilla/5.0 (compatible; LucidSync/1.0)",
            },
          });
          if (!pageRes.ok) break;
          const pageHtml = await pageRes.text();
          const pageTbody = pageHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
          const pageBody = pageTbody ? pageTbody[1] : pageHtml;
          const pageRowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
          let pageRow: RegExpExecArray | null;
          while ((pageRow = pageRowRe.exec(pageBody)) !== null) {
            const cells = extractCells(pageRow[1]);
            const parsed = parseRow(cells);
            if (parsed) numbers.push(parsed);
          }
          pagesScraped++;
        }
      }
    }

    return { numbers, pagesScraped };
  } catch (err: any) {
    return { numbers: [], pagesScraped: 0, error: String(err?.message ?? err) };
  }
}
