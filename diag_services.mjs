import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Total services
const [[totRow]] = await conn.execute('SELECT COUNT(*) as cnt FROM services');
console.log('Total services:', totRow.cnt);

// Matched vs unmatched
const [[mRow]] = await conn.execute(`SELECT 
  SUM(CASE WHEN customerExternalId IS NOT NULL AND customerExternalId != '' THEN 1 ELSE 0 END) as matched,
  SUM(CASE WHEN customerExternalId IS NULL OR customerExternalId = '' THEN 1 ELSE 0 END) as unmatched
  FROM services`);
console.log('Matched:', mRow.matched, '| Unmatched:', mRow.unmatched);

// Top 10 by cost - are they matched?
const [topCost] = await conn.execute(`
  SELECT externalId, serviceType, provider, planName, locationAddress, customerExternalId, monthlyCost
  FROM services ORDER BY monthlyCost DESC LIMIT 10`);
console.log('\nTop 10 services by cost:');
topCost.forEach(r => console.log(
  `  $${r.monthlyCost} | matched=${!!r.customerExternalId} | ${r.provider} | addr=${r.locationAddress?.slice(0,50)||'none'} | ${r.planName?.slice(0,40)||''}`
));

// Unmatched services with real addresses
const [[addrRow]] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM services 
  WHERE (customerExternalId IS NULL OR customerExternalId = '')
  AND locationAddress IS NOT NULL AND locationAddress != '' AND locationAddress NOT LIKE '%Unknown%'`);
console.log('\nUnmatched services with real addresses:', addrRow.cnt);

// Sample unmatched services with addresses
const [unmatchedAddr] = await conn.execute(`
  SELECT externalId, provider, planName, locationAddress
  FROM services 
  WHERE (customerExternalId IS NULL OR customerExternalId = '')
  AND locationAddress IS NOT NULL AND locationAddress != '' AND locationAddress NOT LIKE '%Unknown%'
  LIMIT 20`);
console.log('Sample unmatched with addresses:');
unmatchedAddr.forEach(r => console.log(`  ${r.provider} | ${r.locationAddress} | ${r.planName?.slice(0,40)||''}`));

// Matched services WITH addresses - how many?
const [[matchedAddrRow]] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM services 
  WHERE customerExternalId IS NOT NULL AND customerExternalId != ''
  AND locationAddress IS NOT NULL AND locationAddress != '' AND locationAddress NOT LIKE '%Unknown%'`);
console.log('\nMatched services with real addresses:', matchedAddrRow.cnt);

// Sample matched services with addresses
const [matchedAddr] = await conn.execute(`
  SELECT s.externalId, s.provider, s.locationAddress, s.customerExternalId, c.name as custName, c.siteAddress
  FROM services s
  JOIN customers c ON s.customerExternalId = c.externalId
  WHERE s.locationAddress IS NOT NULL AND s.locationAddress != '' AND s.locationAddress NOT LIKE '%Unknown%'
  LIMIT 10`);
console.log('Sample matched services with addresses:');
matchedAddr.forEach(r => console.log(
  `  svc=${r.locationAddress?.slice(0,50)} | cust=${r.custName} | custAddr=${r.siteAddress?.slice(0,50)||'none'}`
));

// Check the Unmatched page - what query does it use?
// The page shows 1080 services - check if it includes ALL services or just unmatched
const [[allUnmatched]] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM services 
  WHERE customerExternalId IS NULL OR customerExternalId = ''`);
console.log('\nAll unmatched (null customerExternalId):', allUnmatched.cnt);

// Check if there are services with customerExternalId set but customer doesn't exist
const [[orphaned]] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM services s
  WHERE s.customerExternalId IS NOT NULL AND s.customerExternalId != ''
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.externalId = s.customerExternalId)`);
console.log('Orphaned services (customer deleted):', orphaned.cnt);

await conn.end();
