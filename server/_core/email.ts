/**
 * SmileTel Email Helper
 * ─────────────────────
 * Sends branded transactional emails via SendGrid SMTP relay.
 *
 * From:    noreply@smiletel.com.au  (SmileTel Provider Alerts)
 * To:      configurable per call (default: notifications@smiletel.com.au)
 * Auth:    SendGrid SMTP relay — username "apikey", password = SendGrid_Password secret
 *
 * Usage:
 *   import { sendEmail } from "./_core/email";
 *   await sendEmail({ to: "notifications@smiletel.com.au", subject: "...", html: "..." });
 */

import nodemailer from "nodemailer";
import { ENV } from "./env";

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

const FROM_ADDRESS = '"SmileTel Provider Alerts" <noreply@smiletel.com.au>';
const DEFAULT_TO = "notifications@smiletel.com.au";

// Lazy-initialised transporter (created once per process)
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: "smtp.sendgrid.net",
    port: 587,
    secure: false, // STARTTLS
    auth: {
      user: "apikey",                     // SendGrid SMTP always uses literal "apikey"
      pass: ENV.SENDGRID_API_KEY,         // SG.xxx API key with Mail Send permission
    },
  });

  return _transporter;
}

/**
 * Send a branded SmileTel email.
 * Returns true on success, false on failure (logs error).
 */
export async function sendEmail(opts: EmailOptions): Promise<boolean> {
  if (!ENV.SENDGRID_API_KEY) {
    console.warn("[Email] SendGrid_API not configured — skipping email send");
    return false;
  }

  const transporter = getTransporter();

  try {
    const info = await transporter.sendMail({
      from: FROM_ADDRESS,
      to: opts.to ?? DEFAULT_TO,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? stripHtml(opts.html),
      replyTo: opts.replyTo,
    });

    console.log(`[Email] Sent "${opts.subject}" → ${opts.to} (msgId: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error("[Email] Failed to send email:", err);
    return false;
  }
}

/** Strip HTML tags for plain-text fallback */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Build a branded SmileTel HTML email body.
 * Wraps content in a consistent SmileTel alert template.
 */
export function buildAlertEmail(opts: {
  title: string;
  urgency?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  bodyLines: string[];
  actionLine?: string;
  checkedAt?: string;
}): string {
  const urgencyColor =
    opts.urgency === "CRITICAL" ? "#dc2626"
    : opts.urgency === "HIGH"   ? "#ea580c"
    : opts.urgency === "MEDIUM" ? "#d97706"
    : "#6b7280";

  const urgencyBadge = opts.urgency
    ? `<span style="display:inline-block;padding:2px 10px;border-radius:4px;background:${urgencyColor};color:#fff;font-size:12px;font-weight:700;letter-spacing:0.05em;">${opts.urgency}</span>`
    : "";

  const bodyHtml = opts.bodyLines
    .map((line) =>
      line === ""
        ? "<br>"
        : `<p style="margin:4px 0;font-size:14px;color:#374151;">${line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`
    )
    .join("\n");

  const actionHtml = opts.actionLine
    ? `<div style="margin-top:16px;padding:12px 16px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;">
        <p style="margin:0;font-size:13px;color:#92400e;">${opts.actionLine}</p>
       </div>`
    : "";

  const checkedHtml = opts.checkedAt
    ? `<p style="margin-top:16px;font-size:12px;color:#9ca3af;">Checked at: ${opts.checkedAt}</p>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:20px 28px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">SmileTel</p>
            <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Provider Alert System</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px;">
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">${opts.title}</h2>
            ${urgencyBadge ? `<div style="margin-bottom:16px;">${urgencyBadge}</div>` : ""}
            ${bodyHtml}
            ${actionHtml}
            ${checkedHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              This is an automated alert from the SmileTel Billing &amp; Operations Platform.<br>
              To manage alert settings, log in to the SmileTel Billing Recon portal.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();
}
