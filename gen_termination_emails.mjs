/**
 * Termination Candidates Export — grouped by Supplier then Technology Type
 * Sends one email per supplier to support@smiletel.com.au
 */

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const SENDGRID_API_KEY = process.env.SendGrid_API;
const FROM_EMAIL = 'billing@smiletel.com.au';
const TO_EMAIL = 'support@smiletel.com.au';

const fmt = (v) => v != null ? `$${parseFloat(v).toFixed(2)}` : '$0.00';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-AU') : '—';

function techLabel(serviceType, technology, planName) {
  const t = (serviceType || '').toLowerCase();
  const tech = (technology || '').toLowerCase();
  const plan = (planName || '').toLowerCase();
  if (t === 'internet' || t === 'data') {
    if (tech.includes('fibre') || tech.includes('fiber') || plan.includes('fibre') || plan.includes('fast fibre')) return 'Fixed Fibre (FAST Fibre/On-Net)';
    if (tech.includes('fttp') || tech.includes('fttb') || tech.includes('fttn') || tech.includes('fttc') || tech.includes('hfc') || plan.includes('nbn')) return 'NBN Broadband';
    if (tech.includes('starlink') || plan.includes('starlink')) return 'Starlink';
    if (tech.includes('4g') || tech.includes('lte') || plan.includes('4g')) return '4G Fixed Wireless';
    if (tech.includes('adsl') || tech.includes('vdsl')) return 'ADSL/VDSL';
    return 'Internet/Broadband';
  }
  if (t === 'mobile' || t === 'mobile data') {
    if (plan.includes('4g backup') || plan.includes('backup sim') || plan.includes('failover')) return '4G Backup SIM';
    return 'Mobile SIM';
  }
  if (t === 'voice' || t === 'voip') {
    if (tech.includes('sip') || plan.includes('sip') || plan.includes('voip')) return 'VoIP/SIP';
    return 'Fixed Voice/PSTN';
  }
  if (t === 'static ip') return 'Static IP Add-on';
  return serviceType || 'Other';
}

// ─── QUERY 1: Inactive customers with active services ─────────────────────────
const [inactiveServices] = await conn.execute(`
  SELECT
    s.id, s.serviceId, s.provider, s.serviceType, s.technology, s.planName,
    s.speedTier, s.monthlyCost, s.status AS svcStatus, s.locationAddress,
    s.serviceActivationDate AS activationDate, s.contractEndDate,
    s.discoveryNotes, s.terminationNote,
    c.externalId AS custId, c.name AS customerName, c.status AS custStatus,
    c.billingPlatforms AS billingPlatform, c.contactEmail, c.contactPhone
  FROM services s
  JOIN customers c ON s.customerExternalId = c.externalId
  WHERE c.status IN ('inactive','churned','off-boarded','review')
    AND s.status = 'active'
  ORDER BY s.provider, s.serviceType, c.name
`);

// ─── QUERY 2: Duplicate services ──────────────────────────────────────────────
const [dupeGroups] = await conn.execute(`
  SELECT customerExternalId, provider, serviceType, COUNT(*) AS cnt
  FROM services
  WHERE status = 'active'
  GROUP BY customerExternalId, provider, serviceType
  HAVING cnt > 1
`);

const dupeRows = [];
for (const grp of dupeGroups) {
  const [svcs] = await conn.execute(`
    SELECT
      s.id, s.serviceId, s.provider, s.serviceType, s.technology, s.planName,
      s.speedTier, s.monthlyCost, s.status AS svcStatus, s.locationAddress,
      s.serviceActivationDate AS activationDate, s.contractEndDate, s.discoveryNotes,
      c.externalId AS custId, c.name AS customerName, c.status AS custStatus,
      c.billingPlatforms AS billingPlatform, c.contactEmail, c.contactPhone
    FROM services s
    JOIN customers c ON s.customerExternalId = c.externalId
    WHERE s.customerExternalId = ? AND s.provider = ? AND s.serviceType = ? AND s.status = 'active'
    ORDER BY s.serviceActivationDate ASC
  `, [grp.customerExternalId, grp.provider, grp.serviceType]);
  // All but the most recently activated are candidates
  svcs.slice(0, -1).forEach(s => dupeRows.push(s));
}

