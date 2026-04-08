import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// All Vocus/Optus services in DB
const [rows] = await conn.execute(`
  SELECT s.externalId, s.serviceId, s.serviceCategory,
         s.monthlyCost, s.status, s.serviceType, s.locationAddress,
         s.technology, s.speedTier, s.provider, s.planName,
         s.customerName, s.customerExternalId, s.discoveryNotes
  FROM services s
  WHERE s.provider IN ('Vocus','Optus')
  ORDER BY s.serviceId
`);
console.log('DB Vocus/Optus services:', rows.length);
rows.forEach(r => console.log(
  (r.serviceId || '').padEnd(14),
  ('$'+(+r.monthlyCost).toFixed(2)).padEnd(10),
  (r.serviceType||'').padEnd(20),
  (r.status||'').padEnd(25),
  (r.technology||'').padEnd(8),
  (r.speedTier||'').padEnd(12),
  (r.customerName||'').substring(0,35)
));

// Product costs for Vocus
const [costs] = await conn.execute(`
  SELECT productName, wholesaleCost, defaultRetailPrice, productCategory
  FROM product_costs WHERE supplier='Vocus' ORDER BY productName
`);
console.log('\nVocus product_costs in DB:', costs.length);
costs.forEach(c => console.log(
  (c.productName||'').padEnd(45),
  ('$'+(+c.wholesaleCost).toFixed(2)).padEnd(10),
  ('$'+(+c.defaultRetailPrice).toFixed(2)).padEnd(10),
  c.productCategory||''
));

await conn.end();
