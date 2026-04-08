import fs from 'fs';

const sendgridKey = process.env.SendGrid_API;
if (!sendgridKey) { console.error('SendGrid_API not set'); process.exit(1); }

const data = JSON.parse(fs.readFileSync('/tmp/vocus_crossref.json'));
const today = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' });

// Helper to format activation date (some are Excel serial numbers)
function fmtDate(d) {
  if (!d) return '—';
  if (/^\d{5}$/.test(d)) {
    // Excel serial date
    const date = new Date(Date.UTC(1899, 11, 30) + parseInt(d) * 86400000);
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return d;
}

// Split into sub-categories
const tiabReady = data.inVocusFile.filter(s => s.tiabSims && s.tiabSims.length > 0);
const needTiab = data.inVocusFile.filter(s => !s.tiabSims || s.tiabSims.length === 0);
const specialCases = data.notInVocusFile; // RVC NBN - not SIMs

// Build Cat A rows (TIAB already active - cancel Vocus now)
let catARows = '';
tiabReady.forEach((s, i) => {
  const v = s.vocusData;
  const tiab = s.tiabSims[0];
  catARows += `
<tr class="cat-a">
  <td>${i+1}</td>
  <td><strong>${s.customerName}</strong><br><small>${s.custId}</small></td>
  <td>${s.dbPhone || '—'}</td>
  <td>${s.dbSimSerial || '—'}</td>
  <td>${v.vocusServiceId}</td>
  <td>${v.planType || 'Wholesale Mobile 4G'}</td>
  <td>${fmtDate(v.activationDate)}</td>
  <td>${v.vocusAddress || v.address + ', ' + v.city + ' ' + v.state}</td>
  <td>${v.matchedBusinessName || v.matchedCustomerName || '—'}</td>
  <td>${v.matchedEmail || s.custEmail || '—'}</td>
  <td><strong>${tiab.phoneNumber}</strong></td>
  <td>${tiab.simSerialNumber || '—'}</td>
  <td>${fmtDate(tiab.serviceActivationDate)}</td>
  <td>TIAB SIM active — <strong>cancel Vocus SIM now</strong> via Vocus portal. Then mark service terminated in billing system.</td>
</tr>`;
});

// Build Cat B rows (need TIAB SIM first)
let catBRows = '';
needTiab.forEach((s, i) => {
  const v = s.vocusData;
  const custStatusBadge = s.custStatus === 'review' ? ' ⚠️ Customer status: REVIEW' : s.custStatus === 'inactive' ? ' ⚠️ Customer status: INACTIVE' : '';
  catBRows += `
<tr class="cat-b">
  <td>${i+1}</td>
  <td><strong>${s.customerName}</strong><br><small>${s.custId}${custStatusBadge}</small></td>
  <td>${s.dbPhone || '—'}</td>
  <td>${s.dbSimSerial || '—'}</td>
  <td>${v.vocusServiceId}</td>
  <td>${v.planType || 'Wholesale Mobile 4G'}</td>
  <td>${fmtDate(v.activationDate)}</td>
  <td>${v.vocusAddress || v.address + ', ' + v.city + ' ' + v.state}</td>
  <td>${v.matchedBusinessName || v.matchedCustomerName || '—'}</td>
  <td>${v.matchedEmail || s.custEmail || '—'}</td>
  <td colspan="3">No TIAB SIM on record</td>
  <td>${s.custStatus === 'review' || s.custStatus === 'inactive' ? '<strong>⚠️ Confirm customer is still active before ordering TIAB SIM.</strong> If closed: cancel Vocus SIM + terminate all services + close customer record.' : 'Order TIAB SIM → confirm it is active and inserted in router → then cancel Vocus SIM via portal.'}</td>
</tr>`;
});

// Build Cat C rows (not SIMs - NBN services)
let catCRows = '';
specialCases.forEach((s, i) => {
  catCRows += `
<tr class="cat-c">
  <td>${i+1}</td>
  <td><strong>${s.customerName}</strong><br><small>${s.custId}</small></td>
  <td>${s.phoneNumber || '—'}</td>
  <td>${s.simSerialNumber || '—'}</td>
  <td colspan="2">${s.planName}</td>
  <td>—</td>
  <td>${s.locationAddress || s.siteAddress || '—'}</td>
  <td colspan="2">${s.contactEmail || '—'}</td>
  <td colspan="3">NBN Service — not a mobile SIM</td>
  <td><strong>NO ACTION REQUIRED.</strong> These are NBN broadband services, not mobile SIMs. They were correctly excluded from the Vocus SIM active list. Retain as-is.</td>
</tr>`;
});

const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: Arial, sans-serif; font-size: 13px; color: #111827; max-width: 1200px; margin: 0 auto; padding: 20px; }
h1 { color: #111827; font-size: 20px; border-bottom: 3px solid #dc2626; padding-bottom: 8px; }
h2 { color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 4px; margin-top: 32px; font-size: 15px; }
.instructions { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 16px; margin: 16px 0; border-radius: 4px; }
.instructions h3 { margin: 0 0 8px 0; color: #92400e; font-size: 14px; }
.instructions ol { margin: 6px 0 0 0; padding-left: 20px; }
.instructions li { margin-bottom: 4px; }
table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 11px; }
th { background: #1a56db; color: white; padding: 7px 8px; text-align: left; white-space: nowrap; }
td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
tr:nth-child(even) td { background: #f9fafb; }
.cat-a td { background: #dcfce7 !important; }
.cat-b td { background: #fef9c3 !important; }
.cat-c td { background: #f0f9ff !important; }
.summary-box { display: inline-block; background: #1e40af; color: white; padding: 12px 20px; border-radius: 6px; margin: 4px; text-align: center; }
.summary-box .num { font-size: 28px; font-weight: bold; display: block; }
.summary-box .lbl { font-size: 11px; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
p { margin: 6px 0; line-height: 1.5; }
small { color: #6b7280; }
</style></head>
<body>

<h1>⚠️ ACTION REQUIRED — Vocus/Optus SIM Audit: Cancellations &amp; TIAB Replacements (17 SIMs)</h1>

<p>Hi Team,</p>
<p>A full audit of all active Vocus/Optus mobile SIMs has been completed. The Vocus portal export (93 active SIMs) has been cross-referenced against the billing system. <strong>17 SIMs in our system are confirmed active on the Vocus portal and must be replaced with TIAB SIMs.</strong> Below are the detailed instructions for each service.</p>

<div style="margin:16px 0;">
  <div class="summary-box" style="background:#16a34a"><span class="num">${tiabReady.length}</span><span class="lbl">Category A<br>TIAB Active — Cancel Vocus Now</span></div>
  <div class="summary-box" style="background:#d97706"><span class="num">${needTiab.length}</span><span class="lbl">Category B<br>Send TIAB First, Then Cancel</span></div>
  <div class="summary-box" style="background:#0284c7"><span class="num">${specialCases.length}</span><span class="lbl">Category C<br>NBN Services — No Action</span></div>
  <div class="summary-box" style="background:#6b7280"><span class="num">76</span><span class="lbl">Vocus Portal SIMs<br>Not Yet in Billing System</span></div>
</div>

<div class="instructions">
  <h3>📋 CRITICAL INSTRUCTIONS — READ BEFORE TAKING ANY ACTION</h3>
  <ol>
    <li><strong>NEVER cancel a Vocus SIM before confirming the TIAB replacement SIM is active and inserted in the router at the site.</strong> Cancelling first will leave the customer with no backup internet.</li>
    <li><strong>Category A (green):</strong> TIAB SIM is already active. Log into the Vocus portal, cancel the Vocus SIM using the Vocus Service ID, then mark the service as Terminated in the billing system.</li>
    <li><strong>Category B (yellow):</strong> No TIAB SIM has been sent yet. Order the TIAB SIM first, ship it to the site, confirm it is active and inserted, then cancel the Vocus SIM. For sites with a ⚠️ customer status flag, confirm the customer is still trading before ordering.</li>
    <li><strong>Category C (blue):</strong> These are NBN broadband services, not mobile SIMs. They do not appear on the Vocus SIM list because they are a different product type. <strong>Do not cancel or investigate these.</strong></li>
    <li><strong>76 additional Vocus SIMs</strong> appear on the Vocus portal but are not yet tracked in the billing system. These will be imported in a separate data ingestion task — do not action them from this email.</li>
    <li>After cancelling each Vocus SIM, update the service record in the billing system: set status to <em>Terminated</em> and add a note with the cancellation date and confirmation reference from the Vocus portal.</li>
  </ol>
</div>

<h2>✅ CATEGORY A — TIAB REPLACEMENT CONFIRMED: CANCEL VOCUS SIM NOW (${tiabReady.length} SIMs)</h2>
<p>The TIAB replacement SIM is already active. Cancel the Vocus SIM immediately via the Vocus portal using the Vocus Service ID.</p>
<table>
<tr>
  <th>#</th><th>Site / Customer</th><th>Vocus Number</th><th>Vocus SIM Serial (ICCID)</th>
  <th>Vocus Service ID</th><th>Plan Type</th><th>Activated</th><th>Site Address</th>
  <th>Franchisee / Business</th><th>Contact Email</th>
  <th>TIAB Replacement Number</th><th>TIAB SIM Serial</th><th>TIAB Activated</th>
  <th>Action</th>
</tr>
${catARows}
</table>

<h2>⚠️ CATEGORY B — SEND TIAB SIM FIRST, THEN CANCEL VOCUS (${needTiab.length} SIMs)</h2>
<p>No confirmed TIAB replacement is active. <strong>Order and activate the TIAB SIM first, confirm it is working at the site, then cancel the Vocus SIM.</strong> Sites with ⚠️ flags need customer status confirmed before ordering.</p>
<table>
<tr>
  <th>#</th><th>Site / Customer</th><th>Vocus Number</th><th>Vocus SIM Serial (ICCID)</th>
  <th>Vocus Service ID</th><th>Plan Type</th><th>Activated</th><th>Site Address</th>
  <th>Franchisee / Business</th><th>Contact Email</th>
  <th colspan="3">TIAB Status</th>
  <th>Action</th>
</tr>
${catBRows}
</table>

<h2>🔵 CATEGORY C — NBN SERVICES: NO ACTION REQUIRED (${specialCases.length} Services)</h2>
<p>These services were flagged as "not on Vocus SIM list" but are NBN broadband services — a different product type. They are correctly excluded from the SIM audit. <strong>Do not cancel or modify these services.</strong></p>
<table>
<tr>
  <th>#</th><th>Customer</th><th>Phone</th><th>SIM Serial</th>
  <th colspan="2">Plan</th><th>Activated</th><th>Address</th>
  <th colspan="2">Contact</th>
  <th colspan="3">Notes</th>
  <th>Action</th>
</tr>
${catCRows}
</table>

<hr>
<h2>📊 ADDITIONAL CONTEXT: 76 Vocus SIMs Not Yet in Billing System</h2>
<p>The Vocus portal export contains <strong>76 additional active SIMs</strong> that are not currently tracked in the billing system. These are predominantly Zambrero, Yiros Shop, Nodo, and other customer sites that were provisioned via Vocus but not yet imported. These will be addressed in a separate data ingestion task. <strong>Do not action these from this email.</strong></p>

<hr>
<p style="font-size:11px;color:#6b7280;">Generated by the SmileTel Billing Recon system on ${today}. All 17 Vocus SIM services have been set to 'Flagged for Termination' status in the billing system. For questions, reply to this email or update the relevant service record in the billing system with notes.</p>
</body></html>`;

const payload = {
  personalizations: [{ to: [{ email: 'support@smiletel.com.au' }] }],
  from: { email: 'billing@smiletel.com.au', name: 'SmileTel Billing Recon' },
  subject: 'ACTION REQUIRED — Vocus/Optus SIM Audit: Cancellations & TIAB Replacements (17 SIMs)',
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
