// Polyfill WebSocket for older Node versions (like Node 20) before importing Supabase
if (typeof global.WebSocket === 'undefined') {
  try {
    global.WebSocket = require('ws');
  } catch (err) {
    console.warn('[WARNING] Failed to load "ws" polyfill for WebSocket support.');
  }
}

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize Supabase Client
let supabase = null;

let supabaseUrl = process.env.SUPABASE_URL || '';
let supabaseKey = process.env.SUPABASE_KEY || '';

// Clean up quotes if passed literally from environment files
if (supabaseUrl) {
  supabaseUrl = supabaseUrl.replace(/^['"]|['"]$/g, '').trim();
  // Strip trailing rest/v1/ or rest/v1 or trailing slashes
  supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}
if (supabaseKey) supabaseKey = supabaseKey.replace(/^['"]|['"]$/g, '').trim();

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('dummy') || supabaseUrl.includes('your-project-id') || supabaseUrl.includes('placeholder')) {
  throw new Error("Supabase URL and Key are required to start the application. Fallback database is disabled.");
}

console.log('[DEBUG] Initializing Supabase client with URL:', supabaseUrl);
try {
  supabase = createClient(supabaseUrl, supabaseKey);
} catch (err) {
  console.error('[FATAL] Failed to initialize Supabase client:', err.message);
  throw err;
}

let simulatedNotifications = [];
let emailCodes = {}; // { userId: { code, expiresAt } }

const seedAccountsTable = async () => {
  const defaultAccounts = [
    { 
      name: 'Developer Tester', 
      email: 'dev@aerohealth.com', 
      password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
      role: 'physician'
    },
    { 
      name: 'Dr. AeroHealth', 
      email: 'doctor@aerohealth.com', 
      password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
      role: 'physician'
    },
    { 
      name: 'Nurse Joy', 
      email: 'nurse@aerohealth.com', 
      password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
      role: 'nurse'
    },
    { 
      name: 'Teacher Sarah', 
      email: 'teacher@aerohealth.com', 
      password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
      role: 'teacher'
    },
    { 
      name: 'Counselor Troy', 
      email: 'counselor@aerohealth.com', 
      password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
      role: 'guidance_counselor'
    },
    { 
      name: 'Admin Alex', 
      email: 'admin@aerohealth.com', 
      password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
      role: 'admin'
    }
  ];

  console.log('[DEBUG] Checking if seeded accounts need to be inserted in database...');
  try {
    for (const acc of defaultAccounts) {
      const { data: existing, error } = await supabase
        .from('accounts')
        .select('email')
        .eq('email', acc.email)
        .maybeSingle();

      if (error) {
        console.error('[WARNING] Failed to check existence of seeded account ' + acc.email + ':', error.message);
        continue;
      }

      if (!existing) {
        console.log('[DEBUG] Seeding account: ' + acc.email);
        const { error: insertErr } = await supabase
          .from('accounts')
          .insert([acc]);

        if (insertErr) {
          console.error('[WARNING] Failed to seed account ' + acc.email + ':', insertErr.message);
        }
      }
    }
    console.log('[DEBUG] Seeded accounts validation completed.');
  } catch (err) {
    console.error('[WARNING] Seeding accounts failed:', err.message);
  }
};

// Execute seeding asynchronously on startup
seedAccountsTable();

// Password Hashing Utility
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

const SEEDED_EMAILS = [
  'dev@aerohealth.com',
  'doctor@aerohealth.com',
  'nurse@aerohealth.com',
  'teacher@aerohealth.com',
  'counselor@aerohealth.com',
  'admin@aerohealth.com'
];

const isSeededAccount = (email) => {
  if (!email) return false;
  return SEEDED_EMAILS.includes(email.toLowerCase());
};

const getPractitioner = (req) => {
  return {
    email: req.headers['x-user-email'] || 'dev@aerohealth.com',
    role: (req.headers['x-user-role'] || 'physician').toLowerCase(),
    name: req.headers['x-user-name'] || 'Developer Tester'
  };
};

const triggerParentNotification = async (patientId, message) => {
  try {
    let parentName = 'Guardian';
    let contactPhone = 'Unknown';
    let patientName = 'Student';

    const { data: p, error } = await supabase.from('patients').select('name, emergency_contact_name, emergency_contact_phone').eq('id', patientId).maybeSingle();
    if (error) throw error;
    if (p) {
      parentName = p.emergency_contact_name || 'Guardian';
      contactPhone = p.emergency_contact_phone || 'Unknown';
      patientName = p.name || 'Student';
    }

    const formattedMessage = "Hi " + parentName + ", alert for " + patientName + ": " + message;

    // Add to our simulated notifications array
    const newNotif = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      patient_id: patientId,
      recipient: parentName + " (" + contactPhone + ")",
      type: 'SMS/Email',
      message: formattedMessage,
      sent_at: new Date().toISOString()
    };
    simulatedNotifications.push(newNotif);

    // Highlight in backend logs
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│ [SMS/EMAIL GATEWAY] Notification Sent to:             │');
    console.log('│ Recipient: ' + newNotif.recipient.padEnd(43) + ' │');
    console.log('│ Message: ' + newNotif.message.substring(0, 45).padEnd(45) + '... │');
    console.log('└────────────────────────────────────────────────────────┘\n');

  } catch (err) {
    console.error('[NOTIFICATIONS] Failed to trigger parent notification:', err.message);
  }
};

const generateAlertId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
};

const sendBrevoEmail = async (recipientEmail, recipientName, subject, htmlContent) => {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const smtpPass = process.env.SMTP_PASS;
  const smtpUser = process.env.SMTP_USER || process.env.SENDER_EMAIL;
  const senderEmail = process.env.SENDER_EMAIL || 'clinic@aerohealth.com';
  const senderName = process.env.SENDER_NAME || 'AeroHealth Clinic';

  // Fall back to SMTP Relay (tries port 587 first, then port 2525, then port 465)
  const smtpKey = smtpPass || brevoApiKey;
  if (!smtpKey || smtpKey.includes('dummy') || smtpKey.includes('your-api-key') || smtpKey.includes('your_brevo_api_key_here')) {
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│ [BREVO OFFLINE SIMULATION]                             │');
    console.log('│ To: ' + recipientName + ' <' + recipientEmail + '>');
    console.log('│ Subject: ' + subject);
    console.log('│ HTML Content preview (first 150 chars):');
    console.log('│ ' + htmlContent.replace(/<[^>]*>/g, ' ').substring(0, 150).trim().replace(/\s+/g, ' ') + '...');
    console.log('└────────────────────────────────────────────────────────┘\n');
    return { simulated: true };
  }

  const portsToTry = [
    { port: 587, secure: false },
    { port: 2525, secure: false },
    { port: 465, secure: true }
  ];

  for (const connection of portsToTry) {
    console.log('[SMTP RELAY] Attempting to send email via port ' + connection.port + ' (secure: ' + connection.secure + ') to: ' + recipientEmail + '...');
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: connection.port,
        secure: connection.secure,
        auth: {
          user: smtpUser,
          pass: smtpKey
        },
        connectionTimeout: 5000 // 5 seconds timeout to fail fast and try next port
      });

      const info = await transporter.sendMail({
        from: '"' + senderName + '" <' + senderEmail + '>',
        to: '"' + recipientName + '" <' + recipientEmail + '>',
        subject,
        html: htmlContent
      });

      console.log('[SMTP SUCCESS] Email sent via SMTP Relay (Port ' + connection.port + '): ' + info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error('[SMTP ERROR] Port ' + connection.port + ' failed: ' + err.message);
    }
  }

  console.error('[BREVO ERROR] All SMTP ports (587, 2525, 465) failed.');
  return { error: 'All SMTP sending attempts failed.' };
};

