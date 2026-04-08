import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const db = await mysql.createConnection(process.env.DATABASE_URL);

// ============================================================
// TELSTRA PORTAL DATA - parsed from pasted_content_3.txt
// ============================================================

const TELSTRA_ACCOUNTS = {
  '019 2549 800': { type: 'business' },
  '058 6992 900': { type: 'business' },
  '173 0301 900': { type: 'business' },
  '098 7432 800': { type: 'business' },
  '026 2378 800': { type: 'business' },
  '229 3609 800': { type: 'business' },
  '212 6987 800': { type: 'business' },
  '057 9578 800': { type: 'business' },
  '253 4058 800': { type: 'business' },
};

// All services from the portal extraction
const TELSTRA_SERVICES = [
  // Account 019 2549 800
  { account: '019 2549 800', type: 'mobile_broadband', identifier: '0457034187', phone: '0457034187' },
  { account: '019 2549 800', type: 'mobile_broadband', identifier: '0439435762', phone: '0439435762' },
  { account: '019 2549 800', type: 'mobile_broadband', identifier: '0438416257', phone: '0438416257' },
  { account: '019 2549 800', type: 'internet', identifier: 'N2962205R', nNumber: 'N2962205R' },
  { account: '019 2549 800', type: 'internet', identifier: 'N2900207R', nNumber: 'N2900207R' },
  { account: '019 2549 800', type: 'internet', identifier: 'N9728363R', nNumber: 'N9728363R' },
  { account: '019 2549 800', type: 'internet', identifier: 'N9729396R', nNumber: 'N9729396R' },
  { account: '019 2549 800', type: 'voice', identifier: '0891402933', phone: '0891402933' },
  { account: '019 2549 800', type: 'voice', identifier: '0892071868', phone: '0892071868' },
  { account: '019 2549 800', type: 'voice', identifier: '0892775513', phone: '0892775513' },
  { account: '019 2549 800', type: 'voice', identifier: '0893497342', phone: '0893497342' },
  { account: '019 2549 800', type: 'voice', identifier: '0269626495', phone: '0269626495' },
  { account: '019 2549 800', type: 'voice', identifier: '0891724119', phone: '0891724119' },
  { account: '019 2549 800', type: 'voice', identifier: '0892775508', phone: '0892775508' },
  { account: '019 2549 800', type: 'voice', identifier: '0269622841', phone: '0269622841' },

  // Account 058 6992 900 — 161 mobile broadband services
  // Key ones that match known customers
  { account: '058 6992 900', type: 'mobile_broadband', identifier: '0450098564', phone: '0450098564', note: 'Non-broadband mobile' },
  { account: '058 6992 900', type: 'mobile_broadband', identifier: '0499022296', phone: '0499022296', note: 'Non-broadband mobile' },
  // The remaining 159 mobile broadband numbers from account 058 6992 900 are in the DB already as Telstra services
  // We'll match them by phone number in the matching step

  // Account 173 0301 900
  { account: '173 0301 900', type: 'internet', identifier: 'N2681181R', nNumber: 'N2681181R' },
  { account: '173 0301 900', type: 'voice', identifier: '0295503018', phone: '0295503018' },

  // Account 098 7432 800
  { account: '098 7432 800', type: 'internet', identifier: 'N7603728R', nNumber: 'N7603728R' },
  { account: '098 7432 800', type: 'internet', identifier: 'N1974440R', nNumber: 'N1974440R' },
  { account: '098 7432 800', type: 'voice', identifier: '1300988960', phone: '1300988960' },
  { account: '098 7432 800', type: 'voice', identifier: '0733915379', phone: '0733915379' },
  { account: '098 7432 800', type: 'voice', identifier: '0733920253', phone: '0733920253' },

  // Account 026 2378 800
  { account: '026 2378 800', type: 'internet', identifier: 'N1952022R', nNumber: 'N1952022R' },
  { account: '026 2378 800', type: 'voice', identifier: '0249337043', phone: '0249337043' },
  { account: '026 2378 800', type: 'voice', identifier: '0249336497', phone: '0249336497' },

  // Account 229 3609 800
  { account: '229 3609 800', type: 'internet', identifier: 'N6666359R', nNumber: 'N6666359R' },
  { account: '229 3609 800', type: 'voice', identifier: '0262570012', phone: '0262570012' },

  // Account 212 6987 800
  { account: '212 6987 800', type: 'internet', identifier: 'N6503097R', nNumber: 'N6503097R' },
  { account: '212 6987 800', type: 'voice', identifier: '0262626820', phone: '0262626820' },

  // Account 057 9578 800
  { account: '057 9578 800', type: 'internet', identifier: 'N7665409R', nNumber: 'N7665409R' },
  { account: '057 9578 800', type: 'internet', identifier: 'N2681181R', nNumber: 'N2681181R' },
  { account: '057 9578 800', type: 'internet', identifier: 'N6503097R', nNumber: 'N6503097R' },
  { account: '057 9578 800', type: 'voice', identifier: '1300988960', phone: '1300988960' },

  // Account 253 4058 800
  { account: '253 4058 800', type: 'internet', identifier: 'N7665409R', nNumber: 'N7665409R' },

  // BigPond Internet & Phone services (grouped under personal in portal but are SmileTel customers)
  { account: 'bigpond', type: 'internet', identifier: 'ISP1DF88B3E52@bigpond.com', email: 'ISP1DF88B3E52@bigpond.com', note: 'Unlimited, no usage data' },
  { account: 'bigpond', type: 'internet', identifier: 'yiros.albion@bigpond.com', email: 'yiros.albion@bigpond.com', note: 'Unlimited, 0MB used, 26 days left' },
  { account: 'bigpond', type: 'internet', identifier: 'aattard180@bigpond.com', email: 'aattard180@bigpond.com', note: 'Unlimited, 0MB used, 26 days left' },
  { account: 'bigpond', type: 'internet', identifier: 'ISP38DC6E2A3B@bigpond.com', email: 'ISP38DC6E2A3B@bigpond.com', note: 'Unlimited, 26.1GB used, 26 days left' },
  { account: 'bigpond', type: 'internet', identifier: 'dhskjdhds@bigpond.com', email: 'dhskjdhds@bigpond.com', note: 'Unlimited, 32.5GB used, 26 days left' },
  { account: 'bigpond', type: 'internet', identifier: 'alfredo.attard387@bigpond.com', email: 'alfredo.attard387@bigpond.com', note: 'Unlimited, 0MB used, 31 days left' },
  { account: 'bigpond', type: 'internet', identifier: 'terrigaldrive@bigpond.com', email: 'terrigaldrive@bigpond.com', note: 'Unlimited, 0MB used, 31 days left' },
  { account: 'bigpond', type: 'internet', identifier: 'ISP4465C7DF44@bigpond.com', email: 'ISP4465C7DF44@bigpond.com', note: 'Unlimited, 2.4GB used, 31 days left' },
  { account: 'bigpond', type: 'internet', identifier: 'littlechawhitford@bigpond.com', email: 'littlechawhitford@bigpond.com', note: 'Unlimited, 0MB used, 31 days left' },
  { account: 'bigpond', type: 'internet', identifier: 'ISP0354792851@bigpond.com', email: 'ISP0354792851@bigpond.com', note: 'Unlimited, 0MB used, 31 days left' },
  { account: 'bigpond', type: 'internet', identifier: 'ISP29D67F7B91@bigpond.com', email: 'ISP29D67F7B91@bigpond.com', note: 'Unlimited, 0MB used, 31 days left' },
  { account: 'bigpond', type: 'internet', identifier: 'ISP2AF78C5322@bigpond.com', email: 'ISP2AF78C5322@bigpond.com', note: 'Unlimited, 0MB used, 31 days left' },
];

