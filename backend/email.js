const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { waitUntil } = require('@vercel/functions');
const { validEmail } = require('./security');

function emailConfiguration() {
  const mode = (process.env.EMAIL_MODE || 'simulate').trim().toLowerCase();
  const sender = process.env.SENDER_EMAIL?.trim() || '';
  const brevoApiKey = process.env.BREVO_API_KEY?.trim() || '';
  const missing = [];
  if (!['simulate', 'brevo', 'smtp'].includes(mode)) missing.push('Valid EMAIL_MODE (simulate, brevo, or smtp)');
  if (mode !== 'simulate' && !validEmail(sender)) missing.push('SENDER_EMAIL');
  if (mode === 'brevo' && !brevoApiKey) missing.push('BREVO_API_KEY');
  if (mode === 'smtp') {
    if (!process.env.SMTP_USER) missing.push('SMTP_USER');
    if (!process.env.SMTP_PASS) missing.push('SMTP_PASS');
    if (!Number.isInteger(Number(process.env.SMTP_PORT || 587)) || Number(process.env.SMTP_PORT || 587) < 1 || Number(process.env.SMTP_PORT || 587) > 65535) missing.push('SMTP_PORT');
  }
  return { mode, sender, configured: missing.length === 0, missing };
}

// Preserve action URLs in the plain-text alternative for mail clients without HTML.
function plainText(html) {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(?:p|div|h[1-6]|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}

async function deliverEmail(recipientEmail, recipientName, subject, html, savedText) {
  const config = emailConfiguration();
  if (!validEmail(recipientEmail)) return { status: 'failed', error: 'Invalid recipient email address.' };
  if (!config.configured) return { status: 'failed', error: 'Email configuration is incomplete: ' + config.missing.join(', ') };
  if (config.mode === 'simulate') return { status: 'simulated', simulated: true };
  const senderName = process.env.SENDER_NAME || 'School Clinic';
  const text = savedText || plainText(html);
  try {
    if (config.mode === 'brevo') {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY.trim(), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { email: config.sender, name: senderName }, to: [{ email: recipientEmail, name: recipientName || 'Recipient' }], subject, htmlContent: html, textContent: text }),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        // Provider responses can contain recipient addresses; retain only the HTTP status.
        return { status: response.status >= 500 ? 'unknown' : 'failed', error: response.status >= 500 ? 'Email provider returned a server error. Check provider logs before resending.' : 'Email provider rejected the request (HTTP ' + response.status + '). Check sender verification, credentials, and sending limits.' };
      }
      const result = await response.json();
      return { status: 'accepted', success: true, messageId: result.messageId || null };
    }
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp-relay.brevo.com', port, secure: port === 465, requireTLS: port !== 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
    });
    try {
      const info = await transport.sendMail({ from: { name: senderName, address: config.sender }, to: { name: recipientName || 'Recipient', address: recipientEmail }, subject, html, text, disableFileAccess: true, disableUrlAccess: true });
      if (!info.accepted?.length) return { status: 'failed', error: 'SMTP server did not accept the recipient.' };
      return { status: 'accepted', success: true, messageId: info.messageId };
    } finally { transport.close(); }
  } catch (error) {
    // A timeout can occur after provider acceptance. Do not automatically resend.
    const definitiveFailure = ['EAUTH', 'ECONNECTION', 'EDNS', 'EREQUIRETLS'].includes(error.code);
    return { status: definitiveFailure ? 'failed' : 'unknown', error: definitiveFailure ? 'Could not connect or authenticate with the email provider.' : 'Provider acceptance could not be confirmed. Check provider logs before resending.' };
  }
}