// ─── QUERY 3: Flagged for termination ─────────────────────────────────────────
const [flaggedServices] = await conn.execute(`
  SELECT
    s.id, s.serviceId, s.provider, s.serviceType, s.technology, s.planName,
    s.speedTier, s.monthlyCost, s.status AS svcStatus, s.locationAddress,
    s.serviceActivationDate AS activationDate, s.contractEndDate,
    s.discoveryNotes, s.terminationNote,
    c.externalId AS custId, c.name AS customerName, c.status AS custStatus,
    c.billingPlatforms AS billingPlatform, c.contactEmail, c.contactPhone
  FROM services s
  LEFT JOIN customers c ON s.customerExternalId = c.externalId
  WHERE s.status = 'flagged_for_termination'
  ORDER BY s.provider, s.serviceType, c.name
`);

await conn.end();

// ─── CATEGORISE AND GROUP ──────────────────────────────────────────────────────
function addToMap(map, services, category, reasonFn, confidenceFn) {
  for (const svc of services) {
    const supplier = svc.provider || 'Unknown';
    const tech = techLabel(svc.serviceType, svc.technology, svc.planName);
    if (!map[supplier]) map[supplier] = {};
    if (!map[supplier][tech]) map[supplier][tech] = [];
    map[supplier][tech].push({
      ...svc,
      category,
      reason: reasonFn(svc),
      confidence: confidenceFn(svc),
    });
  }
}

const supplierMap = {};
addToMap(supplierMap, flaggedServices, 'Previously Flagged',
  svc => svc.terminationNote || svc.discoveryNotes || 'Previously flagged for termination — awaiting cancellation',
  () => 'HIGH'
);
addToMap(supplierMap, inactiveServices, 'Inactive Customer',
  svc => `Customer marked "${svc.custStatus}" — service still active and billing`,
  svc => ['inactive','churned','off-boarded'].includes(svc.custStatus) ? 'HIGH' : 'MEDIUM'
);
addToMap(supplierMap, dupeRows, 'Duplicate Service',
  svc => `Customer has multiple active ${svc.serviceType} services from ${svc.provider} — this is the older/earlier-activated one`,
  () => 'MEDIUM'
);

