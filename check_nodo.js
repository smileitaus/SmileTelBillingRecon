const mysql2 = require('mysql2/promise');
async function main() {
  const conn = await mysql2.createConnection(process.env.DATABASE_URL);
  
  const [rows] = await conn.execute(`
    SELECT s.externalId, s.provider, s.serviceType, s.planName, s.monthlyCost,
           s.locationAddress, s.phoneNumber, s.speedTier,
           sba.billingItemExternalId
    FROM services s
    LEFT JOIN service_billing_assignments sba ON sba.serviceExternalId = s.externalId
    WHERE s.customerExternalId = 'C0171'
    AND s.externalId NOT IN (SELECT serviceExternalId FROM unbillable_services)
    ORDER BY s.locationAddress, s.provider, s.externalId
  `);
  
  // Group by location
  const byLoc = {};
  rows.forEach(r => {
    const loc = r.locationAddress || '(No Address)';
    if (!byLoc[loc]) byLoc[loc] = [];
    byLoc[loc].push(r);
  });
  
  Object.entries(byLoc).forEach(([loc, svcs]) => {
    console.log('\nSite:', loc);
    svcs.forEach(s => console.log('  ', s.externalId, s.provider, s.serviceType, (s.planName || '').substring(0,25), 'cost:', s.monthlyCost, 'phone:', s.phoneNumber, 'bi:', s.billingItemExternalId));
  });
  
  await conn.end();
}
main().catch(console.error);
