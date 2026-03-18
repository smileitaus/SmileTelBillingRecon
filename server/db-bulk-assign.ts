/**
 * db-bulk-assign.ts
 * Bulk auto-assign all HIGH CONFIDENCE suggested matches across all unmatched services.
 *
 * Logic:
 *  1. Fetch every service with status='unmatched'
 *  2. For each, run getSuggestedMatches() and pick the first HIGH confidence suggestion
 *  3. If exactly one HIGH confidence match exists (no ambiguity), assign it
 *  4. If multiple HIGH confidence matches exist for the same service, skip (ambiguous)
 *  5. Recalculate customer counts after all assignments
 *  6. Refresh supplier_registry totals for all affected providers
 *  7. Return a detailed audit log
 */

import { eq, sql, count } from "drizzle-orm";
import { getDb } from "./db";
import { services, supplierRegistry } from "../drizzle/schema";
import { getSuggestedMatches, assignServiceToCustomer } from "./db";

export interface BulkAssignResult {
  assigned: AssignedItem[];
  skipped: SkippedItem[];
  errors: ErrorItem[];
  totalUnmatched: number;
  totalAssigned: number;
  totalSkipped: number;
  totalErrors: number;
}

export interface AssignedItem {
  serviceExternalId: string;
  servicePhone: string;
  serviceAddress: string;
  customerExternalId: string;
  customerName: string;
  reason: string;
}

export interface SkippedItem {
  serviceExternalId: string;
  servicePhone: string;
  reason: string;
}

export interface ErrorItem {
  serviceExternalId: string;
  error: string;
}

/** Refresh supplier_registry totalServices and totalMonthlyCost for a given provider name */
async function refreshSupplierRegistryForProvider(providerName: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [totals] = await db
    .select({
      c: count(),
      cost: sql<number>`COALESCE(SUM(monthlyCost), 0)`,
    })
    .from(services)
    .where(eq(services.provider, providerName));
  const totalServices = Number(totals?.c || 0);
  const totalMonthlyCost = Number(totals?.cost || 0);
  const [existing] = await db
    .select({ id: supplierRegistry.id })
    .from(supplierRegistry)
    .where(eq(supplierRegistry.name, providerName))
    .limit(1);
  if (existing) {
    await db
      .update(supplierRegistry)
      .set({
        totalServices,
        totalMonthlyCost: String(totalMonthlyCost.toFixed(2)) as any,
        updatedAt: new Date(),
      })
      .where(eq(supplierRegistry.name, providerName));
  }
}

export async function bulkAutoAssignHighConfidence(
  assignedBy: string = "Bulk Auto-Assign"
): Promise<BulkAssignResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Fetch all unmatched services
  const unmatchedServices = await db
    .select()
    .from(services)
    .where(eq(services.status, "unmatched"));

  const assigned: AssignedItem[] = [];
  const skipped: SkippedItem[] = [];
  const errors: ErrorItem[] = [];
  const affectedProviders = new Set<string>();

  for (const svc of unmatchedServices) {
    try {
      const suggestions = await getSuggestedMatches(svc.externalId);

      // Filter to HIGH confidence only
      const highConfidence = suggestions.filter((s) => s.confidence === "high");

      if (highConfidence.length === 0) {
        skipped.push({
          serviceExternalId: svc.externalId,
          servicePhone: svc.phoneNumber || "",
          reason:
            suggestions.length === 0
              ? "No suggestions found"
              : `Only ${suggestions[0].confidence} confidence matches available`,
        });
        continue;
      }

      if (highConfidence.length > 1) {
        // Multiple high-confidence matches — ambiguous, skip
        const names = highConfidence.map((s) => s.customer.name).join(", ");
        skipped.push({
          serviceExternalId: svc.externalId,
          servicePhone: svc.phoneNumber || "",
          reason: `Ambiguous — ${highConfidence.length} HIGH confidence matches: ${names}`,
        });
        continue;
      }

      // Exactly one HIGH confidence match — assign it
      const match = highConfidence[0];
      await assignServiceToCustomer(svc.externalId, match.customer.externalId);
      if (svc.provider) affectedProviders.add(svc.provider);

      assigned.push({
        serviceExternalId: svc.externalId,
        servicePhone: svc.phoneNumber || "",
        serviceAddress: svc.locationAddress || "",
        customerExternalId: match.customer.externalId,
        customerName: match.customer.name,
        reason: match.reason,
      });
    } catch (err: any) {
      errors.push({
        serviceExternalId: svc.externalId,
        error: err.message || String(err),
      });
    }
  }

  // Refresh supplier registry totals for all providers that had services assigned
  for (const provider of Array.from(affectedProviders)) {
    await refreshSupplierRegistryForProvider(provider);
  }

  return {
    assigned,
    skipped,
    errors,
    totalUnmatched: unmatchedServices.length,
    totalAssigned: assigned.length,
    totalSkipped: skipped.length,
    totalErrors: errors.length,
  };
}

/** Preview only — returns what would be assigned without making any changes */
export async function previewBulkAutoAssignHighConfidence(): Promise<BulkAssignResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const unmatchedServices = await db
    .select()
    .from(services)
    .where(eq(services.status, "unmatched"));

  const assigned: AssignedItem[] = [];
  const skipped: SkippedItem[] = [];
  const errors: ErrorItem[] = [];

  for (const svc of unmatchedServices) {
    try {
      const suggestions = await getSuggestedMatches(svc.externalId);
      const highConfidence = suggestions.filter((s) => s.confidence === "high");

      if (highConfidence.length === 0) {
        skipped.push({
          serviceExternalId: svc.externalId,
          servicePhone: svc.phoneNumber || "",
          reason:
            suggestions.length === 0
              ? "No suggestions found"
              : `Only ${suggestions[0].confidence} confidence matches available`,
        });
        continue;
      }

      if (highConfidence.length > 1) {
        const names = highConfidence.map((s) => s.customer.name).join(", ");
        skipped.push({
          serviceExternalId: svc.externalId,
          servicePhone: svc.phoneNumber || "",
          reason: `Ambiguous — ${highConfidence.length} HIGH confidence matches: ${names}`,
        });
        continue;
      }

      const match = highConfidence[0];
      assigned.push({
        serviceExternalId: svc.externalId,
        servicePhone: svc.phoneNumber || "",
        serviceAddress: svc.locationAddress || "",
        customerExternalId: match.customer.externalId,
        customerName: match.customer.name,
        reason: match.reason,
      });
    } catch (err: any) {
      errors.push({
        serviceExternalId: svc.externalId,
        error: err.message || String(err),
      });
    }
  }

  return {
    assigned,
    skipped,
    errors,
    totalUnmatched: unmatchedServices.length,
    totalAssigned: assigned.length,
    totalSkipped: skipped.length,
    totalErrors: errors.length,
  };
}
