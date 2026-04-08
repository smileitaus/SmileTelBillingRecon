import mysql from 'mysql2/promise';
import fs from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check Vocus file phone formats
const raw = fs.readFileSync('/home/ubuntu/upload/pasted_content_6.txt', 'utf8');
const lines = raw.split('\n').filter(l => l.trim() && l.length > 10);
const dataLines = lines.filter(l => !l.startsWith('Client Name')).slice(0, 5);

console.log('Sample Vocus file columns:');
dataLines.forEach(line => {
  const cols = line.split('\t');
  console.log('CarrierID(col10):', cols[10], '| MSN(col14):', cols[14], '| SimCard(col15):', cols[15]?.substring(0,20));
});

// The DB stores numbers like 0478489702 (starting with 04784...)
// The Vocus file MSN field has 478489702 (9 digits, no leading 0)
// The CarrierID field has 61478489702 (with 61 country code)
// So we need to normalize: prepend 0 to MSN field values

const norm = (n) => {
  if (!n) return '';
  n = n.replace(/\s/g,'').replace(/[^0-9]/g,'');
  if (n.startsWith('61')) n = '0' + n.slice(2);
  if (n.length === 9 && !n.startsWith('0')) n = '0' + n;
  return n;
};

// Parse all Vocus SIMs
const vocusSims = [];
const seen = new Set();
for (const line of lines.filter(l => !l.startsWith('Client Name'))) {
  const cols = line.split('\t');
  if (cols.length < 15) continue;
  const vocusServiceId = cols[1]?.trim();
  const msn = cols[14]?.trim();
  const carrierId = cols[10]?.trim();
  if (!vocusServiceId || seen.has(vocusServiceId)) continue;
  seen.add(vocusServiceId);
  
  const normalizedMsn = norm(msn) || norm(carrierId);
  if (normalizedMsn) {
    vocusSims.push({
      clientName: cols[0]?.trim(),
      vocusServiceId,
      contactName: cols[2]?.trim(),
      address: cols[3]?.trim(),
      city: cols[5]?.trim(),
      state: cols[6]?.trim(),
      postCode: cols[7]?.trim(),
      planType: cols[8]?.trim(),
      carrierId: cols[10]?.trim(),
      msn: normalizedMsn,
      rawMsn: msn,
      simCard: cols[15]?.trim(),
      serviceLabel: cols[21]?.trim(),
      activationDate: cols[24]?.trim(),
      matchedServiceId: cols[36]?.trim(),
      matchedCustomerId: cols[37]?.trim(),
      matchedCustomerName: cols[43]?.trim(),
      matchedBusinessName: cols[44]?.trim(),
      matchedEmail: cols[45]?.trim(),
      matchedPhone: cols[46]?.trim(),
    });
  }
}

console.log('\nTotal unique Vocus SIMs:', vocusSims.length);
console.log('Sample normalized MSNs:', vocusSims.slice(0,5).map(v => v.msn));

// Get DB Vocus/Optus data SIMs
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

console.log('\nDB Vocus/Optus Data SIMs:', dbSims.length);
console.log('Sample DB phones:', dbSims.slice(0,5).map(s => s.phoneNumber));

// Get TIAB SIMs for same customers
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
  console.log('\nCustomers with TIAB already:', Object.keys(tiabByCustomer).length);
}

const vocusMsnSet = new Set(vocusSims.map(v => v.msn));
const vocusByMsn = {};
vocusSims.forEach(v => { vocusByMsn[v.msn] = v; });

const dbMsnSet = new Set(dbSims.map(s => norm(s.phoneNumber)));

// Categorize
const inVocusFile = [];   // DB SIM matches Vocus file entry - ACTIVE, replace with TIAB
const notInVocusFile = []; // DB SIM NOT in Vocus file - investigate/flag for termination
const inVocusNotInDb = []; // Vocus file entry NOT in DB - untracked

for (const dbSim of dbSims) {
  const normPhone = norm(dbSim.phoneNumber);
  const tiab = tiabByCustomer[dbSim.customerExternalId] || [];
  if (normPhone && vocusMsnSet.has(normPhone)) {
    inVocusFile.push({ ...dbSim, vocusData: vocusByMsn[normPhone], tiabSims: tiab });
  } else {
    notInVocusFile.push({ ...dbSim, tiabSims: tiab });
  }
}

for (const v of vocusSims) {
  if (!dbMsnSet.has(v.msn)) {
    inVocusNotInDb.push(v);
  }
}

console.log('\n=== RESULTS ===');
console.log('DB SIMs FOUND in Vocus file (active - replace with TIAB):', inVocusFile.length);
console.log('DB SIMs NOT in Vocus file (investigate/flag):', notInVocusFile.length);
console.log('Vocus file entries NOT tracked in DB:', inVocusNotInDb.length);

if (inVocusFile.length > 0) {
  console.log('\nMatched:', inVocusFile.map(s => `${s.customerName} ${s.phoneNumber}`));
}
if (notInVocusFile.length > 0) {
  console.log('\nNot in Vocus file:', notInVocusFile.map(s => `${s.customerName} ${s.phoneNumber} (${s.supplierName})`));
}

fs.writeFileSync('/home/ubuntu/vocus_analysis.json', JSON.stringify({
  inVocusFile, notInVocusFile, inVocusNotInDb,
  summary: {
    totalVocusFile: vocusSims.length,
    totalDbSims: dbSims.length,
    inVocusFile: inVocusFile.length,
    notInVocusFile: notInVocusFile.length,
    inVocusNotInDb: inVocusNotInDb.length
  }
}, null, 2));

console.log('\nSaved to /home/ubuntu/vocus_analysis.json');
await conn.end();
