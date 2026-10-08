const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createEmailService, emailConfiguration } = require('./email');
const { validEmail } = require('./security');
const { createClinicalWorkflowRouter, bedCapacity } = require('./clinical-workflows');
const { createWorkflowNotifications } = require('./workflow-notifications');
const { adviserCheckin, parentCheckin, parentContactRequest } = require('./notification-templates');
require('dotenv').config();
const { database } = require('./database');
const { createApiAuthMiddleware, createAuthRouter, getPractitioner } = require('./auth');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE || 'Asia/Singapore';
const db = database;
const emails = createEmailService(database);
let listeningPort = PORT;

const clinicDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const getClinicDateString = (date = new Date()) => {
  const parts = Object.fromEntries(clinicDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const isCalendarDateString = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const ageAtClinicDate = (dateOfBirth) => {
  if (!isCalendarDateString(dateOfBirth)) return null;
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = getClinicDateString().split('-').map(Number);
  return todayYear - birthYear - (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay) ? 1 : 0);
};

const clinicalError = (status, message) => Object.assign(new Error(message), { status });

const isAllergyHistoryUnreviewed = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return !normalized || ['none', 'unknown', 'unknown - not reviewed', 'not reviewed', 'not recorded', 'not on file', 'n/a'].includes(normalized);
};

const medicationAllergyMatch = (allergiesValue, medicationValue) => {
  const normalizedMedication = String(medicationValue || '').trim().toLowerCase();
  if (!normalizedMedication) return null;
  const allergyNames = String(allergiesValue || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  for (const allergy of allergyNames) {
    if (['no known allergies', 'no known drug allergies', 'nka', 'nkda'].includes(allergy)) continue;
    if (normalizedMedication.includes(allergy) || allergy.includes(normalizedMedication)) return allergy;
    if (allergy === 'penicillin' && normalizedMedication.includes('amoxicillin')) return 'penicillin (possible cross-sensitivity with amoxicillin)';
    if (allergy === 'amoxicillin' && normalizedMedication.includes('penicillin')) return 'amoxicillin (possible cross-sensitivity with penicillin)';
  }
  return null;
};

const getBackendUrl = () => {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return 'https://' + process.env.VERCEL_URL;
  return 'http://localhost:' + listeningPort;
};

const createResponseToken = (alertId, response, sentAt) => {
  const secret = process.env.RESPONSE_TOKEN_SECRET || process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!secret) throw new Error('Response token signing secret is unavailable.');
  return crypto.createHmac('sha256', secret)
    .update(`${alertId}:${response}:${new Date(sentAt).toISOString()}`)
    .digest('hex');
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

const allowedOrigins = new Set((process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean));

const production = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
if (production && allowedOrigins.size === 0) {
  throw new Error('CORS_ORIGIN must list the deployed frontend origin in production.');
}

if (production) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  next();
});

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || (!production && allowedOrigins.size === 0) || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Account-ID'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
});
app.use((req, res, next) => {
  // Email response links open as top-level navigations from webmail. They are
  // HTML form interactions, not cross-origin API calls, so API CORS must not
  // reject the mail provider or webmail Origin header.
  if (req.path === '/api/notifications/respond') return next();
  return corsMiddleware(req, res, next);
});
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '8kb' }));
app.use(async (req, res, next) => {
  try {
    await database.initialize();
    return next();
  } catch (error) {
    console.error('[DATABASE INIT ERROR]', error.message);
    return res.status(503).json({ error: 'Database is unavailable.' });
  }
});

app.use('/api', createApiAuthMiddleware(database));
app.use('/api/auth', createAuthRouter(database));

const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied for this account role.' });
  }
  return next();
};
const clinicalRoles = ['physician', 'nurse', 'admin'];
app.use('/api/patients', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !clinicalRoles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Only clinical staff and administrators may change patient records.' });
  }
  return next();
});
app.use('/api/dashboard', allowRoles(...clinicalRoles));
app.use('/api/notifications/logs', allowRoles(...clinicalRoles));
app.use('/api/admin', allowRoles('admin'));
app.use('/api/settings/clinic', allowRoles(...clinicalRoles));
app.use('/api/patients/:id/consents', allowRoles(...clinicalRoles));

let simulatedNotifications = [];

const generateAlertId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
};

