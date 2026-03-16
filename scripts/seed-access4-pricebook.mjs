/**
 * Seed the supplier_product_cost_map table with Access4 Diamond Advantage Pricebook v3.4
 * Diamond tier pricing = SmileIT's wholesale cost from SasBoss/Access4
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

const SOURCE = 'Access4 Diamond Pricebook v3.4';
const SUPPLIER = 'SasBoss';

const products = [
  // === UCaaS Licensing ===
  { category: 'UCaaS Licensing', productName: 'Office User - Bundled', unit: 'Per Month', rrp: 30.00, wholesaleCost: 18.00 },
  { category: 'UCaaS Licensing', productName: 'Executive User - Bundled', unit: 'Per Month', rrp: 35.00, wholesaleCost: 21.00 },
  { category: 'UCaaS Licensing', productName: 'Office User - Included Calls', unit: 'Per Month', rrp: 25.00, wholesaleCost: 15.00 },
  { category: 'UCaaS Licensing', productName: 'Executive user - Included Calls', unit: 'Per Month', rrp: 30.00, wholesaleCost: 18.00 },
  { category: 'UCaaS Licensing', productName: 'Office User', unit: 'Per Month', rrp: 10.00, wholesaleCost: 6.00 },
  { category: 'UCaaS Licensing', productName: 'Executive User', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00 },
  { category: 'UCaaS Licensing', productName: 'Residential License', unit: 'Per Month', rrp: 6.50, wholesaleCost: 3.90 },
  { category: 'UCaaS Licensing', productName: 'Common Phone License', unit: 'Per Month', rrp: 6.50, wholesaleCost: 3.90 },
  { category: 'UCaaS Licensing', productName: 'Reception Console Web App', unit: 'Per Month', rrp: 79.95, wholesaleCost: 47.97 },
  { category: 'UCaaS Licensing', productName: 'Call Centre Supervisor Web App', unit: 'Per Month', rrp: 49.95, wholesaleCost: 29.97 },
  { category: 'UCaaS Licensing', productName: 'Call Centre Agent Web App', unit: 'Per Month', rrp: 24.00, wholesaleCost: 14.40 },
  { category: 'UCaaS Licensing', productName: 'Call Centre Wall Board', unit: 'Per Month', rrp: 85.00, wholesaleCost: 68.00 },
  { category: 'UCaaS Licensing', productName: 'Business Fax Service', unit: 'Per Month', rrp: 12.00, wholesaleCost: 7.20 },
  { category: 'UCaaS Licensing', productName: 'Basic Call Queue Agent', unit: 'Per Month', rrp: 10.50, wholesaleCost: 6.30 },
  { category: 'UCaaS Licensing', productName: 'Enhanced Call Centre Agent', unit: 'Per Month', rrp: 15.50, wholesaleCost: 9.30 },
  { category: 'UCaaS Licensing', productName: 'Premium Call Centre Agent', unit: 'Per Month', rrp: 25.50, wholesaleCost: 15.30 },
  { category: 'UCaaS Licensing', productName: 'Virtual Park User', unit: 'Per Month', rrp: 5.00, wholesaleCost: 3.00 },
  { category: 'UCaaS Licensing', productName: 'Voicemail User', unit: 'Per Month', rrp: 5.00, wholesaleCost: 3.00 },
  { category: 'UCaaS Licensing', productName: 'Auto Attendant (IVR) with TOD routing', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00 },
  { category: 'UCaaS Licensing', productName: 'Voicemail Add-On for Residential Services', unit: 'Per Month', rrp: 2.50, wholesaleCost: 2.00 },
  { category: 'UCaaS Licensing', productName: 'Fax to Email Add-On', unit: 'Per Month', rrp: 5.00, wholesaleCost: 3.00 },
  { category: 'UCaaS Licensing', productName: 'Soft Phone Desktop - EOS', unit: 'Per Month', rrp: 1.00, wholesaleCost: 0.60 },
  // SasBoss product name variants for UCaaS
  { category: 'UCaaS Licensing', productName: 'SmileTel Essential user', unit: 'Per Month', rrp: 17.00, wholesaleCost: 9.00, notes: 'SasBoss product name. Diamond cost = $9. RRP is SmileIT default retail.' },
  { category: 'UCaaS Licensing', productName: 'SmileTel Essential User Special', unit: 'Per Month', rrp: 22.50, wholesaleCost: 9.00, notes: 'Special pricing variant' },
  { category: 'UCaaS Licensing', productName: 'SmileTel Executive User License', unit: 'Per Month', rrp: 27.00, wholesaleCost: 15.00, notes: 'SasBoss product name for Executive User - Included Calls' },
  { category: 'UCaaS Licensing', productName: 'SmileTel Lite user', unit: 'Per Month', rrp: 12.00, wholesaleCost: 6.00, notes: 'SasBoss product name for Office User' },
  { category: 'UCaaS Licensing', productName: 'SmileTel Basic User License', unit: 'Per Month', rrp: 10.00, wholesaleCost: 6.00, notes: 'SasBoss product name for Office User' },
  { category: 'UCaaS Licensing', productName: 'SmileTel Professional User License', unit: 'Per Month', rrp: 27.00, wholesaleCost: 15.00, notes: 'SasBoss product name for Executive User - Included Calls' },
  { category: 'UCaaS Licensing', productName: 'MC - SmileTel Basic User License', unit: 'Per Month', rrp: 10.00, wholesaleCost: 6.00, notes: 'Multi-channel variant' },
  { category: 'UCaaS Licensing', productName: 'MC - SmileTel Executive User License', unit: 'Per Month', rrp: 27.00, wholesaleCost: 15.00, notes: 'Multi-channel variant' },
  { category: 'UCaaS Licensing', productName: 'MC - SmileTel Lite User License', unit: 'Per Month', rrp: 12.00, wholesaleCost: 6.00, notes: 'Multi-channel variant' },
  { category: 'UCaaS Licensing', productName: 'MC - SmileTel Premium User License', unit: 'Per Month', rrp: 27.00, wholesaleCost: 15.00, notes: 'Multi-channel variant' },
  { category: 'UCaaS Licensing', productName: 'MC (Special - Inc) - Executive User License', unit: 'Per Month', rrp: 30.00, wholesaleCost: 18.00, notes: 'Special included calls variant' },
  { category: 'UCaaS Licensing', productName: 'MC (Special) - Executive User License', unit: 'Per Month', rrp: 12.00, wholesaleCost: 7.20, notes: 'Special variant' },
  { category: 'UCaaS Licensing', productName: 'Huntgroup with Time of Day Routing', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00, notes: 'Auto Attendant / Hunt Group variant' },
  { category: 'UCaaS Licensing', productName: 'Hunt Group Premium', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00 },
  { category: 'UCaaS Licensing', productName: 'Auto Attendant with Time of Day Routing', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00 },
  { category: 'UCaaS Licensing', productName: 'Voicemail', unit: 'Per Month', rrp: 5.00, wholesaleCost: 3.00, notes: 'Voicemail User' },
  { category: 'UCaaS Licensing', productName: 'Voicemail User', unit: 'Per Month', rrp: 5.00, wholesaleCost: 3.00 },
  { category: 'UCaaS Licensing', productName: 'Premium-1', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00, notes: 'Executive User tier' },
  { category: 'UCaaS Licensing', productName: 'Premium-2', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00, notes: 'Executive User tier' },
  { category: 'UCaaS Licensing', productName: 'Premium', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00, notes: 'Executive User tier' },
  { category: 'UCaaS Licensing', productName: 'Premium-3', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00, notes: 'Executive User tier' },
  { category: 'UCaaS Licensing', productName: 'Standard', unit: 'Per Month', rrp: 10.00, wholesaleCost: 6.00, notes: 'Office User tier' },
  { category: 'UCaaS Licensing', productName: 'Lite', unit: 'Per Month', rrp: 10.00, wholesaleCost: 6.00, notes: 'Office User tier' },
  { category: 'UCaaS Licensing', productName: 'Single Number', unit: 'Per Month', rrp: 10.00, wholesaleCost: 6.00 },
  { category: 'UCaaS Licensing', productName: 'Virtual Park User', unit: 'Per Month', rrp: 5.00, wholesaleCost: 3.00 },
  // === UCXcel (UCaaS Licensing) ===
  { category: 'UCaaS Licensing', productName: 'UCXcel Essential', unit: 'Per Month', rrp: 17.00, wholesaleCost: 9.00, notes: 'UCXcel = UCaaS Licensing. Diamond cost $9.' },
  { category: 'UCaaS Licensing', productName: 'UCXcel Lite', unit: 'Per Month', rrp: 12.00, wholesaleCost: 6.00, notes: 'UCXcel Lite = Office User tier' },
  { category: 'UCaaS Licensing', productName: 'UCXcel Professional', unit: 'Per Month', rrp: 27.00, wholesaleCost: 15.00, notes: 'UCXcel Professional = Executive User - Included Calls' },
  { category: 'UCaaS Licensing', productName: 'UCXcel Premium', unit: 'Per Month', rrp: 37.50, wholesaleCost: 21.00, notes: 'UCXcel Premium = Executive User - Bundled' },
  { category: 'UCaaS Licensing', productName: 'UCXcel Webex Basic', unit: 'Per Month', rrp: 23.00, wholesaleCost: 13.80, notes: 'Collaborate Basic User with Cisco Webex' },
  { category: 'UCaaS Licensing', productName: 'UCXcel Hunt Group', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00 },
  { category: 'UCaaS Licensing', productName: 'UCXcel Auto-Attendant', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00 },
  { category: 'UCaaS Licensing', productName: 'UCXcel Call Centre Queue', unit: 'Per Month', rrp: 10.50, wholesaleCost: 6.30 },
  { category: 'UCaaS Licensing', productName: 'UCXcel Basic Queue Agent', unit: 'Per Month', rrp: 10.50, wholesaleCost: 6.30 },
  { category: 'UCaaS Licensing', productName: 'UCXcel Voicemail User', unit: 'Per Month', rrp: 5.00, wholesaleCost: 3.00 },
  // === Third Party Add-Ons ===
  { category: 'Third Party Add-Ons', productName: 'Call Recording - Lite', unit: 'Per Month', rrp: 3.00, wholesaleCost: 2.00 },
  { category: 'Third Party Add-Ons', productName: 'Call Recording - Unlimited', unit: 'Per Month', rrp: 13.00, wholesaleCost: 9.50 },
  { category: 'Third Party Add-Ons', productName: 'Call Recording - AI', unit: 'Per Month', rrp: 25.00, wholesaleCost: 19.00 },
  { category: 'Third Party Add-Ons', productName: 'Call Recording - Unlimited', unit: 'Per Month', rrp: 13.00, wholesaleCost: 9.50 },
  { category: 'Third Party Add-Ons', productName: 'CRM Integration', unit: 'Per Month', rrp: 13.00, wholesaleCost: 10.47 },
  { category: 'Third Party Add-Ons', productName: 'Go Integrator Cara - Solo', unit: 'Per Month', rrp: 2.00, wholesaleCost: 1.60 },
  { category: 'Third Party Add-Ons', productName: 'Go Integrator Cara - Team', unit: 'Per Month', rrp: 4.50, wholesaleCost: 3.60 },
  { category: 'Third Party Add-Ons', productName: 'Go Integrator Cara - Unite', unit: 'Per Month', rrp: 11.00, wholesaleCost: 9.80 },
  { category: 'Third Party Add-Ons', productName: 'Go Integrator Nava - Solo', unit: 'Per Month', rrp: 2.00, wholesaleCost: 1.60 },
  { category: 'Third Party Add-Ons', productName: 'Go Integrator Nava - Unite', unit: 'Per Month', rrp: 11.00, wholesaleCost: 9.80 },
  { category: 'Third Party Add-Ons', productName: 'Go Operator Console', unit: 'Per Month', rrp: 65.00, wholesaleCost: 52.33 },
  { category: 'Third Party Add-Ons', productName: 'Softphone add-on with Cisco Webex', unit: 'Per Month', rrp: 0.00, wholesaleCost: 0.00, notes: 'Free when attached to Executive User' },
  // === Managed Voice / SIP ===
  { category: 'Managed Voice', productName: 'SIP Channel - PAYG', unit: 'Per Month', rrp: 8.60, wholesaleCost: 4.80 },
  { category: 'Managed Voice', productName: 'SIP Channel - Included Calls', unit: 'Per Month', rrp: 50.00, wholesaleCost: 24.00 },
  { category: 'Managed Voice', productName: 'SIP Channel - Purecloud Connector - PAYG', unit: 'Per Month', rrp: 9.95, wholesaleCost: 5.97 },
  { category: 'Managed Voice', productName: 'SIP Channel - CCXP Connector - PAYG', unit: 'Per Month', rrp: 9.95, wholesaleCost: 5.97 },
  { category: 'Managed Voice', productName: 'SIP Channel - CX One Connector - PAYG', unit: 'Per Month', rrp: 9.95, wholesaleCost: 5.97 },
  { category: 'Managed Voice', productName: 'Business Trunk (PAYG)', unit: 'Per Month', rrp: 8.60, wholesaleCost: 4.80, notes: 'SasBoss name for SIP Channel - PAYG' },
  { category: 'Managed Voice', productName: '4 Channels Business SIP', unit: 'Per Month', rrp: 34.40, wholesaleCost: 19.20, notes: '4x SIP Channel PAYG' },
  { category: 'Managed Voice', productName: '3 Channels Business SIP', unit: 'Per Month', rrp: 25.80, wholesaleCost: 14.40, notes: '3x SIP Channel PAYG' },
  { category: 'Managed Voice', productName: 'Operator Connect SIP Trunk', unit: 'Per Month', rrp: 18.00, wholesaleCost: 9.00, notes: 'Microsoft Teams operator connect' },
  // === UC Xpress ===
  { category: 'UC Xpress', productName: 'Essentials', unit: 'Per Month', rrp: 11.25, wholesaleCost: 6.75, notes: 'UC Xpress Essentials per simultaneous call' },
  { category: 'UC Xpress', productName: 'External Channels', unit: 'Per Month', rrp: 8.60, wholesaleCost: 4.80, notes: 'UC Xpress External Channel PAYG' },
  { category: 'UC Xpress', productName: 'External Channel - PAYG', unit: 'Per Month', rrp: 8.60, wholesaleCost: 4.80 },
  // === iCallSuite ===
  { category: 'iCallSuite', productName: 'iCall Suite - Ultimate User Licence', unit: 'Per Month', rrp: 129.00, wholesaleCost: 96.75 },
  { category: 'iCallSuite', productName: 'iCall Suite - Essentials User License', unit: 'Per Month', rrp: 19.00, wholesaleCost: 14.25 },
  { category: 'iCallSuite', productName: 'iCall Suite - Advanced User License', unit: 'Per Month', rrp: 79.00, wholesaleCost: 59.25 },
  // === SMS Gateway ===
  { category: 'SMS Gateway', productName: 'SMS Gateway Instance', unit: 'Per Month', rrp: 5.00, wholesaleCost: 3.00 },
  { category: 'SMS Gateway', productName: 'SMS Gateway - Dedicated Virtual Number', unit: 'Per Month', rrp: 25.00, wholesaleCost: 15.00 },
  // === Number Hosting ===
  { category: 'Number Hosting', productName: 'DID Australia (1)', unit: 'Per Month', rrp: 2.00, wholesaleCost: 0.33, notes: 'DID (AUD) $0.33/month Diamond. SasBoss charges $2 retail.' },
  { category: 'Number Hosting', productName: 'DID Australia (10)', unit: 'Per Month', rrp: 20.00, wholesaleCost: 3.30, notes: '10x DID' },
  { category: 'Number Hosting', productName: 'DID Australia (100)', unit: 'Per Month', rrp: 55.00, wholesaleCost: 33.00, notes: '100x DID' },
  { category: 'Number Hosting', productName: 'Direct In Dial AU Mobile Number (1)', unit: 'Per Month', rrp: 22.50, wholesaleCost: 20.00, notes: 'Mobile DID' },
  { category: 'Number Hosting', productName: 'Inbound 1300 Number Hosting', unit: 'Per Month', rrp: 8.00, wholesaleCost: 6.00 },
  { category: 'Number Hosting', productName: 'Inbound 1800 Number Hosting', unit: 'Per Month', rrp: 8.00, wholesaleCost: 6.00 },
  { category: 'Number Hosting', productName: '13Number', unit: 'Per Month', rrp: 1100.00, wholesaleCost: 900.00, notes: '13 number minimum 12 month rental' },
  // === Call Usage (per minute) ===
  { category: 'Call Usage', productName: 'AU National Outbound Calls', unit: 'Per Minute', rrp: 0.05510, wholesaleCost: 0.03857 },
  { category: 'Call Usage', productName: 'AU Mobile Outbound Calls', unit: 'Per Minute', rrp: 0.13100, wholesaleCost: 0.09167 },
  { category: 'Call Usage', productName: '1300 Inbound Calls', unit: 'Per Minute', rrp: 0.05510, wholesaleCost: 0.03860 },
  { category: 'Call Usage', productName: '1800 Inbound Calls', unit: 'Per Minute', rrp: 0.05950, wholesaleCost: 0.04170 },
  { category: 'Call Usage', productName: 'Local Calls (Not on SIP)', unit: 'Per Call', rrp: 0.10000, wholesaleCost: 0.07023 },
  { category: 'Call Usage', productName: 'Local', unit: 'Per Minute', rrp: 0.10000, wholesaleCost: 0.07023 },
  { category: 'Call Usage', productName: 'National', unit: 'Per Minute', rrp: 0.05510, wholesaleCost: 0.03857 },
  { category: 'Call Usage', productName: 'Mobile', unit: 'Per Minute', rrp: 0.13100, wholesaleCost: 0.09167 },
  { category: 'Call Usage', productName: 'Regional', unit: 'Per Minute', rrp: 0.05510, wholesaleCost: 0.03857 },
  // === eFax ===
  { category: 'Fax', productName: 'eFax', unit: 'Per Month', rrp: 5.00, wholesaleCost: 3.00, notes: 'Fax to Email Add-On' },
  { category: 'Fax', productName: 'eFax Service', unit: 'Per Month', rrp: 5.00, wholesaleCost: 3.00 },
  // === Call Queues ===
  { category: 'UCaaS Licensing', productName: 'Call Centre Queue with Time of Day Routing', unit: 'Per Month', rrp: 15.00, wholesaleCost: 9.00, notes: 'Auto Attendant / Queue' },
  { category: 'UCaaS Licensing', productName: 'Basic Call Queue', unit: 'Per Month', rrp: 10.50, wholesaleCost: 6.30 },
  { category: 'UCaaS Licensing', productName: 'Premium Call Queue', unit: 'Per Month', rrp: 25.50, wholesaleCost: 15.30 },
  // === ME Call Packs ===
  { category: 'Call Packs', productName: 'ME - 3 Included Local National Mobile Call Pack', unit: 'Per Month', rrp: 0.00, wholesaleCost: 0.00, notes: 'Included in Executive User - Included Calls bundle' },
  // === Webex ===
  { category: 'Webex', productName: 'Collaborate Basic User with Cisco Webex', unit: 'Per Month', rrp: 23.00, wholesaleCost: 13.80 },
  { category: 'Webex', productName: 'Collaborate Standard User with Cisco Webex', unit: 'Per Month', rrp: 30.00, wholesaleCost: 18.00 },
  { category: 'Webex', productName: 'Collaborate Premium User with Cisco Webex', unit: 'Per Month', rrp: 50.00, wholesaleCost: 30.00 },
];

// Deduplicate by productName (keep first occurrence)
const seen = new Set();
const uniqueProducts = products.filter(p => {
  if (seen.has(p.productName)) return false;
  seen.add(p.productName);
  return true;
});

console.log(`Seeding ${uniqueProducts.length} products...`);

// Clear existing SasBoss entries
await conn.execute(`DELETE FROM supplier_product_cost_map WHERE supplier = ?`, [SUPPLIER]);

for (const p of uniqueProducts) {
  await conn.execute(
    `INSERT INTO supplier_product_cost_map 
     (supplier, productName, productCategory, unit, rrp, wholesaleCost, defaultRetailPrice, notes, source, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      SUPPLIER,
      p.productName,
      p.category,
      p.unit,
      p.rrp.toFixed(5),
      p.wholesaleCost.toFixed(5),
      (p.defaultRetailPrice ?? p.rrp).toFixed(5),
      p.notes ?? null,
      SOURCE,
    ]
  );
}

console.log(`✓ Seeded ${uniqueProducts.length} SasBoss product cost mappings`);
await conn.end();
