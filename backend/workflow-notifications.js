const crypto = require('node:crypto');
const { validEmail } = require('./security');
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const template = (title, content) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,sans-serif;color:#1e293b;background:#f8fafc;padding:24px"><main style="max-width:560px;margin:auto;background:white;padding:28px;border:1px solid #e2e8f0;border-radius:12px"><h1 style="font-size:22px">${escape(title)}</h1>${content}<p style="font-size:12px;color:#64748b">School clinic notification. For questions, contact the clinic through your usual school contact.</p></main></body></html>`;

function createWorkflowNotifications(database, emails, getBackendUrl) {
  async function settings() {
    const result = await database.query("SELECT key, value FROM clinic_settings WHERE key IN ('principal_email', 'security_guard_email')");
    return Object.fromEntries(result.rows.map(({ key, value }) => [key, value]));
  }
  async function adviser(patient, slip) {
    let result;
    if (validEmail(patient.adviser_email?.trim())) {
      result = await emails.send(patient.id, 'adviser', patient.adviser_email, 'Homeroom Adviser', '[School Clinic] Clinic Document Update', template('Clinic document update', '<p>A clinic document has been recorded. Please contact the clinic through the authorized school process for details.</p>'), crypto.randomUUID(), slip ? 'teacher:' + slip.id : null);
    } else result = { status: 'failed', error: 'No valid adviser email is configured for this patient.' };
    if (slip) {
      const status = { accepted: 'Provider accepted', simulated: 'Simulated', failed: 'Failed', unknown: 'Unconfirmed' }[result.status];
      if (status) await database.query('UPDATE excuse_slips SET teacher_notified = $2 WHERE id = $1', [slip.id, status]);
    }
    return result;
  }
  async function slipEmails(patient, slip, token) {
    const config = await settings();
    const pending = [];
    if (token) {
      if (validEmail(config.principal_email?.trim())) {
        const url = getBackendUrl() + '/api/excuse-slips/' + slip.id + '/acknowledge#' + token;
        pending.push(emails.send(patient.id, 'principal', config.principal_email, 'School Principal', '[School Clinic] Departure Approval Requested', template('Departure approval requested', `<p>A clinic excuse slip requires your approval. Verify the request through the authorized school process before approving departure.</p><p><a href="${escape(url)}">Review and approve departure</a></p><p>This link expires after seven days. Opening it does not approve the request.</p>`), crypto.randomUUID(), 'principal:' + slip.id));
      } else pending.push({ status: 'failed', error: 'Configure the principal email in Clinic Settings to request approval. The slip remains pending.' });
    }
    if (slip.teacher_notification_requested) pending.push(adviser(patient, slip));
    return Promise.all(pending);
  }
  async function gateEmail(slipId) {
    // Approval is bound to this checkout, not any earlier or later clinic visit.
    const eligible = await database.query(`SELECT s.id, p.id AS patient_id, p.name, p.section FROM excuse_slips s JOIN patients p ON p.id = s.patient_id
      WHERE s.id = $1 AND s.departure_approved = TRUE AND s.checkout_at IS NOT NULL AND p.status = 'Checked Out'
        AND CURRENT_DATE BETWEEN s.start_date AND s.end_date
        AND s.checkout_at >= COALESCE((SELECT max(created_at) FROM visit_logs WHERE patient_id = p.id AND event_type = 'Check-in'), '-infinity'::timestamptz)`, [slipId]);
    if (!eligible.rows[0]) return [];
    const patient = eligible.rows[0];
    const config = await settings();
    if (!validEmail(config.security_guard_email?.trim())) return [{ status: 'failed', error: 'Departure approved, but no security email is configured.' }];
    const html = template('Approved departure', `<p>Principal approval and clinic checkout have been recorded for <strong>${escape(patient.name)}</strong> (${escape(patient.section)}).</p><p>Verify the student and follow the school departure procedure before permitting exit.</p>`);
    return [await emails.send(patient.patient_id, 'security_guard', config.security_guard_email, 'Gate Security', '[School Clinic] Approved Departure', html, crypto.randomUUID(), 'gate:' + slipId)];
  }
  async function checkoutEmails(patient, slip, token, wantTeacher) {
    const pending = [];
    if (patient.parent_email?.trim()) pending.push(emails.send(patient.id, 'parent', patient.parent_email, 'Parent/Guardian', '[School Clinic] Clinic Status Update', template('Clinic status update', '<p>The clinic visit has ended. Contact the school clinic through the authorized process for details. Clinic checkout does not itself authorize departure from school.</p>')));
    if (slip && token) pending.push(slipEmails(patient, slip, token));
    else if (!slip && wantTeacher) pending.push(adviser(patient));
    if (slip?.departure_approved) pending.push(gateEmail(slip.id));
    const results = (await Promise.all(pending)).flat();
    if (slip && !slip.departure_approved) results.push({ status: 'awaiting_approval' });
    return results;
  }
  return { slipEmails, checkoutEmails, gateEmail };
}

module.exports = { createWorkflowNotifications };