const getResponseLandingPage = (status) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Clinic Response Recorded</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: radial-gradient(circle at top left, #f7fafc, #edf2f7); color: #2d3748; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .card { background: #ffffff; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05), 0 20px 48px rgba(0,0,0,0.05); max-width: 500px; width: 90%; padding: 40px; text-align: center; border: 1px solid rgba(226, 232, 240, 0.8); }
        .icon-circle { display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px; background-color: #c6f6d5; color: #38a169; border-radius: 50%; font-size: 36px; margin-bottom: 24px; }
        h1 { font-size: 24px; font-weight: 700; margin: 0 0 12px 0; color: #1a202c; letter-spacing: -0.5px; }
        p.subtitle { color: #718096; font-size: 16px; margin: 0 0 30px 0; }
        .details-table { text-align: left; background: #f7fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 30px; font-size: 14px; }
        .details-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
        .details-row:last-child { margin-bottom: 0; }
        .label { color: #718096; font-weight: 500; }
        .value { color: #2d3748; font-weight: 600; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; background-color: #ebf8ff; color: #2b6cb0; }
        .footer-text { font-size: 12px; color: #a0aec0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon-circle">✓</div>
        <h1>Response Recorded</h1>
        <p class="subtitle">Your response has been recorded in the clinic dashboard.</p>
        <p class="subtitle">Response: ${status}</p>
        <p class="footer-text">OLPHA AeroHealth Clinic</p>
      </div>
    </body>
    </html>
  `;
};

const triggerCheckinEmails = async (patient, _chiefComplaint, visitLog) => {
  if (!patient) return [];
  const contacts = [
    ['parent', patient.parent_email, patient.emergency_contact_name || 'Parent/Guardian'],
    ['adviser', patient.adviser_email, patient.adviser_name || 'Homeroom Adviser']
  ].filter(([, email]) => email?.trim());
  return Promise.all(contacts.map(([type, email, name]) => {
    const id = generateAlertId();
    const message = type === 'parent'
      ? parentCheckin({ patient, eventAt: visitLog?.created_at, backendUrl: getBackendUrl(), alertId: id })
      : adviserCheckin({ patient, eventAt: visitLog?.created_at });
    return emails.send({
      patientId: patient.id,
      recipientType: type,
      email,
      name,
      message,
      id,
      dedupKey: visitLog?.id ? `clinic-checkin:${visitLog.id}:${type}` : null
    });
  }));
};

const workflowNotifications = createWorkflowNotifications(database, emails, getBackendUrl);

app.get('/api/health', async (req, res) => {
  try {
    const databaseStatus = await database.health();
    return res.json({ status: 'ok', message: 'EMR API is running', database: databaseStatus });
  } catch (error) {
    return res.status(503).json({ status: 'error', message: 'EMR API database is unavailable.' });
  }
});

// GET displays confirmation; only an explicit POST records a recipient response.
app.all('/api/notifications/respond', async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).set('Allow', 'GET, POST').send('Method not allowed.');
  const { alertId, response } = req.method === 'GET' ? req.query : req.body;
  if (!/^[0-9a-f-]{36}$/i.test(String(alertId || '')) || !['Acknowledged', 'On My Way'].includes(response)) return res.status(400).send('<h1>Invalid response link</h1>');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  try {
    const selected = await db.query("SELECT acknowledged, sent_at, body FROM email_alerts WHERE id = $1 AND recipient_type IN ('parent', 'adviser')", [alertId]);
    const alert = selected.rows[0];
    if (!alert || !alert.body?.includes('/api/notifications/respond?')) return res.status(404).send('<h1>Response link not found</h1>');
    if (Date.now() - new Date(alert.sent_at).getTime() > 7 * 86400000) return res.status(410).send('<h1>This response link has expired. Please contact the clinic.</h1>');
    if (alert.acknowledged) return res.status(409).send('<h1>A response has already been recorded. Contact the clinic to change it.</h1>');
    const expectedResponseToken = createResponseToken(alertId, response, alert.sent_at);
    if (req.method === 'GET') return res.type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm clinic response</title></head><body style="font:16px system-ui;max-width:480px;margin:64px auto;padding:24px"><h1>Confirm clinic response</h1><p>Opening this link has not recorded a response. Submit below to confirm: <strong>' + escapeHtml(response) + '</strong>.</p><form method="post" action="/api/notifications/respond"><input type="hidden" name="alertId" value="' + escapeHtml(alertId) + '"><input type="hidden" name="response" value="' + escapeHtml(response) + '"><input type="hidden" name="responseToken" value="' + expectedResponseToken + '"><button type="submit">Confirm response</button></form><p>For urgent assistance, contact the clinic directly.</p></body></html>');
    const submittedToken = String(req.body.responseToken || '');
    const validTokenFormat = /^[a-f0-9]{64}$/i.test(submittedToken);
    const validToken = validTokenFormat && crypto.timingSafeEqual(Buffer.from(submittedToken, 'hex'), Buffer.from(expectedResponseToken, 'hex'));
    if (!validToken) return res.status(403).send('<h1>Please confirm this response from the email confirmation page.</h1>');
    const updated = await db.query('UPDATE email_alerts SET acknowledged = TRUE, acknowledged_at = now(), response_status = $2 WHERE id = $1 AND acknowledged = FALSE RETURNING id', [alertId, response]);
    if (!updated.rows.length) return res.status(409).send('<h1>A response has already been recorded.</h1>');
    return res.type('html').send(getResponseLandingPage(response));
  } catch {
    return res.status(503).send('<h1>Response could not be recorded. Please contact the clinic.</h1>');
  }
});

// Email Tracking Endpoint
app.get('/api/notifications/logs', async (req, res) => {
  try {
      // A serverless instance may stop after the provider call but before the
      // delivery result is written. Mark old claims as uncertain, never retry them automatically.
      await db.query("UPDATE email_alerts SET delivery_status = 'unknown', delivery_error = 'Delivery attempt stopped before its outcome was saved. Check provider logs before resending.' WHERE delivery_status = 'sending' AND last_attempt_at < now() - interval '2 minutes'");
      const { data, error } = await db
        .from('email_alerts')
        .select('*, patients(name)')
        .order('sent_at', { ascending: false });

      if (error) throw error;
      const formatted = (data || []).map(a => ({
        id: a.id,
        patient_id: a.patient_id,
        student_name: a.patients ? (Array.isArray(a.patients) ? a.patients[0]?.name : a.patients.name) : 'Unknown',
        recipient_type: a.recipient_type,
        recipient_email: a.recipient_email,
        event_type: a.event_type || 'custom',
        subject: a.subject,
        response_requested: Boolean(a.body?.includes('/api/notifications/respond?')),
        sent_at: a.sent_at,
        acknowledged: a.acknowledged,
        acknowledged_at: a.acknowledged_at,
        response_status: a.response_status,
        delivery_status: a.delivery_status,
        delivery_error: a.delivery_error,
        attempt_count: a.attempt_count,
        last_attempt_at: a.last_attempt_at,
        accepted_at: a.accepted_at,
        can_retry: ['pending', 'failed'].includes(a.delivery_status) && a.attempt_count < 3 && Date.now() - new Date(a.last_attempt_at || a.sent_at).getTime() < 86400000
      }));
      return res.json({ data: formatted });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Delivery configuration excludes credentials and is visible only to clinical staff.
app.get('/api/notifications/email-config', allowRoles(...clinicalRoles), (req, res) => {
  res.json({ data: emailConfiguration() });
});

app.post('/api/patients/:id/notify-parent', allowRoles(...clinicalRoles), async (req, res) => {
  const patientId = Number(req.params.id);
  if (!Number.isSafeInteger(patientId) || patientId < 1) return res.status(400).json({ error: 'Invalid patient reference.' });
  try {
    const { data: patient, error } = await db.from('patients').select('*').eq('id', patientId).maybeSingle();
    if (error) throw error;
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });
    if (!validEmail(patient.parent_email?.trim())) return res.status(400).json({ error: 'Add a valid parent email address to the patient record first.' });
    const recent = await db.query("SELECT id FROM email_alerts WHERE patient_id = $1 AND recipient_type = 'parent' AND last_attempt_at > now() - interval '60 seconds' LIMIT 1", [patientId]);
    if (recent.rows.length) return res.status(429).json({ error: 'A parent notification was attempted recently. Wait one minute before sending another.' });
    const id = generateAlertId();
    const result = await emails.send({
      patientId,
      recipientType: 'parent',
      email: patient.parent_email,
      name: patient.emergency_contact_name || 'Parent/Guardian',
      message: parentContactRequest({ patient }),
      id
    });
    return res.json({ notifications: [result] });
  } catch {
    return res.status(503).json({ error: 'Could not prepare the parent notification.' });
  }
});

app.post('/api/notifications/logs/:id/retry', allowRoles(...clinicalRoles), async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid email reference.' });
  try {
    const existing = await db.query('SELECT delivery_status, attempt_count, last_attempt_at, sent_at FROM email_alerts WHERE id = $1', [req.params.id]);
    const alert = existing.rows[0];
    if (!alert) return res.status(404).json({ error: 'Email record not found.' });
    if (!['pending', 'failed'].includes(alert.delivery_status) || alert.attempt_count >= 3 || Date.now() - new Date(alert.last_attempt_at || alert.sent_at).getTime() > 86400000) {
      return res.status(409).json({ error: 'Only queued emails or confirmed failures from the last 24 hours can be sent again, up to three attempts. Check provider logs for uncertain sends.' });
    }
    const result = await emails.dispatch(req.params.id);
    return res.json({ data: result });
  } catch {
    return res.status(503).json({ error: 'Email retry is temporarily unavailable.' });
  }
});

// Patients Route: Fetch List
app.get('/api/patients', async (req, res) => {
  const practitioner = getPractitioner(req);
  const isRestrictedRole = practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor';
  try {
    let query = db.from('patients').select(isRestrictedRole
      ? 'id, name, section, grade_level, status, status_color'
      : '*');
      if (req.query.search) {
        const search = req.query.search;
        if (!isNaN(search)) {
          query = query.or([
            { column: 'id', operator: 'eq', value: parseInt(search, 10) },
            { column: 'name', operator: 'ilike', value: `%${search}%` }
          ]);
        } else {
          query = query.ilike('name', `%${search}%`);
        }
      }
      if (req.query.letter) {
        query = query.ilike('name', `${req.query.letter}%`);
      }
      query = query.order('name', { ascending: true });
      const { data: patientsList, error } = await query;
      if (error) throw error;

      // If there are checked-in patients, fetch their latest check-in log details to include in the response
      if (!isRestrictedRole && patientsList && patientsList.length > 0) {
        const checkedInIds = patientsList.filter(p => ['Checked In', 'Under Observation'].includes(p.status)).map(p => p.id);
        if (checkedInIds.length > 0) {
          const { data: logs, error: logsErr } = await db
            .from('visit_logs')
            .select('patient_id, details, created_at')
            .eq('event_type', 'Check-in')
            .in('patient_id', checkedInIds)
            .order('created_at', { ascending: false });

          if (!logsErr && logs) {
            patientsList.forEach(p => {
              if (['Checked In', 'Under Observation'].includes(p.status)) {
                const latestLog = logs.find(l => l.patient_id === p.id);
                p.chief_complaint = latestLog ? latestLog.details : 'No details';
                p.checked_in_at = latestLog ? latestLog.created_at : null;
              }
            });
          }
        }
      }

      return res.json({ data: patientsList });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Register New Patient
app.post('/api/patients', async (req, res) => {
  const { name, section, age, gender, status, status_color, date_of_birth, grade_level, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, parent_email, adviser_name, adviser_email, graduation_year } = req.body;
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (status && status !== 'Checked Out') return res.status(400).json({ error: 'Register the student first, then use the clinic check-in workflow.' });

  const practitioner = getPractitioner(req);
  if (!clinicalRoles.includes(practitioner.role)) {
    return res.status(403).json({ error: 'Access denied. Only clinical staff and administrators can register new patients.' });
  }

  if (!['Male', 'Female', 'Other', 'Not recorded'].includes(gender)) {
    return res.status(400).json({ error: 'Choose a gender value or select Not recorded.' });
  }
  if (date_of_birth && !isCalendarDateString(date_of_birth)) {
    return res.status(400).json({ error: 'Date of birth must be a valid calendar date.' });
  }
  const enteredAge = age === '' || age === null || age === undefined ? null : Number(age);
  if (enteredAge !== null && (!Number.isInteger(enteredAge) || enteredAge < 0 || enteredAge > 150)) {
    return res.status(400).json({ error: 'Age must be a whole number from 0 to 150.' });
  }
  if (!date_of_birth && enteredAge === null) {
    return res.status(400).json({ error: 'Enter a date of birth or an age.' });
  }
  const calculatedAge = date_of_birth ? ageAtClinicDate(date_of_birth) : null;
  if (calculatedAge !== null && (calculatedAge < 0 || calculatedAge > 150)) {
    return res.status(400).json({ error: 'Date of birth must be valid and cannot be in the future.' });
  }
  if (calculatedAge !== null && enteredAge !== null && calculatedAge !== enteredAge) {
    return res.status(400).json({ error: 'Age must match the date of birth.' });
  }
  if (graduation_year && (!Number.isInteger(Number(graduation_year)) || Number(graduation_year) <= 0)) {
    return res.status(400).json({ error: 'Graduation year must be a valid positive integer.' });
  }

  const ageParsed = calculatedAge ?? enteredAge;
  const gradYearParsed = graduation_year ? Number(graduation_year) : null;

  try {
    const { data, error } = await db.from('patients').insert([{
        name: name.trim(), section, age: ageParsed, gender, status: 'Checked Out', status_color: 'gray',
        date_of_birth: date_of_birth || null,
        grade_level: grade_level || null,
        allergies: typeof allergies === 'string' && allergies.trim() ? allergies.trim() : 'Unknown - not reviewed',
        chronic_conditions: typeof chronic_conditions === 'string' && chronic_conditions.trim() ? chronic_conditions.trim() : 'Unknown - not reviewed',
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        parent_email: parent_email || null,
        adviser_name: adviser_name || null,
        adviser_email: adviser_email || null,
        graduation_year: gradYearParsed
      }]).select();
      if (error) throw error;
      const newPatient = data[0];
 
      await db.from('visit_logs').insert([{
          patient_id: newPatient.id,
          event_type: 'Registration',
          details: 'Student roster record registered.',
          performed_by: practitioner.email
        }]);
 
      return res.json({ data: newPatient });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Fetch Detail (Demographics + Vitals + SOAP + Orders + Logs + Immunizations + Consents + Excuse Slips)
app.get('/api/patients/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid patient ID' });

  const practitioner = getPractitioner(req);
  const isRestrictedRole = practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor';

  // Audit Log: Record Viewed
  const auditDetails = `Patient record viewed by ${practitioner.name} (${practitioner.role})${isRestrictedRole ? ' [REDACTED VIEW]' : ''}`;

  try {
    const { data: patient, error: pError } = await db.from('patients').select('*').eq('id', id).maybeSingle();
      if (pError) throw pError;
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      // Background refreshes already receive a security audit event in auth.
      // Only opening the chart adds a clinical timeline event.
      if (req.query.refresh !== 'true') await db.from('visit_logs').insert([{
        patient_id: id,
        event_type: 'Record Viewed',
        details: auditDetails,
        performed_by: practitioner.email
      }]);

      let vitals = [];
      let soapNotes = [];
      let orders = [];
      let immunizations = [];
      let consents = [];
      let logs = [];

      // Fetch excuse slips (accessible to all roles for verification)
      const excuseSlipColumns = isRestrictedRole
        ? 'id, start_date, end_date, teacher_notified, principal_acknowledged, principal_acknowledged_at, departure_approved, departure_approved_at, created_at'
        : '*';
      const { data: excuseSlips } = await db.from('excuse_slips').select(excuseSlipColumns).eq('patient_id', id).order('created_at', { ascending: false });

      if (!isRestrictedRole) {
        const [vRes, sRes, oRes, iRes, cRes, lRes] = await Promise.all([
          db.from('vitals').select('*').eq('patient_id', id).order('recorded_at', { ascending: false }),
          db.from('soap_notes').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
          db.from('medication_orders').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
          db.from('immunizations').select('*').eq('patient_id', id).order('vaccine_name', { ascending: true }),
          db.from('parental_consents').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
          db.from('visit_logs').select('*').eq('patient_id', id).order('created_at', { ascending: false })
        ]);

        vitals = vRes.data || [];
        soapNotes = sRes.data || [];
        orders = oRes.data || [];
        immunizations = iRes.data || [];
        consents = cRes.data || [];
        logs = lRes.data || [];
      } else {
        // Teachers/counselors can only see their own view action and general excuse logs
        const { data: lData } = await db.from('visit_logs').select('event_type, created_at').eq('patient_id', id).eq('event_type', 'Check-in').order('created_at', { ascending: false });
        logs = lData || [];
      }

      const safePatient = isRestrictedRole
        ? {
            id: patient.id,
            name: patient.name,
            section: patient.section,
            grade_level: patient.grade_level,
            created_at: patient.created_at,
            status: patient.status,
            status_color: patient.status_color
          }
        : patient;

      return res.json({
        data: {
          ...safePatient,
          vitals,
          soapNotes,
          orders,
          logs,
          immunizations,
          consents,
          excuseSlips: excuseSlips || []
        }
      });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Update Patient Demographics
app.put('/api/patients/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid patient ID' });

  const {
    name, section, age, gender, status, status_color,
    date_of_birth, grade_level, allergies, chronic_conditions,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
    parent_email, adviser_name, adviser_email,
    graduation_year
  } = req.body;

  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  const practitioner = getPractitioner(req);
  if (!clinicalRoles.includes(practitioner.role)) {
    return res.status(403).json({ error: 'Access denied. Only clinical staff and administrators can update patient demographics.' });
  }

  if (!['Male', 'Female', 'Other', 'Not recorded'].includes(gender)) {
    return res.status(400).json({ error: 'Choose a gender value or select Not recorded.' });
  }

  if (date_of_birth && !isCalendarDateString(date_of_birth)) {
    return res.status(400).json({ error: 'Date of birth must be a valid calendar date.' });
  }
  const enteredAge = age === '' || age === null || age === undefined ? null : Number(age);
  if (enteredAge !== null && (!Number.isInteger(enteredAge) || enteredAge < 0 || enteredAge > 150)) {
    return res.status(400).json({ error: 'Age must be a whole number from 0 to 150.' });
  }
  const calculatedAge = date_of_birth ? ageAtClinicDate(date_of_birth) : null;
  if (calculatedAge !== null && (calculatedAge < 0 || calculatedAge > 150)) {
    return res.status(400).json({ error: 'Date of birth must be valid and cannot be in the future.' });
  }
  if (calculatedAge !== null && enteredAge !== null && calculatedAge !== enteredAge) {
    return res.status(400).json({ error: 'Age must match the date of birth.' });
  }
  if (graduation_year && (!Number.isInteger(Number(graduation_year)) || Number(graduation_year) <= 0)) {
    return res.status(400).json({ error: 'Graduation year must be a valid positive integer.' });
  }

  const ageParsed = calculatedAge ?? enteredAge;
  const gradYearParsed = graduation_year ? Number(graduation_year) : null;

  const updates = {
    name: name.trim(),
    section: section || null,
    age: ageParsed,
    gender: gender || null,
    date_of_birth: date_of_birth || null,
    grade_level: grade_level || null,
    allergies: typeof allergies === 'string' && allergies.trim() ? allergies.trim() : 'Unknown - not reviewed',
    chronic_conditions: typeof chronic_conditions === 'string' && chronic_conditions.trim() ? chronic_conditions.trim() : 'Unknown - not reviewed',
    emergency_contact_name: emergency_contact_name || null,
    emergency_contact_phone: emergency_contact_phone || null,
    emergency_contact_relationship: emergency_contact_relationship || null,
    parent_email: parent_email || null,
    adviser_name: adviser_name || null,
    adviser_email: adviser_email || null,
    graduation_year: gradYearParsed
  };

  try {
    const { data, error } = await db
        .from('patients')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ error: 'Patient not found' });

      // Audit log
      await db.from('visit_logs').insert([{
        patient_id: id,
        event_type: 'Demographics Updated',
        details: `Patient demographics updated by ${practitioner.name} (${practitioner.role})`,
        performed_by: practitioner.email
      }]);

      return res.json({ data: data[0] });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Update/Record Immunization Dose
app.post('/api/patients/:id/immunizations', async (req, res) => {
  const patientId = Number(req.params.id);
  const { vaccine_name, doses_received, doses_required, verified } = req.body;
  const vaccineName = typeof vaccine_name === 'string' ? vaccine_name.trim() : '';

  if (!Number.isSafeInteger(patientId) || patientId < 1) return res.status(400).json({ error: 'Invalid patient ID' });
  if (!vaccineName || doses_received === undefined || doses_required === undefined || verified !== true) {
    return res.status(400).json({ error: 'Confirm that the source immunization history was reviewed before saving the dose count.' });
  }

  const rec = Number(doses_received);
  const reqDoses = Number(doses_required);
  if (!Number.isInteger(rec) || rec < 0) {
    return res.status(400).json({ error: 'Doses received must be a valid non-negative integer.' });
  }
  if (!Number.isInteger(reqDoses) || reqDoses <= 0 || reqDoses > 50) {
    return res.status(400).json({ error: 'Doses required must be a whole number from 1 to 50.' });
  }
  if (rec > reqDoses) return res.status(400).json({ error: 'Doses received cannot exceed the required count.' });

  const practitioner = getPractitioner(req);
  if (practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor') {
    return res.status(403).json({ error: 'Access denied. Teachers and counselors cannot update immunization records.' });
  }

  const auditDetails = `Immunization '${vaccineName}' updated to ${rec}/${reqDoses} doses after source record review.`;

  try {
    // Check if this vaccine already has a record for the patient
      const { data: existing, error: findErr } = await db
        .from('immunizations')
        .select('*')
        .eq('patient_id', patientId)
        .eq('vaccine_name', vaccineName)
        .maybeSingle();

      if (findErr) throw findErr;

      let result;
      if (existing) {
        // Update doses
        const { data, error } = await db
          .from('immunizations')
        .update({ doses_received: rec, doses_required: reqDoses, verification_status: 'verified', updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select();
        if (error) throw error;
        result = data[0];
      } else {
        // Insert new record
        const { data, error } = await db
          .from('immunizations')
          .insert([{
            patient_id: patientId,
            vaccine_name: vaccineName,
            doses_received: rec,
            doses_required: reqDoses,
            verification_status: 'verified'
          }])
          .select();
        if (error) throw error;
        result = data[0];
      }

      // Audit log
      await db.from('visit_logs').insert([{
        patient_id: patientId,
        event_type: 'Immunization Updated',
        details: auditDetails,
        performed_by: practitioner.email
      }]);

      return res.json({ data: result });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Save SOAP Clinical Note
app.post('/api/patients/:id/soap', async (req, res) => {
  const id = parseInt(req.params.id);
  const { subjective, objective, assessment, plan, disposition } = req.body;

  const practitioner = getPractitioner(req);
  if (practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor') {
    return res.status(403).json({ error: 'Access denied. Teachers and counselors cannot record clinical SOAP notes.' });
  }

  // Set NOT NULL validation check on core fields
  if (!subjective?.trim() || !objective?.trim() || !assessment?.trim() || !plan?.trim() || !disposition?.trim()) {
    return res.status(400).json({ error: 'All SOAP fields (subjective, objective, assessment, plan/treatment, disposition) are required and cannot be blank.' });
  }

  const auditDetails = `SOAP Note saved by ${practitioner.name} (Disposition: ${disposition})`;

  try {
    const note = await db.transaction(async (client) => {
      const { rows } = await client.query(
        'INSERT INTO soap_notes (patient_id, subjective, objective, assessment, plan, disposition, author_name, author_email, author_role) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
        [id, subjective, objective, assessment, plan, disposition, practitioner.name, practitioner.email, practitioner.role]
      );
      await client.query('INSERT INTO visit_logs (patient_id, event_type, details, performed_by) VALUES ($1,$2,$3,$4)', [id, 'Clinical Note Added', auditDetails, practitioner.email]);
      return rows[0];
    });
    return res.json({ data: note });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Save Medication Order
app.post('/api/patients/:id/orders', async (req, res) => {
  const id = Number(req.params.id);
  const { medication, dose_amount, dose_unit, strength, form, route, consent, allergy_override } = req.body;

  const practitioner = getPractitioner(req);
  if (practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor') {
    return res.status(403).json({ error: 'Access denied. Teachers and counselors cannot order medication.' });
  }

  // Enforce NOT NULL validations on core fields
  const doseAmount = Number(dose_amount);
  const allowedDoseUnits = new Set(['mg', 'g', 'mcg', 'mL', 'tablet', 'capsule', 'puff', 'drop', 'patch', 'application']);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid patient ID.' });
  if (typeof medication !== 'string' || !medication.trim() || medication.length > 120 ||
      typeof strength !== 'string' || !strength.trim() || strength.length > 120 ||
      typeof form !== 'string' || !form.trim() || form.length > 80 ||
      !['oral', 'inhaled', 'topical'].includes(route) ||
      !Number.isFinite(doseAmount) || doseAmount < 0.001 || doseAmount > 9999999.999 ||
      Math.abs(doseAmount * 1000 - Math.round(doseAmount * 1000)) > 1e-8 ||
      !allowedDoseUnits.has(dose_unit)) {
    return res.status(400).json({ error: 'Enter a medication, product strength, form, route, actual amount given (0.001 to 9,999,999.999, up to three decimal places), and dose unit.' });
  }

  if (consent !== true) {
    return res.status(400).json({ error: 'Parental/guardian consent is mandatory before dispensing medication.' });
  }

  try {
      const savedAdministration = await db.transaction(async (transaction) => {
        const { rows } = await transaction.query('SELECT id, status, allergies FROM patients WHERE id = $1 FOR UPDATE', [id]);
        const patient = rows[0];
        if (!patient) throw clinicalError(404, 'Patient not found.');
        if (!['Checked In', 'Under Observation'].includes(patient.status)) {
          throw clinicalError(409, 'Medication can only be administered while the patient is Checked In or Under Observation.');
        }
        if (isAllergyHistoryUnreviewed(patient.allergies)) {
          throw clinicalError(409, 'Allergy history is unknown or not reviewed. Update the allergy record before recording a medication administration.');
        }
        const allergyConflict = medicationAllergyMatch(patient.allergies, medication);
        if (allergyConflict && allergy_override !== true) {
          throw clinicalError(409, `A possible name match was found for the documented allergy "${allergyConflict}". Review the chart and confirm the clinical decision before continuing.`);
        }

        const dosage = `${doseAmount} ${dose_unit}`;
        const administeredBy = practitioner.email || practitioner.name;
        const auditDetails = `${medication.charAt(0).toUpperCase() + medication.slice(1)} ${dosage} (${strength}, ${form}) via ${route} (Administered by: ${administeredBy})${allergyConflict ? ' (possible allergy match reviewed by clinician)' : ''}`;
        const administrationResult = await transaction.query(`INSERT INTO medication_orders
          (patient_id, medication, dosage, dose_amount, dose_unit, strength, form, route, administered_by, consent)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE) RETURNING *`,
        [id, medication.trim(), dosage, doseAmount, dose_unit, strength.trim(), form.trim(), route, administeredBy]);
        await transaction.query(`INSERT INTO visit_logs (patient_id, event_type, details, performed_by)
          VALUES ($1, 'Medication Administered', $2, $3)`, [id, auditDetails, administeredBy]);
        return administrationResult.rows[0];
      });
      return res.json({ data: savedAdministration });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Save Vital Signs
app.post('/api/patients/:id/vitals', async (req, res) => {
  const id = parseInt(req.params.id);
  const { temperature, heart_rate, blood_pressure, o2_sat, respiratory_rate } = req.body;

  const practitioner = getPractitioner(req);
  if (practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor') {
    return res.status(403).json({ error: 'Access denied. Teachers and counselors cannot record vital signs.' });
  }

  // Enforce NOT NULL validations on vital signs
  if (!temperature || !heart_rate || !blood_pressure?.trim() || !o2_sat || !respiratory_rate) {
    return res.status(400).json({ error: 'All vital signs (temperature, heart rate, blood pressure, oxygen saturation, and respiratory rate) are required.' });
  }

  const temp = parseFloat(temperature);
  const hr = parseInt(heart_rate);
  const o2 = parseInt(o2_sat);
  const rr = parseInt(respiratory_rate);

  if (isNaN(temp) || temp <= 0 || temp > 50) {
    return res.status(400).json({ error: 'Temperature must be a valid number between 0 and 50.' });
  }
  if (isNaN(hr) || hr <= 0 || hr > 300) {
    return res.status(400).json({ error: 'Heart rate must be a valid positive integer.' });
  }
  if (isNaN(o2) || o2 < 0 || o2 > 100) {
    return res.status(400).json({ error: 'Oxygen saturation must be a valid percentage between 0 and 100.' });
  }
  if (isNaN(rr) || rr <= 0 || rr > 100) {
    return res.status(400).json({ error: 'Respiratory rate must be a valid positive integer.' });
  }
  const bpPattern = /^\d{2,3}\/\d{2,3}$/;
  if (!bpPattern.test(blood_pressure.trim())) {
    return res.status(400).json({ error: 'Blood pressure must be in Sys/Dia format (e.g. 120/80).' });
  }

  const auditDetails = `Temp: ${temperature}°C, HR: ${heart_rate} bpm, BP: ${blood_pressure}, O₂: ${o2_sat}%, RR: ${respiratory_rate} breaths/min`;

  try {
    const vital = await db.transaction(async (client) => {
      const { rows } = await client.query(
        'INSERT INTO vitals (patient_id, temperature, heart_rate, blood_pressure, o2_sat, respiratory_rate, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [id, parseFloat(temperature), parseInt(heart_rate), blood_pressure, parseInt(o2_sat), parseInt(respiratory_rate), practitioner.name + ' (' + practitioner.email + ')']
      );
      await client.query('INSERT INTO visit_logs (patient_id, event_type, details, performed_by) VALUES ($1,$2,$3,$4)', [id, 'Vitals Recorded', auditDetails, practitioner.email]);
      return rows[0];
    });
    return res.json({ data: vital });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Check-In Existing Patient
app.use('/api', createClinicalWorkflowRouter(database, {
  checkinEmails: triggerCheckinEmails,
  checkoutEmails: workflowNotifications.checkoutEmails,
  slipEmails: workflowNotifications.slipEmails
}));

// Helper to check for abnormal vitals
const checkVitals = (v) => {
  const alerts = [];
  if (v.temperature !== null && v.temperature !== undefined) {
    const temp = parseFloat(v.temperature);
    if (!isNaN(temp)) {
      if (temp >= 38.0) alerts.push('Fever');
      else if (temp < 35.5) alerts.push('Hypothermia');
    }
  }
  if (v.heart_rate !== null && v.heart_rate !== undefined) {
    const hr = parseInt(v.heart_rate);
    if (!isNaN(hr)) {
      if (hr > 100) alerts.push('Tachycardia');
      else if (hr < 60) alerts.push('Bradycardia');
    }
  }
  if (v.respiratory_rate !== null && v.respiratory_rate !== undefined) {
    const rr = parseInt(v.respiratory_rate);
    if (!isNaN(rr)) {
      if (rr > 24) alerts.push('Tachypnea');
      else if (rr < 12) alerts.push('Bradypnea');
    }
  }
  if (v.o2_sat !== null && v.o2_sat !== undefined) {
    const o2 = parseInt(v.o2_sat);
    if (!isNaN(o2)) {
      if (o2 < 95) alerts.push('Hypoxia');
    }
  }
  if (v.blood_pressure) {
    const parts = v.blood_pressure.toString().split('/');
    if (parts.length === 2) {
      const sys = parseInt(parts[0]);
      const dia = parseInt(parts[1]);
      if (!isNaN(sys) && !isNaN(dia)) {
        if (sys > 130 || dia > 90) alerts.push('Hypertension');
        else if (sys < 90 || dia < 60) alerts.push('Hypotension');
      }
    }
  }
  return alerts;
};

// Dashboard Route: Summary Stats
app.get('/api/dashboard/stats', async (req, res) => {
  let totalPatients = 0;
  let checkinsToday = 0;
  let activeAlerts = 0;
  let bedsOccupied = 0;
  const paracetamolStock = null;
  let sentHomeToday = 0;
  let occupiedBedsList = [];
  let highRiskPatients = [];
  let outbreakAlert = null;

  const clinicDate = getClinicDateString();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const fluKeywords = ['flu', 'fever', 'cough', 'cold', 'influenza', 'sore throat'];
  const categories = {
    fever_flu: ['fever', 'flu', 'influenza', 'chills'],
    respiratory: ['cough', 'cold', 'sore throat', 'congestion', 'runny nose', 'respiratory', 'difficulty breathing', 'breathing'],
    gastrointestinal: ['stomach', 'tummy', 'belly', 'nausea', 'vomiting', 'diarrhea', 'abdominal', 'cramp', 'gastro'],
    injury_sprains: ['injury', 'sprain', 'bruise', 'wound', 'cut', 'scrape', 'fall', 'sprained', 'pain', 'hurt', 'scratch']
  };

  try {
    const [
      totalPatientsRes,
      checkinsTodayRes,
      sentHomeTodayRes,
      bedPatientsRes,
      vitalsTodayRes,
      recentLogsRes
    ] = await Promise.all([
      db.from('patients').select('*', { count: 'exact', head: true }),
      db.query(`SELECT COUNT(*)::integer AS count
        FROM visit_logs
        WHERE event_type = 'Check-in'
          AND created_at >= ($1::date::timestamp AT TIME ZONE $2)
          AND created_at < (($1::date + 1)::timestamp AT TIME ZONE $2)`, [clinicDate, CLINIC_TIME_ZONE]
      ).then(({ rows }) => ({ count: rows[0]?.count || 0 })),
      db.query(`SELECT COUNT(*)::integer AS count
        FROM visit_logs AS checkout
        WHERE checkout.event_type = 'Check-out'
          AND checkout.created_at >= ($1::date::timestamp AT TIME ZONE $2)
          AND checkout.created_at < (($1::date + 1)::timestamp AT TIME ZONE $2)
          AND EXISTS (
            SELECT 1
            FROM soap_notes AS note
            WHERE note.patient_id = checkout.patient_id
              AND note.disposition = 'Sent Home'
              AND note.created_at <= checkout.created_at
              AND note.created_at >= COALESCE((
                SELECT MAX(checkin.created_at)
                FROM visit_logs AS checkin
                WHERE checkin.patient_id = checkout.patient_id
                  AND checkin.event_type = 'Check-in'
                  AND checkin.created_at < checkout.created_at
              ), '-infinity'::timestamptz)
          )`, [clinicDate, CLINIC_TIME_ZONE]
      ).then(({ rows }) => ({ count: rows[0]?.count || 0 })),
      db.from('patients').select('id, name, section, gender, age, observation_started_at').eq('status', 'Under Observation'),
      db.query(`SELECT DISTINCT ON (v.patient_id) v.*, json_build_object('name', p.name, 'section', p.section, 'gender', p.gender, 'age', p.age) AS patients
        FROM vitals v JOIN patients p ON p.id = v.patient_id
        WHERE p.status IN ('Checked In', 'Under Observation')
          AND v.recorded_at >= COALESCE((SELECT max(created_at) FROM visit_logs WHERE patient_id = p.id AND event_type = 'Check-in'), '-infinity'::timestamptz)
        ORDER BY v.patient_id, v.recorded_at DESC, v.id DESC`).then(result => ({ data: result.rows })),
      db.from('visit_logs').select('*, patients(section)').eq('event_type', 'Check-in').gte('created_at', fortyEightHoursAgo.toISOString())
    ]);

    if (totalPatientsRes.error) throw totalPatientsRes.error;
    if (checkinsTodayRes.error) throw checkinsTodayRes.error;
    if (sentHomeTodayRes.error) throw sentHomeTodayRes.error;
    if (bedPatientsRes.error) throw bedPatientsRes.error;
    if (vitalsTodayRes.error) throw vitalsTodayRes.error;
    if (recentLogsRes.error) throw recentLogsRes.error;

    totalPatients = totalPatientsRes.count || 0;
    checkinsToday = checkinsTodayRes.count || 0;
    sentHomeToday = sentHomeTodayRes.count || 0;

    const bedPatients = bedPatientsRes.data || [];
    if (bedPatients.length > 0) {
      occupiedBedsList = bedPatients.map(p => ({
        id: p.id,
        name: p.name,
        section: p.section,
        gender: p.gender,
        age: p.age,
        entryTime: p.observation_started_at
      }));
      bedsOccupied = occupiedBedsList.length;
    }

    // 6. High-Risk Patients Today
    const vitalsToday = vitalsTodayRes.data || [];
    const highRiskMap = {};
    for (const v of vitalsToday) {
      const alerts = checkVitals(v);
      if (alerts.length > 0) {
        const patientId = v.patient_id;
        const p = (v.patients && Array.isArray(v.patients) ? v.patients[0] : v.patients) || {};
        if (!highRiskMap[patientId]) {
          highRiskMap[patientId] = {
            id: patientId,
            name: p.name || 'Unknown',
            section: p.section || '—',
            gender: p.gender || '—',
            age: p.age || '—',
            alerts: new Set(),
            vitals: {
              temperature: v.temperature,
              heart_rate: v.heart_rate,
              blood_pressure: v.blood_pressure,
              o2_sat: v.o2_sat,
              respiratory_rate: v.respiratory_rate
            }
          };
        }
        alerts.forEach(a => highRiskMap[patientId].alerts.add(a));
      }
    }

    highRiskPatients = Object.values(highRiskMap).map(p => ({
      ...p,
      alerts: Array.from(p.alerts)
    }));
    activeAlerts = highRiskPatients.length;

    // 7. Outbreak Detection
    const recentLogs = recentLogsRes.data || [];
    const sectionFluPatients = {};

    const symptomsBreakdown = {
      fever_flu: 0,
      respiratory: 0,
      gastrointestinal: 0,
      injury_sprains: 0
    };

      if (recentLogs) {
        for (const log of recentLogs) {
          const complaint = (log.details || '').toLowerCase();
          const hasFluSymptom = fluKeywords.some(kw => complaint.includes(kw));
          const p = (log.patients && Array.isArray(log.patients) ? log.patients[0] : log.patients) || {};
          const section = p.section;

          if (hasFluSymptom && section && section !== 'Unassigned' && section.trim() !== '') {
            if (!sectionFluPatients[section]) {
              sectionFluPatients[section] = new Set();
            }
            sectionFluPatients[section].add(log.patient_id);
          }

          // Compute symptom breakdown
          if (categories.fever_flu.some(kw => complaint.includes(kw))) symptomsBreakdown.fever_flu++;
          if (categories.respiratory.some(kw => complaint.includes(kw))) symptomsBreakdown.respiratory++;
          if (categories.gastrointestinal.some(kw => complaint.includes(kw))) symptomsBreakdown.gastrointestinal++;
          if (categories.injury_sprains.some(kw => complaint.includes(kw))) symptomsBreakdown.injury_sprains++;
        }
      }

      for (const section of Object.keys(sectionFluPatients)) {
        if (sectionFluPatients[section].size >= 5) {
          outbreakAlert = {
            section,
            count: sectionFluPatients[section].size,
            message: `⚠️ Outbreak Warning: ${sectionFluPatients[section].size} students from section ${section} checked in with flu-like symptoms in the last 48 hours!`
          };
          break;
        }
      }

      return res.json({
        totalPatients,
        checkinsToday,
        activeAlerts,
        bedsOccupied,
        paracetamolStock,
        inventoryTracked: false,
        bedCapacity: bedCapacity(),
        sentHomeToday,
        occupiedBedsList,
        highRiskPatients,
        outbreakAlert,
        symptomsBreakdown
      });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Dashboard Route: Activity Audit Log
app.get('/api/dashboard/activity', async (req, res) => {
  const dateParam = req.query.date ? String(req.query.date) : getClinicDateString();
  if (!isCalendarDateString(dateParam)) {
    return res.status(400).json({ error: 'date must be a valid calendar date in YYYY-MM-DD format.' });
  }

  try {
    const { rows: logs } = await db.query(`SELECT log.*, patient.name AS patient_name
      FROM visit_logs AS log
      LEFT JOIN patients AS patient ON patient.id = log.patient_id
      WHERE log.created_at >= ($1::date::timestamp AT TIME ZONE $2)
        AND log.created_at < (($1::date + 1)::timestamp AT TIME ZONE $2)
      ORDER BY log.created_at DESC`, [dateParam, CLINIC_TIME_ZONE]);

      const formatted = (logs || []).map(l => ({
        id: l.id,
        patient_id: l.patient_id,
        patient_name: l.patient_name || 'Unknown Patient',
        event_type: l.event_type,
        details: l.details,
        created_at: l.created_at
      }));
      return res.json({ data: formatted });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Dashboard Route: Weekly Trends
app.get('/api/dashboard/trends', async (req, res) => {
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  try {
    const [year, month, day] = getClinicDateString().split('-').map(Number);
    const today = new Date(0);
    today.setUTCHours(0, 0, 0, 0);
    today.setUTCFullYear(year, month - 1, day);
    const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 24 * 60 * 60 * 1000);
    const friday = new Date(monday.getTime() + 4 * 24 * 60 * 60 * 1000);
    const mondayDate = monday.toISOString().slice(0, 10);
    const fridayDate = friday.toISOString().slice(0, 10);

    const { rows } = await db.query(`SELECT (created_at AT TIME ZONE $3)::date::text AS clinic_date,
        COUNT(*)::integer AS count
      FROM visit_logs
      WHERE event_type = 'Check-in'
        AND created_at >= ($1::date::timestamp AT TIME ZONE $3)
        AND created_at < (($2::date + 1)::timestamp AT TIME ZONE $3)
      GROUP BY clinic_date`, [mondayDate, fridayDate, CLINIC_TIME_ZONE]);

    const countsByDate = new Map((rows || []).map(row => [row.clinic_date, row.count]));
    const trendData = Object.fromEntries(weekdays.map((weekday, index) => {
      const clinicDate = new Date(monday.getTime() + index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return [weekday, countsByDate.get(clinicDate) || 0];
    }));

    return res.json({ data: trendData });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Get Parental Consents
app.get('/api/patients/:id/consents', async (req, res) => {
  const patientId = parseInt(req.params.id);
  if (isNaN(patientId)) return res.status(400).json({ error: 'Invalid patient ID' });
  try {
    const { data, error } = await db.from('parental_consents').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ data: data || [] });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Save Parental Consent
app.post('/api/patients/:id/consents', async (req, res) => {
  const patientId = parseInt(req.params.id);
  if (isNaN(patientId)) return res.status(400).json({ error: 'Invalid patient ID' });
  const { consent_type, document_name, parent_name, date_granted, notes } = req.body;
  
  if (!consent_type?.trim() || !document_name?.trim() || !parent_name?.trim()) {
    return res.status(400).json({ error: 'Consent type, document name, and parent name are required.' });
  }

  // Validate date_granted if provided
  let parsedDateGranted = date_granted;
  if (date_granted) {
    const d = new Date(date_granted);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: 'Invalid consent date format.' });
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (d > today) {
      return res.status(400).json({ error: 'Consent date cannot be in the future.' });
    }
  } else {
    parsedDateGranted = getClinicDateString();
  }

  const practitioner = getPractitioner(req);
  if (practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor') {
    return res.status(403).json({ error: 'Access denied. Teachers and counselors cannot upload parental consent.' });
  }
  
  const auditDetails = `Uploaded parental consent: ${consent_type} document '${document_name}' signed by parent ${parent_name}`;

  try {
    const { data, error } = await db.from('parental_consents').insert([{
        patient_id: patientId, consent_type, document_name, parent_name, date_granted: parsedDateGranted, notes
      }]).select();
      if (error) throw error;
      
      await db.from('visit_logs').insert([{
        patient_id: patientId,
        event_type: 'Consent Form Registered',
        details: auditDetails,
        performed_by: practitioner.email
      }]);

      return res.json({ data: data[0] });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Get Excuse Slips
app.get('/api/patients/:id/excuse-slips', async (req, res) => {
  const patientId = parseInt(req.params.id);
  if (isNaN(patientId)) return res.status(400).json({ error: 'Invalid patient ID' });
  const isRestrictedRole = req.user.role === 'teacher' || req.user.role === 'guidance_counselor';
  try {
    const columns = isRestrictedRole
      ? 'id, start_date, end_date, teacher_notified, principal_acknowledged, principal_acknowledged_at, departure_approved, departure_approved_at, created_at'
      : '*';
    const { data, error } = await db.from('excuse_slips').select(columns).eq('patient_id', patientId).order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ data: data || [] });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Admin Route: Purge Graduate Patients (Data Retention)
app.post('/api/admin/purge-graduates', async (req, res) => {
  const practitioner = getPractitioner(req);
  if (practitioner.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Only system administrators can purge student records.' });
  }
  const { years } = req.body;
  const yearsVal = years !== undefined ? parseInt(years) : 5;
  if (isNaN(yearsVal) || yearsVal <= 0) {
    return res.status(400).json({ error: 'Retention period must be a positive integer number of years.' });
  }
  const cutoffYear = new Date().getFullYear() - yearsVal;

  let deletedCount = 0;

  try {
    // Find patients who graduated on or before cutoffYear
      const { data: toDelete, error: findErr } = await db.from('patients').select('id, name').lte('graduation_year', cutoffYear);
      if (findErr) throw findErr;

      if (toDelete && toDelete.length > 0) {
        const ids = toDelete.map(p => p.id);
        const { error: deleteErr } = await db.from('patients').delete().in('id', ids);
        if (deleteErr) throw deleteErr;
        deletedCount = toDelete.length;
      }

      return res.json({ success: true, message: `Successfully purged ${deletedCount} student records graduated on or before ${cutoffYear}.` });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Admin Route: Get Simulated Notifications Log
app.get('/api/admin/notifications', (req, res) => {
  res.json({ data: simulatedNotifications });
});

// Settings Route: Get Clinic settings (principal and security guard emails)
app.get('/api/settings/clinic', async (req, res) => {
  try {
    const { data, error } = await db.from('clinic_settings').select('*');
      if (error) throw error;
      
      const settings = {};
      data.forEach(s => {
        settings[s.key] = s.value;
      });
      
      return res.json({
        data: {
          principal_email: settings.principal_email || '',
          security_guard_email: settings.security_guard_email || '',
          school_logo_url: settings.school_logo_url || ''
        }
      });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Settings Route: Update Clinic settings
app.post('/api/settings/clinic', async (req, res) => {
  const { school_logo_url } = req.body;
  const principal_email = String(req.body.principal_email || '').trim();
  const security_guard_email = String(req.body.security_guard_email || '').trim();
  if ((principal_email && !validEmail(principal_email)) || (security_guard_email && !validEmail(security_guard_email))) {
    return res.status(400).json({ error: 'Enter valid principal and security email addresses, or leave them empty.' });
  }
  
  const practitioner = getPractitioner(req);
  if (practitioner.role !== 'admin' && practitioner.role !== 'nurse' && practitioner.role !== 'physician') {
    return res.status(403).json({ error: 'Access denied. Only clinical staff and admins can update settings.' });
  }

  try {
    const { error: err1 } = await db.from('clinic_settings').upsert({ key: 'principal_email', value: principal_email });
      if (err1) throw err1;
      const { error: err2 } = await db.from('clinic_settings').upsert({ key: 'security_guard_email', value: security_guard_email });
      if (err2) throw err2;
      const { error: err3 } = await db.from('clinic_settings').upsert({ key: 'school_logo_url', value: school_logo_url || '' });
      if (err3) throw err3;

      return res.json({ message: 'Clinic settings updated successfully.' });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

const acknowledgmentPage = (nonce) => {
  const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clinic departure approval</title><style>body{font:16px system-ui,sans-serif;background:#f8fafc;color:#1e293b;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:440px;margin:24px;padding:32px;background:white;border:1px solid #e2e8f0;border-radius:16px;text-align:center}button{border:0;border-radius:8px;padding:12px 18px;background:#2563eb;color:white;font-weight:700;cursor:pointer}p{line-height:1.5;color:#475569}</style></head><body><main class="card"><h1>Clinic departure approval</h1><p>Verify the request through the school process, then explicitly approve departure for this excuse slip. This approval will be recorded.</p><form id="ack-form"><button type="submit">Approve departure</button></form><p id="ack-status" role="status"></p></main><script nonce="' + nonce + '">document.getElementById("ack-form").addEventListener("submit", async function(event){event.preventDefault();var token=window.location.hash.slice(1);var status=document.getElementById("ack-status");if(!/^[a-f0-9]{64}$/i.test(token)){status.textContent="This link is invalid or expired.";return;}try{var response=await fetch(window.location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:token})});var result=await response.json();status.textContent=response.ok?result.message:"This link is invalid, expired, or already used.";if(response.ok){document.getElementById("ack-form").remove();window.history.replaceState(null,"",window.location.pathname);}}catch(error){status.textContent="The acknowledgment could not be recorded. Please contact the clinic."}});</script></body></html>';
  return page;
};

app.get('/api/excuse-slips/:id/acknowledge', (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-" + nonce + "'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  return res.type('html').send(acknowledgmentPage(nonce));
});

app.post('/api/excuse-slips/:id/acknowledge', async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(403).json({ error: 'This acknowledgment link is invalid or expired.' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  let patientId;
  try {
    await database.transaction(async (transaction) => {
      const selected = await transaction.query(
        'SELECT patient_id, acknowledgment_token_hash, departure_approved, created_at FROM excuse_slips WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      const slip = selected.rows[0];
      const storedHash = slip?.acknowledgment_token_hash || '';
      const tokenMatches = /^[a-f0-9]{64}$/i.test(storedHash) &&
        crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(tokenHash, 'hex'));
      if (!slip || !tokenMatches || slip.departure_approved || Date.now() - new Date(slip.created_at).getTime() > 7 * 86400000) {
        const error = new Error('Acknowledgment link is invalid or already used.');
        error.status = 403;
        throw error;
      }

      const updated = await transaction.query(
        'UPDATE excuse_slips ' +
        'SET principal_acknowledged = TRUE, principal_acknowledged_at = NOW(), departure_approved = TRUE, departure_approved_at = NOW(), acknowledgment_token_hash = NULL ' +
        'WHERE id = $1 AND acknowledgment_token_hash = $2 AND departure_approved = FALSE ' +
        'RETURNING patient_id',
        [req.params.id, tokenHash]
      );
      if (!updated.rows[0]) {
        const error = new Error('Acknowledgment link is invalid or already used.');
        error.status = 403;
        throw error;
      }
      patientId = updated.rows[0].patient_id;
      await transaction.query(
        'INSERT INTO visit_logs (patient_id, event_type, details, performed_by) ' +
        "VALUES ($1, 'Excuse Slip Approved', 'Principal explicitly approved departure for this excuse slip.', 'Principal email link')",
        [patientId]
      );
    });

    let notifications = [];
    try { notifications = await workflowNotifications.gateEmail(req.params.id); }
    catch { notifications = [{ status: 'unknown' }]; }
    const message = notifications.some(item => ['failed', 'unknown'].includes(item.status))
      ? 'Approval recorded. The security notification could not be confirmed; contact the clinic.'
      : notifications.some(item => ['pending', 'sending'].includes(item.status))
        ? 'Approval recorded. The security email is queued; check the email delivery log for the provider result.'
      : notifications.some(item => item.status === 'simulated')
        ? 'Approval recorded. Security email was simulated; no external email was sent.'
        : notifications.some(item => item.status === 'accepted')
          ? 'Approval recorded. The security notification was accepted by the email provider.'
          : 'Approval recorded. Security clearance is sent only after an eligible clinic checkout.';
    return res.json({ success: true, message });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[ACKNOWLEDGMENT] Could not record clinic document acknowledgment:', error.message);
    return res.status(503).json({ error: 'The acknowledgment could not be recorded.' });
  }
});
// Centralized Express Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(`[EXPRESS ERROR] ${req.method} ${req.path}:`, err.stack || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

async function startServer(port = PORT) {
  await database.initialize();
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.once('error', reject);
    server.once('listening', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Backend server did not bind to a TCP port.'));
        return;
      }
      listeningPort = address.port;
      console.log('EMR Backend Server running on port ' + listeningPort + ' with ' + database.mode + ' database');
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().then((server) => {
    const shutdown = () => server.close(async () => {
      await database.close();
      process.exit(0);
    });
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }).catch((error) => {
    console.error('[FATAL] Backend startup failed:', error.message);
    database.close().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.app = app;
module.exports.database = database;
module.exports.startServer = startServer;
