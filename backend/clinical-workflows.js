const express = require('express');
const crypto = require('node:crypto');

const CLINICAL_ROLES = new Set(['physician', 'nurse', 'admin']);
const bedCapacity = () => Math.max(1, Math.min(100, Number.parseInt(process.env.CLINIC_BED_CAPACITY || '5', 10) || 5));
const requested = (value) => value === true || value === 'Yes';

function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function validateSlip(body) {
  if (typeof body.excuse_reason !== 'string' || !body.excuse_reason.trim()) fail(400, 'An excuse reason is required.');
  for (const value of [body.start_date, body.end_date]) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(400, 'Valid excuse start and end dates are required.');
  }
  if (body.start_date > body.end_date) fail(400, 'Excuse start date cannot be after the end date.');
}

async function createSlip(transaction, patientId, body, actor) {
  validateSlip(body);
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const wantTeacher = requested(body.teacher_notified);
  const inserted = await transaction.query(`INSERT INTO excuse_slips
    (patient_id, excuse_reason, start_date, end_date, teacher_notified, teacher_notification_requested, verification_hash, acknowledgment_token_hash, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
  [patientId, body.excuse_reason.trim(), body.start_date, body.end_date, wantTeacher ? 'Pending' : 'Not requested', wantTeacher, crypto.randomBytes(32).toString('hex').toUpperCase(), tokenHash, actor]);
  await transaction.query("INSERT INTO visit_logs (patient_id, event_type, details, performed_by) VALUES ($1, 'Excuse Slip Issued', 'Clinic excuse slip created; principal approval pending.', $2)", [patientId, actor]);
  return { slip: inserted.rows[0], token };
}

function createClinicalWorkflowRouter(database, { checkinEmails, checkoutEmails, slipEmails }) {
  const router = express.Router();
  async function patientForUpdate(transaction, id) {
    const result = await transaction.query('SELECT * FROM patients WHERE id = $1 FOR UPDATE', [id]);
    if (!result.rows[0]) fail(404, 'Patient not found.');
    return result.rows[0];
  }
  for (const action of ['checkin', 'admit', 'discharge', 'checkout', 'excuse-slips']) {
    router.post('/patients/:id/' + action, async (req, res) => {
      if (!CLINICAL_ROLES.has(req.user.role)) return res.status(403).json({ error: 'Only clinical staff and administrators may perform this action.' });
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid patient reference.' });
      const body = req.body || {};
      try {
        const requestKey = req.get('Idempotency-Key') || null;
        if (requestKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey)) fail(400, 'Invalid request reference.');
        const fingerprint = crypto.createHash('sha256').update(JSON.stringify([action, id, body])).digest('hex');
        if (action === 'checkin' && (typeof body.chief_complaint !== 'string' || !body.chief_complaint.trim())) fail(400, 'Chief complaint is required.');
        if (action === 'excuse-slips' || (action === 'checkout' && body.excuse_reason?.trim())) validateSlip(body);
        const saved = await database.transaction(async (transaction) => {
          // Lock admission capacity before a patient row, using a consistent lock order.
          await transaction.query('LOCK TABLE patients IN SHARE ROW EXCLUSIVE MODE');
          if (requestKey) {
            const prior = await transaction.query('SELECT account_id, request_fingerprint, response_payload FROM clinical_action_requests WHERE request_key = $1', [requestKey]);
            if (prior.rows[0]) {
              if (String(prior.rows[0].account_id) !== String(req.user.id) || prior.rows[0].request_fingerprint !== fingerprint) fail(409, 'This request reference has already been used for a different action.');
              return { replay: prior.rows[0].response_payload };
            }
          }
          async function persist(result) {
            if (requestKey) await transaction.query('INSERT INTO clinical_action_requests (request_key, account_id, patient_id, request_fingerprint, response_payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [requestKey, req.user.id, id, fingerprint, JSON.stringify({ data: action === 'excuse-slips' ? result.slip : result.log, notifications: [{ status: 'processing' }] })]);
            return result;
          }
          const patient = await patientForUpdate(transaction, id);
          let slipResult = null;
          if (action === 'excuse-slips') {
            slipResult = await createSlip(transaction, id, body, req.user.email);
            return persist({ patient, ...slipResult, log: null });
          }
          const allowed = { checkin: ['Checked Out'], admit: ['Checked In'], discharge: ['Under Observation'], checkout: ['Checked In', 'Under Observation'] };
          if (!allowed[action].includes(patient.status)) fail(409, 'This action is not allowed while the patient is ' + patient.status + '. Refresh the chart.');
          if (action === 'admit') {
            const occupancy = await transaction.query("SELECT count(*)::int AS count FROM patients WHERE status = 'Under Observation'");
            if (occupancy.rows[0].count >= bedCapacity()) fail(409, 'All clinic beds are occupied. Release a bed before admitting another patient.');
          }
          if (action === 'checkout') {
            if (body.excuse_reason?.trim()) slipResult = await createSlip(transaction, id, body, req.user.email);
            else {
              // Reuse only an applicable slip from this visit, never paperwork from an earlier visit.
              const existing = await transaction.query(`SELECT * FROM excuse_slips WHERE patient_id = $1 AND end_date >= CURRENT_DATE
                AND created_at >= COALESCE((SELECT max(created_at) FROM visit_logs WHERE patient_id = $1 AND event_type = 'Check-in'), '-infinity'::timestamptz)
                ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [id]);
              if (existing.rows[0]) slipResult = { slip: existing.rows[0], token: null };
            }
            if (slipResult) {
              const updated = await transaction.query('UPDATE excuse_slips SET checkout_at = now() WHERE id = $1 RETURNING *', [slipResult.slip.id]);
              slipResult.slip = updated.rows[0];
            }
          }
          const nextStatus = { checkin: 'Checked In', admit: 'Under Observation', discharge: 'Checked In', checkout: 'Checked Out' }[action];
          const updatedPatient = await transaction.query('UPDATE patients SET status = $2, status_color = $3, observation_started_at = CASE WHEN $4 THEN now() ELSE NULL END WHERE id = $1 RETURNING *', [id, nextStatus, nextStatus === 'Checked Out' ? 'gray' : 'amber', action === 'admit']);
          const eventType = { checkin: 'Check-in', admit: 'Bed Observation', discharge: 'Bed Observation', checkout: 'Check-out' }[action];
          const details = { checkin: body.chief_complaint?.trim(), admit: 'Admitted to clinic bed for observation.', discharge: 'Discharged from clinic bed observation.', checkout: 'Student checked out of the clinic.' }[action];
          const log = await transaction.query('INSERT INTO visit_logs (patient_id, event_type, details, performed_by) VALUES ($1, $2, $3, $4) RETURNING *', [id, eventType, details, req.user.email]);
          return persist({ patient: updatedPatient.rows[0], log: log.rows[0], ...(slipResult || {}) });
        });
        if (saved.replay) return res.json(saved.replay);
        // Notification problems must not turn an already committed clinical action into an apparent failure.
        let notifications = [];
        try {
          if (action === 'checkin') notifications = await checkinEmails(saved.patient, body.chief_complaint, saved.log);
          if (action === 'checkout') notifications = await checkoutEmails(saved.patient, saved.slip, saved.token, requested(body.teacher_notified), saved.log);
          if (action === 'excuse-slips') notifications = await slipEmails(saved.patient, saved.slip, saved.token);
        } catch { notifications = [{ status: 'unknown', error: 'Record saved, but notification processing could not be confirmed. Check the email log.' }]; }
        const response = { data: action === 'excuse-slips' ? saved.slip : saved.log, notifications };
        if (requestKey) {
          try { await database.query('UPDATE clinical_action_requests SET response_payload = $2::jsonb WHERE request_key = $1', [requestKey, JSON.stringify(response)]); }
          catch { console.error('[CLINICAL WORKFLOW] Could not update notification outcome for request.'); }
        }
        return res.json(response);
      } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        console.error('[CLINICAL WORKFLOW] Transaction failed.');
        return res.status(503).json({ error: 'The action was not saved. Please refresh and try again.' });
      }
    });
  }
  return router;
}

module.exports = { createClinicalWorkflowRouter, bedCapacity };
