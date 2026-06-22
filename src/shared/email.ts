/**
 * Minimal email sender — no npm dependencies.
 *
 * Send strategy (in priority order):
 *  1. SENDGRID_API_KEY env var → POST to SendGrid /v3/mail/send
 *  2. EMAIL_WEBHOOK_URL env var → POST raw payload to that URL (generic)
 *  3. Neither set → log the email to console (dev mode) and return sent=false
 */

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendResult {
  sent: boolean;
  preview?: string; // HTML preview when not actually sent
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const sgKey = process.env["SENDGRID_API_KEY"];
  const webhookUrl = process.env["EMAIL_WEBHOOK_URL"];

  if (sgKey) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sgKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from: { email: msg.from },
        subject: msg.subject,
        content: [{ type: "text/plain", value: msg.text }, { type: "text/html", value: msg.html }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid error: ${res.status} ${await res.text()}`);
    return { sent: true };
  }

  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
    if (!res.ok) throw new Error(`Email webhook error: ${res.status} ${await res.text()}`);
    return { sent: true };
  }

  // Dev fallback: log and return preview
  const { moduleLogger } = await import("./logger.js");
  moduleLogger("email").info({ to: msg.to, subject: msg.subject }, "email (dev preview — not sent)");
  return { sent: false, preview: msg.html };
}
