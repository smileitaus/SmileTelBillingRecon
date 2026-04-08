import fs from 'fs';

const sendgridKey = process.env.SendGrid_API;
if (!sendgridKey) { console.error('SendGrid_API not set'); process.exit(1); }

const today = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' });

// Load the 76 untracked Vocus SIMs dataset
const crossref = JSON.parse(fs.readFileSync('/tmp/vocus_crossref.json'));
const untracked = crossref.inVocusNotInDb;

// Load duplicate SIM data
const duplicates = JSON.parse(fs.readFileSync('/tmp/duplicate_sims.json'));

// Load full Vocus parsed data for enrichment
const vocusParsed = JSON.parse(fs.readFileSync('/tmp/vocus_parsed_v2.json'));
const vocusByServiceId = {};
vocusParsed.forEach(v => { vocusByServiceId[v.vocusServiceId] = v; });

function fmtDate(d) {
  if (!d) return '—';
  if (/^\d{5}$/.test(d)) {
    const date = new Date(Date.UTC(1899, 11, 30) + parseInt(d) * 86400000);
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return d;
}

// Build recommendation for each of the 76 untracked SIMs
function getRec(v, dupData) {
  const name = (v.clientName + ' ' + (v.vocusCustName || '')).toLowerCase();
  const isInternal = v.isInternal || name.includes('smile it') || name.includes('smileit') || name.includes('peter drummond') || name.includes('elysia') || name.includes('mike teo') || name.includes('internal');
  const isLoan = name.includes('loan');
  const custStatus = v.matchedCustomerId ? 'matched' : 'unmatched';

  // Check if this customer appears in duplicate list
  const dupEntry = dupData ? dupData.find(d => d.custId === v.matchedCustomerId) : null;
  const hasDuplicate = !!dupEntry;

  if (isInternal) {
    return { rec: 'KEEP — Internal Use', priority: 'LOW', colour: '#dbeafe',
      reason: 'Smile IT internal SIM assigned to a staff member or internal device.',
      action: 'Confirm with management that this SIM is actively assigned. If unassigned or spare, cancel.' };
  }

  if (isLoan) {
    return { rec: 'INVESTIGATE — Loan SIM', priority: 'HIGH', colour: '#fef9c3',
      reason: 'Service label indicates this is a LOAN SIM. Loan SIMs are temporary and should be recovered once the permanent solution is in place.',
      action: 'Confirm whether the loan period has ended. If yes: recover SIM and cancel. If still on loan: confirm end date and schedule cancellation.' };
  }

  if (!v.matchedCustomerId) {
    return { rec: 'INVESTIGATE — No Customer Match', priority: 'HIGH', colour: '#fee2e2',
      reason: 'This SIM has no matching customer record in the billing system. It may belong to a customer not yet onboarded, a closed account, or a provisioning error.',
      action: 'Identify who this SIM belongs to using the Vocus client name and address. Create customer record if active, or cancel if customer has closed.' };
  }

  if (hasDuplicate && dupEntry.tiabCount > 0) {
    return { rec: '🔴 CANCEL — TIAB Already Active (Duplicate)', priority: 'HIGH', colour: '#fee2e2',
      reason: `Customer already has ${dupEntry.tiabCount} active TIAB SIM(s) in the billing system. This Vocus SIM is redundant.`,
      action: `Confirm TIAB SIM (${dupEntry.sims.filter(s=>s.supplier==='TIAB').map(s=>s.phone||'no phone').join(', ')}) is active and working in the router, then cancel this Vocus SIM via the portal.` };
  }

  if (hasDuplicate && dupEntry.totalSims >= 2 && dupEntry.tiabCount === 0) {
    return { rec: '⚠️ DUPLICATE — Multiple SIMs, No TIAB', priority: 'HIGH', colour: '#fef9c3',
      reason: `Customer has ${dupEntry.totalSims} SIM services on record with no TIAB replacement. Multiple SIMs at the same site may indicate multiple routers, or a provisioning duplicate.`,
      action: 'Confirm with the site how many routers/devices are in use. If only one router: identify which SIM is active and cancel the other. Then replace the active one with TIAB.' };
  }

  // Standard mobile SIM - active customer, no TIAB
  return { rec: 'REPLACE WITH TIAB', priority: 'MEDIUM', colour: '#fef9c3',
    reason: 'Active Vocus mobile SIM for an active customer. No TIAB replacement has been provisioned. Replacing with TIAB will consolidate onto the preferred supplier and reduce cost.',
    action: 'Order TIAB SIM → ship to site → confirm active in router → cancel this Vocus SIM. Do NOT cancel before TIAB is confirmed working. Awaiting usage data to confirm this SIM is in active use.' };
}

// Sort untracked: HIGH priority first, then by client name
const processed = untracked.map(v => {
  const dupData = duplicates;
  const rec = getRec(v, dupData);
  return { ...v, ...rec };
});
processed.sort((a, b) => {
  const po = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return (po[a.priority] || 1) - (po[b.priority] || 1);
});

// Summary counts
const highCount = processed.filter(v => v.priority === 'HIGH').length;
const medCount = processed.filter(v => v.priority === 'MEDIUM').length;
const lowCount = processed.filter(v => v.priority === 'LOW').length;
const cancelCount = processed.filter(v => v.rec.includes('CANCEL')).length;
const replaceCount = processed.filter(v => v.rec.includes('REPLACE')).length;
const investigateCount = processed.filter(v => v.rec.includes('INVESTIGATE') || v.rec.includes('DUPLICATE') || v.rec.includes('LOAN')).length;
const keepCount = processed.filter(v => v.rec.includes('KEEP')).length;

// Build the 76-row table
let simRows = '';
processed.forEach((v, i) => {
  const dupEntry = duplicates.find(d => d.custId === v.matchedCustomerId);
  const dupFlag = dupEntry ? `⚠️ ${dupEntry.totalSims} SIMs on record` : '—';
  const tiabOnRecord = dupEntry ? dupEntry.sims.filter(s => s.supplier === 'TIAB').map(s => s.phone || 'no phone').join(', ') : '—';

  simRows += `
<tr style="background:${v.colour}">
  <td style="font-weight:bold;text-align:center">${i + 1}</td>
  <td><strong>${v.clientName}</strong>${v.vocusCustName && v.vocusCustName !== v.clientName ? '<br><small>' + v.vocusCustName + '</small>' : ''}</td>
  <td style="font-family:monospace">${v.msn}</td>
  <td style="font-family:monospace;font-size:10px">${v.vocusServiceId}</td>
  <td>${v.planType || 'Mobile Service'}</td>
  <td style="font-size:10px">${fmtDate(v.activationDate)}</td>
  <td style="font-size:10px">${v.address}, ${v.city} ${v.state} ${v.postCode}</td>
  <td style="font-size:10px">${v.matchedCustomerId || '—'}</td>
  <td style="font-size:10px">${v.matchedCustomerName || '—'}</td>
  <td style="font-size:10px">${v.matchedBusinessName || '—'}</td>
  <td style="font-size:10px">${v.matchedEmail || '—'}</td>
  <td style="text-align:center">${dupFlag}</td>
  <td style="font-size:10px">${tiabOnRecord}</td>
  <td><strong>${v.rec}</strong></td>
  <td style="font-size:10px;color:#374151">${v.reason}</td>
  <td style="font-size:10px;color:#1a56db"><strong>${v.action}</strong></td>
</tr>`;
});

// Build duplicate SIM section
let dupRows = '';
const relevantDups = duplicates.filter(d => {
  // Exclude: RVC NBN (not SIMs), pure ABB-only flagged (already handled), pure TIAB-only with clear reason
  if (d.custId === 'C0207') return false; // RVC NBN
  return true;
});

relevantDups.forEach((c, i) => {
  const tiab = c.sims.filter(s => s.supplier === 'TIAB');
  const legacy = c.sims.filter(s => s.supplier !== 'TIAB');
  const allFlagged = c.sims.every(s => s.status === 'flagged_for_termination');
  const bgColour = c.flag.includes('🔴') ? '#fee2e2' : c.flag.includes('🟡') ? '#fef9c3' : '#f0f9ff';

  c.sims.forEach((s, si) => {
    const isFirst = si === 0;
    dupRows += `
<tr style="background:${bgColour}">
  ${isFirst ? `<td rowspan="${c.sims.length}" style="font-weight:bold;vertical-align:top">${i + 1}</td>
  <td rowspan="${c.sims.length}" style="vertical-align:top"><strong>${c.custName}</strong><br><small>${c.custId}</small><br><small>Status: ${c.custStatus || '—'}</small><br><small>${c.siteAddress || ''}</small></td>
  <td rowspan="${c.sims.length}" style="vertical-align:top;font-size:10px">${c.flag}</td>
  <td rowspan="${c.sims.length}" style="vertical-align:top;font-size:10px">${c.recommendation}</td>
  <td rowspan="${c.sims.length}" style="vertical-align:top;font-size:10px;color:#374151">${c.reason}</td>` : ''}
  <td style="font-family:monospace;font-size:11px">${s.supplier}</td>
  <td style="font-family:monospace;font-size:11px">${s.phone || '—'}</td>
  <td style="font-family:monospace;font-size:10px">${s.serial || '—'}</td>
  <td style="font-size:10px">${s.plan}</td>
  <td style="font-size:10px;${s.status === 'flagged_for_termination' ? 'color:#dc2626' : s.status === 'active' || s.status === 'Active' ? 'color:#16a34a' : ''}">${s.status}</td>
  <td style="font-size:10px">$${s.cost || '—'}/mo</td>
</tr>`;
  });
});

const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: Arial, sans-serif; font-size: 13px; color: #111827; max-width: 1400px; margin: 0 auto; padding: 20px; }
h1 { color: #111827; font-size: 20px; border-bottom: 3px solid #1a56db; padding-bottom: 8px; }
h2 { color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 4px; margin-top: 32px; font-size: 15px; }
.instructions { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 16px; margin: 16px 0; border-radius: 4px; }
.instructions h3 { margin: 0 0 8px 0; color: #92400e; font-size: 14px; }
.instructions ol { margin: 6px 0 0 0; padding-left: 20px; line-height: 1.8; }
.notice { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; border-radius: 4px; font-size: 12px; }
table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 11px; }
th { background: #1a56db; color: white; padding: 7px 8px; text-align: left; white-space: nowrap; }
td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
.summary-box { display: inline-block; padding: 12px 18px; border-radius: 6px; margin: 4px; text-align: center; color: white; }
.summary-box .num { font-size: 26px; font-weight: bold; display: block; }
.summary-box .lbl { font-size: 10px; }
hr { border: none; border-top: 2px solid #e5e7eb; margin: 28px 0; }
p { margin: 6px 0; line-height: 1.6; }
</style></head>
<body>

<h1>📋 VOCUS SIM REVIEW — 76 Untracked Services + Duplicate SIM Flags</h1>
<p>Hi Team,</p>
<p>This email contains two sections:</p>
<ol>
  <li><strong>Section 1:</strong> The 76 Vocus SIMs currently active on the Vocus portal that are <em>not yet tracked</em> in the billing system — each with a recommendation for keeping, replacing with TIAB, or cancelling.</li>
  <li><strong>Section 2:</strong> All customers in the billing system who currently have <em>2 or more</em> mobile/4G backup SIM services — flagged for review to eliminate redundancy.</li>
</ol>

<div class="notice">
  <strong>⚠️ Important note on recommendations:</strong> These recommendations are based on the data currently available (Vocus portal status, billing system customer records, and existing TIAB SIM data). Usage and billing data has not yet been reviewed. <strong>Next week, Vocus usage/billing data will be provided to validate these recommendations before any cancellations are actioned.</strong> Do not cancel any SIM until that review is complete, unless it is clearly redundant (e.g. customer is inactive/closed, or TIAB is already confirmed active).
</div>

<div style="margin:16px 0">
  <div class="summary-box" style="background:#dc2626"><span class="num">${cancelCount}</span><span class="lbl">Recommend<br>CANCEL</span></div>
  <div class="summary-box" style="background:#d97706"><span class="num">${investigateCount}</span><span class="lbl">INVESTIGATE /<br>DUPLICATE</span></div>
  <div class="summary-box" style="background:#0284c7"><span class="num">${replaceCount}</span><span class="lbl">REPLACE<br>with TIAB</span></div>
  <div class="summary-box" style="background:#16a34a"><span class="num">${keepCount}</span><span class="lbl">KEEP<br>(Internal)</span></div>
  <div class="summary-box" style="background:#6b7280"><span class="num">${highCount}</span><span class="lbl">HIGH<br>Priority</span></div>
  <div class="summary-box" style="background:#9ca3af"><span class="num">${medCount}</span><span class="lbl">MEDIUM<br>Priority</span></div>
</div>

<div class="instructions">
  <h3>📋 HOW TO USE THIS LIST</h3>
  <ol>
    <li><strong>HIGH priority items</strong> (red/yellow) should be reviewed first — these are cases where a customer is inactive/closed, a TIAB replacement is already active, or a duplicate has been detected.</li>
    <li><strong>MEDIUM priority items</strong> are active Vocus SIMs for active customers with no TIAB yet — these should be scheduled for TIAB replacement but are not urgent.</li>
    <li><strong>NEVER cancel a SIM before confirming:</strong> (a) the customer is still active, and (b) either no backup SIM is needed, or the TIAB replacement is confirmed working at the site.</li>
    <li><strong>Vocus usage data</strong> will be provided next week — hold all MEDIUM priority decisions until that data is reviewed. High priority items (inactive customers, confirmed TIAB replacements) can be actioned now.</li>
    <li>After actioning any cancellation, update the billing system: set service status to Terminated and add a note with the date and Vocus portal confirmation reference.</li>
  </ol>
</div>

<hr>

<h2>SECTION 1 — 76 VOCUS SIMs NOT YET IN BILLING SYSTEM</h2>
<p>These SIMs are active on the Vocus portal but have no corresponding service record in the billing system. They need to be either imported (if being kept/replaced) or cancelled (if redundant).</p>

<table>
<tr>
  <th>#</th>
  <th>Vocus Client Name / Label</th>
  <th>Mobile Number</th>
  <th>Vocus Service ID</th>
  <th>Plan Type</th>
  <th>Activated</th>
  <th>Site Address</th>
  <th>Cust ID</th>
  <th>Matched Customer</th>
  <th>Franchisee / Business</th>
  <th>Contact Email</th>
  <th>Duplicate SIM Flag</th>
  <th>TIAB on Record</th>
  <th>Recommendation</th>
  <th>Reason</th>
  <th>Action Required</th>
</tr>
${simRows}
</table>

<hr>

<h2>SECTION 2 — CUSTOMERS WITH 2+ SIM SERVICES (DUPLICATE FLAG)</h2>
<p>The following customers have <strong>2 or more mobile/4G backup SIM services</strong> recorded in the billing system (across all suppliers: Vocus, ABB, TIAB). Each case has been categorised. Rows highlighted in <span style="background:#fee2e2;padding:2px 6px">red</span> require immediate action; <span style="background:#fef9c3;padding:2px 6px">yellow</span> require investigation; <span style="background:#f0f9ff;padding:2px 6px">blue</span> are expected/normal.</p>

<table>
<tr>
  <th>#</th>
  <th>Customer</th>
  <th>Flag</th>
  <th>Recommendation</th>
  <th>Reason</th>
  <th>Supplier</th>
  <th>Mobile Number</th>
  <th>SIM Serial</th>
  <th>Plan</th>
  <th>Status</th>
  <th>Cost</th>
</tr>
${dupRows}
</table>

<hr>
<p style="font-size:11px;color:#6b7280;">
  Generated by the SmileTel Billing Recon system on ${today}.<br>
  Section 1 covers 76 Vocus SIMs active on the portal but not yet tracked in the billing system.<br>
  Section 2 covers ${relevantDups.length} customers with 2+ SIM services across all suppliers.<br>
  Vocus usage/billing data will be provided next week to finalise recommendations. For questions, reply to this email.
</p>
</body></html>`;

const payload = {
  personalizations: [{ to: [{ email: 'support@smiletel.com.au' }] }],
  from: { email: 'billing@smiletel.com.au', name: 'SmileTel Billing Recon' },
  subject: `Vocus SIM Review — 76 Untracked SIMs + Duplicate Flags (${today})`,
  content: [{ type: 'text/html', value: html }]
};

const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + sendgridKey, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

console.log('Status:', response.status);
if (!response.ok) {
  const text = await response.text();
  console.log('Error:', text);
} else {
  console.log('Email sent successfully to support@smiletel.com.au');
}
