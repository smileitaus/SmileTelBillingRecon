import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';

const db = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Find all Smile IT customer IDs
const [customers] = await db.execute(`
  SELECT id, externalId, name, status, billingPlatforms, contactEmail, contactPhone, siteAddress, notes
  FROM customers 
  WHERE name LIKE '%Smile IT%' OR name LIKE '%SmileIT%' OR name LIKE '%Smile Tel%' OR name LIKE '%SmileTel%'
  ORDER BY name
`);

console.log(`Found ${customers.length} Smile IT customer records:`);
customers.forEach(c => console.log(`  [${c.externalId}] ${c.name} | status: ${c.status}`));

// 2. Get all services for these customers
const customerIds = customers.map(c => c.externalId);
if (customerIds.length === 0) {
  console.log('No Smile IT customers found!');
  process.exit(1);
}

const placeholders = customerIds.map(() => '?').join(',');
const [services] = await db.execute(`
  SELECT 
    s.externalId, s.serviceId, s.serviceType, s.serviceTypeDetail, s.planName,
    s.status, s.provider, s.supplierName, s.supplierAccount,
    s.monthlyCost, s.monthlyRevenue, s.marginPercent,
    s.phoneNumber, s.locationAddress,
    s.serviceActivationDate, s.serviceEndDate, s.contractEndDate,
    s.technology, s.speedTier, s.avcId, s.connectionId,
    s.customerName, s.customerExternalId,
    s.discoveryNotes, s.terminationNote, s.billingPlatform,
    s.blitzNoUse3m, s.blitzNoUse6m, s.blitzNoNetActivity6m,
    s.carbonStatus, s.carbonServiceType, s.carbonAlias,
    s.simSerialNumber, s.simOwner, s.dataPlanGb,
    s.noDataUse, s.dataSource
  FROM services s
  WHERE s.customerExternalId IN (${placeholders})
  ORDER BY s.provider, s.serviceType, s.externalId
`, customerIds);

console.log(`\nTotal services assigned to Smile IT: ${services.length}`);