// ─── BUILD EMAIL HTML ──────────────────────────────────────────────────────────
function buildEmailHtml(supplier, techGroups) {
  const allRows = Object.values(techGroups).flat();
  const totalServices = allRows.length;
  const totalCost = allRows.reduce((s, r) => s + parseFloat(r.monthlyCost || 0), 0);
  const highCount = allRows.filter(r => r.confidence === 'HIGH').length;

  const techOrder = [
    'NBN Broadband','Fixed Fibre (FAST Fibre/On-Net)','4G Fixed Wireless','Starlink',
    'Internet/Broadband','ADSL/VDSL','4G Backup SIM','Mobile SIM',
    'VoIP/SIP','Fixed Voice/PSTN','Static IP Add-on','Other'
  ];
  const sortedTechs = Object.keys(techGroups).sort((a,b) => {
    const ai = techOrder.indexOf(a); const bi = techOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;max-width:960px;margin:0 auto;padding:20px}
h1{color:#c0392b;border-bottom:2px solid #c0392b;padding-bottom:8px}
h2{color:#2c3e50;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}
.summary{background:#fef9e7;border:1px solid #f39c12;border-radius:6px;padding:14px 18px;margin:16px 0}
.warning{background:#fdedec;border:1px solid #e74c3c;border-radius:6px;padding:12px 16px;margin:12px 0;font-weight:bold}
table{width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:12px}
th{background:#2c3e50;color:white;padding:7px 8px;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}
tr:nth-child(even) td{background:#f8f9fa}
.bh{background:#e74c3c;color:white;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:bold}
.bm{background:#e67e22;color:white;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:bold}
.bl{background:#27ae60;color:white;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:bold}
.bc{background:#8e44ad;color:white;padding:2px 7px;border-radius:10px;font-size:10px}
.cost{font-weight:bold;color:#c0392b}
.footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;color:#888;font-size:11px}
</style></head><body>
<h1>⚠️ Service Termination Review — ${supplier}</h1>
<div class="warning">
  ACTION REQUIRED: Review each service below and initiate cancellation where confirmed appropriate.<br>
  ⛔ Do NOT cancel any service without first verifying it is not in active use.<br>
  ✅ HIGH confidence items can generally be actioned immediately. ⚠️ MEDIUM confidence items require verification first.
</div>
<div class="summary">
  <strong>Supplier:</strong> ${supplier} &nbsp;|&nbsp;
  <strong>Services for review:</strong> ${totalServices} &nbsp;|&nbsp;
  <strong>Monthly cost at risk:</strong> <span class="cost">${fmt(totalCost)}/month</span> &nbsp;|&nbsp;
  <strong>HIGH confidence:</strong> ${highCount} &nbsp;|&nbsp;
  <strong>Generated:</strong> ${new Date().toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'})}
</div>
<p><strong>Instructions for support team:</strong></p>
<ol>
  <li>Review each service listed below, grouped by technology type.</li>
  <li>For HIGH confidence items: confirm with account manager that the service is no longer required, then cancel via the ${supplier} portal.</li>
  <li>For MEDIUM confidence items: contact the customer or account manager to verify before cancelling.</li>
  <li>Once cancelled, update the service status to <em>Terminated</em> in the SmileTel Billing Recon system.</li>
  <li>If unsure about any service, escalate to the account manager — do not cancel without confirmation.</li>
</ol>`;

  for (const tech of sortedTechs) {
    const rows = techGroups[tech];
    const techCost = rows.reduce((s,r) => s + parseFloat(r.monthlyCost||0), 0);
    html += `<h2>${tech} <span style="font-size:13px;color:#888;">(${rows.length} service${rows.length>1?'s':''} — ${fmt(techCost)}/mo)</span></h2>
<table><thead><tr>
  <th>Service ID</th><th>Customer</th><th>Cust. Status</th><th>Address / Location</th>
  <th>Plan / Speed</th><th>Monthly Cost</th><th>Activated</th><th>Contract End</th>
  <th>Billing Platform</th><th>Reason for Review</th><th>Confidence</th><th>Category</th>
</tr></thead><tbody>`;
    for (const r of rows) {
      const bc = r.confidence === 'HIGH' ? 'bh' : r.confidence === 'MEDIUM' ? 'bm' : 'bl';
      const planSpeed = [r.planName, r.speedTier].filter(Boolean).join(' / ') || '—';
      html += `<tr>
  <td style="font-family:monospace;font-size:11px;">${r.serviceId || r.id}</td>
  <td><strong>${r.customerName||'—'}</strong>${r.contactEmail?`<br><span style="color:#888;font-size:11px;">${r.contactEmail}</span>`:''}</td>
  <td>${r.custStatus||'—'}</td>
  <td style="font-size:11px;">${r.locationAddress||'—'}</td>
  <td style="font-size:11px;">${planSpeed}</td>
  <td class="cost">${fmt(r.monthlyCost)}</td>
  <td style="font-size:11px;">${fmtDate(r.activationDate)}</td>
  <td style="font-size:11px;">${fmtDate(r.contractEndDate)}</td>
  <td style="font-size:11px;">${r.billingPlatform||'—'}</td>
  <td style="font-size:11px;">${r.reason}</td>
  <td><span class="${bc}">${r.confidence}</span></td>
  <td><span class="bc">${r.category}</span></td>
</tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `<div class="footer">
Generated by SmileTel Billing Recon System — ${new Date().toISOString().split('T')[0]}<br>
This report covers HIGH confidence (inactive customers, previously flagged) and MEDIUM confidence (duplicate services) termination candidates only.<br>
Services with $0 cost, unmatched services, and usage-dependent assessments will follow once carrier billing data is available.
</div></body></html>`;
  return html;
}

// ─── SEND EMAILS ──────────────────────────────────────────────────────────────
async function sendEmail(subject, html) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: TO_EMAIL }] }],
      from: { email: FROM_EMAIL, name: 'SmileTel Billing Recon' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
  if (res.ok) {
    console.log(`✅ Sent: ${subject}`);
  } else {
    const err = await res.text();
    console.error(`❌ Failed: ${subject}\n   ${err}`);
  }
}

// ─── PROCESS EACH SUPPLIER ────────────────────────────────────────────────────
let emailsSent = 0;
let totalReviewed = 0;

for (const supplier of Object.keys(supplierMap).sort()) {
  const techGroups = supplierMap[supplier];
  const allRows = Object.values(techGroups).flat();
  if (allRows.length === 0) continue;

  const totalCost = allRows.reduce((s,r) => s + parseFloat(r.monthlyCost||0), 0);
  const highCount = allRows.filter(r => r.confidence === 'HIGH').length;
  const techTypes = Object.keys(techGroups).join(', ');

  const subject = `[SmileTel Billing Recon] ${supplier} — Service Termination Review | ${allRows.length} services | ${fmt(totalCost)}/mo | ${highCount} HIGH confidence`;
  const html = buildEmailHtml(supplier, techGroups);

  await sendEmail(subject, html);
  emailsSent++;
  totalReviewed += allRows.length;

  console.log(`   ${supplier}: ${allRows.length} services | ${Object.keys(techGroups).length} tech types (${techTypes})`);
}

console.log(`\n=== COMPLETE ===`);
console.log(`Emails sent: ${emailsSent}`);
console.log(`Total services reviewed: ${totalReviewed}`);