function createEmailService(database) {
  function queue(id) {
    const delivery = dispatch(id).catch(() => {
      console.error('[EMAIL] Background delivery could not be completed. Check the email log.');
    });
    if (process.env.VERCEL) waitUntil(delivery);
    else void delivery;
    return { status: 'pending', queued: true };
  }

  async function dispatch(id) {
    // Claim once: concurrent requests cannot send the same log entry twice.
    const claimed = await database.query("UPDATE email_alerts SET delivery_status = 'sending', attempt_count = attempt_count + 1, last_attempt_at = now(), delivery_error = NULL WHERE id = $1 AND delivery_status IN ('pending', 'failed') AND attempt_count < 3 RETURNING *", [id]);
    const alert = claimed.rows[0];
    if (!alert) return { status: 'skipped' };
    let result;
    if (alert.dedup_key?.startsWith('gate:')) {
      const eligible = await database.query(`SELECT s.id FROM excuse_slips s JOIN patients p ON p.id = s.patient_id
        WHERE s.id = $1 AND s.departure_approved = TRUE AND s.checkout_at IS NOT NULL AND p.status = 'Checked Out'
          AND CURRENT_DATE BETWEEN s.start_date AND s.end_date
          AND s.checkout_at >= COALESCE((SELECT max(created_at) FROM visit_logs WHERE patient_id = p.id AND event_type = 'Check-in'), '-infinity'::timestamptz)`, [alert.dedup_key.slice(5)]);
      if (!eligible.rows.length) result = { status: 'cancelled', error: 'This departure clearance no longer applies to the current visit.' };
    }
    if (alert.dedup_key?.startsWith('principal:')) {
      const pending = await database.query("SELECT id FROM excuse_slips WHERE id = $1 AND departure_approved = FALSE AND created_at > now() - interval '7 days'", [alert.dedup_key.slice(10)]);
      if (!pending.rows.length) result = { status: 'cancelled', error: 'The approval request is expired or has already been completed.' };
    }
    if (!result) result = await deliverEmail(alert.recipient_email, alert.recipient_name || recipientNameFor(alert.recipient_type), alert.subject, alert.body, alert.text_body);
    await database.query('UPDATE email_alerts SET delivery_status = $2, provider_message_id = $3, delivery_error = $4, accepted_at = CASE WHEN $2 = \'accepted\' THEN now() ELSE NULL END WHERE id = $1', [id, result.status, result.messageId || null, result.error || null]);
    if (alert.dedup_key?.startsWith('teacher:')) {
      const status = { accepted: 'Provider accepted', simulated: 'Simulated', failed: 'Failed', unknown: 'Unconfirmed' }[result.status] || 'Unconfirmed';
      await database.query('UPDATE excuse_slips SET teacher_notified = $2 WHERE id = $1', [alert.dedup_key.slice(8), status]);
    }
    return result;
  }
  async function send({ patientId, recipientType, email, name, message, id = crypto.randomUUID(), dedupKey = null }) {
    try {
      if (!message || typeof message.subject !== 'string' || typeof message.html !== 'string' || typeof message.text !== 'string') {
        return { status: 'failed', error: 'Email message is incomplete.' };
      }
      const eventType = typeof message.eventType === 'string' && /^[a-z0-9_]{1,64}$/i.test(message.eventType) ? message.eventType : 'custom';
      const subject = message.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
      const inserted = await database.query("INSERT INTO email_alerts (id, patient_id, recipient_type, recipient_email, recipient_name, event_type, subject, body, text_body, payload_version, delivery_status, dedup_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 2, 'pending', $10) ON CONFLICT DO NOTHING RETURNING id", [
        id, patientId, recipientType, String(email || '').trim(), name || null, eventType, subject, message.html, message.text, dedupKey
      ]);
      if (!inserted.rows.length) {
        if (dedupKey) {
          const existing = await database.query('SELECT id, delivery_status FROM email_alerts WHERE dedup_key = $1', [dedupKey]);
          const previous = existing.rows[0];
          if (previous?.delivery_status === 'pending') return queue(previous.id);
          if (previous) return { status: previous.delivery_status, duplicate: true };
        }
        return { status: 'skipped', duplicate: true };
      }
      return queue(id);
    } catch {
      // Never send without a durable record, and never fail the clinical action for email.
      console.error('[EMAIL] Could not persist email delivery state.');
      return { status: 'unknown', error: 'Email delivery state could not be saved.' };
    }
  }
  return { send, dispatch };
}

function recipientNameFor(recipientType) {
  return ({
    parent: 'Parent/Guardian',
    adviser: 'Homeroom Adviser',
    principal: 'School Principal',
    security_guard: 'Gate Security'
  })[recipientType] || 'Recipient';
}

module.exports = { createEmailService, emailConfiguration };