// ============================================================
// STEP 1: Check existing Telstra services in DB
// ============================================================
console.log('\n=== STEP 1: Existing Telstra services in DB ===');
const [existingTelstra] = await db.execute(`
  SELECT s.externalId, s.phoneNumber, s.avcId, s.supplierAccount, s.planName, 
         s.serviceType, s.customerExternalId, c.name as customerName
  FROM services s
  LEFT JOIN customers c ON s.customerExternalId = c.externalId
  WHERE s.provider = 'Telstra'
  ORDER BY s.externalId
  LIMIT 20
`);
console.log(`Total Telstra services in DB (sample of 20):`, existingTelstra.slice(0, 5));

const [telstraCount] = await db.execute(`SELECT COUNT(*) as cnt FROM services WHERE provider = 'Telstra'`);
console.log(`Total Telstra services: ${telstraCount[0].cnt}`);

// ============================================================
// STEP 2: Match by phone number
// ============================================================
console.log('\n=== STEP 2: Matching by phone number ===');
const phoneServices = TELSTRA_SERVICES.filter(s => s.phone);
let phoneMatches = 0;
const phoneMatchResults = [];

for (const svc of phoneServices) {
  // Normalize phone: remove spaces, dashes, leading +61
  const normalized = svc.phone.replace(/\D/g, '').replace(/^61/, '0');
  const [rows] = await db.execute(`
    SELECT s.externalId, s.phoneNumber, s.customerExternalId, c.name as customerName, s.supplierAccount
    FROM services s
    LEFT JOIN customers c ON s.customerExternalId = c.externalId
    WHERE REPLACE(REPLACE(s.phoneNumber, ' ', ''), '-', '') = ?
       OR REPLACE(REPLACE(s.phoneNumber, ' ', ''), '-', '') = ?
    LIMIT 3
  `, [normalized, svc.phone]);
  
  if (rows.length > 0) {
    phoneMatches++;
    phoneMatchResults.push({
      telstraAccount: svc.account,
      phone: svc.phone,
      dbService: rows[0].externalId,
      customer: rows[0].customerName || 'Unmatched',
      currentAccount: rows[0].supplierAccount
    });
  }
}
console.log(`Phone matches: ${phoneMatches} / ${phoneServices.length}`);
phoneMatchResults.slice(0, 10).forEach(r => console.log(`  ${r.phone} → ${r.dbService} (${r.customer}) [acct: ${r.currentAccount || 'none'}]`));

