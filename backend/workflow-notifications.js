const { validEmail } = require('./security');
const {
  adviserDocumentUpdate,
  parentCheckout,
  principalApproval,
  securityClearance
} = require('./notification-templates');

function createWorkflowNotifications(database, emails, getBackendUrl) {
  async function settings() {
    const result = await database.query("SELECT key, value FROM clinic_settings WHERE key IN ('principal_email', 'security_guard_email')");
    return Object.fromEntries(result.rows.map(({ key, value }) => [key, value]));
  }

  async function adviser(patient, slip) {
    let result;
    if (validEmail(patient.adviser_email?.trim())) {
      result = await emails.send({
        patientId: patient.id,
        recipientType: 'adviser',
        email: patient.adviser_email,
        name: patient.adviser_name || 'Homeroom Adviser',
        message: adviserDocumentUpdate({ patient }),
        dedupKey: slip ? 'teacher:' + slip.id : null
      });
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
        pending.push(emails.send({
          patientId: patient.id,
          recipientType: 'principal',
          email: config.principal_email,
          name: 'School Principal',
          message: principalApproval({ backendUrl: getBackendUrl(), slipId: slip.id, token }),
          dedupKey: 'principal:' + slip.id
        }));
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
    return [await emails.send({
      patientId: patient.patient_id,
      recipientType: 'security_guard',
      email: config.security_guard_email,
      name: 'Gate Security',
      message: securityClearance({ patient }),
      dedupKey: 'gate:' + slipId
    })];
  }

  async function checkoutEmails(patient, slip, token, wantTeacher, visitLog) {
    const pending = [];
    if (patient.parent_email?.trim()) {
      pending.push(emails.send({
        patientId: patient.id,
        recipientType: 'parent',
        email: patient.parent_email,
        name: patient.emergency_contact_name || 'Parent/Guardian',
        message: parentCheckout({ patient, eventAt: visitLog?.created_at }),
        dedupKey: visitLog?.id ? `clinic-checkout:${visitLog.id}:parent` : null
      }));
    }
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
