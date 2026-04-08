/**
 * NetSIP / Over the Wire portal — server-side sync helper
 *
 * Authenticates against the OTW portal and fetches the indials CSV export,
 * then returns a normalised list of numbers ready for upsert into phone_numbers.
 *
 * Flow:
 *   1. POST /api/login with username + password → receive auth token
 *   2. GET /api/indials/export (CSV) with Bearer token
 *   3. Parse CSV rows into NetSIPNumber objects
 *
 * Fallback: if the API endpoint is not available, try the web portal
 * login + CSV download approach.
 */

import { ENV } from "../_core/env";

export interface NetSIPNumber {
  number: string;           // raw DID digits, e.g. "0280124500"
  sipId: string;            // SIP trunk / service ID from portal
  customerName: string;     // account / description label
  status: "active" | "terminated";
  notes: string;
}

/** Minimal cookie-jar for Node fetch */
function parseCookies(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map(h => h.split(";")[0])
    .join("; ");
}

/** Parse a CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

const BASE = (ENV.NETSIP_WEB_ADDRESS || "https://portal.netsip.com.au").replace(/\/$/, "");

export async function syncNetSIPNumbers(): Promise<{
  numbers: NetSIPNumber[];
  source: string;
  error?: string;
}> {
  // ── Strategy 1: Try REST API login + CSV export ───────────────────────────
  try {
    const apiResult = await tryApiSync();
    if (apiResult.numbers.length > 0 || !apiResult.error) {
      return apiResult;
    }
  } catch (_) {
    // fall through to web portal strategy
  }

  // ── Strategy 2: Web portal login + CSV download ───────────────────────────
  return tryWebPortalSync();
}

/** Strategy 1: REST API approach */
async function tryApiSync(): Promise<{ numbers: NetSIPNumber[]; source: string; error?: string }> {
  // Attempt token-based login
  const loginRes = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; LucidSync/1.0)",
    },
    body: JSON.stringify({
      username: ENV.NETSIP_LOGIN,
      password: ENV.NETSIP_PASSWORD,
    }),
  });

  if (!loginRes.ok) {
    return { numbers: [], source: "api", error: `API login returned ${loginRes.status}` };
  }

  let token = "";
  try {
    const json = await loginRes.json() as any;
    token = json?.token ?? json?.access_token ?? json?.data?.token ?? "";
  } catch {
    return { numbers: [], source: "api", error: "Could not parse login response" };
  }

  if (!token) {
    return { numbers: [], source: "api", error: "No auth token in login response" };
  }

  // Fetch indials CSV
  const csvRes = await fetch(`${BASE}/api/indials/export`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "User-Agent": "Mozilla/5.0 (compatible; LucidSync/1.0)",
    },
  });

  if (!csvRes.ok) {
    return { numbers: [], source: "api", error: `CSV export returned ${csvRes.status}` };
  }

  const csvText = await csvRes.text();
  const numbers = parseNetSIPCSV(csvText);
  return { numbers, source: "api" };
}

/** Strategy 2: Web portal form login + CSV download */
async function tryWebPortalSync(): Promise<{ numbers: NetSIPNumber[]; source: string; error?: string }> {
  try {
    // Step 1: GET login page to capture session cookie + CSRF token
    const loginPageRes = await fetch(`${BASE}/login`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LucidSync/1.0)" },
    });
    const loginCookies = parseCookies(loginPageRes.headers.getSetCookie?.() ?? []);
    const loginHtml = await loginPageRes.text();

    // Extract CSRF token if present
    const csrfMatch = loginHtml.match(/name="_token"[^>]*value="([^"]+)"/i)
      ?? loginHtml.match(/value="([^"]+)"[^>]*name="_token"/i)
      ?? loginHtml.match(/name="csrf[_-]token"[^>]*value="([^"]+)"/i);
    const csrfToken = csrfMatch ? csrfMatch[1] : "";

    // Step 2: POST login credentials
    const formData = new URLSearchParams();
    formData.set("username", ENV.NETSIP_LOGIN);
    formData.set("password", ENV.NETSIP_PASSWORD);
    if (csrfToken) formData.set("_token", csrfToken);

    const loginRes = await fetch(`${BASE}/login`, {
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

    // Collect session cookies
    const sessionCookies = parseCookies([
      ...loginCookies.split("; ").filter(Boolean),
      ...(loginRes.headers.getSetCookie?.() ?? []).map(h => h.split(";")[0]),
    ].filter(Boolean));

    // Follow redirect
    let afterLoginUrl = loginRes.headers.get("location") ?? `${BASE}/indials`;
    if (!afterLoginUrl.startsWith("http")) {
      afterLoginUrl = `${BASE}${afterLoginUrl}`;
    }

    // Step 3: Try to download indials CSV
    // Common OTW portal paths for CSV export
    const csvPaths = [
      "/indials/export",
      "/indials/export.csv",
      "/numbers/export",
      "/numbers/export.csv",
      "/dids/export",
      "/dids/export.csv",
    ];

    for (const path of csvPaths) {
      const csvRes = await fetch(`${BASE}${path}`, {
        headers: {
          "Cookie": sessionCookies,
          "User-Agent": "Mozilla/5.0 (compatible; LucidSync/1.0)",
          "Referer": afterLoginUrl,
        },
      });

      if (!csvRes.ok) continue;
      const contentType = csvRes.headers.get("content-type") ?? "";
      const csvText = await csvRes.text();

      // Check it's actually CSV content (not an HTML redirect to login)
      if (
        contentType.includes("text/csv") ||
        contentType.includes("application/csv") ||
        (csvText.includes(",") && !csvText.trim().startsWith("<"))
      ) {
        const numbers = parseNetSIPCSV(csvText);
        if (numbers.length > 0) {
          return { numbers, source: "web-portal" };
        }
      }
    }

    // Step 4: If CSV download fails, try scraping the HTML indials page
    const indialsRes = await fetch(`${BASE}/indials`, {
      headers: {
        "Cookie": sessionCookies,
        "User-Agent": "Mozilla/5.0 (compatible; LucidSync/1.0)",
        "Referer": afterLoginUrl,
      },
    });

    if (!indialsRes.ok) {
      return { numbers: [], source: "web-portal", error: `Indials page returned ${indialsRes.status}` };
    }

    const html = await indialsRes.text();
    if (html.includes("login") && html.includes("password") && !html.includes("indial")) {
      return { numbers: [], source: "web-portal", error: "Authentication failed — redirected back to login" };
    }

    const numbers = parseNetSIPHTML(html);
    return { numbers, source: "web-portal-html" };
  } catch (err: any) {
    return { numbers: [], source: "web-portal", error: String(err?.message ?? err) };
  }
}