// 3. Classify each service
const classified = services.map(s => {
  let recommendation = '';
  let confidence = '';
  let reason = '';
  let suggestedCustomer = '';

  const name = (s.planName || '').toLowerCase();
  const provider = (s.provider || s.supplierName || '').toLowerCase();
  const type = (s.serviceType || '').toLowerCase();
  const detail = (s.serviceTypeDetail || '').toLowerCase();
  const phone = (s.phoneNumber || '');
  const alias = (s.carbonAlias || '').toLowerCase();
  const notes = (s.discoveryNotes || '').toLowerCase();
  const status = (s.status || '').toLowerCase();

  // Already flagged for termination
  if (status === 'flagged_for_termination') {
    recommendation = 'ALREADY FLAGGED FOR TERMINATION';
    confidence = 'HIGH';
    reason = 'Service has already been flagged for termination. No further action needed unless flag was in error.';
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // Internal Smile IT services — legitimate
  const internalKeywords = [
    'smile it', 'smileit', 'smiletel', 'smile tel',
    'rvc ict', 'rvcict', 'angus', 'internal',
    'office', 'staff', 'reception', 'admin',
    'teams', 'microsoft', 'azure', 'o365',
    'test', 'demo', 'pbx user', 'pbx_rvcfree'
  ];
  const isInternalName = internalKeywords.some(k => name.includes(k) || alias.includes(k) || notes.includes(k));

  // Exetel — known Smile IT internal broadband
  if (provider.includes('exetel')) {
    recommendation = 'KEEP — Internal Smile IT service';
    confidence = 'HIGH';
    reason = 'Exetel connection is the known Smile IT internal broadband service.';
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // AAPT — Smile IT office connection
  if (provider.includes('aapt') && (name.includes('smile') || name.includes('rvc') || name.includes('office'))) {
    recommendation = 'KEEP — Internal Smile IT service';
    confidence = 'HIGH';
    reason = 'AAPT service with Smile IT / RVC reference — likely internal office connection.';
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // NetSIP — internal SIP
  if (provider.includes('netsip') && (name.includes('smile') || name.includes('rvc') || name.includes('wholesale'))) {
    recommendation = 'KEEP — Internal Smile IT service';
    confidence = 'HIGH';
    reason = 'NetSIP wholesale/internal SIP account for Smile IT office use.';
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // ChannelHaus/ECN — RVC PBX
  if ((provider.includes('channelhaus') || provider.includes('ecn')) && (name.includes('rvc') || name.includes('smile'))) {
    recommendation = 'KEEP — Internal Smile IT service';
    confidence = 'HIGH';
    reason = 'ChannelHaus/ECN PBX service for Smile IT / RVC ICT internal use.';
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // Telstra mobile — check if it's a staff phone or a customer SIM
  if (provider.includes('telstra') && (type.includes('mobile') || type.includes('sim'))) {
    if (name.includes('smile') || name.includes('staff') || name.includes('angus') || name.includes('rvc')) {
      recommendation = 'KEEP — Internal staff mobile';
      confidence = 'HIGH';
      reason = 'Telstra mobile SIM assigned to Smile IT staff member.';
    } else {
      recommendation = 'INVESTIGATE — Possible mis-assignment';
      confidence = 'MEDIUM';
      reason = 'Telstra mobile SIM assigned to Smile IT but name does not reference internal staff. May belong to a customer whose SIM was imported under Smile IT.';
      suggestedCustomer = 'Check Telstra portal for subscriber name and reassign to correct customer.';
    }
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // SasBoss Voice/VoIP — check if internal or customer
  if (provider.includes('sasboss')) {
    if (name.includes('smile') || name.includes('rvc') || name.includes('wholesale')) {
      recommendation = 'KEEP — Internal Smile IT SasBoss account';
      confidence = 'HIGH';
      reason = 'SasBoss service referencing Smile IT / RVC — internal wholesale or office account.';
    } else {
      recommendation = 'INVESTIGATE — Likely mis-assigned customer service';
      confidence = 'MEDIUM';
      reason = 'SasBoss service assigned to Smile IT but the service name does not reference Smile IT internally. This was likely auto-assigned because the Xero/SasBoss invoice was billed to Smile IT as reseller.';
      suggestedCustomer = 'Review service name and phone number to identify the end customer. Reassign to correct customer record.';
    }
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // Vocus — Smile IT wholesale account
  if (provider.includes('vocus')) {
    if (name.includes('smile') || name.includes('rvc') || name.includes('kim walker') || name.includes('stephen donald')) {
      recommendation = 'KEEP — Smile IT wholesale Vocus account';
      confidence = 'HIGH';
      reason = 'Vocus service under Smile IT wholesale reseller account (Kim Walker / Stephen Donald). This is the reseller account holder, not an end customer.';
    } else {
      recommendation = 'REASSIGN — End customer service mis-assigned to Smile IT';
      confidence = 'HIGH';
      reason = 'Vocus NBN/SIM service assigned to Smile IT but appears to be an end customer service. Was likely imported without customer matching and defaulted to Smile IT.';
      suggestedCustomer = 'Match service ID to end customer via Vocus portal and reassign.';
    }
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // TIAB SIMs
  if (provider.includes('tiab')) {
    if (name.includes('smile') || name.includes('rvc') || name.includes('test') || name.includes('demo')) {
      recommendation = 'KEEP — Internal Smile IT TIAB SIM';
      confidence = 'HIGH';
      reason = 'TIAB SIM assigned to Smile IT — likely a test/demo or staff SIM.';
    } else {
      recommendation = 'REASSIGN — Customer TIAB SIM mis-assigned to Smile IT';
      confidence = 'HIGH';
      reason = 'TIAB SIM does not reference Smile IT internally. Likely a customer SIM that was imported without a customer match and defaulted to Smile IT.';
      suggestedCustomer = 'Check TIAB portal for SIM owner and reassign to correct customer.';
    }
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // ABB SIMs
  if (provider.includes('abb') || provider.includes('aussie broadband')) {
    recommendation = 'REASSIGN — Customer ABB SIM mis-assigned to Smile IT';
    confidence = 'HIGH';
    reason = 'ABB SIM assigned to Smile IT. ABB SIMs are all customer-facing 4G backup SIMs. This was likely imported without a customer match.';
    suggestedCustomer = 'Check ABB portal for SIM owner and reassign to correct customer.';
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // Starlink
  if (provider.includes('starlink')) {
    recommendation = 'INVESTIGATE — Starlink service under Smile IT';
    confidence = 'MEDIUM';
    reason = 'Starlink service assigned to Smile IT. May be a demo/test unit or a customer service that was not matched.';
    suggestedCustomer = 'Check Starlink portal for account owner and confirm if internal or customer.';
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // Zero cost services with no clear provider
  if (!s.monthlyCost || s.monthlyCost === 0) {
    recommendation = 'INVESTIGATE — Zero cost, unclear ownership';
    confidence = 'LOW';
    reason = 'Service has $0 cost and is assigned to Smile IT. May be a placeholder, test entry, or mis-assigned service with no billing data.';
    suggestedCustomer = 'Review service details and either assign to correct customer or mark for termination if redundant.';
    return { ...s, recommendation, confidence, reason, suggestedCustomer };
  }

  // Default — needs manual review
  recommendation = 'INVESTIGATE — Manual review required';
  confidence = 'LOW';
  reason = 'Service assigned to Smile IT but could not be automatically classified. Manual review required to determine if internal or mis-assigned.';
  suggestedCustomer = 'Review service name, provider, and cost to determine correct assignment.';
  return { ...s, recommendation, confidence, reason, suggestedCustomer };
});

// 4. Summarise
const summary = {
  total: classified.length,
  keep: classified.filter(s => s.recommendation.startsWith('KEEP')).length,
  reassign: classified.filter(s => s.recommendation.startsWith('REASSIGN')).length,
  investigate: classified.filter(s => s.recommendation.startsWith('INVESTIGATE')).length,
  alreadyFlagged: classified.filter(s => s.recommendation.startsWith('ALREADY FLAGGED')).length,
};

console.log('\n=== CLASSIFICATION SUMMARY ===');
console.log(`KEEP (legitimate internal): ${summary.keep}`);
console.log(`REASSIGN (mis-assigned customer service): ${summary.reassign}`);
console.log(`INVESTIGATE (needs manual review): ${summary.investigate}`);
console.log(`ALREADY FLAGGED FOR TERMINATION: ${summary.alreadyFlagged}`);
console.log(`TOTAL: ${summary.total}`);

// 5. Group by provider for email
const byProvider = {};
for (const s of classified) {
  const prov = s.provider || s.supplierName || 'Unknown';
  if (!byProvider[prov]) byProvider[prov] = [];
  byProvider[prov].push(s);
}

console.log('\n=== BY PROVIDER ===');
for (const [prov, svcs] of Object.entries(byProvider)) {
  const keep = svcs.filter(s => s.recommendation.startsWith('KEEP')).length;
  const reassign = svcs.filter(s => s.recommendation.startsWith('REASSIGN')).length;
  const investigate = svcs.filter(s => s.recommendation.startsWith('INVESTIGATE')).length;
  const flagged = svcs.filter(s => s.recommendation.startsWith('ALREADY')).length;
  const totalCost = svcs.reduce((sum, s) => sum + (parseFloat(s.monthlyCost) || 0), 0);
  console.log(`${prov}: ${svcs.length} services | $${totalCost.toFixed(2)}/mo | KEEP:${keep} REASSIGN:${reassign} INVESTIGATE:${investigate} FLAGGED:${flagged}`);
}

// Save for email step
import { writeFileSync } from 'fs';
writeFileSync('/tmp/smileit_classified.json', JSON.stringify({ customers, classified, summary, byProvider }, null, 2));
console.log('\nSaved to /tmp/smileit_classified.json');

await db.end();
