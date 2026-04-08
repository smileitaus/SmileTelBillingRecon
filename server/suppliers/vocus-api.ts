/**
 * vocus-api.ts
 * Vocus Wholesale API — Product Inventory sync module.
 *
 * Uses the TMF-standard Product Inventory API to fetch all active Vocus services
 * for SmileTel's wholesale account and upsert them into the services table.
 *
 * API reference: Vocus Developer Portal (https://developer.vocus.com.au)
 * Contact:       vw-api-support@vocus.com.au
 * Auth:          Bearer token via VOCUS_API_KEY env var
 * Base URL:      VOCUS_API_BASE_URL env var (e.g. https://api.vocus.com.au/wholesale/v1)
 *
 * ONBOARDING REQUIRED:
 *   1. Complete API onboarding form with Leigh Harper (Leigh.Harper@vocus.com.au)
 *   2. Obtain API key from Vocus Developer Portal
 *   3. Set VOCUS_API_KEY and VOCUS_API_BASE_URL in project secrets
 *   4. Complete UAT sign-off before production access is enabled
 *
 * Product types mapped:
 *   EPL       → Internet (enterprise point-to-point)
 *   VIE       → Internet (Vocus Internet Express, on-net fibre)
 *   VBU       → Internet (Business Unlimited, NBN EE Low CoS)
 *   VEI       → Internet (Enterprise Internet, NBN EE High CoS)
 *   Access EE → Internet (Ethernet Access)
 */

import { getDb } from "../db";
import { services, supplierSyncLog } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VocusProductInventoryItem {
  id: string;                      // Vocus service/circuit ID
  href?: string;
  name?: string;
  description?: string;
  status: string;                  // 'active' | 'suspended' | 'terminated'
  productOfferingName?: string;    // e.g. 'VBU', 'VIE', 'EPL', 'VEI'
  startDate?: string;
  terminationDate?: string;
  place?: Array<{
    id?: string;
    name?: string;
    role?: string;
    streetNr?: string;
    streetName?: string;
    city?: string;
    stateOrProvince?: string;
    postcode?: string;
    country?: string;
  }>;
  characteristic?: Array<{
    name: string;
    value: string | number;
  }>;
  productPrice?: Array<{
    name?: string;
    priceType?: string;
    recurringChargePeriod?: string;
    price?: { taxIncludedAmount?: { value: number; unit: string } };
  }>;
}

export interface VocusSyncResult {
  logId: number;
  status: "success" | "error" | "partial";
  summary: string;
  servicesFound: number;
  servicesCreated: number;
  servicesUpdated: number;
  errors: string[];
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapProductType(offeringName: string): "Internet" | "Voice" | "Other" {
  const n = (offeringName || "").toUpperCase();
  if (n.includes("VIE") || n.includes("VBU") || n.includes("VEI") || n.includes("EPL") || n.includes("ACCESS EE") || n.includes("ETHERNET")) return "Internet";
  if (n.includes("VOICE") || n.includes("SIP") || n.includes("IPTEL")) return "Voice";
  return "Other";
}

function mapServiceCategory(offeringName: string): string {
  const n = (offeringName || "").toUpperCase();
  if (n.includes("VBU") || n.includes("NBN")) return "data-nbn";
  if (n.includes("VIE") || n.includes("VEI") || n.includes("EPL") || n.includes("ACCESS EE")) return "data-enterprise";
  if (n.includes("VOICE") || n.includes("SIP")) return "voice-licensing";
  return "other";
}

function getCharacteristic(item: VocusProductInventoryItem, name: string): string {
  const char = item.characteristic?.find(c => c.name.toLowerCase() === name.toLowerCase());
  return char ? String(char.value) : "";
}

function buildAddress(item: VocusProductInventoryItem): string {
  const place = item.place?.find(p => p.role === "installationAddress" || p.role === "serviceAddress") || item.place?.[0];
  if (!place) return "";
  const parts = [
    place.streetNr && place.streetName ? `${place.streetNr} ${place.streetName}` : place.name,
    place.city,
    place.stateOrProvince,
    place.postcode,
  ].filter(Boolean);
  return parts.join(", ");
}

function getMonthlyCost(item: VocusProductInventoryItem): number {
  const recurring = item.productPrice?.find(p =>
    p.priceType === "recurring" || p.recurringChargePeriod === "month"
  );
  return recurring?.price?.taxIncludedAmount?.value ?? 0;
}

// ── Main sync function ────────────────────────────────────────────────────────

/**
 * Fetches all active services from the Vocus Product Inventory API and upserts
 * them into the services table. Creates a sync log entry for audit purposes.
 *
 * @param triggeredBy - 'scheduled' | 'manual' | 'system'
 * @returns VocusSyncResult with counts and status
 */
export async function syncVocusProductInventory(triggeredBy: string = "scheduled"): Promise<VocusSyncResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startedAt = Date.now();
  const errors: string[] = [];

