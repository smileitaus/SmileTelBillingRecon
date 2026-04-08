/**
 * shared/suppliers.ts
 *
 * SINGLE SOURCE OF TRUTH for all supplier and provider names used across the
 * SmileTel Billing Reconciliation system.
 *
 * ─── HOW TO ADD A NEW SUPPLIER ───────────────────────────────────────────────
 * 1. Add the supplier key to KNOWN_SUPPLIERS below (keep alphabetical order).
 * 2. Add a matching entry to SUPPLIER_LABELS if the display label differs from
 *    the key (e.g. "ABB" → "ABB / Aussie Broadband").
 * 3. Add a colour entry to SUPPLIER_COLORS for the ProviderBadge / ProviderDot
 *    components (hex value used in charts).
 * 4. Add a providerConfig entry in ProviderBadge.tsx for badge styling + logo.
 *
 * Everything else (dropdowns, filter selects, edit-form dropdowns) is driven
 * from this file automatically — no other files need to be touched.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Canonical supplier/provider keys — used as DB values and dropdown values. */
export const KNOWN_SUPPLIERS = [
  "AAPT",
  "ABB",
  "Access4",
  "Blitznet",
  "ChannelHaus",
  "CommsCode",
  "DataGate",
  "Exetel",
  "Infinet",
  "Legion",
  "Optus",
  "OptiComm",
  "SasBoss",
  "SmileTel",
  "Starlink",
  "Tech-e",
  "Telstra",
  "TIAB",
  "TPG",
  "VineDirect",
  "Vocus",
] as const;

export type KnownSupplier = (typeof KNOWN_SUPPLIERS)[number];

/**
 * Human-readable display labels for each supplier.
 * Falls back to the key itself if not listed here.
 */
export const SUPPLIER_LABELS: Record<string, string> = {
  ABB: "ABB / Aussie Broadband",
  ChannelHaus: "Channel Haus",
  Legion: "Legion Telecom",
  VineDirect: "Vine Direct",
};

/** Returns the display label for a supplier key. */
export function supplierLabel(key: string): string {
  return SUPPLIER_LABELS[key] ?? key;
}

/**
 * Hex colours used in charts and the PROVIDER_COLORS export in ProviderBadge.
 * Add an entry here when adding a new supplier.
 */
export const SUPPLIER_COLORS: Record<string, string> = {
  AAPT: "#14b8a6",
  ABB: "#16a34a",
  Access4: "#8b5cf6",
  Blitznet: "#eab308",
  ChannelHaus: "#d946ef",
  CommsCode: "#0284c7",
  DataGate: "#0369a1",
  Exetel: "#06b6d4",
  Infinet: "#0ea5e9",
  Legion: "#ef4444",
  Optus: "#10b981",
  OptiComm: "#65a30d",
  SasBoss: "#6366f1",
  SmileTel: "#ec4899",
  Starlink: "#1d4ed8",
  "Tech-e": "#f59e0b",
  Telstra: "#3b82f6",
  TIAB: "#6b7280",
  TPG: "#7c3aed",
  VineDirect: "#15803d",
  Vocus: "#a855f7",
  Unknown: "#9ca3af",
};
