/**
 * Run globalAutoMatchBillingItems + redistributeProportionalRevenue directly
 * Usage: node scripts/run-global-automatch.mjs
 */
import { globalAutoMatchBillingItems, redistributeProportionalRevenue } from '../server/db.ts';

console.log('[AutoMatch] Starting global auto-match at 70% threshold...');
const matchResult = await globalAutoMatchBillingItems(70, 'manual-script');
console.log('[AutoMatch] Result:', JSON.stringify(matchResult, null, 2));

console.log('\n[ProportionalSplit] Redistributing revenue for multi-service billing items...');
const splitResult = await redistributeProportionalRevenue();
console.log('[ProportionalSplit] Result:', JSON.stringify(splitResult, null, 2));
