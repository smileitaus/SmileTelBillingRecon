import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Find Light Source Computing customer(s)
const [customers] = await db.execute(
  `SELECT externalId, name, status, billingPlatforms, contactEmail FROM customers 
   WHERE name LIKE '%light%' AND name LIKE '%source%'`
);
console.log('=== LIGHT SOURCE CUSTOMERS ===');
console.log(JSON.stringify(customers, null, 2));

// Find all services for Light Source
if (customers.length > 0) {
  for (const cust of customers) {
    const [services] = await db.execute(
      `SELECT s.externalId, s.serviceType, s.provider, s.planName, s.serviceId, s.monthlyCost, s.monthlyRevenue, s.status, s.connectionId
       FROM services s WHERE s.customerExternalId = ? ORDER BY s.provider, s.serviceType`,
      [cust.externalId]
    );
    console.log(`\n=== SERVICES FOR ${cust.name} (${cust.externalId}) — ${services.length} total ===`);
    services.forEach(s => console.log(`${s.externalId} | ${s.provider} | ${s.serviceType} | ${s.planName} | serviceId:${s.serviceId} | cost:$${s.monthlyCost} | rev:$${s.monthlyRevenue} | ${s.status}`));
  }
}

// Check for ChannelHaus services with ECN-style names (bsip_ prefix in serviceId or planName)
const [channelHaus] = await db.execute(
  `SELECT s.externalId, s.serviceType, s.provider, s.planName, s.serviceId, s.monthlyCost, s.monthlyRevenue, s.status, c.name as customerName
   FROM services s JOIN customers c ON s.customerExternalId = c.externalId
   WHERE s.provider = 'ChannelHaus' 
   ORDER BY c.name, s.planName`
);
console.log(`\n=== ALL CHANNELHAUS SERVICES (${channelHaus.length} total) ===`);
channelHaus.forEach(s => console.log(`${s.externalId} | ${s.customerName} | ${s.planName} | serviceId:${s.serviceId} | cost:$${s.monthlyCost} | rev:$${s.monthlyRevenue} | ${s.status}`));

// Check for any services with bsip_ in serviceId or planName
const [bsipServices] = await db.execute(
  `SELECT s.externalId, s.serviceType, s.provider, s.planName, s.serviceId, s.monthlyCost, s.monthlyRevenue, s.status, c.name as customerName
   FROM services s JOIN customers c ON s.customerExternalId = c.externalId
   WHERE s.serviceId LIKE 'bsip_%' OR s.planName LIKE 'bsip_%' OR s.connectionId LIKE 'bsip_%'`
);
console.log(`\n=== SERVICES WITH bsip_ IDENTIFIER (${bsipServices.length} total) ===`);
bsipServices.forEach(s => console.log(`${s.externalId} | ${s.customerName} | ${s.planName} | serviceId:${s.serviceId} | cost:$${s.monthlyCost} | rev:$${s.monthlyRevenue} | ${s.status}`));

// Check what providers exist and their Voice service counts
const [providerVoice] = await db.execute(
  `SELECT provider, serviceType, COUNT(*) as cnt, SUM(monthlyCost) as totalCost, SUM(monthlyRevenue) as totalRev
   FROM services WHERE serviceType IN ('Voice', 'VoIP', 'SIP') AND status != 'terminated'
   GROUP BY provider, serviceType ORDER BY totalCost DESC`
);
console.log(`\n=== VOICE SERVICES BY PROVIDER ===`);
providerVoice.forEach(r => console.log(`${r.provider} | ${r.serviceType} | ${r.cnt} services | cost:$${r.totalCost} | rev:$${r.totalRev}`));

await db.end();
