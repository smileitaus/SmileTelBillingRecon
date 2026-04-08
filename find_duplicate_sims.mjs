import mysql from 'mysql2/promise';
import fs from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all mobile/data SIM services across all suppliers (not terminated)
const [rows] = await conn.execute(`
  SELECT 
    s.customerExternalId,
    s.customerName,
    c.status as custStatus,
    c.siteAddress,
    c.contactEmail,
    c.billingPlatforms,
    s.externalId as serviceId,
    s.supplierName,
    s.planName,
    s.phoneNumber,
    s.simSerialNumber,
    s.status as svcStatus,
    s.serviceActivationDate,
    s.monthlyCost,
    s.locationAddress,
    s.terminationNote
  FROM services s
  LEFT JOIN customers c ON s.customerExternalId = c.externalId
  WHERE s.serviceType = 'Data'
  AND s.supplierName IN ('Vocus','Optus','ABB','TIAB')
  AND s.status NOT IN ('terminated','Ceased')
  ORDER BY s.customerExternalId, s.supplierName, s.status
`);

console.log('Total SIM service records found:', rows.length);

// Group by customer
const byCustomer = new Map();
for (const r of rows) {
  const key = r.customerExternalId || ('NO_ID_' + r.customerName);
  if (!byCustomer.has(key)) {
    byCustomer.set(key, {
      custId: r.customerExternalId,
      custName: r.customerName,
      custStatus: r.custStatus,
      siteAddress: r.siteAddress,
      email: r.contactEmail,
      billing: r.billingPlatforms,
      sims: []
    });
  }
  byCustomer.get(key).sims.push({
    id: r.serviceId,
    supplier: r.supplierName,
    plan: r.planName,
    phone: r.phoneNumber,
    serial: r.simSerialNumber,
    status: r.svcStatus,
    activated: r.serviceActivationDate,
    cost: r.monthlyCost,
    address: r.locationAddress,
    note: r.terminationNote
  });
}

// Filter to customers with 2+ SIMs
const duplicates = [...byCustomer.values()].filter(c => c.sims.length >= 2);
duplicates.sort((a, b) => b.sims.length - a.sims.length);

console.log('\nCustomers with 2+ SIM services:', duplicates.length);
console.log('\nBreakdown:');
duplicates.forEach(c => {
  const flagged = c.sims.filter(s => s.status === 'flagged_for_termination').length;
  const active = c.sims.filter(s => s.status === 'active').length;
  const suppliers = [...new Set(c.sims.map(s => s.supplier))].join('+');
  console.log(`  ${c.custId || '—'} ${c.custName}: ${c.sims.length} SIMs [${suppliers}] active:${active} flagged:${flagged}`);
  c.sims.forEach(s => console.log(`    [${s.status}] ${s.supplier} ${s.phone || 'no phone'} — ${s.plan}`));
});

// Categorise each duplicate customer
const categorised = duplicates.map(c => {
  const activeSims = c.sims.filter(s => s.status === 'active');
  const flaggedSims = c.sims.filter(s => s.status === 'flagged_for_termination');
  const tiabSims = c.sims.filter(s => s.supplier === 'TIAB');
  const vocusSims = c.sims.filter(s => s.supplier === 'Vocus' || s.supplier === 'Optus');
  const abbSims = c.sims.filter(s => s.supplier === 'ABB');
  const suppliers = [...new Set(c.sims.map(s => s.supplier))];

  let flag = '';
  let recommendation = '';
  let reason = '';

  if (tiabSims.length > 0 && (vocusSims.length > 0 || abbSims.length > 0)) {
    const legacyFlagged = [...vocusSims, ...abbSims].filter(s => s.status === 'flagged_for_termination').length;
    const legacyActive = [...vocusSims, ...abbSims].filter(s => s.status === 'active').length;
    if (legacyFlagged > 0 && legacyActive === 0) {
      flag = '🟡 TIAB + Legacy (flagged)';
      recommendation = 'Confirm TIAB active, then complete legacy cancellation';
      reason = `Customer has ${tiabSims.length} TIAB SIM(s) and ${legacyFlagged} legacy SIM(s) already flagged for termination. Verify TIAB is working, then action the cancellation.`;
    } else {
      flag = '🔴 TIAB + Active Legacy — ACTION REQUIRED';
      recommendation = 'Confirm TIAB is active and working, then cancel legacy SIM(s)';
      reason = `Customer has both a TIAB SIM and ${legacyActive} active legacy (${suppliers.filter(s => s !== 'TIAB').join('/')}) SIM(s). The legacy SIM(s) should be cancelled once TIAB is confirmed operational.`;
    }
  } else if (tiabSims.length >= 2) {
    flag = '🔴 MULTIPLE TIAB SIMs — INVESTIGATE';
    recommendation = 'Investigate — customer has more than one TIAB SIM';
    reason = `Customer has ${tiabSims.length} TIAB SIMs. This may be intentional (e.g. multiple sites/routers) or a provisioning error. Confirm with the site how many routers are in use.`;
  } else if (vocusSims.length >= 2 || abbSims.length >= 2) {
    flag = '🔴 MULTIPLE LEGACY SIMs — INVESTIGATE';
    recommendation = 'Investigate — customer has multiple SIMs on same legacy supplier';
    reason = `Customer has ${c.sims.length} SIMs all on legacy supplier(s). May indicate multiple routers/devices at the same site, or duplicates. Confirm with site before cancelling any.`;
  } else {
    flag = '⚠️ MIXED SUPPLIERS';
    recommendation = 'Review — multiple SIMs across different suppliers';
    reason = `Customer has SIMs across ${suppliers.join(', ')}. Review to determine which is the primary backup SIM and which should be cancelled.`;
  }

  return {
    ...c,
    totalSims: c.sims.length,
    activeSims: activeSims.length,
    flaggedSims: flaggedSims.length,
    tiabCount: tiabSims.length,
    vocusCount: vocusSims.length,
    abbCount: abbSims.length,
    suppliers: suppliers.join(' + '),
    flag,
    recommendation,
    reason
  };
});

fs.writeFileSync('/tmp/duplicate_sims.json', JSON.stringify(categorised, null, 2));
console.log('\nSaved to /tmp/duplicate_sims.json');

await conn.end();