// ============================================================
// STEP 3: Match BigPond email services to customers
// ============================================================
console.log('\n=== STEP 3: BigPond email matching ===');
const bigpondServices = TELSTRA_SERVICES.filter(s => s.email);
const bigpondMatches = [];

// Known mappings from email prefix
const EMAIL_CUSTOMER_HINTS = {
  'yiros.albion': 'yiros',
  'littlechawhitford': 'little cha',
  'alfredo.attard': 'attard',
  'aattard': 'attard',
  'terrigaldrive': 'terrigal',
  'dhskjdhds': null, // unknown
};

for (const svc of bigpondServices) {
  const emailPrefix = svc.email.split('@')[0].toLowerCase();
  
  // Try to find customer by name hint
  let matchedCustomer = null;
  for (const [hint, customerHint] of Object.entries(EMAIL_CUSTOMER_HINTS)) {
    if (emailPrefix.includes(hint) && customerHint) {
      const [rows] = await db.execute(`
        SELECT externalId, name FROM customers 
        WHERE LOWER(name) LIKE ? 
        LIMIT 3
      `, [`%${customerHint}%`]);
      if (rows.length > 0) {
        matchedCustomer = rows[0];
        break;
      }
    }
  }
  
  // Also search existing services for this email/identifier
  const [existingRows] = await db.execute(`
    SELECT s.externalId, s.customerExternalId, c.name as customerName
    FROM services s
    LEFT JOIN customers c ON s.customerExternalId = c.externalId
    WHERE s.planName LIKE ? OR s.supplierAccount LIKE ?
    LIMIT 3
  `, [`%${svc.email}%`, `%${svc.email}%`]);
  
  bigpondMatches.push({
    email: svc.email,
    emailPrefix,
    customerHint: matchedCustomer?.name || 'Unknown',
    customerId: matchedCustomer?.externalId || null,
    existingService: existingRows[0]?.externalId || null,
    existingCustomer: existingRows[0]?.customerName || null,
  });
}

bigpondMatches.forEach(m => console.log(`  ${m.email} → customer: ${m.customerHint} (${m.customerId || 'no match'}), existing svc: ${m.existingService || 'none'}`));

// ============================================================
// STEP 4: Check N-numbers against existing services
// ============================================================
console.log('\n=== STEP 4: N-number matching ===');
const nNumberServices = TELSTRA_SERVICES.filter(s => s.nNumber);
let nMatches = 0;

for (const svc of nNumberServices) {
  const [rows] = await db.execute(`
    SELECT s.externalId, s.customerExternalId, c.name as customerName, s.supplierAccount
    FROM services s
    LEFT JOIN customers c ON s.customerExternalId = c.externalId
    WHERE s.avcId = ? OR s.supplierAccount = ? OR s.connectionId = ?
    LIMIT 3
  `, [svc.nNumber, svc.nNumber, svc.nNumber]);
  
  if (rows.length > 0) {
    nMatches++;
    console.log(`  ${svc.nNumber} (acct ${svc.account}) → ${rows[0].externalId} (${rows[0].customerName || 'Unmatched'})`);
  }
}
console.log(`N-number matches: ${nMatches} / ${nNumberServices.length}`);

// ============================================================
// STEP 5: Check how many of the 058 6992 900 mobile broadband
//          services are already in DB as Telstra services
// ============================================================
console.log('\n=== STEP 5: Account 058 6992 900 mobile broadband coverage ===');
const [acct058] = await db.execute(`
  SELECT COUNT(*) as cnt FROM services 
  WHERE provider = 'Telstra' 
  AND (supplierAccount LIKE '%058%6992%' OR supplierAccount LIKE '%0586992%')
`);
console.log(`Services already tagged with account 058 6992 900: ${acct058[0].cnt}`);

// Count Telstra mobile broadband services total
const [telstraMobile] = await db.execute(`
  SELECT COUNT(*) as cnt FROM services 
  WHERE provider = 'Telstra' 
  AND (serviceType LIKE '%mobile%' OR serviceType LIKE '%Mobile%' OR planName LIKE '%broadband%')
`);
console.log(`Telstra mobile/broadband services in DB: ${telstraMobile[0].cnt}`);

// ============================================================
// STEP 6: Summary
// ============================================================
console.log('\n=== SUMMARY ===');
console.log(`Portal services parsed: ${TELSTRA_SERVICES.length} (+ ~159 mobile broadband from acct 058 not fully listed)`);
console.log(`Phone matches found: ${phoneMatches}`);
console.log(`N-number matches found: ${nMatches}`);
console.log(`BigPond email services: ${bigpondServices.length}`);

await db.end();
