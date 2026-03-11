import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all customer-matched billing items
const [billingItems] = await conn.query(`
  SELECT id, externalId, contactName, description, lineAmount, taxAmount, 
         customerExternalId, category, matchStatus
  FROM billing_items 
  WHERE customerExternalId != '' AND matchStatus = 'customer-matched'
  ORDER BY customerExternalId
`);

console.log(`Customer-matched billing items: ${billingItems.length}\n`);

// Get all services grouped by customer
const [services] = await conn.query(`
  SELECT externalId, serviceType, planName, phoneNumber, connectionId, 
         customerExternalId, customerName, monthlyCost, locationAddress,
         serviceId, provider, avcId, carbonAlias
  FROM services 
  WHERE customerExternalId != ''
  ORDER BY customerExternalId
`);

console.log(`Services with customers: ${services.length}\n`);

// Group services by customer
const servicesByCustomer = new Map();
for (const s of services) {
  if (!servicesByCustomer.has(s.customerExternalId)) {
    servicesByCustomer.set(s.customerExternalId, []);
  }
  servicesByCustomer.get(s.customerExternalId).push(s);
}

// Matching logic: try to match billing items to specific services
// Strategy:
// 1. For internet/NBN items: match by address or connection details
// 2. For voice/SIP items: match by phone number in description
// 3. For mobile items: match by phone number
// 4. For bundles: match to internet service at same customer
// 5. For number rentals: match to voice services

function extractPhoneFromDesc(desc) {
  // Look for Australian phone numbers in description
  const matches = desc.match(/0[234578]\d{8}/g);
  return matches || [];
}