const getEmailTemplate = (recipientName, studentName, incidentDetails, respondUrlBase, alertId) => {
  const ackUrl = respondUrlBase + "/api/notifications/respond?alertId=" + alertId + "&response=Acknowledged";
  const omwUrl = respondUrlBase + "/api/notifications/respond?alertId=" + alertId + "&response=On%20My%20Way";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Clinic Incident Notification</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #333333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e1e4e8; }
        .header { background: linear-gradient(135deg, #2b6cb0, #3182ce); color: #ffffff; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }
        .content { padding: 40px 30px; line-height: 1.6; }
        .content p { margin: 0 0 20px 0; font-size: 16px; color: #4a5568; }
        .alert-box { background-color: #ebf8ff; border-left: 4px solid #3182ce; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 30px; }
        .alert-box p { margin: 0; font-size: 15px; color: #2b6cb0; font-weight: 500; }
        .actions { margin: 40px 0 20px 0; text-align: center; }
        .btn { display: inline-block; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none; text-align: center; margin: 0 10px; }
        .btn-primary { background-color: #3182ce; color: #ffffff !important; box-shadow: 0 2px 4px rgba(49, 130, 206, 0.2); }
        .btn-secondary { background-color: #edf2f7; color: #4a5568 !important; border: 1px solid #cbd5e0; }
        .footer { background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #edf2f7; font-size: 12px; color: #a0aec0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AeroHealth EMR Clinic Alert</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${recipientName}</strong>,</p>
          <p>This is a notification from the school clinic regarding student <strong>${studentName}</strong>, who has just checked in.</p>
          <div class="alert-box">
            <p><strong>Reason for Visit:</strong> ${incidentDetails}</p>
          </div>
          <p>Please acknowledge receipt of this alert and let the clinic know your status by clicking one of the options below:</p>
          <div class="actions">
            <a href="${ackUrl}" class="btn btn-primary">Acknowledge Receipt</a>
            <a href="${omwUrl}" class="btn btn-secondary">On My Way</a>
          </div>
          <p style="font-size: 13px; color: #718096; margin-top: 30px; font-style: italic;">Note: Clicking either button logs your confirmation timestamp directly in our clinic records as verified proof of receipt.</p>
        </div>
        <div class="footer">
          &copy; 2026 AeroHealth EMR System. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
};

const getResponseLandingPage = (status, recipientEmail, recipientType, studentName, timestamp) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Clinic Receipt Verified</title>
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
        <h1>Receipt Verified</h1>
        <p class="subtitle">Your response has been transmitted to the clinic dashboard.</p>
        <div class="details-table">
          <div class="details-row">
            <span class="label">Student:</span>
            <span class="value">	ext{studentName}</span>
          </div>
          <div class="details-row">
            <span class="label">Recipient:</span>
            <span class="value">	ext{recipientEmail} (	ext{recipientType} === 'parent' ? 'Parent/Guardian' : 'Homeroom Adviser')</span>
          </div>
          <div class="details-row">
            <span class="label">Response:</span>
            <span class="value"><span class="badge">	ext{status}</span></span>
          </div>
          <div class="details-row">
            <span class="label">Timestamp:</span>
            <span class="value">	ext{new Date(timestamp).toLocaleString()}</span>
          </div>
        </div>
        <p class="footer-text">AeroHealth School EMR System &bull; Real-time active response gateway</p>
      </div>
    </body>
    </html>
  `;
};

const triggerCheckinEmails = async (patient, chiefComplaint) => {
  if (!patient) return;
  const respondUrlBase = process.env.BACKEND_URL || 'http://localhost:5000';

  // 1. Send Parent Email
  if (patient.parent_email?.trim()) {
    const parentAlertId = generateAlertId();
    const parentName = patient.emergency_contact_name || 'Parent/Guardian';
    const parentSubject = "[AeroHealth Clinic] Incident Alert for " + patient.name;
    const parentHtmlContent = getEmailTemplate(parentName, patient.name, chiefComplaint, respondUrlBase, parentAlertId);

    // Record in DB
    const newAlert = {
      id: parentAlertId,
      patient_id: patient.id,
      recipient_type: 'parent',
      recipient_email: patient.parent_email,
      subject: parentSubject,
      body: parentHtmlContent,
      sent_at: new Date().toISOString(),
      acknowledged: false,
      acknowledged_at: null,
      response_status: null
    };

    try {
      const { error } = await supabase.from('email_alerts').insert([newAlert]);
      if (error) throw error;
    } catch (err) {
      console.error('[DATABASE ERROR] Failed to record parent email alert:', err.message);
    }

    // Call Brevo
    sendBrevoEmail(patient.parent_email, parentName, parentSubject, parentHtmlContent).then(result => {
      if (result && result.simulated) {
        console.log("[SIMULATION LINK] Parent Action Links:");
        console.log("- Acknowledge: " + respondUrlBase + "/api/notifications/respond?alertId=" + parentAlertId + "&response=Acknowledged");
        console.log("- On My Way: " + respondUrlBase + "/api/notifications/respond?alertId=" + parentAlertId + "&response=On%20My%20Way");
      }
    });
  }

  // 2. Send Adviser Email
  if (patient.adviser_email?.trim()) {
    const adviserAlertId = generateAlertId();
    const adviserName = patient.adviser_name || 'Homeroom Adviser';
    const adviserSubject = "[AeroHealth Clinic] Class Incident Alert for " + patient.name;
    const adviserHtmlContent = getEmailTemplate(adviserName, patient.name, chiefComplaint, respondUrlBase, adviserAlertId);

    // Record in DB
    const newAlert = {
      id: adviserAlertId,
      patient_id: patient.id,
      recipient_type: 'adviser',
      recipient_email: patient.adviser_email,
      subject: adviserSubject,
      body: adviserHtmlContent,
      sent_at: new Date().toISOString(),
      acknowledged: false,
      acknowledged_at: null,
      response_status: null
    };

    try {
      const { error } = await supabase.from('email_alerts').insert([newAlert]);
      if (error) throw error;
    } catch (err) {
      console.error('[DATABASE ERROR] Failed to record adviser email alert:', err.message);
    }

    // Call Brevo
    sendBrevoEmail(patient.adviser_email, adviserName, adviserSubject, adviserHtmlContent).then(result => {
      if (result && result.simulated) {
        console.log("[SIMULATION LINK] Adviser Action Links:");
        console.log("- Acknowledge: " + respondUrlBase + "/api/notifications/respond?alertId=" + adviserAlertId + "&response=Acknowledged");
        console.log("- On My Way: " + respondUrlBase + "/api/notifications/respond?alertId=" + adviserAlertId + "&response=On%20My%20Way");
      }
    });
  }
};

const getCheckoutEmailTemplate = (recipientName, studentName) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Clinic Checkout Notification</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #333333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e1e4e8; }
        .header { background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }
        .content { padding: 40px 30px; line-height: 1.6; }
        .content p { margin: 0 0 20px 0; font-size: 16px; color: #4a5568; }
        .alert-box { background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 30px; }
        .alert-box p { margin: 0; font-size: 15px; color: #065f46; font-weight: 500; }
        .footer { background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #edf2f7; font-size: 12px; color: #a0aec0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AeroHealth Clinic Checkout Alert</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${recipientName}</strong>,</p>
          <p>This is a notification from the school clinic to inform you that student <strong>${studentName}</strong> has been successfully checked out of the clinic.</p>
          <div class="alert-box">
            <p><strong>Status:</strong> Checked Out & Returned / Cleared</p>
          </div>
          <p>The student is now cleared to return to class or head home according to their disposition plan.</p>
        </div>
        <div class="footer">
          &copy; 2026 AeroHealth EMR System. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
};

const triggerCheckoutEmails = async (patient) => {
  if (!patient) return;

  // 1. Send Parent Checkout Email
  if (patient.parent_email?.trim()) {
    const parentName = patient.emergency_contact_name || 'Parent/Guardian';
    const parentSubject = "[AeroHealth Clinic] Checkout Alert for " + patient.name;
    const parentHtmlContent = getCheckoutEmailTemplate(parentName, patient.name);
    sendBrevoEmail(patient.parent_email, parentName, parentSubject, parentHtmlContent);
  }

  // 2. Send Adviser Checkout Email
  if (patient.adviser_email?.trim()) {
    const adviserName = patient.adviser_name || 'Homeroom Adviser';
    const adviserSubject = "[AeroHealth Clinic] Class Checkout Alert for " + patient.name;
    const adviserHtmlContent = getCheckoutEmailTemplate(adviserName, patient.name);
    sendBrevoEmail(patient.adviser_email, adviserName, adviserSubject, adviserHtmlContent);
  }

  // 3. Fetch latest excuse slip for student to email Principal and Guard
  try {
    let latestSlip = null;
    const { data: slips, error: fetchSlipsErr } = await supabase
      .from('excuse_slips')
      .select('*')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchSlipsErr) throw fetchSlipsErr;
    if (slips && slips.length > 0) {
      latestSlip = slips[0];
    }

    if (latestSlip) {
      // Get clinic settings
      let principalEmail = 'principal@aerohealth.com';
      let guardEmail = 'guard@aerohealth.com';

      const { data: dbSettings, error: settingsErr } = await supabase.from('clinic_settings').select('*');
      if (settingsErr) throw settingsErr;
      if (dbSettings) {
        const pS = dbSettings.find(s => s.key === 'principal_email');
        const gS = dbSettings.find(s => s.key === 'security_guard_email');
        if (pS) principalEmail = pS.value;
        if (gS) guardEmail = gS.value;
      }

      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
      const ackLink = backendUrl + "/api/excuse-slips/" + latestSlip.id + "/acknowledge";

      // Email Principal
      if (principalEmail?.trim()) {
        const principalSubject = "[AeroHealth Clinic] Excuse Slip Approval Required for " + patient.name;
        const principalHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: sans-serif; line-height: 1.5; color: #334155; }
              .card { border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; max-width: 500px; }
              .btn { background: #0284c7; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-top: 16px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Excuse Slip Acknowledgment Required</h2>
              <p>Dear Principal,</p>
              <p>A medical excuse slip has been generated for student <strong>${patient.name}</strong> (${patient.section}) upon checkout from the clinic.</p>
              <p><strong>Excuse Reason:</strong> ${latestSlip.excuse_reason}</p>
              <p><strong>Excuse Period:</strong> ${latestSlip.start_date} to ${latestSlip.end_date}</p>
              <p>Please click the button below to acknowledge and stamp this excuse certificate:</p>
              <a href="${ackLink}" class="btn">Acknowledge & Approve Excuse Slip</a>
              <p style="margin-top: 24px; font-size: 11px; color: #94a3b8;">AeroHealth School EMR System</p>
            </div>
          </body>
          </html>
        `;
        
        sendBrevoEmail(principalEmail, 'School Principal', principalSubject, principalHtml).then(result => {
          if (result && result.simulated) {
            console.log("[SIMULATION LINK] Principal Action Link:");
            console.log("- Acknowledge Excuse Slip: " + ackLink);
          }
        });
      }

      // Email Security Guard
      if (guardEmail?.trim()) {
        const guardSubject = "[AeroHealth Clinic] Gate Clearance Notification: " + patient.name;
        const guardHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: sans-serif; line-height: 1.5; color: #334155; }
              .card { border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; max-width: 500px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Student Gate Clearance Permit</h2>
              <p>Dear Gate Security,</p>
              <p>This is to notify you that student <strong>${patient.name}</strong> (${patient.section}) has been officially checked out of the clinic and is cleared to leave the school premises.</p>
              <p><strong>Excuse Reason:</strong> ${latestSlip.excuse_reason}</p>
              <p><strong>Excuse Period:</strong> ${latestSlip.start_date} to ${latestSlip.end_date}</p>
              <p>An excuse permission slip is being processed with the principal's approval. Please grant clearance for departure.</p>
              <p style="margin-top: 24px; font-size: 11px; color: #94a3b8;">AeroHealth School EMR System</p>
            </div>
          </body>
          </html>
        `;
        sendBrevoEmail(guardEmail, 'Gate Security Guard', guardSubject, guardHtml);
      }
    }
  } catch (err) {
    console.error('[DATABASE ERROR] Failed in triggerCheckoutEmails:', err.message);
  }
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EMR API is running', supabase: 'connected' });
});

// Active Response Tracking Route
app.get('/api/notifications/respond', async (req, res) => {
  const { alertId, response } = req.query;
  if (!alertId || !response) {
    return res.status(400).send('<h1>Missing alertId or response parameter</h1>');
  }

  const nowStr = new Date().toISOString();

  try {
    const { data: alert, error: fetchErr } = await supabase
        .from('email_alerts')
        .select('*, patients(name)')
        .eq('id', alertId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      
      if (alert) {
        const { error: updateErr } = await supabase
          .from('email_alerts')
          .update({
            acknowledged: true,
            acknowledged_at: nowStr,
            response_status: response
          })
          .eq('id', alertId);

        if (updateErr) throw updateErr;

        const patientName = alert.patients ? (Array.isArray(alert.patients) ? alert.patients[0]?.name : alert.patients.name) : 'Student';
        return res.send(getResponseLandingPage(response, alert.recipient_email, alert.recipient_type, patientName, nowStr));
      }
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).send('<h1>Database Error</h1><p>' + err.message + '</p>');
  }});

// Email Tracking Endpoint
app.get('/api/notifications/logs', async (req, res) => {
  try {
    const { data, error } = await supabase
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
        subject: a.subject,
        body: a.body,
        sent_at: a.sent_at,
        acknowledged: a.acknowledged,
        acknowledged_at: a.acknowledged_at,
        response_status: a.response_status
      }));
      return res.json({ data: formatted });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Authentication Route: Register User
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields (name, email, password, role) are required.' });
  }

  const hashedPassword = hashPassword(password);

  try {
    // Check if user already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('accounts')
        .select('email')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (checkError) throw checkError;
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered.' });
      }

      // Insert new account
      const { data, error } = await supabase
        .from('accounts')
        .insert([{
          name,
          email: email.toLowerCase(),
          password: hashedPassword,
          role
        }])
        .select('id, name, email, role, created_at');

      if (error) throw error;
      return res.json({ data: data[0] });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Base32 Decode for TOTP Secrets (Google Authenticator)
const base32Decode = (base32) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = chars.indexOf(clean[i]);
    if (val === -1) throw new Error('Invalid base32 character');
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    const chunk = bits.substr(i, 8);
    if (chunk.length === 8) {
      bytes.push(parseInt(chunk, 2));
    }
  }
  return Buffer.from(bytes);
};

// TOTP Verification Utility (RFC 6238 Compliant)
const verifyTOTP = (token, secret, window = 1) => {
  try {
    const key = base32Decode(secret);
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / 30);

    for (let i = -window; i <= window; i++) {
      const timeStep = counter + i;
      const buffer = Buffer.alloc(8);
      let temp = timeStep;
      for (let j = 7; j >= 0; j--) {
        buffer[j] = temp & 0xff;
        temp = temp >> 8;
      }

      const hmac = crypto.createHmac('sha1', key);
      hmac.update(buffer);
      const hmacResult = hmac.digest();

      const offset = hmacResult[hmacResult.length - 1] & 0xf;
      const code =
        ((hmacResult[offset] & 0x7f) << 24) |
        ((hmacResult[offset + 1] & 0xff) << 16) |
        ((hmacResult[offset + 2] & 0xff) << 8) |
        (hmacResult[offset + 3] & 0xff);

      const otp = (code % 1000000).toString().padStart(6, '0');
      if (otp === token) {
        return true;
      }
    }
  } catch (err) {
    console.error('[MFA] TOTP verification error:', err.message);
  }
  return false;
};

// Generate Random 16-character Base32 Secret
const generateBase32Secret = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < 16; i++) {
    secret += chars[Math.floor(Math.random() * chars.length)];
  }
  return secret;
};

// Authentication Route: Login User
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const hashedPassword = hashPassword(password);

  try {
    const { data: user, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (error) throw error;
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (user.password !== hashedPassword) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (user.mfa_enabled) {
        return res.json({
          mfaRequired: true,
          mfaType: user.mfa_type,
          userId: user.id,
          email: user.email
        });
      }

      const { password: _, mfa_secret: __, ...userWithoutPassword } = user;
      return res.json({ data: userWithoutPassword });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// MFA Route: Generate TOTP Setup Secret
app.post('/api/auth/mfa/setup', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  const secret = generateBase32Secret();

  try {
    const { data: user, error: fetchErr } = await supabase
        .from('accounts')
        .select('email')
        .eq('id', userId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!user) return res.status(404).json({ error: 'User not found.' });

      // Save unverified secret temporarily in DB
      const { error: updateErr } = await supabase
        .from('accounts')
        .update({ mfa_secret: secret })
        .eq('id', userId);

      if (updateErr) throw updateErr;

      const qrCodeUri = `otpauth://totp/AeroHealth:${user.email}?secret=${secret}&issuer=AeroHealth`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUri)}`;

      return res.json({ secret, qrCodeUrl });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// MFA Route: Verify & Enable MFA Setup
app.post('/api/auth/mfa/verify-setup', async (req, res) => {
  const { userId, code, mfaType } = req.body;
  if (!userId || !code || !mfaType) {
    return res.status(400).json({ error: 'User ID, verification code, and MFA type are required.' });
  }

  try {
    const { data: user, error: fetchErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Verification Logic
    if (mfaType === 'totp') {
      if (!user.mfa_secret) {
        return res.status(400).json({ error: 'MFA Secret has not been initialized. Please run setup first.' });
      }
      const isCodeValid = verifyTOTP(code, user.mfa_secret);
      if (!isCodeValid) {
        return res.status(400).json({ error: 'Invalid authenticator code. Please check and try again.' });
      }
    } else if (mfaType === 'email') {
      const cached = emailCodes[userId];
      if (!cached || cached.code !== code || cached.expiresAt < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired email verification code.' });
      }
      delete emailCodes[userId]; // Consume code
    } else {
      return res.status(400).json({ error: 'Invalid MFA type.' });
    }

    // Update User Profile
    const { data, error: updateErr } = await supabase
      .from('accounts')
      .update({
        mfa_enabled: true,
        mfa_type: mfaType
      })
      .eq('id', userId)
      .select('*');

    if (updateErr) throw updateErr;
    const { password: _, mfa_secret: __, ...userWithoutPassword } = data[0];
    return res.json({ data: userWithoutPassword });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/auth/mfa/verify-setup: ', err.message);
    return res.status(500).json({ error: err.message });
  }
});;

const getMfaEmailTemplate = (recipientName, code) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>AeroHealth EMR Security Code</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #333333; margin: 0; padding: 0; }
        .container { max-width: 500px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e1e4e8; }
        .header { background: linear-gradient(135deg, #1a202c, #2d3748); color: #ffffff; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.5px; }
        .content { padding: 40px 30px; line-height: 1.6; text-align: center; }
        .content p { margin: 0 0 24px 0; font-size: 16px; color: #4a5568; text-align: left; }
        .code-box { background-color: #f7fafc; border: 1.5px dashed #cbd5e0; padding: 20px; border-radius: 8px; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #2b6cb0; display: inline-block; margin: 10px 0 30px 0; }
        .footer { background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #edf2f7; font-size: 12px; color: #a0aec0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AeroHealth EMR Security Verification</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${recipientName}</strong>,</p>
          <p>Use the following verification code to secure your login session. This code is active for 5 minutes.</p>
          <div class="code-box">${code}</div>
          <p style="font-size: 13px; color: #718096; margin-top: 20px; text-align: left;">If you did not request this code, please secure your account immediately or notify system administration.</p>
        </div>
        <div class="footer">
          &copy; 2026 AeroHealth EMR Security. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
};

// MFA Route: Send Email Verification Code
app.post('/api/auth/mfa/send-email', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  try {
    const { data: user, error: fetchErr } = await supabase
      .from('accounts')
      .select('email, name')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Generate 6-digit random code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    emailCodes[userId] = { code, expiresAt };

    // Log in a highlighted console banner for development
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log("│ [MFA EMAIL] Verification Code for: " + user.email.padEnd(20) + " │");
    console.log("│ CODE: " + code + "                                             │");
    console.log('└────────────────────────────────────────────────────────┘\n');

    // Trigger targeted email via Brevo
    const recipientName = user.name || 'Practitioner';
    const emailSubject = '[AeroHealth EMR] Login Verification Security Code';
    const htmlContent = getMfaEmailTemplate(recipientName, code);
    
    sendBrevoEmail(user.email, recipientName, emailSubject, htmlContent).catch(err => {
      console.error('[MFA EMAIL ERROR] Failed to deliver code via Brevo:', err.message);
    });

    return res.json({ success: true, message: 'Verification code sent to email.' });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/auth/mfa/send-email:', err.message);
    return res.status(500).json({ error: err.message });
  }
});;

// MFA Route: Verify Login Code (TOTP or Email)
app.post('/api/auth/mfa/verify', async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) {
    return res.status(400).json({ error: 'User ID and verification code are required.' });
  }

  try {
    const { data: user, error: fetchErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (!user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is not enabled for this account.' });
    }

    if (user.mfa_type === 'totp') {
      const isCodeValid = verifyTOTP(code, user.mfa_secret);
      if (!isCodeValid) {
        return res.status(400).json({ error: 'Invalid verification code.' });
      }
    } else if (user.mfa_type === 'email') {
      const cached = emailCodes[userId];
      if (!cached || cached.code !== code || cached.expiresAt < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired email verification code.' });
      }
      delete emailCodes[userId]; // Consume code
    } else {
      return res.status(400).json({ error: 'Unsupported MFA method.' });
    }

    const { password: _, mfa_secret: __, ...userWithoutPassword } = user;
    return res.json({ data: userWithoutPassword });
  } catch (err) {
    console.error('[DATABASE ERROR] POST /api/auth/mfa/verify:', err.message);
    return res.status(500).json({ error: err.message });
  }
});;

// Authentication Route: Change Password
app.post('/api/auth/change-password', async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body;
  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields (userId, currentPassword, newPassword) are required.' });
  }

  const currentHashed = hashPassword(currentPassword);
  const newHashed = hashPassword(newPassword);

  let userObj = null;

  try {
    const { data: user, error: fetchErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!user) return res.status(404).json({ error: 'User not found.' });

      if (user.password !== currentHashed) {
        return res.status(400).json({ error: 'Incorrect current password.' });
      }

      const { error: updateErr } = await supabase
        .from('accounts')
        .update({ password: newHashed })
        .eq('id', userId);

      if (updateErr) throw updateErr;
      return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Authentication Route: Disable MFA
app.post('/api/auth/mfa/disable', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  let userObj = null;

  try {
    // Fetch user details first to check if they are seeded
      const { data: existingUser, error: findErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (findErr) throw findErr;
      if (!existingUser) return res.status(404).json({ error: 'User not found.' });

      if (!isSeededAccount(existingUser.email)) {
        return res.status(403).json({ error: 'Multi-Factor Authentication is mandatory for this account and cannot be disabled.' });
      }

      const { data, error: updateErr } = await supabase
        .from('accounts')
        .update({
          mfa_enabled: false,
          mfa_type: 'none',
          mfa_secret: null
        })
        .eq('id', userId)
        .select('*');

      if (updateErr) throw updateErr;
      if (!data || data.length === 0) return res.status(404).json({ error: 'User not found.' });

      const { password: _, mfa_secret: __, ...userWithoutPassword } = data[0];
      return res.json({ data: userWithoutPassword });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});




// Patients Route: Fetch List
app.get('/api/patients', async (req, res) => {
  try {
    let query = supabase.from('patients').select('*');
      if (req.query.search) {
        const search = req.query.search;
        if (!isNaN(search)) {
          query = query.or(`id.eq.${parseInt(search)},name.ilike.%${search}%`);
        } else {
          query = query.ilike('name', `%${search}%`);
        }
      }
      if (req.query.letter) {
        query = query.ilike('name', `${req.query.letter}%`);
      }
      query = query.order('name', { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      return res.json({ data });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Register New Patient
app.post('/api/patients', async (req, res) => {
  const { name, section, age, gender, status, status_color, date_of_birth, grade_level, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, parent_email, adviser_name, adviser_email, graduation_year } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const practitioner = getPractitioner(req);
  if (practitioner.role !== 'physician' && practitioner.role !== 'nurse') {
    return res.status(403).json({ error: 'Access denied. Only physicians and nurses can register new patients.' });
  }

  if (age && (isNaN(parseInt(age)) || parseInt(age) < 0)) {
    return res.status(400).json({ error: 'Age must be a valid non-negative integer.' });
  }
  if (graduation_year && (isNaN(parseInt(graduation_year)) || parseInt(graduation_year) <= 0)) {
    return res.status(400).json({ error: 'Graduation year must be a valid positive integer.' });
  }

  const ageParsed = age ? parseInt(age) : null;
  const gradYearParsed = graduation_year ? parseInt(graduation_year) : null;

  try {
    const { data, error } = await supabase.from('patients').insert([{
        name, section, age: ageParsed, gender, status: status || 'Checked Out', status_color: status_color || 'gray',
        date_of_birth: date_of_birth || null,
        grade_level: grade_level || null,
        allergies: allergies || 'None',
        chronic_conditions: chronic_conditions || 'None',
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        parent_email: parent_email || null,
        adviser_name: adviser_name || null,
        adviser_email: adviser_email || null,
        graduation_year: gradYearParsed
      }]).select();
      if (error) throw error;
      const newPatient = data[0];

      // Seed default immunizations in Supabase
      const defaultVaccines = [
        { vaccine: 'Measles (MMR)', req: 2 },
        { vaccine: 'Polio (IPV)', req: 4 },
        { vaccine: 'Hepatitis B', req: 3 },
        { vaccine: 'Varicella (Chickenpox)', req: 2 }
      ];
      await supabase.from('immunizations').insert(defaultVaccines.map(v => ({
        patient_id: newPatient.id,
        vaccine_name: v.vaccine,
        doses_received: 0,
        doses_required: v.req
      })));

      // Audit Log for Register / Check-in
      await supabase.from('visit_logs').insert([{
        patient_id: newPatient.id,
        event_type: 'Check-in',
        details: 'Patient registered and checked in.',
        performed_by: practitioner.email
      }]);

      // Trigger Simulated Parent Notification
      triggerParentNotification(newPatient.id, 'registered and checked into the school clinic.');

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
  const isRestrictedRole = practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor';

  // Audit Log: Record Viewed
  const auditDetails = `Patient record viewed by ${practitioner.name} (${practitioner.role})${isRestrictedRole ? ' [REDACTED VIEW]' : ''}`;

  try {
    const { data: patient, error: pError } = await supabase.from('patients').select('*').eq('id', id).maybeSingle();
      if (pError) throw pError;
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      // Log the view action
      await supabase.from('visit_logs').insert([{
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
      const { data: excuseSlips } = await supabase.from('excuse_slips').select('*').eq('patient_id', id).order('created_at', { ascending: false });

      if (!isRestrictedRole) {
        const { data: vData } = await supabase.from('vitals').select('*').eq('patient_id', id).order('recorded_at', { ascending: false });
        const { data: sData } = await supabase.from('soap_notes').select('*').eq('patient_id', id).order('created_at', { ascending: false });
        const { data: oData } = await supabase.from('medication_orders').select('*').eq('patient_id', id).order('created_at', { ascending: false });
        const { data: iData } = await supabase.from('immunizations').select('*').eq('patient_id', id).order('vaccine_name', { ascending: true });
        const { data: cData } = await supabase.from('parental_consents').select('*').eq('patient_id', id).order('created_at', { ascending: false });
        const { data: lData } = await supabase.from('visit_logs').select('*').eq('patient_id', id).order('created_at', { ascending: false });

        vitals = vData || [];
        soapNotes = sData || [];
        orders = oData || [];
        immunizations = iData || [];
        consents = cData || [];
        logs = lData || [];
      } else {
        // Teachers/counselors can only see their own view action and general excuse logs
        const { data: lData } = await supabase.from('visit_logs').select('*').eq('patient_id', id).eq('event_type', 'Check-in').order('created_at', { ascending: false });
        logs = lData || [];
        
        // Redact patient medical details
        patient.allergies = 'Restricted View';
        patient.chronic_conditions = 'Restricted View';
      }

      return res.json({
        data: {
          ...patient,
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

  if (!name) return res.status(400).json({ error: 'Name is required' });

  const practitioner = getPractitioner(req);
  if (practitioner.role !== 'physician' && practitioner.role !== 'nurse') {
    return res.status(403).json({ error: 'Access denied. Only physicians and nurses can update patient demographics.' });
  }

  if (age && (isNaN(parseInt(age)) || parseInt(age) < 0)) {
    return res.status(400).json({ error: 'Age must be a valid non-negative integer.' });
  }
  if (graduation_year && (isNaN(parseInt(graduation_year)) || parseInt(graduation_year) <= 0)) {
    return res.status(400).json({ error: 'Graduation year must be a valid positive integer.' });
  }

  const ageParsed = age ? parseInt(age) : null;
  const gradYearParsed = graduation_year ? parseInt(graduation_year) : null;

  const updates = {
    name,
    section: section || null,
    age: ageParsed,
    gender: gender || null,
    status: status || 'Active',
    status_color: status_color || 'green',
    date_of_birth: date_of_birth || null,
    grade_level: grade_level || null,
    allergies: allergies || 'None',
    chronic_conditions: chronic_conditions || 'None',
    emergency_contact_name: emergency_contact_name || null,
    emergency_contact_phone: emergency_contact_phone || null,
    emergency_contact_relationship: emergency_contact_relationship || null,
    parent_email: parent_email || null,
    adviser_name: adviser_name || null,
    adviser_email: adviser_email || null,
    graduation_year: gradYearParsed
  };

  try {
    const { data, error } = await supabase
        .from('patients')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ error: 'Patient not found' });

      // Audit log
      await supabase.from('visit_logs').insert([{
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
  const patientId = parseInt(req.params.id);
  const { vaccine_name, doses_received, doses_required } = req.body;

  if (isNaN(patientId)) return res.status(400).json({ error: 'Invalid patient ID' });
  if (!vaccine_name || doses_received === undefined || doses_required === undefined) {
    return res.status(400).json({ error: 'Vaccine name, doses received, and required doses are required.' });
  }

  const rec = parseInt(doses_received);
  const reqDoses = parseInt(doses_required);
  if (isNaN(rec) || rec < 0) {
    return res.status(400).json({ error: 'Doses received must be a valid non-negative integer.' });
  }
  if (isNaN(reqDoses) || reqDoses <= 0) {
    return res.status(400).json({ error: 'Doses required must be a valid positive integer.' });
  }

  const practitioner = getPractitioner(req);
  if (practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor') {
    return res.status(403).json({ error: 'Access denied. Teachers and counselors cannot update immunization records.' });
  }

  const auditDetails = `Immunization '${vaccine_name}' updated to ${doses_received}/${doses_required} doses.`;

  try {
    // Check if this vaccine already has a record for the patient
      const { data: existing, error: findErr } = await supabase
        .from('immunizations')
        .select('*')
        .eq('patient_id', patientId)
        .eq('vaccine_name', vaccine_name)
        .maybeSingle();

      if (findErr) throw findErr;

      let result;
      if (existing) {
        // Update doses
        const { data, error } = await supabase
          .from('immunizations')
          .update({ doses_received: parseInt(doses_received), updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select();
        if (error) throw error;
        result = data[0];
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('immunizations')
          .insert([{
            patient_id: patientId,
            vaccine_name,
            doses_received: parseInt(doses_received),
            doses_required: parseInt(doses_required)
          }])
          .select();
        if (error) throw error;
        result = data[0];
      }

      // Audit log
      await supabase.from('visit_logs').insert([{
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
    const { data, error } = await supabase.from('soap_notes').insert([{
        patient_id: id, subjective, objective, assessment, plan, disposition
      }]).select();
      if (error) throw error;

      await supabase.from('visit_logs').insert([{
        patient_id: id,
        event_type: 'Clinical Note Added',
        details: auditDetails,
        performed_by: practitioner.email
      }]);

      return res.json({ data: data[0] });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Save Medication Order
app.post('/api/patients/:id/orders', async (req, res) => {
  const id = parseInt(req.params.id);
  const { medication, strength, form, route, administered_by, consent } = req.body;
  const dosage = `${strength || ''} ${form || ''}`.trim() || 'Not Specified';

  const practitioner = getPractitioner(req);
  if (practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor') {
    return res.status(403).json({ error: 'Access denied. Teachers and counselors cannot order medication.' });
  }

  // Enforce NOT NULL validations on core fields
  if (!medication?.trim() || !strength?.trim() || !form?.trim() || !route?.trim() || !administered_by?.trim()) {
    return res.status(400).json({ error: 'Medication, strength, form, route, and administrator initials are required and cannot be blank.' });
  }

  if (!consent) {
    return res.status(400).json({ error: 'Parental/guardian consent is mandatory before dispensing medication.' });
  }

  const auditDetails = `${medication.charAt(0).toUpperCase() + medication.slice(1)} ${dosage} via ${route} (Administered by: ${administered_by})`;

  try {
    const { data, error } = await supabase.from('medication_orders').insert([{
        patient_id: id, medication, dosage, strength, form, route, administered_by, consent: !!consent
      }]).select();
      if (error) throw error;

      await supabase.from('visit_logs').insert([{
        patient_id: id,
        event_type: 'Medication Ordered',
        details: auditDetails,
        performed_by: practitioner.email
      }]);

      // Trigger Simulated Parent Notification if checked in or administered
      triggerParentNotification(id, `Medication Administered: ${medication} ${dosage} given by ${administered_by}.`);

      return res.json({ data: data[0] });
  } catch (err) {
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

  const auditDetails = `Temp: ${temperature}°C, HR: ${heart_rate} bpm, BP: ${blood_pressure}, O₂: ${o2_sat}%, RR: ${respiratory_rate} bpm`;

  try {
    const { data, error } = await supabase.from('vitals').insert([{
        patient_id: id,
        temperature: parseFloat(temperature),
        heart_rate: parseInt(heart_rate),
        blood_pressure,
        o2_sat: parseInt(o2_sat),
        respiratory_rate: parseInt(respiratory_rate)
      }]).select();
      if (error) throw error;

      await supabase.from('visit_logs').insert([{
        patient_id: id,
        event_type: 'Vitals Recorded',
        details: auditDetails,
        performed_by: practitioner.email
      }]);

      return res.json({ data: data[0] });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Check-In Existing Patient
app.post('/api/patients/:id/checkin', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid patient ID' });
  const { chief_complaint } = req.body;

  if (!chief_complaint?.trim()) {
    return res.status(400).json({ error: 'Chief complaint is required' });
  }

  const practitioner = getPractitioner(req);
  if (practitioner.role !== 'physician' && practitioner.role !== 'nurse') {
    return res.status(403).json({ error: 'Access denied. Only physicians and nurses can check in patients.' });
  }

  try {
    // 1. Update patient status to 'Checked In'
      await supabase.from('patients').update({
        status: 'Checked In',
        status_color: 'amber'
      }).eq('id', id);

      // 2. Insert check-in log
      const { data, error } = await supabase.from('visit_logs').insert([{
        patient_id: id,
        event_type: 'Check-in',
        details: chief_complaint,
        performed_by: practitioner.email
      }]).select();
      if (error) throw error;

      // Trigger Simulated Parent Notification on Check-in
      triggerParentNotification(id, `checked into the school clinic. Reason: ${chief_complaint}`);

      // Fetch patient details for emails
      supabase.from('patients').select('*').eq('id', id).maybeSingle().then(({ data: patient }) => {
        if (patient) {
          triggerCheckinEmails(patient, chief_complaint);
        }
      }).catch(err => {
        console.error('[NOTIFICATIONS] Failed to fetch patient for check-in emails:', err.message);
      });

      return res.json({ data: data[0] });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Check-Out Patient
app.post('/api/patients/:id/checkout', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid patient ID' });

  const practitioner = getPractitioner(req);
  if (practitioner.role !== 'physician' && practitioner.role !== 'nurse') {
    return res.status(403).json({ error: 'Access denied. Only physicians and nurses can check out patients.' });
  }

  const auditDetails = 'Student checked out of the clinic.';

  try {
    // Get patient info first to send emails
      const { data: patient } = await supabase.from('patients').select('*').eq('id', id).maybeSingle();

      // Update patient status to 'Checked Out' and status_color to 'gray'
      const { error: updateErr } = await supabase.from('patients')
        .update({
          status: 'Checked Out',
          status_color: 'gray'
        })
        .eq('id', id);

      if (updateErr) throw updateErr;

      // Log checkout event
      const { data, error: logErr } = await supabase.from('visit_logs').insert([{
        patient_id: id,
        event_type: 'Check-out',
        details: auditDetails,
        performed_by: practitioner.email
      }]).select();

      if (logErr) throw logErr;

      // Trigger Simulated Parent Notification on Check-out
      triggerParentNotification(id, 'checked out of the school clinic.');

      // Send checkout emails
      if (patient) {
        triggerCheckoutEmails(patient);
      }

      return res.json({ data: data[0] });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Dashboard Route: Summary Stats
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
  let paracetamolStock = 120;
  let sentHomeToday = 0;
  let occupiedBedsList = [];
  let highRiskPatients = [];
  let outbreakAlert = null;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
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
      paracetamolStockRes,
      sentHomeTodayRes,
      bedPatientsRes,
      vitalsTodayRes,
      recentLogsRes
    ] = await Promise.all([
      supabase.from('patients').select('*', { count: 'exact', head: true }),
      supabase.from('visit_logs').select('*', { count: 'exact', head: true }).eq('event_type', 'Check-in').gte('created_at', startOfDay.toISOString()),
      supabase.from('medication_orders').select('*', { count: 'exact', head: true }).ilike('medication', '%paracetamol%'),
      supabase.from('soap_notes').select('*', { count: 'exact', head: true }).eq('disposition', 'Sent Home').gte('created_at', startOfDay.toISOString()),
      supabase.from('patients').select('id, name, section, gender, age, created_at').eq('status', 'Checked In'),
      supabase.from('vitals').select('*, patients(name, section, gender, age)').gte('recorded_at', startOfDay.toISOString()).order('recorded_at', { ascending: false }),
      supabase.from('visit_logs').select('*, patients(section)').eq('event_type', 'Check-in').gte('created_at', fortyEightHoursAgo.toISOString())
    ]);

    if (totalPatientsRes.error) throw totalPatientsRes.error;
    if (checkinsTodayRes.error) throw checkinsTodayRes.error;
    if (paracetamolStockRes.error) throw paracetamolStockRes.error;
    if (sentHomeTodayRes.error) throw sentHomeTodayRes.error;
    if (bedPatientsRes.error) throw bedPatientsRes.error;
    if (vitalsTodayRes.error) throw vitalsTodayRes.error;
    if (recentLogsRes.error) throw recentLogsRes.error;

    totalPatients = totalPatientsRes.count || 0;
    checkinsToday = checkinsTodayRes.count || 0;
    paracetamolStock = Math.max(0, 120 - (paracetamolStockRes.count || 0));
    sentHomeToday = sentHomeTodayRes.count || 0;

    const bedPatients = bedPatientsRes.data || [];
    if (bedPatients.length > 0) {
      const bedPatientIds = bedPatients.map(p => p.id);
      const { data: logs, error: logsErr } = await supabase.from('visit_logs')
        .select('patient_id, created_at')
        .eq('event_type', 'Check-in')
        .in('patient_id', bedPatientIds)
        .order('created_at', { ascending: false });

      if (logsErr) throw logsErr;

      const entryTimesMap = {};
      if (logs) {
        for (const log of logs) {
          if (!entryTimesMap[log.patient_id]) {
            entryTimesMap[log.patient_id] = log.created_at;
          }
        }
      }

      occupiedBedsList = bedPatients.map(p => ({
        id: p.id,
        name: p.name,
        section: p.section,
        gender: p.gender,
        age: p.age,
        entryTime: entryTimesMap[p.id] || p.created_at
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
  const dateParam = req.query.date || new Date().toISOString().split('T')[0];
  const targetDate = new Date(dateParam);
  const startOfTarget = new Date(targetDate.setHours(0, 0, 0, 0));
  const endOfTarget = new Date(targetDate.setHours(23, 59, 59, 999));

  try {
    const { data: logs, error: lErr } = await supabase.from('visit_logs')
        .select('*, patients(name)')
        .gte('created_at', startOfTarget.toISOString())
        .lte('created_at', endOfTarget.toISOString())
        .order('created_at', { ascending: false });

      if (lErr) throw lErr;
      const formatted = (logs || []).map(l => ({
        id: l.id,
        patient_id: l.patient_id,
        patient_name: l.patients ? l.patients.name : 'Unknown Patient',
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
  const now = new Date();

  const getWeekdayDate = (dayIndex) => {
    const d = new Date(now);
    const currentDay = d.getDay(); // Sunday = 0
    // Calculate distance to specified dayIndex (1 = Mon, 5 = Fri)
    const distance = dayIndex - (currentDay === 0 ? 7 : currentDay);
    d.setDate(d.getDate() + distance);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const trendData = {};

  try {
    const { data: checkins } = await supabase.from('visit_logs')
        .select('created_at')
        .eq('event_type', 'Check-in');

      weekdays.forEach((day, index) => {
        const start = getWeekdayDate(index + 1); // 1 = Monday
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);

        const count = (checkins || []).filter(c => {
          const cd = new Date(c.created_at);
          return cd >= start && cd <= end;
        }).length;
        trendData[day] = count;
      });

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
    const { data, error } = await supabase.from('parental_consents').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
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
    parsedDateGranted = new Date().toISOString().split('T')[0];
  }

  const practitioner = getPractitioner(req);
  if (practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor') {
    return res.status(403).json({ error: 'Access denied. Teachers and counselors cannot upload parental consent.' });
  }
  
  const auditDetails = `Uploaded parental consent: ${consent_type} document '${document_name}' signed by parent ${parent_name}`;

  try {
    const { data, error } = await supabase.from('parental_consents').insert([{
        patient_id: patientId, consent_type, document_name, parent_name, date_granted: parsedDateGranted, notes
      }]).select();
      if (error) throw error;
      
      await supabase.from('visit_logs').insert([{
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
  try {
    const { data, error } = await supabase.from('excuse_slips').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ data: data || [] });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Patients Route: Save Excuse Slip
app.post('/api/patients/:id/excuse-slips', async (req, res) => {
  const patientId = parseInt(req.params.id);
  if (isNaN(patientId)) return res.status(400).json({ error: 'Invalid patient ID' });
  const { excuse_reason, start_date, end_date, teacher_notified } = req.body;
  
  if (!excuse_reason?.trim() || !start_date || !end_date) {
    return res.status(400).json({ error: 'Excuse reason, start date, and end date are required.' });
  }
  if (new Date(start_date) > new Date(end_date)) {
    return res.status(400).json({ error: 'Excuse start date cannot be after the end date.' });
  }
  const practitioner = getPractitioner(req);
  if (practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor') {
    return res.status(403).json({ error: 'Access denied. Teachers and counselors cannot issue excuse slips.' });
  }
  
  // Generate secure excuse verification hash
  const verification_hash = crypto.createHash('md5').update(`${patientId}_${start_date}_${Date.now()}`).digest('hex').substring(0, 12).toUpperCase();
  const auditDetails = `Excused student from ${start_date} to ${end_date} due to: ${excuse_reason} (Verification Hash: ${verification_hash})`;

  try {
    const { data, error } = await supabase.from('excuse_slips').insert([{
        patient_id: patientId, excuse_reason, start_date, end_date, teacher_notified, verification_hash, created_by: practitioner.email
      }]).select();
      if (error) throw error;

      await supabase.from('visit_logs').insert([{
        patient_id: patientId,
        event_type: 'Excuse Slip Issued',
        details: auditDetails,
        performed_by: practitioner.email
      }]);

      return res.json({ data: data[0] });
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
      const { data: toDelete, error: findErr } = await supabase.from('patients').select('id, name').lte('graduation_year', cutoffYear);
      if (findErr) throw findErr;

      if (toDelete && toDelete.length > 0) {
        const ids = toDelete.map(p => p.id);
        const { error: deleteErr } = await supabase.from('patients').delete().in('id', ids);
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
    const { data, error } = await supabase.from('clinic_settings').select('*');
      if (error) throw error;
      
      const settings = {};
      data.forEach(s => {
        settings[s.key] = s.value;
      });
      
      return res.json({
        data: {
          principal_email: settings.principal_email || 'principal@aerohealth.com',
          security_guard_email: settings.security_guard_email || 'guard@aerohealth.com'
        }
      });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Settings Route: Update Clinic settings
app.post('/api/settings/clinic', async (req, res) => {
  const { principal_email, security_guard_email } = req.body;
  
  const practitioner = getPractitioner(req);
  if (practitioner.role !== 'admin' && practitioner.role !== 'nurse' && practitioner.role !== 'physician') {
    return res.status(403).json({ error: 'Access denied. Only clinical staff and admins can update settings.' });
  }

  try {
    const { error: err1 } = await supabase.from('clinic_settings').upsert({ key: 'principal_email', value: principal_email });
      if (err1) throw err1;
      const { error: err2 } = await supabase.from('clinic_settings').upsert({ key: 'security_guard_email', value: security_guard_email });
      if (err2) throw err2;

      return res.json({ message: 'Clinic settings updated successfully.' });
  } catch (err) {
    console.error('[DATABASE ERROR] ' + req.method + ' ' + req.path + ': ', err.message);
    return res.status(500).json({ error: err.message });
  }});

// Excuse Slip Route: Principal Acknowledgment Response
app.get('/api/excuse-slips/:id/acknowledge', async (req, res) => {
  const excuseSlipId = req.params.id;
  const nowStr = new Date().toISOString();

  try {
    // Fetch excuse slip and patient name
    const { data: slip, error: fetchErr } = await supabase
      .from('excuse_slips')
      .select('*, patients(name)')
      .eq('id', excuseSlipId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!slip) {
      return res.status(404).send('<h1>Excuse Slip not found</h1>');
    }

    const patientId = slip.patient_id;
    const excuseReason = slip.excuse_reason;
    const p = (slip.patients && Array.isArray(slip.patients) ? slip.patients[0] : slip.patients) || {};
    const patientName = p.name || 'Student';

    // Update principal acknowledgment status
    const { error: updateErr } = await supabase
      .from('excuse_slips')
      .update({
        principal_acknowledged: true,
        principal_acknowledged_at: nowStr
      })
      .eq('id', excuseSlipId);

    if (updateErr) throw updateErr;

    // Log audit event
    await supabase.from('visit_logs').insert([{
      patient_id: patientId,
      event_type: 'Excuse Slip Approved',
      details: "Principal email acknowledged excuse slip (ID: " + excuseSlipId + ")",
      performed_by: 'Principal'
    }]);

    // Render a beautiful acknowledgement success landing page
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Excuse Slip Verification - AeroHealth</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .container {
            background: #ffffff;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            text-align: center;
            max-width: 440px;
            width: 90%;
            border: 1px solid #e2e8f0;
          }
          .icon {
            width: 64px;
            height: 64px;
            background: #f0fdf4;
            color: #16a34a;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px auto;
            border: 2px solid #bbf7d0;
          }
          .icon svg {
            width: 32px;
            height: 32px;
          }
          h1 {
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 12px 0;
          }
          p {
            font-size: 14px;
            color: #64748b;
            line-height: 1.6;
            margin: 0 0 24px 0;
          }
          .details {
            background: #f8fafc;
            border-radius: 8px;
            padding: 16px;
            text-align: left;
            font-size: 13px;
            border: 1px solid #edf2f7;
            margin-bottom: 24px;
          }
          .details-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
          }
          .details-row:last-child {
            margin-bottom: 0;
          }
          .details-label {
            color: #94a3b8;
            font-weight: 600;
          }
          .details-val {
            color: #334155;
            font-weight: 700;
          }
          .footer-text {
            font-size: 11px;
            color: #94a3b8;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h1>Excuse Slip Acknowledged</h1>
          <p>You have successfully approved and stamped the medical excuse slip for departure permission clearance.</p>
          
          <div class="details">
            <div class="details-row">
              <span class="details-label">Student Name:</span>
              <span class="details-val">${patientName}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Reason:</span>
              <span class="details-val">${excuseReason}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Status:</span>
              <span class="details-val" style="color:#16a34a">Officially Approved</span>
            </div>
          </div>

          <p class="footer-text">AeroHealth School EMR System • Real-time active response gateway</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[DATABASE ERROR] GET /api/excuse-slips/:id/acknowledge:', err.message);
    return res.status(500).send('<h1>Database Error</h1><p>' + err.message + '</p>');
  }
});;

// Start Server
app.listen(PORT, () => {
  console.log(`EMR Backend Server running on port ${PORT}`);
});

