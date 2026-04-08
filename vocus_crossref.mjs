import mysql from 'mysql2/promise';
import fs from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const vocus = JSON.parse(fs.readFileSync('/tmp/vocus_parsed.json'));
const vocusByMsn = {};
vocus.forEach(v => { vocusByMsn[v.msn] = v; });
const vocusMsnSet = new Set(Object.keys(vocusByMsn));

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
  AND s.status NOT IN ('terminated','Ceased','flagged_for_termination')
  ORDER BY s.customerName
`);

console.log('DB Vocus/Optus Data SIMs (active):', dbSims.length);

// Get TIAB SIMs for same customers
const custIds = [...new Set(dbSims.map(s => s.customerExternalId).filter(Boolean))];
const tiabByCustomer = {};
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
  for (const t of tiabSims) {
    if (!tiabByCustomer[t.customerExternalId]) tiabByCustomer[t.customerExternalId] = [];
    tiabByCustomer[t.customerExternalId].push(t);
  }
}

const norm = (n) => {
  if (!n) return '';
  n = n.replace(/\s/g,'').replace(/[^0-9]/g,'');
  if (n.startsWith('61')) n = '0' + n.slice(2);
  if (n.length === 9) n = '0' + n;
  return n;
};

const dbMsnSet = new Set(dbSims.map(s => norm(s.phoneNumber)));

const inVocusFile = [];
const notInVocusFile = [];

for (const dbSim of dbSims) {
  const normPhone = norm(dbSim.phoneNumber);
  const tiab = tiabByCustomer[dbSim.customerExternalId] || [];
  if (normPhone && vocusMsnSet.has(normPhone)) {
    inVocusFile.push({ ...dbSim, vocusData: vocusByMsn[normPhone], tiabSims: tiab });
  } else {
    notInVocusFile.push({ ...dbSim, tiabSims: tiab });
  }
}

const inVocusNotInDb = vocus.filter(v => !dbMsnSet.has(v.msn));

console.log('DB SIMs found in Vocus file (active - replace with TIAB):', inVocusFile.length);
console.log('DB SIMs NOT in Vocus file (investigate/flag):', notInVocusFile.length);
console.log('Vocus file entries not tracked in DB:', inVocusNotInDb.length);

console.log('\nMatched DB->Vocus:');
inVocusFile.forEach(s => console.log(' ', s.customerName, s.phoneNumber, '| TIAB replacements:', s.tiabSims.length));

console.log('\nNot in Vocus file:');
notInVocusFile.forEach(s => console.log(' ', s.customerName, s.phoneNumber, s.supplierName, s.status));

fs.writeFileSync('/tmp/vocus_crossref.json', JSON.stringify({ inVocusFile, notInVocusFile, inVocusNotInDb }, null, 2));
console.log('\nSaved to /tmp/vocus_crossref.json');

await conn.end();
