import { recalculateAll } from './server/db';

async function main() {
  console.log('Running recalculateAll...');
  const start = Date.now();
  await recalculateAll();
  console.log(`Done in ${Date.now() - start}ms`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
