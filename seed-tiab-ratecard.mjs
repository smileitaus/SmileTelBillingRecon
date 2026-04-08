import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL not set');
const url = new URL(DB_URL);
const conn = await mysql.createConnection({
  host: url.hostname, port: parseInt(url.port || '3306'),
  user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});
console.log('Connected');

// All plans from TIAB MVNO Wholesale Pricebook Jan 2025
const plans = [
  // 4G & 5G Mobile (Voice + Data)
  { id: 'TW-MOB-5GB',    name: 'TW Mobile Plan 5GB',           type: 'mobile',    gb: 5,   cost: 15.00,   tariff: 'UTB:W8095M', voice: true  },
  { id: 'TW-MOB-12GB',   name: 'TW Mobile Plan 12GB',          type: 'mobile',    gb: 12,  cost: 19.25,   tariff: 'UTB:W8087M', voice: true  },
  { id: 'TW-MOB-25GB',   name: 'TW Mobile Plan 25GB',          type: 'mobile',    gb: 25,  cost: 23.63,   tariff: 'UTB:W8088M', voice: true  },
  { id: 'TW-MOB-32GB',   name: 'TW 5G Mobile Plan 32GB',       type: 'mobile',    gb: 32,  cost: 29.55,   tariff: 'UTB:W8054M', voice: true  },
  { id: 'TW-MOB-50GB',   name: 'TW 5G Mobile Plan 50GB',       type: 'mobile',    gb: 50,  cost: 33.38,   tariff: 'UTB:WMPBCM', voice: true  },
  { id: 'TW-MOB-90GB',   name: 'TW 5G Mobile Plan 90GB',       type: 'mobile',    gb: 90,  cost: 39.30,   tariff: 'UTB:W8055M', voice: true  },
  { id: 'TW-MOB-120GB',  name: 'TW 5G Mobile Plan 120GB',      type: 'mobile',    gb: 120, cost: 46.47,   tariff: 'UTB:W5LXAM', voice: true  },
  { id: 'TW-MOB-150GB',  name: 'TW 5G Mobile Plan 150GB',      type: 'mobile',    gb: 150, cost: 50.74,   tariff: 'UTB:W8056M', voice: true  },
  { id: 'TW-MOB-180GB',  name: 'TW 5G Mobile Plan 180GB',      type: 'mobile',    gb: 180, cost: 54.88,   tariff: 'UTB:W180AM', voice: true  },
  // 4G & 5G Pooling
  { id: 'TW-POOL-10GB',  name: 'TW Mobile Pool 10GB',          type: 'pooling',   gb: 10,  cost: 21.68,   tariff: 'UTB:W5LXDM', voice: true  },
  { id: 'TW-POOL-30GB',  name: 'TW Mobile Pool 30GB',          type: 'pooling',   gb: 30,  cost: 29.89,   tariff: 'UTB:W5LXEM', voice: true  },
  { id: 'TW-POOL-45GB',  name: 'TW 5G Mobile Pool 45GB',       type: 'pooling',   gb: 45,  cost: 39.89,   tariff: 'UTB:W5LXFM', voice: true  },
  { id: 'TW-POOL-60GB',  name: 'TW 5G Mobile Pool 60GB',       type: 'pooling',   gb: 60,  cost: 49.91,   tariff: 'UTB:W5LXCM', voice: true  },
  { id: 'TW-DPOOL-10GB', name: 'TW Data Only Pool 10GB',       type: 'pooling',   gb: 10,  cost: 16.93,   tariff: 'UTB:WP10BM', voice: false },
  { id: 'TW-DPOOL-30GB', name: 'TW Data Only Pool 30GB',       type: 'pooling',   gb: 30,  cost: 25.00,   tariff: 'UTB:WP30BM', voice: false },
  { id: 'TW-DPOOL-45GB', name: 'TW 5G Data Only Pool 45GB',    type: 'pooling',   gb: 45,  cost: 35.25,   tariff: 'UTB:WP45AM', voice: false },
  { id: 'TW-DPOOL-60GB', name: 'TW 5G Data Only Pool 60GB',    type: 'pooling',   gb: 60,  cost: 45.51,   tariff: 'UTB:WP60AM', voice: false },
  // Mobile Broadband (Data Only)
  { id: 'TW-DATA-12GB',  name: 'TW Data Only 12GB',            type: 'broadband', gb: 12,  cost: 16.01,   tariff: 'UTB:WMBWCM', voice: false },
  { id: 'TW-DATA-25GB',  name: 'TW Data Only 25GB',            type: 'broadband', gb: 25,  cost: 19.21,   tariff: 'UTB:WMBWDM', voice: false },
  { id: 'TW-DATA-32GB',  name: 'TW 5G Data Only 32GB',         type: 'broadband', gb: 32,  cost: 25.53,   tariff: 'UTB:WMBWEM', voice: false },
  { id: 'TW-DATA-50GB',  name: 'TW 5G Data Only 50GB',         type: 'broadband', gb: 50,  cost: 29.61,   tariff: 'UTB:WMBWFM', voice: false },
  { id: 'TW-DATA-90GB',  name: 'TW 5G Data Only 90GB',         type: 'broadband', gb: 90,  cost: 35.63,   tariff: 'UTB:WMBWGM', voice: false },
  { id: 'TW-DATA-120GB', name: 'TW 5G Data Only 120GB',        type: 'broadband', gb: 120, cost: 43.15,   tariff: 'UTB:WMBWJM', voice: false },
  { id: 'TW-DATA-150GB', name: 'TW 5G Data Only 150GB',        type: 'broadband', gb: 150, cost: 48.23,   tariff: 'UTB:WMBWHM', voice: false },
  { id: 'TW-DATA-180GB', name: 'TW 5G Data Only 180GB',        type: 'broadband', gb: 180, cost: 51.97,   tariff: 'UTB:W180CM', voice: false },
  { id: 'TW-DATA-400GB', name: 'TW 5G Data Only 400GB',        type: 'broadband', gb: 400, cost: 61.40,   tariff: 'UTB:WMBNKM', voice: false },
  // Bolt-ons
  { id: 'TW-BOLT-5GB',   name: '5GB Recurring Bolt-on',        type: 'bolt_on',   gb: 5,   cost: 27.70,   tariff: 'UTB:B823',   voice: false },
  { id: 'TW-BOLT-2GB',   name: '2GB Auto Bolt-on',             type: 'bolt_on',   gb: 2,   cost: 7.90,    tariff: 'UTB:B824',   voice: false },
  { id: 'TW-BOLT-1GB',   name: '1GB One-off Bolt-on',          type: 'bolt_on',   gb: 1,   cost: 7.90,    tariff: 'UTB:B822',   voice: false },
  { id: 'TW-BOLT-10GB',  name: '10GB Auto Bolt-on (MB)',       type: 'bolt_on',   gb: 10,  cost: 47.15,   tariff: 'UTB:BF21',   voice: false },
  // SIM Card
  { id: 'TW-SIM-4G',     name: 'Prima Mobile 4G SIM',          type: 'sim',       gb: 0,   cost: 3.50,    tariff: 'N/A',        voice: false },
];

