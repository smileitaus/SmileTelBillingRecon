/**
 * Standalone script: bulk auto-assign all high-confidence unmatched services.
 * Run with: npx tsx run_bulk_assign.ts
 */
import { bulkAutoAssignHighConfidence } from "./server/db-bulk-assign";

async function main() {
  console.log("Starting bulk high-confidence auto-assign...");
  const result = await bulkAutoAssignHighConfidence("Admin Bulk Auto-Assign");
  console.log(`\n=== RESULTS ===`);
  console.log(`Total unmatched processed: ${result.totalUnmatched}`);
  console.log(`Assigned: ${result.totalAssigned}`);
  console.log(`Skipped: ${result.totalSkipped}`);
  console.log(`Errors: ${result.totalErrors}`);
  if (result.assigned.length > 0) {
    console.log(`\n--- Assigned ---`);
    for (const a of result.assigned) {
      console.log(`  ${a.serviceExternalId} → ${a.customerName} (${a.reason})`);
    }
  }
  if (result.errors.length > 0) {
    console.log(`\n--- Errors ---`);
    for (const e of result.errors) {
      console.log(`  ${e.serviceExternalId}: ${e.error}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
