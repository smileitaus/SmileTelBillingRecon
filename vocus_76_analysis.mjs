import mysql from 'mysql2/promise';
import fs from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Load the already-parsed Vocus data
const vocus = JSON.parse(fs.readFileSync('/tmp/vocus_parsed.json'));

// Load crossref to get the 76 untracked ones
const crossref = JSON.parse(fs.readFileSync('/tmp/vocus_crossref.json'));
const untracked = crossref.inVocusNotInDb;

console.log('Untracked Vocus SIMs to analyse:', untracked.length);

// For each untracked SIM, the matchedCustomerId field tells us if it was matched to a customer
// Gather all unique customer IDs from matched entries
const matchedCustIds = [...new Set(untracked.map(v => v.matchedCustomerId).filter(Boolean))];
console.log('Unique matched customer IDs:', matchedCustIds.length);

// Get customer details for all matched customers
let customerMap = {};
if (matchedCustIds.length > 0) {
  const ph = matchedCustIds.map(() => '?').join(',');
  const [customers] = await conn.execute(`
    SELECT externalId, name, status, billingPlatforms, siteAddress, contactEmail, contactPhone, notes
    FROM customers
    WHERE externalId IN (${ph})
  `, matchedCustIds);
  customers.forEach(c => { customerMap[c.externalId] = c; });
}

// For each customer, get their existing services (to understand what they already have)
const [allServices] = await conn.execute(`
  SELECT s.externalId, s.customerExternalId, s.customerName, s.serviceType, s.supplierName,
         s.planName, s.status, s.phoneNumber, s.simSerialNumber, s.monthlyCost,
         s.serviceActivationDate, s.locationAddress
  FROM services s
  WHERE s.customerExternalId IN (${matchedCustIds.length > 0 ? matchedCustIds.map(() => '?').join(',') : "'NONE'"})
  AND s.status NOT IN ('terminated','Ceased','flagged_for_termination')
  ORDER BY s.customerExternalId, s.serviceType
`, matchedCustIds.length > 0 ? matchedCustIds : []);

const servicesByCustomer = {};
for (const svc of allServices) {
  if (!servicesByCustomer[svc.customerExternalId]) servicesByCustomer[svc.customerExternalId] = [];
  servicesByCustomer[svc.customerExternalId].push(svc);
}