console.log(`Seeding ${plans.length} plans into tiab_plans...`);
let ins = 0, upd = 0;
for (const p of plans) {
  const desc = `${p.type === 'pooling' ? 'Pooling: ' : ''}${p.gb > 0 ? p.gb + 'GB' : ''} ${p.voice ? '+ Voice/SMS' : 'Data Only'} | Tariff: ${p.tariff}`.trim();
  const [r] = await conn.execute(
    `INSERT INTO tiab_plans (tiabPlanId, planName, planType, baseCharge, dataAllowanceGb, description, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE planName=VALUES(planName), planType=VALUES(planType), baseCharge=VALUES(baseCharge), dataAllowanceGb=VALUES(dataAllowanceGb), description=VALUES(description), status='active'`,
    [p.id, p.name, p.type, p.cost, p.gb, desc]
  );
  if (r.affectedRows === 1) { ins++; console.log(`  + ${p.name}: $${p.cost}/mo`); }
  else { upd++; console.log(`  ~ ${p.name}: $${p.cost}/mo (updated)`); }
}
console.log(`Plans: ${ins} inserted, ${upd} updated`);

// Apply costs to tiab_services using planName matching
console.log('\nApplying costs to tiab_services...');
const mappings = [
  // Retail Data Plan = TW Data Only 12GB ($16.01/mo per SIM)
  { octane: 'Retail Data Plan',         planId: 'TW-DATA-12GB', cost: 16.01 },
  // ST Data Pool 60GB = TW 5G Mobile Pool 60GB ($49.91/mo per SIM in pool)
  { octane: 'ST Data Pool 60GB',        planId: 'TW-POOL-60GB', cost: 49.91 },
  { octane: 'TW Mobile Plan 5GB',       planId: 'TW-MOB-5GB',   cost: 15.00 },
  { octane: 'TW Mobile Plan 12GB',      planId: 'TW-MOB-12GB',  cost: 19.25 },
  { octane: 'TW Mobile Plan 25GB',      planId: 'TW-MOB-25GB',  cost: 23.63 },
  { octane: 'TW 5G Mobile Plan 50GB',   planId: 'TW-MOB-50GB',  cost: 33.38 },
  { octane: 'TW 5G Mobile Plan 90GB',   planId: 'TW-MOB-90GB',  cost: 39.30 },
  { octane: 'TW Data Only 12GB',        planId: 'TW-DATA-12GB', cost: 16.01 },
  { octane: 'TW Data Only 25GB',        planId: 'TW-DATA-25GB', cost: 19.21 },
  { octane: 'TW 5G Data Only 50GB',     planId: 'TW-DATA-50GB', cost: 29.61 },
  { octane: 'TW 5G Data Only 90GB',     planId: 'TW-DATA-90GB', cost: 35.63 },
];

let svcUpd = 0;
for (const m of mappings) {
  const [r] = await conn.execute(
    `UPDATE tiab_services SET planId=? WHERE planName=?`,
    [m.planId, m.octane]
  );
  if (r.affectedRows > 0) {
    console.log(`  ✓ "${m.octane}": ${r.affectedRows} services -> $${m.cost}/mo`);
    svcUpd += r.affectedRows;
  }
}
console.log(`tiab_services updated: ${svcUpd} rows`);

// Summary
const [pc] = await conn.execute(`SELECT COUNT(*) as c FROM tiab_plans WHERE status='active'`);
const [sc] = await conn.execute(`SELECT COUNT(*) as c, planName FROM tiab_services WHERE planId IS NOT NULL GROUP BY planName`);
console.log(`\nSummary: ${pc[0].c} active plans in rate card`);
for (const r of sc) console.log(`  ${r.planName}: ${r.c} services mapped`);

await conn.end();
console.log('\nDone!');
