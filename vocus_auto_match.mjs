/**
 * Vocus Auto-Match Script
 * Links Vocus NBN services and Mobile SIMs to existing SmileTel customer/service records.
 *
 * Matching strategy:
 *   NBN:    1. Exact AVC ID match (connectionId)
 *           2. Address fuzzy match (locationAddress vs vocus address)
 *   Mobile: 1. Exact phone number match (phoneNumber vs MSN)
 *           2. Customer name fuzzy match
 */

import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

// Parse DATABASE_URL: mysql://user:pass@host:port/db
const url = new URL(DB_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log("Connected to database.");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a phone number to digits only, strip leading 0 or +61 */
function normalisePhone(p) {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  // Strip leading +61 → 0
  if (digits.startsWith("61") && digits.length === 11) return "0" + digits.slice(2);
  return digits;
}

/** Normalise an address for fuzzy comparison */
function normaliseAddress(a) {
  if (!a) return "";
  return a
    .toLowerCase()
    .replace(/\b(unit|u|lot|shop|tncy|tenancy|suite|level|floor|bldg|building)\b/g, "")
    .replace(/\b(street|st|road|rd|avenue|ave|drive|dr|place|pl|court|ct|way|crescent|cres|boulevard|blvd|lane|ln)\b/g, (m) => {
      const map = { street: "st", road: "rd", avenue: "ave", drive: "dr", place: "pl",
        court: "ct", crescent: "cres", boulevard: "blvd", lane: "ln" };
      return map[m] || m;
    })
    .replace(/[,\.\-\/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Simple token overlap score between two normalised addresses */
function addressScore(a, b) {
  if (!a || !b) return 0;
  const tokA = new Set(a.split(" ").filter(t => t.length > 2));
  const tokB = new Set(b.split(" ").filter(t => t.length > 2));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) if (tokB.has(t)) overlap++;
  return overlap / Math.max(tokA.size, tokB.size);
}

/** Normalise a customer/business name for fuzzy comparison */
function normaliseName(n) {
  if (!n) return "";
  return n
    .toLowerCase()
    .replace(/\b(pty|ltd|limited|pty ltd|the|and|&)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token overlap score for names */
function nameScore(a, b) {
  if (!a || !b) return 0;
  const tokA = new Set(normaliseName(a).split(" ").filter(t => t.length > 1));
  const tokB = new Set(normaliseName(b).split(" ").filter(t => t.length > 1));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) if (tokB.has(t)) overlap++;
  return overlap / Math.max(tokA.size, tokB.size);
}

// ─────────────────────────────────────────────────────────────────────────────
// Load data
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== Loading data from database ===");

// All active Vocus NBN services (not yet matched)
const [vocusNbn] = await conn.query(
  `SELECT vocusServiceId, avcId, address, username, customerName, serviceStatus
   FROM vocus_nbn_services
   WHERE serviceStatus = 'active'`
);
console.log(`Vocus NBN active: ${vocusNbn.length}`);

// All active Vocus Mobile SIMs (not yet matched)
const [vocusMobile] = await conn.query(
  `SELECT vocusServiceId, msn, customerName, serviceScope, serviceStatus
   FROM vocus_mobile_services
   WHERE serviceStatus = 'active'`
);
console.log(`Vocus Mobile active: ${vocusMobile.length}`);

// All SmileTel services with AVC IDs
const [svcWithAvc] = await conn.query(
  `SELECT externalId, connectionId, locationAddress, phoneNumber, customerExternalId, customerName, serviceType
   FROM services
   WHERE connectionId IS NOT NULL AND connectionId != ''
   AND status != 'terminated'`
);
console.log(`SmileTel services with AVC/connectionId: ${svcWithAvc.length}`);

// All SmileTel services with phone numbers
const [svcWithPhone] = await conn.query(
  `SELECT externalId, phoneNumber, locationAddress, customerExternalId, customerName, serviceType
   FROM services
   WHERE phoneNumber IS NOT NULL AND phoneNumber != ''
   AND status != 'terminated'`
);
console.log(`SmileTel services with phone numbers: ${svcWithPhone.length}`);

// All SmileTel customers for name matching
const [customers] = await conn.query(
  `SELECT externalId, name, businessName, siteAddress
   FROM customers
   WHERE name IS NOT NULL`
);
console.log(`SmileTel customers: ${customers.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// NBN Matching
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== NBN Matching ===");

// Build AVC → service lookup
const avcToService = new Map();
for (const svc of svcWithAvc) {
  if (svc.connectionId && svc.connectionId.startsWith("AVC")) {
    avcToService.set(svc.connectionId.trim().toUpperCase(), svc);
  }
}

let nbnExactMatches = 0;
let nbnAddressMatches = 0;
let nbnUnmatched = 0;
const nbnUpdates = [];

for (const vn of vocusNbn) {
  const avcKey = vn.avcId?.trim().toUpperCase();

  // 1. Exact AVC match
  if (avcKey && avcToService.has(avcKey)) {
    const svc = avcToService.get(avcKey);
    if (svc.customerExternalId) {
      nbnUpdates.push({
        vocusServiceId: vn.vocusServiceId,
        internalServiceExternalId: svc.externalId,
        internalCustomerExternalId: svc.customerExternalId,
        matchType: "avc",
        matchConfidence: "1.00",
        matchedField: `AVC: ${avcKey}`,
      });
      nbnExactMatches++;
      continue;
    }
  }

  // 2. Address fuzzy match
  const vocusAddr = normaliseAddress(vn.address);
  let bestScore = 0;
  let bestSvc = null;

  for (const svc of svcWithAvc) {
    const svcAddr = normaliseAddress(svc.locationAddress);
    const score = addressScore(vocusAddr, svcAddr);
    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      bestSvc = svc;
    }
  }

  if (bestSvc && bestSvc.customerExternalId) {
    nbnUpdates.push({
      vocusServiceId: vn.vocusServiceId,
      internalServiceExternalId: bestSvc.externalId,
      internalCustomerExternalId: bestSvc.customerExternalId,
      matchType: "address",
      matchConfidence: bestScore.toFixed(2),
      matchedField: `Addr score ${bestScore.toFixed(2)}: "${vn.address}" ~ "${bestSvc.locationAddress}"`,
    });
    nbnAddressMatches++;
  } else {
    nbnUnmatched++;
  }
}

console.log(`NBN exact AVC matches: ${nbnExactMatches}`);
console.log(`NBN address fuzzy matches: ${nbnAddressMatches}`);
console.log(`NBN unmatched: ${nbnUnmatched}`);

// Apply NBN updates
if (nbnUpdates.length > 0) {
  console.log(`\nApplying ${nbnUpdates.length} NBN matches...`);
  for (const u of nbnUpdates) {
    await conn.query(
      `UPDATE vocus_nbn_services SET
         internalServiceExternalId = ?,
         internalCustomerExternalId = ?,
         matchType = ?,
         matchConfidence = ?,
         updatedAt = NOW()
       WHERE vocusServiceId = ?`,
      [u.internalServiceExternalId, u.internalCustomerExternalId, u.matchType, u.matchConfidence, u.vocusServiceId]
    );
  }
  console.log("NBN matches applied.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile SIM Matching
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== Mobile SIM Matching ===");

// Build phone → service lookup (normalised)
const phoneToService = new Map();
for (const svc of svcWithPhone) {
  const norm = normalisePhone(svc.phoneNumber);
  if (norm) phoneToService.set(norm, svc);
}

let mobilePhoneMatches = 0;
let mobileNameMatches = 0;
let mobileUnmatched = 0;
const mobileUpdates = [];

for (const vm of vocusMobile) {
  const msnNorm = normalisePhone(vm.msn);

  // 1. Exact phone/MSN match
  if (msnNorm && phoneToService.has(msnNorm)) {
    const svc = phoneToService.get(msnNorm);
    if (svc.customerExternalId) {
      mobileUpdates.push({
        vocusServiceId: vm.vocusServiceId,
        internalServiceExternalId: svc.externalId,
        internalCustomerExternalId: svc.customerExternalId,
        matchType: "msn",
        matchConfidence: "1.00",
        matchedField: `MSN: ${vm.msn} → ${svc.phoneNumber}`,
      });
      mobilePhoneMatches++;
      continue;
    }
  }

  // 2. Customer name fuzzy match against customers table
  const vocusName = vm.customerName;
  if (!vocusName || vocusName === "N/A") {
    mobileUnmatched++;
    continue;
  }

  let bestScore = 0;
  let bestCustomer = null;

  for (const cust of customers) {
    const nameS = nameScore(vocusName, cust.name);
    const bizS = nameScore(vocusName, cust.businessName);
    const score = Math.max(nameS, bizS);
    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      bestCustomer = cust;
    }
  }

  if (bestCustomer) {
    mobileUpdates.push({
      vocusServiceId: vm.vocusServiceId,
      internalServiceExternalId: null,
      internalCustomerExternalId: bestCustomer.externalId,
      matchType: "name",
      matchConfidence: bestScore.toFixed(2),
      matchedField: `Name score ${bestScore.toFixed(2)}: "${vocusName}" ~ "${bestCustomer.name}"`,
    });
    mobileNameMatches++;
  } else {
    mobileUnmatched++;
  }
}

console.log(`Mobile exact MSN matches: ${mobilePhoneMatches}`);
console.log(`Mobile name fuzzy matches: ${mobileNameMatches}`);
console.log(`Mobile unmatched: ${mobileUnmatched}`);

// Apply Mobile updates
if (mobileUpdates.length > 0) {
  console.log(`\nApplying ${mobileUpdates.length} Mobile matches...`);
  for (const u of mobileUpdates) {
    await conn.query(
      `UPDATE vocus_mobile_services SET
         internalServiceExternalId = ?,
         internalCustomerExternalId = ?,
         matchType = ?,
         matchConfidence = ?,
         updatedAt = NOW()
       WHERE vocusServiceId = ?`,
      [u.internalServiceExternalId, u.internalCustomerExternalId, u.matchType, u.matchConfidence, u.vocusServiceId]
    );
  }
  console.log("Mobile matches applied.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== MATCH SUMMARY ===");
console.log(`NBN:    ${nbnExactMatches} exact AVC + ${nbnAddressMatches} address fuzzy = ${nbnExactMatches + nbnAddressMatches} matched / ${vocusNbn.length} total (${nbnUnmatched} unmatched)`);
console.log(`Mobile: ${mobilePhoneMatches} exact MSN + ${mobileNameMatches} name fuzzy = ${mobilePhoneMatches + mobileNameMatches} matched / ${vocusMobile.length} total (${mobileUnmatched} unmatched)`);

// Print sample of name matches for review
console.log("\n--- Sample NBN address matches (review) ---");
nbnUpdates.filter(u => u.matchType === "address").slice(0, 10).forEach(u => {
  console.log(`  ${u.vocusServiceId}: ${u.matchedField}`);
});

console.log("\n--- Sample Mobile name matches (review) ---");
mobileUpdates.filter(u => u.matchType === "name").slice(0, 10).forEach(u => {
  console.log(`  ${u.vocusServiceId}: ${u.matchedField}`);
});

await conn.end();
console.log("\nDone.");