// Helper to format date
function fmtDate(d) {
  if (!d) return '—';
  if (/^\d{5}$/.test(d)) {
    const date = new Date(Date.UTC(1899, 11, 30) + parseInt(d) * 86400000);
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return d;
}

// Generate recommendation for each SIM
function getRecommendation(v, customer, services) {
  const planType = v.planType || '';
  const isMobileSIM = planType.includes('Mobile') || planType.includes('POSTPAID') || planType.includes('PAYGD');
  const is4GBackup = planType.includes('4G Backup') || planType.includes('DATA-HOSTED');
  const isInternal = v.clientName?.includes('Internal') || v.clientName?.includes('Smile IT') || v.serviceLabel?.includes('Smile IT') || v.serviceLabel?.includes('SmileIT');
  const isSmileTel = v.clientName?.includes('Smile IT') || v.clientName?.includes('SmileTel');

  // Check if customer has TIAB SIMs already
  const tiabSims = services ? services.filter(s => s.supplierName === 'TIAB' && s.serviceType === 'Data') : [];
  const hasTiab = tiabSims.length > 0;

  // Check customer status
  const custStatus = customer?.status || 'unknown';
  const isInactive = custStatus === 'inactive' || custStatus === 'Ceased';
  const isReview = custStatus === 'review';
  const isActive = custStatus === 'active';

  // Check if customer has NBN/internet service
  const hasInternet = services ? services.some(s => s.serviceType === 'Internet') : false;

  // Internal Smile IT SIMs
  if (isInternal || isSmileTel) {
    return {
      recommendation: 'KEEP — Internal Use',
      priority: 'LOW',
      reason: 'This is a Smile IT internal SIM. Review with management to confirm it is still required. If active and in use, retain. If spare/unused, cancel.',
      action: 'Confirm with management whether this SIM is actively assigned to a staff member or device. If unassigned, cancel.'
    };
  }

  // Inactive/ceased customer
  if (isInactive) {
    return {
      recommendation: 'CANCEL',
      priority: 'HIGH',
      reason: `Customer ${customer?.name || v.matchedCustomerName} is marked as INACTIVE/CEASED in the billing system. This SIM is likely redundant.`,
      action: 'Confirm customer has closed, then cancel this Vocus SIM immediately via the portal. No TIAB replacement needed.'
    };
  }

  // Customer under review
  if (isReview) {
    return {
      recommendation: 'INVESTIGATE FIRST',
      priority: 'HIGH',
      reason: `Customer ${customer?.name || v.matchedCustomerName} is flagged for REVIEW in the billing system. Status is uncertain.`,
      action: 'Confirm with account management whether this customer is still active. If active: proceed with TIAB replacement. If closed: cancel SIM.'
    };
  }

  // 4G Backup SIM for active customer with TIAB already
  if (is4GBackup && hasTiab && isActive) {
    return {
      recommendation: 'CANCEL — TIAB Already Active',
      priority: 'HIGH',
      reason: `Customer already has ${tiabSims.length} active TIAB SIM(s). This Vocus 4G backup SIM is redundant.`,
      action: `Confirm TIAB SIM (${tiabSims.map(t => t.phoneNumber).join(', ')}) is inserted and working in the router, then cancel this Vocus SIM via the portal.`
    };
  }

  // 4G Backup SIM for active customer without TIAB
  if (is4GBackup && !hasTiab && isActive) {
    return {
      recommendation: 'REPLACE WITH TIAB',
      priority: 'MEDIUM',
      reason: 'This is an active 4G backup SIM for an active customer. No TIAB replacement has been provisioned yet. Replacing with TIAB will reduce cost and consolidate onto the preferred supplier.',
      action: 'Order a TIAB SIM for this site, ship to site, confirm active in router, then cancel this Vocus SIM. Do NOT cancel before TIAB is confirmed working.'
    };
  }

  // Mobile SIM (not 4G backup) for active customer
  if (isMobileSIM && isActive) {
    return {
      recommendation: 'REVIEW — Mobile SIM',
      priority: 'MEDIUM',
      reason: 'This is a standard mobile SIM (not a 4G backup). It may be assigned to a staff member, POS device, EFTPOS terminal, or other equipment at the site.',
      action: 'Confirm with the site/customer what device this SIM is in. If it is a backup router SIM: replace with TIAB. If it is in a POS/EFTPOS/staff device: assess whether to keep on Vocus or migrate to TIAB mobile.'
    };
  }

  // No customer match
  if (!customer) {
    return {
      recommendation: 'INVESTIGATE — No Customer Match',
      priority: 'HIGH',
      reason: 'This SIM has no matching customer record in the billing system. It may be for a customer not yet onboarded, a closed customer, or a provisioning error.',
      action: 'Identify who this SIM belongs to. Check the Vocus portal service label and client name. If customer is active: create customer record and link. If customer has closed: cancel SIM.'
    };
  }

  // Default
  return {
    recommendation: 'REVIEW',
    priority: 'MEDIUM',
    reason: 'Insufficient data to make a definitive recommendation. Awaiting Vocus usage/billing data.',
    action: 'Hold pending usage data. Review next week when billing information is available.'
  };
}

// Build full dataset
const dataset = untracked.map((v, idx) => {
  const customer = customerMap[v.matchedCustomerId] || null;
  const services = servicesByCustomer[v.matchedCustomerId] || [];
  const tiabSims = services.filter(s => s.supplierName === 'TIAB' && s.serviceType === 'Data');
  const internetSvcs = services.filter(s => s.serviceType === 'Internet');
  const rec = getRecommendation(v, customer, services);

  return {
    num: idx + 1,
    // Vocus portal data
    vocusServiceId: v.vocusServiceId,
    clientName: v.clientName,
    serviceLabel: v.serviceLabel,
    msn: v.msn,
    planType: v.planType,
    activationDate: fmtDate(v.activationDate),
    vocusAddress: `${v.address}, ${v.city} ${v.state} ${v.postCode}`.trim(),
    contactName: v.contactName,
    // Matched customer data
    matchedCustomerId: v.matchedCustomerId || '—',
    matchedCustomerName: v.matchedCustomerName || v.clientName,
    matchedBusinessName: v.matchedBusinessName || '—',
    matchedEmail: v.matchedEmail || '—',
    matchedPhone: v.matchedPhone || '—',
    // Customer billing system data
    custStatus: customer?.status || 'NOT IN SYSTEM',
    custBillingPlatform: customer ? (JSON.parse(customer.billingPlatforms || '[]').join(', ') || 'None') : '—',
    custSiteAddress: customer?.siteAddress || '—',
    custEmail: customer?.contactEmail || '—',
    // Existing services
    totalActiveServices: services.length,
    tiabSimCount: tiabSims.length,
    tiabSimDetails: tiabSims.map(t => `${t.phoneNumber} (${t.simSerialNumber || 'no serial'})`).join('; ') || '—',
    internetServiceCount: internetSvcs.length,
    internetServices: internetSvcs.map(s => `${s.planName} @ ${s.locationAddress || 'unknown'}`).join('; ') || '—',
    // Recommendation
    recommendation: rec.recommendation,
    priority: rec.priority,
    reason: rec.reason,
    action: rec.action
  };
});

// Sort by priority then recommendation
const priorityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
dataset.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

// Summary counts
const summary = {
  total: dataset.length,
  cancel: dataset.filter(d => d.recommendation.startsWith('CANCEL')).length,
  replaceWithTiab: dataset.filter(d => d.recommendation.startsWith('REPLACE')).length,
  review: dataset.filter(d => d.recommendation.startsWith('REVIEW') || d.recommendation.startsWith('INVESTIGATE')).length,
  keep: dataset.filter(d => d.recommendation.startsWith('KEEP')).length,
  highPriority: dataset.filter(d => d.priority === 'HIGH').length,
  mediumPriority: dataset.filter(d => d.priority === 'MEDIUM').length,
  lowPriority: dataset.filter(d => d.priority === 'LOW').length,
};

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

fs.writeFileSync('/tmp/vocus_76_dataset.json', JSON.stringify({ dataset, summary }, null, 2));
console.log('\nSaved to /tmp/vocus_76_dataset.json');

await conn.end();
