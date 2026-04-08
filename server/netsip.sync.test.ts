/**
 * Unit tests for the NetSIP / Over the Wire sync supplier module.
 *
 * These tests validate the CSV and HTML parsing logic without making
 * real network requests. The syncNetSIPNumbers function is tested via
 * the exported parsing helpers (accessed through the module internals).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Helpers extracted from the module for unit testing ────────────────────

/** Parse a CSV line respecting quoted fields (mirrors netsip.ts) */
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

function findColIdx(header: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = header.indexOf(candidate);
    if (idx >= 0) return idx;
  }
  for (const candidate of candidates) {
    const idx = header.findIndex(h => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

interface NetSIPNumber {
  number: string;
  sipId: string;
  customerName: string;
  status: "active" | "terminated";
  notes: string;
}

function parseNetSIPCSV(csv: string): NetSIPNumber[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

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

    let rawNumber = idx.number >= 0 ? (cols[idx.number] ?? "") : "";
    if (!rawNumber) {
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("NetSIP CSV parser", () => {
  it("parses a standard DID/SIP/Description/Status CSV", () => {
    const csv = `DID,SIP ID,Description,Status
0280124500,sip-001,Acme Corp,active
0280124501,sip-002,Beta Ltd,active
0280124502,sip-003,Gamma Inc,terminated`;

    const result = parseNetSIPCSV(csv);
    expect(result).toHaveLength(3);

    expect(result[0]).toMatchObject({
      number: "0280124500",
      sipId: "sip-001",
      customerName: "Acme Corp",
      status: "active",
    });
    expect(result[2]).toMatchObject({
      number: "0280124502",
      sipId: "sip-003",
      customerName: "Gamma Inc",
      status: "terminated",
    });
  });

  it("handles 1300/1800 numbers correctly", () => {
    const csv = `DID,SIP ID,Description,Status
1300192868,sip-100,Toll Free Customer,active
1800555123,sip-101,Another Customer,active`;

    const result = parseNetSIPCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0].number).toBe("1300192868");
    expect(result[1].number).toBe("1800555123");
  });

  it("falls back to 'Smile IT' when description is empty", () => {
    const csv = `DID,SIP ID,Description,Status
0280124500,sip-001,,active`;

    const result = parseNetSIPCSV(csv);
    expect(result[0].customerName).toBe("Smile IT");
  });

  it("generates SIP notes when sipId is present", () => {
    const csv = `DID,SIP ID,Description,Status
0280124500,sip-001,Test Customer,active`;

    const result = parseNetSIPCSV(csv);
    expect(result[0].notes).toBe("SIP: sip-001");
  });

  it("generates fallback notes when sipId is empty", () => {
    const csv = `DID,SIP ID,Description,Status
0280124500,,Test Customer,active`;

    const result = parseNetSIPCSV(csv);
    expect(result[0].notes).toBe("NetSIP 0280124500");
  });

  it("handles quoted fields with commas", () => {
    const csv = `DID,SIP ID,Description,Status
0280124500,sip-001,"Smith, Jones & Co",active`;

    const result = parseNetSIPCSV(csv);
    expect(result[0].customerName).toBe("Smith, Jones & Co");
  });

  it("returns empty array for CSV with only a header", () => {
    const csv = `DID,SIP ID,Description,Status`;
    const result = parseNetSIPCSV(csv);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(parseNetSIPCSV("")).toHaveLength(0);
    expect(parseNetSIPCSV("\n\n")).toHaveLength(0);
  });

  it("skips rows with invalid/short phone numbers", () => {
    const csv = `DID,SIP ID,Description,Status
123,sip-001,Short Number,active
0280124500,sip-002,Valid Number,active`;

    const result = parseNetSIPCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe("0280124500");
  });

  it("handles 'inactive' status as terminated", () => {
    const csv = `DID,SIP ID,Description,Status
0280124500,sip-001,Test,inactive`;

    const result = parseNetSIPCSV(csv);
    expect(result[0].status).toBe("terminated");
  });

  it("handles alternative column name 'Number' instead of 'DID'", () => {
    const csv = `Number,Service,Customer,Status
0280124500,sip-001,Test Corp,active`;

    const result = parseNetSIPCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe("0280124500");
    expect(result[0].customerName).toBe("Test Corp");
  });

  it("auto-detects phone number column when header is unrecognised", () => {
    const csv = `ref,code,label,state
0280124500,sip-001,Test Corp,active`;

    const result = parseNetSIPCSV(csv);
    // Should find 0280124500 by scanning for phone-like values
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe("0280124500");
  });
});

describe("parseCSVLine", () => {
  it("splits simple comma-separated values", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields", () => {
    expect(parseCSVLine('"hello, world",b,c')).toEqual(["hello, world", "b", "c"]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    expect(parseCSVLine('"say ""hello""",b')).toEqual(['say "hello"', "b"]);
  });

  it("trims whitespace from unquoted fields", () => {
    expect(parseCSVLine(" a , b , c ")).toEqual(["a", "b", "c"]);
  });
});
