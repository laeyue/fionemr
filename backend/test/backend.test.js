const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const crypto = require('node:crypto');

require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const databaseTarget = (value) => {
  if (!value) return null;
  const url = new URL(value);
  return url.hostname.replace('-pooler.', '.') + url.pathname;
};
if (!process.env.TEST_DATABASE_URL || [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].some(value => value && databaseTarget(value) === databaseTarget(process.env.TEST_DATABASE_URL))) {
  throw new Error('Set TEST_DATABASE_URL to a separate disposable Neon test database before running tests.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.EMAIL_MODE = 'simulate';

const { database } = require('../database');
const { hashPassword } = require('../security');
const { startServer } = require('../index');

const testEmail = 'backend-test-doctor@example.invalid';
const testPassword = 'test-only-clinic-password-2026';

let server;

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  await database.close();
});

test('local backend initializes PostgreSQL, signs in, and persists patient workflow data', async () => {
  await database.initialize();
  const passwordHash = await hashPassword(testPassword);
  await database.query(
    `INSERT INTO accounts (name, email, password, role, is_active)
     VALUES ($1, $2, $3, 'physician', TRUE)`,
    ['Backend Test Doctor', testEmail, passwordHash]
  );

  server = await startServer(0);
  const address = server.address();
  const baseUrl = 'http://127.0.0.1:' + address.port;

  const healthResponse = await fetch(baseUrl + '/api/health');
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.status, 'ok');
  assert.equal(health.database.mode, 'postgresql');

  const loginResponse = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword })
  });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();
  assert.equal(login.data.role, 'physician');
  assert.equal(login.data.password, undefined);
  assert.match(login.accessToken, /^[A-Za-z0-9_-]{43}$/);

  const unauthenticatedResponse = await fetch(baseUrl + '/api/patients', {
    headers: {
      'x-user-email': testEmail,
      'x-user-role': 'admin',
      'x-user-name': 'Impersonated Admin'
    }
  });
  assert.equal(unauthenticatedResponse.status, 401);

  const authHeaders = {
    'content-type': 'application/json',
    authorization: 'Bearer ' + login.accessToken
  };

  const patientResponse = await fetch(baseUrl + '/api/patients', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Local Backend Test Student',
      section: 'Test Section',
      age: 12,
      gender: 'Female',
      emergency_contact_name: 'Test Parent',
      emergency_contact_phone: '000',
      parent_email: 'parent@example.invalid',
      adviser_name: 'Test Adviser',
      adviser_email: 'adviser@example.invalid'
    })
  });
  assert.equal(patientResponse.status, 200);
  const patient = (await patientResponse.json()).data;
  assert.equal(patient.name, 'Local Backend Test Student');
  assert.ok(Number(patient.id) >= 1000);

  const teacherEmail = 'backend-test-teacher@example.invalid';
  const teacherPassword = 'test-only-teacher-password-2026';
  const teacherHash = await hashPassword(teacherPassword);
  await database.query(
    `INSERT INTO accounts (name, email, password, role, is_active)
     VALUES ($1, $2, $3, 'teacher', TRUE)`,
    ['Backend Test Teacher', teacherEmail, teacherHash]
  );
  const teacherLoginResponse = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: teacherEmail, password: teacherPassword })
  });
  assert.equal(teacherLoginResponse.status, 200);
  const teacherLogin = await teacherLoginResponse.json();
  const teacherHeaders = { authorization: 'Bearer ' + teacherLogin.accessToken };
  const teacherDetailResponse = await fetch(baseUrl + '/api/patients/' + patient.id, { headers: teacherHeaders });
  assert.equal(teacherDetailResponse.status, 200);
  const teacherPatient = (await teacherDetailResponse.json()).data;
  assert.equal(teacherPatient.emergency_contact_phone, undefined);
  assert.equal(teacherPatient.allergies, undefined);
  const teacherDashboardResponse = await fetch(baseUrl + '/api/dashboard/stats', { headers: teacherHeaders });
  assert.equal(teacherDashboardResponse.status, 403);

  const deniedAdminResponse = await fetch(baseUrl + '/api/admin/notifications', {
    headers: {
      authorization: 'Bearer ' + login.accessToken,
      'x-user-role': 'admin'
    }
  });
  assert.equal(deniedAdminResponse.status, 403);

  const publicRegistrationResponse = await fetch(baseUrl + '/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Self Signup', email: 'self-signup@example.invalid', password: testPassword, role: 'admin' })
  });
  assert.equal(publicRegistrationResponse.status, 401);

  const unprivilegedRegistrationResponse = await fetch(baseUrl + '/api/auth/register', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Unauthorized Staff', email: 'unauthorized@example.invalid', password: testPassword, role: 'nurse' })
  });
  assert.equal(unprivilegedRegistrationResponse.status, 403);

  const removedMfaRouteResponse = await fetch(baseUrl + '/api/auth/mfa/verify', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ code: '123456' })
  });
  assert.equal(removedMfaRouteResponse.status, 404);

  const searchResponse = await fetch(baseUrl + '/api/patients?search=' + encodeURIComponent(String(patient.id)), {
    headers: authHeaders
  });
  assert.equal(searchResponse.status, 200);
  const patients = (await searchResponse.json()).data;
  assert.equal(patients.some((row) => String(row.id) === String(patient.id)), true);

  const checkinResponse = await fetch(baseUrl + '/api/patients/' + patient.id + '/checkin', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ chief_complaint: 'Synthetic check-in for backend test' })
  });
  assert.equal(checkinResponse.status, 200);

  let alerts = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const alertResult = await database.from('email_alerts').select('*').eq('patient_id', patient.id);
    alerts = alertResult.data || [];
    if (alerts.length === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(alerts.length, 2);
  const parentAlert = alerts.find((alert) => alert.recipient_type === 'parent');
  assert.ok(parentAlert);

  const confirmationUrl = baseUrl + '/api/notifications/respond?alertId=' + encodeURIComponent(parentAlert.id) + '&response=Acknowledged';
  const webmailConfirmation = await fetch(confirmationUrl, {
    headers: { origin: 'https://mail.google.com' }
  });
  assert.equal(webmailConfirmation.status, 200);
  assert.match(await webmailConfirmation.text(), /Confirm clinic response/);
  assert.equal(webmailConfirmation.headers.get('access-control-allow-origin'), null);

  const crossOriginSubmission = await fetch(baseUrl + '/api/notifications/respond', {
    method: 'POST',
    headers: { origin: 'https://mail.google.com', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ alertId: parentAlert.id, response: 'Acknowledged' })
  });
  assert.equal(crossOriginSubmission.status, 403);

  const responsePage = await fetch(baseUrl + '/api/notifications/respond', {
    method: 'POST',
    headers: { origin: baseUrl, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ alertId: parentAlert.id, response: 'Acknowledged' })
  });
  assert.equal(responsePage.status, 200);
  assert.match(await responsePage.text(), /Response Recorded/);

  const updatedAlert = await database.from('email_alerts')
    .select('*, patients(name)')
    .eq('id', parentAlert.id)
    .maybeSingle();
  assert.equal(updatedAlert.error, null);
  assert.equal(updatedAlert.data.acknowledged, true);
  assert.equal(updatedAlert.data.response_status, 'On My Way');
  assert.equal(updatedAlert.data.patients.name, patient.name);

  const acknowledgmentToken = crypto.randomBytes(32).toString('hex');
  const acknowledgmentHash = crypto.createHash('sha256').update(acknowledgmentToken).digest('hex');
  const verificationHash = crypto.randomBytes(32).toString('hex').toUpperCase();
  const slip = await database.query(
    `INSERT INTO excuse_slips (patient_id, excuse_reason, start_date, end_date, verification_hash, acknowledgment_token_hash, created_by)
     VALUES ($1, 'Test reason', CURRENT_DATE, CURRENT_DATE, $2, $3, $4)
     RETURNING id`,
    [patient.id, verificationHash, acknowledgmentHash, testEmail]
  );
  const acknowledgmentUrl = baseUrl + '/api/excuse-slips/' + slip.rows[0].id + '/acknowledge';
  const acknowledgmentPageResponse = await fetch(acknowledgmentUrl + '#' + acknowledgmentToken);
  assert.equal(acknowledgmentPageResponse.status, 200);
  assert.match(await acknowledgmentPageResponse.text(), /Approve departure/);
  const notYetAcknowledged = await database.query('SELECT principal_acknowledged FROM excuse_slips WHERE id = $1', [slip.rows[0].id]);
  assert.equal(notYetAcknowledged.rows[0].principal_acknowledged, false);

  const acknowledgmentResponse = await fetch(acknowledgmentUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: acknowledgmentToken })
  });
  assert.equal(acknowledgmentResponse.status, 200);
  const replayResponse = await fetch(acknowledgmentUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: acknowledgmentToken })
  });
  assert.equal(replayResponse.status, 403);

  const dashboardResponse = await fetch(baseUrl + '/api/dashboard/stats', { headers: authHeaders });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.equal(dashboard.totalPatients, 1);
  assert.equal(dashboard.checkinsToday, 1);

  const joinedLog = await database.from('visit_logs')
    .select('id, event_type, patients(name)')
    .eq('patient_id', patient.id)
    .eq('event_type', 'Registration')
    .maybeSingle();
  assert.equal(joinedLog.error, null);
  assert.equal(joinedLog.data.event_type, 'Registration');
  assert.equal(joinedLog.data.patients.name, patient.name);

  const immunizationRows = await database.from('immunizations')
    .select('*', { count: 'exact', head: true })
    .in('patient_id', [patient.id]);
  assert.equal(immunizationRows.error, null);
  assert.equal(immunizationRows.count, 4);

  const upsertResult = await database.from('clinic_settings').upsert({ key: 'backend_test', value: 'initial' });
  assert.equal(upsertResult.error, null);
  const updateResult = await database.from('clinic_settings').update({ value: 'updated' }).eq('key', 'backend_test');
  assert.equal(updateResult.error, null);
  const setting = await database.from('clinic_settings').select('*').eq('key', 'backend_test').maybeSingle();
  assert.equal(setting.data.value, 'updated');
  const deleteResult = await database.from('clinic_settings').delete().in('key', ['backend_test']);
  assert.equal(deleteResult.error, null);

  const logoutResponse = await fetch(baseUrl + '/api/auth/logout', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + login.accessToken }
  });
  assert.equal(logoutResponse.status, 200);
  const revokedSessionResponse = await fetch(baseUrl + '/api/patients', {
    headers: { authorization: 'Bearer ' + login.accessToken }
  });
  assert.equal(revokedSessionResponse.status, 401);
});
