import dotenv from 'dotenv';
dotenv.config();
import { readFileSync } from 'fs';

const { customers, classified, summary, byProvider } = JSON.parse(readFileSync('/tmp/smileit_classified.json', 'utf8'));

const SENDGRID_API_KEY = process.env.SendGrid_API;

const formatCost = v => v ? `$${parseFloat(v).toFixed(2)}/mo` : '$0.00/mo';

// Build per-provider sections
const providerOrder = ['Vocus', 'Telstra', 'TIAB', 'SasBoss', 'AAPT', 'ABB', 'ChannelHaus', 'Exetel', 'Unknown'];

function buildProviderSection(provider, services) {
  const keep = services.filter(s => s.recommendation.startsWith('KEEP'));
  const reassign = services.filter(s => s.recommendation.startsWith('REASSIGN'));
  const investigate = services.filter(s => s.recommendation.startsWith('INVESTIGATE'));
  const flagged = services.filter(s => s.recommendation.startsWith('ALREADY'));
  const totalCost = services.reduce((sum, s) => sum + (parseFloat(s.monthlyCost) || 0), 0);

  let html = `
    <h2 style="color:#1a1a2e;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-top:32px;">
      ${provider} — ${services.length} services | $${totalCost.toFixed(2)}/mo
    </h2>
    <p style="color:#64748b;font-size:13px;">
      ✅ Keep: ${keep.length} &nbsp;|&nbsp; 🔄 Reassign: ${reassign.length} &nbsp;|&nbsp; 🔍 Investigate: ${investigate.length} &nbsp;|&nbsp; 🚩 Already Flagged: ${flagged.length}
    </p>`;

  const renderTable = (title, color, svcs) => {
    if (!svcs.length) return '';
    let rows = svcs.map(s => `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px 6px;font-size:12px;font-family:monospace;">${s.externalId}</td>
        <td style="padding:8px 6px;font-size:12px;">${s.planName || s.serviceId || '—'}</td>
        <td style="padding:8px 6px;font-size:12px;">${s.serviceType || '—'}${s.serviceTypeDetail ? ' / ' + s.serviceTypeDetail : ''}</td>
        <td style="padding:8px 6px;font-size:12px;">${s.phoneNumber || s.connectionId || s.avcId || '—'}</td>
        <td style="padding:8px 6px;font-size:12px;">${s.locationAddress || '—'}</td>
        <td style="padding:8px 6px;font-size:12px;font-weight:600;">${formatCost(s.monthlyCost)}</td>
        <td style="padding:8px 6px;font-size:12px;">${s.serviceActivationDate ? new Date(s.serviceActivationDate).toLocaleDateString('en-AU') : '—'}</td>
        <td style="padding:8px 6px;font-size:12px;color:${color};">${s.confidence}</td>
        <td style="padding:8px 6px;font-size:12px;">${s.reason}</td>
        <td style="padding:8px 6px;font-size:12px;color:#7c3aed;">${s.suggestedCustomer || '—'}</td>
      </tr>`).join('');

    return `
      <h3 style="color:${color};margin-top:20px;">${title}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 6px;text-align:left;font-size:11px;color:#64748b;">Service ID</th>
            <th style="padding:8px 6px;text-align:left;font-size:11px;color:#64748b;">Plan / Name</th>
            <th style="padding:8px 6px;text-align:left;font-size:11px;color:#64748b;">Type</th>
            <th style="padding:8px 6px;text-align:left;font-size:11px;color:#64748b;">Phone / ID</th>
            <th style="padding:8px 6px;text-align:left;font-size:11px;color:#64748b;">Address</th>
            <th style="padding:8px 6px;text-align:left;font-size:11px;color:#64748b;">Cost</th>
            <th style="padding:8px 6px;text-align:left;font-size:11px;color:#64748b;">Activated</th>
            <th style="padding:8px 6px;text-align:left;font-size:11px;color:#64748b;">Confidence</th>
            <th style="padding:8px 6px;text-align:left;font-size:11px;color:#64748b;">Reason</th>
            <th style="padding:8px 6px;text-align:left;font-size:11px;color:#64748b;">Suggested Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  };

  html += renderTable('✅ KEEP — Legitimate Internal Services', '#16a34a', keep);
  html += renderTable('🔄 REASSIGN — Mis-assigned Customer Services', '#dc2626', reassign);
  html += renderTable('🔍 INVESTIGATE — Manual Review Required', '#d97706', investigate);
  html += renderTable('🚩 ALREADY FLAGGED FOR TERMINATION', '#9ca3af', flagged);

  return html;
}

// Build full email body
const totalCost = classified.reduce((sum, s) => sum + (parseFloat(s.monthlyCost) || 0), 0);
const reassignCost = classified.filter(s => s.recommendation.startsWith('REASSIGN')).reduce((sum, s) => sum + (parseFloat(s.monthlyCost) || 0), 0);

let body = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:1400px;margin:0 auto;padding:24px;color:#1a1a2e;">

<div style="background:#1a1a2e;color:white;padding:24px;border-radius:8px;margin-bottom:24px;">
  <h1 style="margin:0 0 8px 0;font-size:22px;">Smile IT — Internal Services Review</h1>
  <p style="margin:0;color:#94a3b8;font-size:14px;">Generated: ${new Date().toLocaleDateString('en-AU', {day:'2-digit',month:'long',year:'numeric'})} | SmileTel Billing Reconciliation</p>
</div>

<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:24px;">
  <h2 style="margin:0 0 8px 0;color:#92400e;font-size:16px;">⚠️ IMPORTANT INSTRUCTIONS FOR SUPPORT TEAM</h2>
  <p style="margin:0 0 8px 0;color:#78350f;font-size:13px;">
    This ticket covers <strong>122 services currently assigned to "Smile IT"</strong> in the billing system. 
    The objective is to <strong>correctly identify which services legitimately belong to Smile IT for internal accounting</strong> 
    and <strong>reassign all others to the correct end customer</strong>.
  </p>
  <ul style="margin:8px 0;color:#78350f;font-size:13px;">
    <li><strong>DO NOT terminate any service</strong> without first confirming it is not active and in use.</li>
    <li><strong>REASSIGN services</strong> by opening the service in Lucid, clicking the customer field, and searching for the correct customer.</li>
    <li><strong>INVESTIGATE services</strong> require manual research — check the carrier portal, Xero, or OneBill to identify the correct customer.</li>
    <li><strong>KEEP services</strong> are confirmed internal Smile IT services — no action needed.</li>
    <li>The <strong>Vocus 86 services ($8,095/mo)</strong> are the highest priority — these are all end-customer NBN/SIM services that defaulted to Smile IT because Vocus bills Smile IT as the wholesale reseller.</li>
  </ul>
</div>

<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;">
    <div style="font-size:28px;font-weight:700;color:#16a34a;">${summary.keep}</div>
    <div style="font-size:12px;color:#15803d;">✅ KEEP (Internal)</div>
  </div>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;text-align:center;">
    <div style="font-size:28px;font-weight:700;color:#dc2626;">${summary.reassign}</div>
    <div style="font-size:12px;color:#b91c1c;">🔄 REASSIGN</div>
    <div style="font-size:11px;color:#b91c1c;">$${reassignCost.toFixed(2)}/mo</div>
  </div>
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;text-align:center;">
    <div style="font-size:28px;font-weight:700;color:#d97706;">${summary.investigate}</div>
    <div style="font-size:12px;color:#b45309;">🔍 INVESTIGATE</div>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">
    <div style="font-size:28px;font-weight:700;color:#64748b;">${summary.alreadyFlagged}</div>
    <div style="font-size:12px;color:#475569;">🚩 ALREADY FLAGGED</div>
  </div>
</div>

<p style="color:#64748b;font-size:13px;">
  Total services: <strong>${summary.total}</strong> | 
  Total monthly cost: <strong>$${totalCost.toFixed(2)}/mo</strong> | 
  Mis-assigned cost to reallocate: <strong>$${reassignCost.toFixed(2)}/mo</strong>
</p>
`;

// Add each provider section
for (const provider of providerOrder) {
  if (byProvider[provider]) {
    body += buildProviderSection(provider, byProvider[provider]);
  }
}

// Any remaining providers
for (const [provider, services] of Object.entries(byProvider)) {
  if (!providerOrder.includes(provider)) {
    body += buildProviderSection(provider, services);
  }
}

body += `
<hr style="margin:32px 0;border:none;border-top:1px solid #e2e8f0;">
<p style="color:#94a3b8;font-size:12px;">
  Generated by SmileTel Billing Reconciliation System | ${new Date().toISOString()}
</p>
</body>
</html>`;

// Send via SendGrid
const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    personalizations: [{
      to: [{ email: 'support@smiletel.com.au' }],
      subject: '[Lucid] Smile IT Internal Services Review — 122 Services Require Classification (REASSIGN / INVESTIGATE / KEEP)'
    }],
    from: { email: 'billing@smiletel.com.au', name: 'SmileTel Billing Recon' },
    content: [{ type: 'text/html', value: body }]
  })
});

if (response.ok) {
  console.log('✅ Email sent successfully to support@smiletel.com.au');
  console.log(`Subject: [Lucid] Smile IT Internal Services Review — 122 Services Require Classification`);
} else {
  const err = await response.text();
  console.error('❌ Email failed:', response.status, err);
}