  // Create a running log entry
  const [logInsert] = await db.insert(supplierSyncLog).values({
    integration: "vocus_api",
    status: "running",
    triggeredBy,
    startedAt: new Date(),
  });
  const logId = (logInsert as any).insertId as number;

  const apiKey = process.env.VOCUS_API_KEY;
  const baseUrl = process.env.VOCUS_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    const errMsg = "VOCUS_API_KEY or VOCUS_API_BASE_URL not configured. Complete Vocus API onboarding first.";
    await db.update(supplierSyncLog)
      .set({
        status: "error",
        errorMessage: errMsg,
        summary: "Configuration missing — API credentials not set.",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      })
      .where(eq(supplierSyncLog.id, logId));
    return { logId, status: "error", summary: errMsg, servicesFound: 0, servicesCreated: 0, servicesUpdated: 0, errors: [errMsg], durationMs: Date.now() - startedAt };
  }

  let allItems: VocusProductInventoryItem[] = [];

  try {
    // TMF Product Inventory API — paginated fetch
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${baseUrl}/productInventory/v5/product?status=active&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Vocus API error ${response.status}: ${body.slice(0, 200)}`);
      }

      const page: VocusProductInventoryItem[] = await response.json();
      allItems = allItems.concat(page);

      if (page.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }
  } catch (err: any) {
    const errMsg = `API fetch failed: ${err.message}`;
    errors.push(errMsg);
    await db.update(supplierSyncLog)
      .set({
        status: "error",
        errorMessage: errMsg,
        summary: `Sync failed: ${errMsg}`,
        servicesFound: 0,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      })
      .where(eq(supplierSyncLog.id, logId));
    return { logId, status: "error", summary: errMsg, servicesFound: 0, servicesCreated: 0, servicesUpdated: 0, errors, durationMs: Date.now() - startedAt };
  }

  // Upsert each service
  let created = 0;
  let updated = 0;

  for (const item of allItems) {
    if (!item.id) continue;

    const externalId = `VOCUS-${item.id}`;
    const offeringName = item.productOfferingName || getCharacteristic(item, "productOfferingName") || "Vocus Service";
    const address = buildAddress(item);
    const monthlyCost = getMonthlyCost(item);
    const serviceType = mapProductType(offeringName);
    const serviceCategory = mapServiceCategory(offeringName);
    const avcId = getCharacteristic(item, "avcId") || getCharacteristic(item, "circuitId") || getCharacteristic(item, "serviceId") || "";
    const speedTier = getCharacteristic(item, "bandwidth") || getCharacteristic(item, "speed") || "";
    const technology = getCharacteristic(item, "technology") || getCharacteristic(item, "accessType") || "";

    try {
      const existing = await db.select({ id: services.id, monthlyCost: services.monthlyCost })
        .from(services)
        .where(eq(services.externalId, externalId))
        .limit(1);

      if (existing.length === 0) {
        // Create new service record
        await db.insert(services).values({
          externalId,
          serviceId: item.id,
          serviceType,
          serviceCategory,
          planName: offeringName,
          status: item.status === "active" ? "active" : "inactive",
          provider: "Vocus",
          locationAddress: address,
          monthlyCost: String(monthlyCost),
          costSource: "vocus_api",
          avcId,
          speedTier,
          technology,
          openDate: item.startDate || "",
          dataSource: "vocus_api_sync",
        });
        created++;
      } else {
        // Update existing — refresh cost, status, address, AVC ID
        await db.update(services)
          .set({
            planName: offeringName,
            status: item.status === "active" ? "active" : "inactive",
            locationAddress: address || undefined,
            monthlyCost: monthlyCost > 0 ? String(monthlyCost) : existing[0].monthlyCost,
            costSource: monthlyCost > 0 ? "vocus_api" : undefined,
            avcId: avcId || undefined,
            speedTier: speedTier || undefined,
            technology: technology || undefined,
          })
          .where(eq(services.externalId, externalId));
        updated++;
      }
    } catch (err: any) {
      errors.push(`Failed to upsert ${externalId}: ${err.message}`);
    }
  }

  const durationMs = Date.now() - startedAt;
  const status = errors.length === 0 ? "success" : errors.length < allItems.length ? "partial" : "error";
  const summary = `Synced ${allItems.length} Vocus services — ${created} created, ${updated} updated, ${errors.length} errors. Duration: ${(durationMs / 1000).toFixed(1)}s`;

  await db.update(supplierSyncLog)
    .set({
      status,
      summary,
      servicesFound: allItems.length,
      servicesCreated: created,
      servicesUpdated: updated,
      errorMessage: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
      completedAt: new Date(),
      durationMs,
    })
    .where(eq(supplierSyncLog.id, logId));

  return { logId, status, summary, servicesFound: allItems.length, servicesCreated: created, servicesUpdated: updated, errors, durationMs };
}

/**
 * Get the last N sync log entries for the Vocus API integration.
 */
export async function getVocusSyncHistory(limit: number = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(supplierSyncLog)
    .where(eq(supplierSyncLog.integration, "vocus_api"))
    .orderBy(supplierSyncLog.startedAt)
    .limit(limit);
}