/** Parse NetSIP CSV export — handles multiple possible column layouts */
function parseNetSIPCSV(csv: string): NetSIPNumber[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  // Map common column names to indices
  const idx = {
    number: findColIdx(header, ["did", "number", "phonenumber", "ddi", "indial", "e164"]),
    sipId: findColIdx(header, ["sipid", "siptrunk", "trunk", "trunkid", "serviceid", "service", "id"]),
    description: findColIdx(header, ["description", "label", "name", "account", "customer", "alias", "comment"]),
    status: findColIdx(header, ["status", "state", "active"]),
  };

  const numbers: NetSIPNumber[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 2) continue;

    // Try to find a phone number in any column if idx.number is -1
    let rawNumber = idx.number >= 0 ? (cols[idx.number] ?? "") : "";
    if (!rawNumber) {
      // Scan all columns for something that looks like a phone number
      for (const col of cols) {
        const d = col.replace(/\D/g, "");
        if (d.length >= 8 && (d.startsWith("0") || d.startsWith("61") || d.startsWith("1300") || d.startsWith("1800"))) {
          rawNumber = col;
          break;
        }
      }
    }

    const digits = rawNumber.replace(/\D/g, "");
    if (!digits || digits.length < 6) continue;

    const sipId = idx.sipId >= 0 ? (cols[idx.sipId] ?? "") : (cols[1] ?? "");
    const description = idx.description >= 0 ? (cols[idx.description] ?? "") : "";
    const statusRaw = idx.status >= 0 ? (cols[idx.status] ?? "").toLowerCase() : "active";

    numbers.push({
      number: digits,
      sipId: sipId.trim(),
      customerName: description.trim() || "Smile IT",
      status: statusRaw.includes("term") || statusRaw === "inactive" || statusRaw === "false" || statusRaw === "0"
        ? "terminated"
        : "active",
      notes: sipId ? `SIP: ${sipId.trim()}` : `NetSIP ${digits}`,
    });
  }

  return numbers;
}

/** Parse NetSIP HTML table (fallback when CSV is unavailable) */
function parseNetSIPHTML(html: string): NetSIPNumber[] {
  const numbers: NetSIPNumber[] = [];

  // Find all table rows
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  let headerParsed = false;
  const colMap: Record<string, number> = {};

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Check for header row (th elements)
    if (!headerParsed && rowHtml.includes("<th")) {
      const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
      let thMatch: RegExpExecArray | null;
      let colIdx = 0;
      while ((thMatch = thRe.exec(rowHtml)) !== null) {
        const label = thMatch[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
        colMap[label] = colIdx++;
      }
      headerParsed = true;
      continue;
    }

    // Parse data rows
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRe.exec(rowHtml)) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, "").trim());
    }
    if (cells.length < 2) continue;

    // Try to identify DID column
    const didIdx = colMap["did"] ?? colMap["number"] ?? colMap["ddi"] ?? colMap["indial"] ?? 0;
    const sipIdx = colMap["sip id"] ?? colMap["sipid"] ?? colMap["trunk"] ?? colMap["service"] ?? 1;
    const descIdx = colMap["description"] ?? colMap["label"] ?? colMap["name"] ?? colMap["account"] ?? 2;

    const rawNumber = cells[didIdx] ?? "";
    const digits = rawNumber.replace(/\D/g, "");
    if (!digits || digits.length < 6) continue;

    numbers.push({
      number: digits,
      sipId: (cells[sipIdx] ?? "").trim(),
      customerName: (cells[descIdx] ?? "").trim() || "Smile IT",
      status: "active",
      notes: cells[sipIdx] ? `SIP: ${cells[sipIdx].trim()}` : `NetSIP ${digits}`,
    });
  }

  return numbers;
}

/** Find the first matching column index from a list of candidate names */
function findColIdx(header: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = header.indexOf(candidate);
    if (idx >= 0) return idx;
  }
  // Partial match
  for (const candidate of candidates) {
    const idx = header.findIndex(h => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}
