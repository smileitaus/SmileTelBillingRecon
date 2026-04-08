/**
 * Fuzzy customer matching engine for Starlink accounts.
 *
 * Matching strategy (in order of priority):
 *  1. Account name  ↔  customer.name / customer.businessName  (Jaro-Winkler)
 *  2. Service address ↔  customer.siteAddress / location.address  (token overlap)
 *  3. ABN (if available in Starlink account name or address string)
 *
 * Returns a ranked list of candidate customers with confidence 0–100 and
 * a human-readable matchMethod string.
 *
 * Confidence thresholds:
 *   ≥ 85  → auto-match (high confidence)
 *   60–84 → suggest (needs manual confirmation)
 *   < 60  → no match
 */

import { getDb } from "../db";
import { customers, locations } from "../../drizzle/schema";
import { eq, like, or } from "drizzle-orm";

export interface MatchCandidate {
  customerExternalId: string;
  customerName: string;
  confidence: number;
  matchMethod: string;
  siteAddress: string;
}

// ─── Jaro-Winkler similarity ──────────────────────────────────────────────────

function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  if (matchDist < 0) return 0;

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  const s1m = s1.split("").filter((_, i) => s1Matches[i]);
  const s2m = s2.split("").filter((_, i) => s2Matches[i]);
  for (let i = 0; i < s1m.length; i++) {
    if (s1m[i] !== s2m[i]) transpositions++;
  }

  return (
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  );
}

function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const jaro = jaroSimilarity(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * p * (1 - jaro);
}

// ─── Token overlap (for addresses) ───────────────────────────────────────────

export function tokenise(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

export function tokenOverlapScore(a: string, b: string): number {
  const ta = tokenise(a);
  const tb = tokenise(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of Array.from(ta)) {
    if (tb.has(t)) common++;
  }
  return (2 * common) / (ta.size + tb.size); // Dice coefficient
}

// ─── Normalise strings for comparison ────────────────────────────────────────

export function normaliseAddress(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bpty\b|\bltd\b|\bpty\.?\s*ltd\.?\b|\binc\b|\bco\b|\bllc\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Alias for normaliseAddress — used for business name normalisation */
export const normaliseName = normaliseAddress;

// ─── ABN extraction ───────────────────────────────────────────────────────────

function extractAbn(s: string): string | null {
  const m = s.replace(/\s/g, "").match(/\d{11}/);
  return m ? m[0] : null;
}

// ─── Main matching function ───────────────────────────────────────────────────

/**
 * Find the best matching SmileTel customer for a Starlink account.
 *
 * @param accountName   Account name from Starlink API
 * @param serviceAddress  Service address string from Starlink API
 * @param accountAbn    ABN if known (optional)
 */
export async function findBestCustomerMatch(
  accountName: string,
  serviceAddress: string,
  accountAbn?: string
): Promise<MatchCandidate | null> {
  const db = await getDb();
  if (!db) return null;

  // Load all active customers
  const allCustomers = await db
    .select({
      externalId: customers.externalId,
      name: customers.name,
      businessName: customers.businessName,
      siteAddress: customers.siteAddress,
      contactName: customers.contactName,
    })
    .from(customers)
    .where(eq(customers.status, "active"));

  const normName = normaliseAddress(accountName);
  const normAddr = serviceAddress ? normaliseAddress(serviceAddress) : "";
  const abn = accountAbn || extractAbn(accountName) || extractAbn(serviceAddress);

  let best: MatchCandidate | null = null;
  let bestScore = 0;

  for (const cust of allCustomers) {
    const custNormName = normaliseAddress(cust.name || "");
    const custNormBiz = normaliseAddress(cust.businessName || "");
    const custNormAddr = normaliseAddress(cust.siteAddress || "");

    // 1. Name similarity (Jaro-Winkler on both name and businessName)
    const nameScore = Math.max(
      jaroWinkler(normName, custNormName),
      jaroWinkler(normName, custNormBiz)
    );

    // 2. Address token overlap
    const addrScore = normAddr && custNormAddr
      ? tokenOverlapScore(normAddr, custNormAddr)
      : 0;

    // 3. Composite score — name is primary, address is secondary
    let composite = nameScore * 0.65 + addrScore * 0.35;
    let method = "name";

    if (addrScore > nameScore && addrScore > 0.6) {
      composite = addrScore * 0.6 + nameScore * 0.4;
      method = "address";
    }

    // Boost if both are strong
    if (nameScore > 0.8 && addrScore > 0.6) {
      composite = Math.min(1, composite * 1.1);
      method = "name+address";
    }

    const confidence = Math.round(composite * 100);

    if (confidence > bestScore && confidence >= 60) {
      bestScore = confidence;
      best = {
        customerExternalId: cust.externalId,
        customerName: cust.name,
        confidence,
        matchMethod: method,
        siteAddress: cust.siteAddress || "",
      };
    }
  }

  // If we have an ABN and it matches, boost to 95
  if (abn && best) {
    const abnCustomers = await db
      .select({ externalId: customers.externalId, name: customers.name, siteAddress: customers.siteAddress })
      .from(customers)
      .where(like(customers.notes, `%${abn}%`));

    if (abnCustomers.length === 1) {
      const c = abnCustomers[0];
      return {
        customerExternalId: c.externalId,
        customerName: c.name,
        confidence: 95,
        matchMethod: "abn",
        siteAddress: c.siteAddress || "",
      };
    }
  }

  return best;
}

/**
 * Run auto-matching for all unmatched Starlink accounts in the database.
 * Updates matchConfidence, matchMethod, customerExternalId, customerName, matchedAt
 * for accounts with confidence ≥ 85.
 *
 * Returns a summary of what was matched.
 */
export async function runAutoMatch(): Promise<{
  total: number;
  autoMatched: number;
  suggested: number;
  unmatched: number;
}> {
  const db = await getDb();
  if (!db) return { total: 0, autoMatched: 0, suggested: 0, unmatched: 0 };

  const { starlinkAccounts } = await import("../../drizzle/schema");
  const { isNull, or: drizzleOr } = await import("drizzle-orm");

  const unmatched = await db
    .select()
    .from(starlinkAccounts)
    .where(isNull(starlinkAccounts.customerExternalId));

  let autoMatched = 0;
  let suggested = 0;
  let unmatchedCount = 0;

  for (const acct of unmatched) {
    const match = await findBestCustomerMatch(
      acct.nickname || acct.accountNumber,
      acct.serviceAddress || ""
    );

    if (!match) {
      unmatchedCount++;
      continue;
    }

    const updateData: Record<string, unknown> = {
      matchConfidence: match.confidence,
      matchMethod: match.matchMethod,
      matchedAt: new Date(),
    };

    if (match.confidence >= 85) {
      // Auto-match
      updateData.customerExternalId = match.customerExternalId;
      updateData.customerName = match.customerName;
      autoMatched++;
    } else {
      // Suggest only — don't auto-assign
      suggested++;
    }

    await db
      .update(starlinkAccounts)
      .set(updateData)
      .where(eq(starlinkAccounts.id, acct.id));
  }

  return {
    total: unmatched.length,
    autoMatched,
    suggested,
    unmatched: unmatchedCount,
  };
}
