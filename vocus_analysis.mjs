import mysql from 'mysql2/promise';
import fs from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Parse the Vocus file
const raw = fs.readFileSync('/home/ubuntu/upload/pasted_content_6.txt', 'utf8');
const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('Client Name'));

const vocusSims = [];
for (const line of lines) {
  const cols = line.split('\t');
  if (cols.length < 15) continue;
  const clientName = cols[0]?.trim();
  const vocusServiceId = cols[1]?.trim();
  const contactName = cols[2]?.trim();
  const address = cols[3]?.trim();
  const city = cols[5]?.trim();
  const state = cols[6]?.trim();
  const postCode = cols[7]?.trim();
  const planType = cols[8]?.trim();
  const msn = cols[14]?.trim();
  const simCard = cols[15]?.trim();
  const simType = cols[16]?.trim();
  const serviceLabel = cols[21]?.trim();
  const activationDate = cols[24]?.trim();
  const matchedServiceId = cols[36]?.trim();
  const matchedCustomerId = cols[37]?.trim();
  const matchedCustomerName = cols[43]?.trim();
  const matchedBusinessName = cols[44]?.trim();
  const matchedEmail = cols[45]?.trim();
  const matchedPhone = cols[46]?.trim();

  if (msn && msn.length >= 9) {
    vocusSims.push({
      clientName, vocusServiceId, contactName, address, city, state, postCode,
      planType, msn, simCard, simType, serviceLabel, activationDate,
      matchedServiceId, matchedCustomerId, matchedCustomerName, matchedBusinessName,
      matchedEmail, matchedPhone,
      fullAddress: `${address}, ${city} ${state} ${postCode}`
    });
  }
}

// Deduplicate by vocusServiceId (keep first occurrence)
const seen = new Set();
const uniqueVocusSims = vocusSims.filter(v => {
  if (seen.has(v.vocusServiceId)) return false;
  seen.add(v.vocusServiceId);
  return true;
});

console.log('Unique Vocus SIMs from file:', uniqueVocusSims.length);

// Get all Vocus/Optus Data SIMs in DB (not already terminated/flagged)
const [dbSims] = await conn.execute(`
  SELECT s.externalId, s.customerName, s.customerExternalId, s.phoneNumber, s.status,
         s.supplierName, s.planName, s.serviceActivationDate, s.locationAddress, s.monthlyCost,
         s.simSerialNumber, s.discoveryNotes, s.serviceType, s.billingPlatform,
         c.status as custStatus, c.billingPlatforms, c.notes as custNotes,
         c.contactEmail, c.contactPhone, c.siteAddress, c.name as custName
  FROM services s
  LEFT JOIN customers c ON s.customerExternalId = c.externalId
  WHERE s.supplierName IN ('Vocus','Optus')
  AND s.serviceType = 'Data'
  AND s.status NOT IN ('terminated','Ceased')
  ORDER BY s.customerName
`);

console.log('DB Vocus/Optus Data SIMs (active/not terminated):', dbSims.length);

// Also get TIAB SIMs for same customers to check replacement status
const custIds = [...new Set(dbSims.map(s => s.customerExternalId).filter(Boolean))];
let tiabByCustomer = {};
if (custIds.length > 0) {
  const ph = custIds.map(() => '?').join(',');
  const [tiabSims] = await conn.execute(`
    SELECT s.externalId, s.customerExternalId, s.customerName, s.phoneNumber,
           s.status, s.supplierName, s.planName, s.serviceActivationDate, s.simSerialNumber
    FROM services s
    WHERE s.customerExternalId IN (${ph})
    AND s.supplierName = 'TIAB'
    AND s.serviceType = 'Data'
    AND s.status NOT IN ('terminated','Ceased')
  `, custIds);
  tiabSims.forEach(t => {
    if (!tiabByCustomer[t.customerExternalId]) tiabByCustomer[t.customerExternalId] = [];
    tiabByCustomer[t.customerExternalId].push(t);
  });
}

// Normalize phone for comparison
const norm = (n) => n ? n.replace(/\s/g,'').replace(/^\+?61/,'0').replace(/[^0-9]/g,'') : '';

const vocusMsnSet = new Set(uniqueVocusSims.map(v => norm(v.msn)));
const vocusByMsn = {};
uniqueVocusSims.forEach(v => { vocusByMsn[norm(v.msn)] = v; });

const dbMsnSet = new Set(dbSims.map(s => norm(s.phoneNumber)));

// Category 1: DB SIMs that ARE in the Vocus file (active Vocus services - keep but replace with TIAB)
const inVocusFile = [];
// Category 2: DB SIMs NOT in the Vocus file (not on active Vocus list - investigate/flag for termination)
const notInVocusFile = [];
// Category 3: Vocus file entries NOT in DB (in Vocus but not tracked in our system)
const inVocusNotInDb = [];

for (const dbSim of dbSims) {
  const normPhone = norm(dbSim.phoneNumber);
  const tiab = tiabByCustomer[dbSim.customerExternalId] || [];
  if (normPhone && vocusMsnSet.has(normPhone)) {
    inVocusFile.push({ ...dbSim, vocusData: vocusByMsn[normPhone], tiabSims: tiab });
  } else {
    notInVocusFile.push({ ...dbSim, tiabSims: tiab });
  }
}

for (const v of uniqueVocusSims) {
  if (!dbMsnSet.has(norm(v.msn))) {
    inVocusNotInDb.push(v);
  }
}

console.log('\nDB SIMs found in Vocus file (active - replace with TIAB):', inVocusFile.length);
console.log('DB SIMs NOT in Vocus file (investigate/flag for termination):', notInVocusFile.length);
console.log('Vocus file entries NOT in DB (untracked):', inVocusNotInDb.length);

fs.writeFileSync('/home/ubuntu/vocus_analysis.json', JSON.stringify({
  inVocusFile, notInVocusFile, inVocusNotInDb,
  summary: {
    totalVocusFile: uniqueVocusSims.length,
    totalDbSims: dbSims.length,
    inVocusFile: inVocusFile.length,
    notInVocusFile: notInVocusFile.length,
    inVocusNotInDb: inVocusNotInDb.length
  }
}, null, 2));

console.log('\nSaved to /home/ubuntu/vocus_analysis.json');
await conn.end();
