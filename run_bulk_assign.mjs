/**
 * Calls the bulk high-confidence auto-assign tRPC mutation via HTTP.
 * Run with: node run_bulk_assign.mjs
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Get a session cookie by reading from the running server logs or use a direct DB call
// Instead, we'll use the internal DB directly via tsx
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

// Use tsx to run TypeScript directly
console.log('Running bulk auto-assign via tsx...');