function extractNbnIdFromDesc(desc) {
  // Look for NBN service IDs like "SVC#5939" or "ID: 13300275"
  const svcMatch = desc.match(/SVC#(\d+)/i);
  const idMatch = desc.match(/ID:\s*(\d+)/i);
  return { svcId: svcMatch ? svcMatch[1] : null, nbnId: idMatch ? idMatch[1] : null };
}

let serviceMatched = 0;
let serviceUnmatched = 0;
let noServicesForCustomer = 0;

// Aggregate revenue per customer
const customerRevenue = new Map();

for (const bi of billingItems) {
  const custServices = servicesByCustomer.get(bi.customerExternalId) || [];
  const revenue = parseFloat(bi.lineAmount) || 0;
  
  // Track customer revenue
  if (!customerRevenue.has(bi.customerExternalId)) {
    customerRevenue.set(bi.customerExternalId, 0);
  }
  customerRevenue.set(bi.customerExternalId, customerRevenue.get(bi.customerExternalId) + revenue);
  
  if (custServices.length === 0) {
    noServicesForCustomer++;
    continue;
  }
  
  let matchedService = null;
  let confidence = '';
  const descLower = bi.description.toLowerCase();
  
  // Strategy 1: Phone number match
  const phones = extractPhoneFromDesc(bi.description);
  if (phones.length > 0) {
    for (const phone of phones) {
      const svc = custServices.find(s => s.phoneNumber && s.phoneNumber.replace(/\s/g, '') === phone);
      if (svc) {
        matchedService = svc;
        confidence = 'high';
        break;
      }
    }
  }
  
  // Strategy 2: NBN service ID match
  if (!matchedService) {
    const { svcId, nbnId } = extractNbnIdFromDesc(bi.description);
    if (svcId || nbnId) {
      const svc = custServices.find(s => 
        (svcId && s.serviceId && s.serviceId.includes(svcId)) ||
        (nbnId && s.connectionId && s.connectionId.includes(nbnId)) ||
        (nbnId && s.avcId && s.avcId.includes(nbnId))
      );
      if (svc) {
        matchedService = svc;
        confidence = 'high';
      }
    }
  }
  
  // Strategy 3: Service type match (if customer has only one service of that type)
  if (!matchedService) {
    let targetType = null;
    if (['internet', 'nbn-bundle', 'nbn-service', 'starlink', 'abb-passthrough'].includes(bi.category)) {
      targetType = 'Internet';
    } else if (['voice', 'sip', 'number-rental'].includes(bi.category)) {
      targetType = 'Voice';
    } else if (['mobile'].includes(bi.category)) {
      targetType = 'Mobile';
    }
    
    if (targetType) {
      const typeServices = custServices.filter(s => s.serviceType === targetType);
      if (typeServices.length === 1) {
        matchedService = typeServices[0];
        confidence = 'medium';
      } else if (typeServices.length === 0) {
        // Try matching to any service if customer has only one
        if (custServices.length === 1) {
          matchedService = custServices[0];
          confidence = 'low';
        }
      }
    }
  }
  
  // Strategy 4: If customer has only one service, match to it
  if (!matchedService && custServices.length === 1) {
    matchedService = custServices[0];
    confidence = 'low';
  }
  
  if (matchedService) {
    serviceMatched++;
    await conn.query(
      `UPDATE billing_items SET serviceExternalId = ?, matchStatus = 'service-matched', matchConfidence = ? WHERE id = ?`,
      [matchedService.externalId, confidence, bi.id]
    );
  } else {
    serviceUnmatched++;
    await conn.query(
      `UPDATE billing_items SET matchStatus = 'service-unmatched' WHERE id = ?`,
      [bi.id]
    );
  }
}

console.log(`=== BILLING-TO-SERVICE MATCHING ===`);
console.log(`Service matched: ${serviceMatched}`);
console.log(`Service unmatched: ${serviceUnmatched}`);
console.log(`No services for customer: ${noServicesForCustomer}`);

// Now calculate revenue per service and margin
// Group billing items by service
const [matchedBilling] = await conn.query(`
  SELECT serviceExternalId, SUM(lineAmount) as totalRevenue, SUM(taxAmount) as totalTax
  FROM billing_items 
  WHERE matchStatus = 'service-matched' AND serviceExternalId != ''
  GROUP BY serviceExternalId
`);

console.log(`\nServices with matched billing: ${matchedBilling.length}`);

// Update services with revenue and margin
for (const mb of matchedBilling) {
  const revenue = parseFloat(mb.totalRevenue) || 0;
  
  // Get service cost
  const [svcRows] = await conn.query(
    'SELECT monthlyCost FROM services WHERE externalId = ?',
    [mb.serviceExternalId]
  );
  
  if (svcRows.length > 0) {
    const cost = parseFloat(svcRows[0].monthlyCost) || 0;
    const margin = revenue > 0 ? ((revenue - cost) / revenue * 100) : 0;
    
    await conn.query(
      'UPDATE services SET monthlyRevenue = ?, marginPercent = ?, billingItemId = ? WHERE externalId = ?',
      [revenue, margin.toFixed(2), mb.serviceExternalId, mb.serviceExternalId]
    );
  }
}

// Update customer revenue totals
for (const [custExtId, revenue] of customerRevenue) {
  // Get customer cost
  const [custRows] = await conn.query(
    'SELECT monthlyCost FROM customers WHERE externalId = ?',
    [custExtId]
  );
  
  if (custRows.length > 0) {
    const cost = parseFloat(custRows[0].monthlyCost) || 0;
    const margin = revenue > 0 ? ((revenue - cost) / revenue * 100) : 0;
    
    await conn.query(
      'UPDATE customers SET monthlyRevenue = ?, marginPercent = ? WHERE externalId = ?',
      [revenue, margin.toFixed(2), custExtId]
    );
  }
}

// Summary stats
const [revenueStats] = await conn.query(`
  SELECT 
    COUNT(*) as totalBillingItems,
    SUM(lineAmount) as totalRevenue,
    SUM(taxAmount) as totalTax,
    SUM(CASE WHEN matchStatus = 'service-matched' THEN lineAmount ELSE 0 END) as matchedRevenue,
    SUM(CASE WHEN matchStatus != 'service-matched' THEN lineAmount ELSE 0 END) as unmatchedRevenue
  FROM billing_items
`);

const [marginStats] = await conn.query(`
  SELECT 
    COUNT(*) as servicesWithRevenue,
    AVG(marginPercent) as avgMargin,
    MIN(marginPercent) as minMargin,
    MAX(marginPercent) as maxMargin,
    SUM(CASE WHEN marginPercent < 0 THEN 1 ELSE 0 END) as negativeMarginCount,
    SUM(CASE WHEN marginPercent >= 0 AND marginPercent < 20 THEN 1 ELSE 0 END) as lowMarginCount
  FROM services WHERE monthlyRevenue > 0
`);

console.log(`\n=== REVENUE SUMMARY ===`);
console.log(`Total recurring revenue: $${parseFloat(revenueStats[0].totalRevenue).toFixed(2)}`);
console.log(`Total tax: $${parseFloat(revenueStats[0].totalTax).toFixed(2)}`);
console.log(`Matched to services: $${parseFloat(revenueStats[0].matchedRevenue).toFixed(2)}`);
console.log(`Unmatched: $${parseFloat(revenueStats[0].unmatchedRevenue).toFixed(2)}`);

console.log(`\n=== MARGIN SUMMARY ===`);
console.log(`Services with revenue: ${marginStats[0].servicesWithRevenue}`);
console.log(`Average margin: ${parseFloat(marginStats[0].avgMargin || 0).toFixed(1)}%`);
console.log(`Min margin: ${parseFloat(marginStats[0].minMargin || 0).toFixed(1)}%`);
console.log(`Max margin: ${parseFloat(marginStats[0].maxMargin || 0).toFixed(1)}%`);
console.log(`Negative margin services: ${marginStats[0].negativeMarginCount}`);
console.log(`Low margin (<20%) services: ${marginStats[0].lowMarginCount}`);

await conn.end();
