const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize Supabase Client
let supabase = null;
let useFallback = false;

let supabaseUrl = process.env.SUPABASE_URL || '';
let supabaseKey = process.env.SUPABASE_KEY || '';

// Clean up quotes if passed literally from environment files
if (supabaseUrl) {
  supabaseUrl = supabaseUrl.replace(/^['"]|['"]$/g, '').trim();
  // Strip trailing rest/v1/ or rest/v1 or trailing slashes
  supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}
if (supabaseKey) supabaseKey = supabaseKey.replace(/^['"]|['"]$/g, '').trim();

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('dummy') || supabaseUrl.includes('your-project-id')) {
  useFallback = true;
} else {
  console.log('[DEBUG] Initializing Supabase client with URL:', supabaseUrl);
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    console.error('[WARNING] Failed to initialize Supabase client:', err.message);
    useFallback = true;
  }
}

if (useFallback) {
  console.log('--------------------------------------------------');
  console.log('[INFO] Supabase URL/Key not set, invalid, or using placeholder values.');
  console.log('[INFO] Backend will run using the local in-memory store.');
  console.log('--------------------------------------------------');
}

// In-Memory Database Fallback Store
let localAccounts = [
  { 
    id: 'a1', 
    name: 'Developer Tester', 
    email: 'dev@fiona.com', 
    password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
    role: 'physician', 
    mfa_enabled: false,
    mfa_type: 'none',
    mfa_secret: null,
    created_at: new Date().toISOString() 
  },
  { 
    id: 'a2', 
    name: 'Dr. Fiona', 
    email: 'doctor@fiona.com', 
    password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
    role: 'physician', 
    mfa_enabled: false,
    mfa_type: 'none',
    mfa_secret: null,
    created_at: new Date().toISOString() 
  },
  { 
    id: 'a3', 
    name: 'Nurse Joy', 
    email: 'nurse@fiona.com', 
    password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
    role: 'nurse', 
    mfa_enabled: false,
    mfa_type: 'none',
    mfa_secret: null,
    created_at: new Date().toISOString() 
  },
  { 
    id: 'a4', 
    name: 'Teacher Sarah', 
    email: 'teacher@fiona.com', 
    password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
    role: 'teacher', 
    mfa_enabled: false,
    mfa_type: 'none',
    mfa_secret: null,
    created_at: new Date().toISOString() 
  },
  { 
    id: 'a5', 
    name: 'Counselor Troy', 
    email: 'counselor@fiona.com', 
    password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
    role: 'guidance_counselor', 
    mfa_enabled: false,
    mfa_type: 'none',
    mfa_secret: null,
    created_at: new Date().toISOString() 
  },
  { 
    id: 'a6', 
    name: 'Admin Alex', 
    email: 'admin@fiona.com', 
    password: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
    role: 'admin', 
    mfa_enabled: false,
    mfa_type: 'none',
    mfa_secret: null,
    created_at: new Date().toISOString() 
  }
];

let emailCodes = {}; // { userId: { code, expiresAt } }

let localPatients = [
  { 
    id: 1023, 
    name: 'John Doe', 
    section: 'Grade 5-A', 
    age: 10, 
    gender: 'Male', 
    status: 'Active', 
    status_color: 'green', 
    date_of_birth: '2016-04-12', 
    grade_level: 'Grade 5', 
    allergies: 'Peanut, Penicillin', 
    chronic_conditions: 'Asthma', 
    emergency_contact_name: 'Jane Doe', 
    emergency_contact_phone: '555-0199', 
    emergency_contact_relationship: 'Mother', 
    graduation_year: 2028,
    created_at: new Date(Date.now() - 7200000).toISOString() 
  },
  { 
    id: 4091, 
    name: 'Alice Smith', 
    section: 'Grade 3-B', 
    age: 8, 
    gender: 'Female', 
    status: 'Under Observation', 
    status_color: 'amber', 
    date_of_birth: '2018-09-22', 
    grade_level: 'Grade 3', 
    allergies: 'None', 
    chronic_conditions: 'None', 
    emergency_contact_name: 'Robert Smith', 
    emergency_contact_phone: '555-0244', 
    emergency_contact_relationship: 'Father', 
    graduation_year: 2030,
    created_at: new Date(Date.now() - 3600000).toISOString() 
  }
];

let localImmunizations = [
  { id: 'i1', patient_id: 1023, vaccine_name: 'Measles (MMR)', doses_received: 2, doses_required: 2 },
  { id: 'i2', patient_id: 1023, vaccine_name: 'Polio (IPV)', doses_received: 3, doses_required: 4 },
  { id: 'i3', patient_id: 1023, vaccine_name: 'Hepatitis B', doses_received: 3, doses_required: 3 },
  { id: 'i4', patient_id: 1023, vaccine_name: 'Varicella (Chickenpox)', doses_received: 1, doses_required: 2 },
  { id: 'i5', patient_id: 4091, vaccine_name: 'Measles (MMR)', doses_received: 1, doses_required: 2 },
  { id: 'i6', patient_id: 4091, vaccine_name: 'Polio (IPV)', doses_received: 2, doses_required: 4 },
  { id: 'i7', patient_id: 4091, vaccine_name: 'Hepatitis B', doses_received: 3, doses_required: 3 },
  { id: 'i8', patient_id: 4091, vaccine_name: 'Varicella (Chickenpox)', doses_received: 0, doses_required: 2 }
];

let localVitals = [
  { id: 'v1', patient_id: 1023, temperature: 37.2, heart_rate: 82, blood_pressure: '115/75', o2_sat: 98, respiratory_rate: 18, recorded_at: new Date(Date.now() - 7200000).toISOString() }
];

let localSoapNotes = [
  { id: 's1', patient_id: 1023, subjective: 'Complaining of slight shortness of breath and mild cough since morning.', objective: 'Temp: 37.2C. Lungs have mild expiratory wheezing bilaterally.', assessment: 'Mild exacerbation of known Asthma.', plan: 'Administered 2 puffs of Salbutamol inhaler. Rest in clinic for 30 minutes. Re-evaluate vitals.', disposition: 'Returned to Class', created_at: new Date(Date.now() - 7200000).toISOString() }
];

let localOrders = [
  { id: 'o1', patient_id: 1023, medication: 'salbutamol', dosage: '2 puffs inhaler', strength: '2 puffs', form: 'inhaler', route: 'inhaled', administered_by: 'Dr. T', consent: true, created_at: new Date(Date.now() - 7200000).toISOString() }
];

let localVisitLogs = [
  { id: 'l1', patient_id: 1023, event_type: 'Check-in', details: 'Checked in due to difficulty breathing.', performed_by: 'dev@fiona.com', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'l2', patient_id: 1023, event_type: 'Vitals Recorded', details: 'Temp: 37.2°C, HR: 82 bpm, BP: 115/75, O₂: 98%', performed_by: 'dev@fiona.com', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'l3', patient_id: 1023, event_type: 'Clinical Note Added', details: 'SOAP Note saved by Dr. Test', performed_by: 'dev@fiona.com', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'l4', patient_id: 1023, event_type: 'Medication Ordered', details: 'Salbutamol 2 puffs via inhaled route', performed_by: 'dev@fiona.com', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'l5', patient_id: 4091, event_type: 'Check-in', details: 'Checked in for routine immunization review.', performed_by: 'dev@fiona.com', created_at: new Date(Date.now() - 3600000).toISOString() }
];

let localParentalConsents = [
  { id: 'c1', patient_id: 1023, consent_type: 'Medication', document_name: 'consent_john_doe.pdf', parent_name: 'Jane Doe', date_granted: '2026-06-08', notes: 'Allowed stock medications for fever and asthma.', created_at: new Date(Date.now() - 7200000).toISOString() }
];

let localExcuseSlips = [];

let simulatedNotifications = [
  { id: 'n1', patient_id: 1023, recipient: 'Jane Doe (555-0199)', type: 'SMS', message: 'Hi Jane, John Doe has checked into the school clinic at 2:31 PM. Reason: checked in due to difficulty breathing.', sent_at: new Date(Date.now() - 7200000).toISOString() }
];

let nextPatientId = 4092;

// Password Hashing Utility
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

const getPractitioner = (req) => {
  return {
    email: req.headers['x-user-email'] || 'dev@fiona.com',
    role: (req.headers['x-user-role'] || 'physician').toLowerCase(),
    name: req.headers['x-user-name'] || 'Developer Tester'
  };
};

const triggerParentNotification = async (patientId, message) => {
  try {
    let parentName = 'Guardian';
    let contactPhone = 'Unknown';
    let patientName = 'Student';

    if (!useFallback) {
      const { data: p } = await supabase.from('patients').select('name, emergency_contact_name, emergency_contact_phone').eq('id', patientId).maybeSingle();
      if (p) {
        parentName = p.emergency_contact_name || 'Guardian';
        contactPhone = p.emergency_contact_phone || 'Unknown';
        patientName = p.name || 'Student';
      }
    } else {
      const p = localPatients.find(x => x.id === patientId);
      if (p) {
        parentName = p.emergency_contact_name || 'Guardian';
        contactPhone = p.emergency_contact_phone || 'Unknown';
        patientName = p.name || 'Student';
      }
    }

    const formattedMessage = `Hi ${parentName}, alert for ${patientName}: ${message}`;

    // Add to our simulated notifications array
    const newNotif = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      patient_id: patientId,
      recipient: `${parentName} (${contactPhone})`,
      type: 'SMS/Email',
      message: formattedMessage,
      sent_at: new Date().toISOString()
    };
    simulatedNotifications.push(newNotif);

    // Highlight in backend logs
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log(`│ [SMS/EMAIL GATEWAY] Notification Sent to:             │`);
    console.log(`│ Recipient: ${newNotif.recipient.padEnd(43)} │`);
    console.log(`│ Message: ${newNotif.message.substring(0, 45).padEnd(45)}... │`);
    console.log('└────────────────────────────────────────────────────────┘\n');

  } catch (err) {
    console.error('[NOTIFICATIONS] Failed to trigger parent notification:', err.message);
  }
};

// Basic Health Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EMR API is running', supabase: useFallback ? 'fallback' : 'connected' });
});

// Authentication Route: Register User
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields (name, email, password, role) are required.' });
  }

  const hashedPassword = hashPassword(password);

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase insert failed. Falling back to local db:", err.message);
    }
  }

  // Fallback local db
  const existingLocal = localAccounts.find(a => a.email.toLowerCase() === email.toLowerCase());
  if (existingLocal) {
    return res.status(400).json({ error: 'Email already registered.' });
  }

  const newUser = {
    id: 'a_' + Date.now(),
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    role,
    mfa_enabled: false,
    mfa_type: 'none',
    mfa_secret: null,
    created_at: new Date().toISOString()
  };

  localAccounts.push(newUser);

  const { password: _, mfa_secret: __, ...userWithoutPassword } = newUser;
  return res.json({ data: userWithoutPassword });
});

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

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase login failed. Falling back to local db:", err.message);
    }
  }

  // Fallback local db
  const user = localAccounts.find(a => a.email.toLowerCase() === email.toLowerCase());
  if (!user || user.password !== hashedPassword) {
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
});

// MFA Route: Generate TOTP Setup Secret
app.post('/api/auth/mfa/setup', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  const secret = generateBase32Secret();

  if (!useFallback) {
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

      const qrCodeUri = `otpauth://totp/Fiona%20EMR:${user.email}?secret=${secret}&issuer=Fiona%20EMR`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUri)}`;

      return res.json({ secret, qrCodeUrl });
    } catch (err) {
      console.warn("[WARNING] Supabase MFA setup failed. Falling back to local db:", err.message);
    }
  }

  // Fallback local db
  const user = localAccounts.find(a => a.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.mfa_secret = secret;

  const qrCodeUri = `otpauth://totp/Fiona%20EMR:${user.email}?secret=${secret}&issuer=Fiona%20EMR`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUri)}`;

  return res.json({ secret, qrCodeUrl });
});

// MFA Route: Verify & Enable MFA Setup
app.post('/api/auth/mfa/verify-setup', async (req, res) => {
  const { userId, code, mfaType } = req.body;
  if (!userId || !code || !mfaType) {
    return res.status(400).json({ error: 'User ID, verification code, and MFA type are required.' });
  }

  let userObj = null;

  if (!useFallback) {
    try {
      const { data: user, error: fetchErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!user) return res.status(404).json({ error: 'User not found.' });
      userObj = user;
    } catch (err) {
      console.warn("[WARNING] Supabase fetch during MFA verification failed. Falling back to local db:", err.message);
    }
  }

  if (!userObj) {
    userObj = localAccounts.find(a => a.id === userId);
    if (!userObj) return res.status(404).json({ error: 'User not found.' });
  }

  // Verification Logic
  if (mfaType === 'totp') {
    if (!userObj.mfa_secret) {
      return res.status(400).json({ error: 'MFA Secret has not been initialized. Please run setup first.' });
    }
    const isCodeValid = verifyTOTP(code, userObj.mfa_secret);
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
  if (!useFallback) {
    try {
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
      console.warn("[WARNING] Supabase MFA update failed. Falling back to local db:", err.message);
    }
  }

  // Fallback local db
  userObj.mfa_enabled = true;
  userObj.mfa_type = mfaType;
  const { password: _, mfa_secret: __, ...userWithoutPassword } = userObj;
  return res.json({ data: userWithoutPassword });
});

// MFA Route: Send Email Verification Code
app.post('/api/auth/mfa/send-email', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  let userObj = null;

  if (!useFallback) {
    try {
      const { data: user, error: fetchErr } = await supabase
        .from('accounts')
        .select('email')
        .eq('id', userId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (user) userObj = user;
    } catch (err) {
      console.warn("[WARNING] Supabase user query failed. Falling back to local db:", err.message);
    }
  }

  if (!userObj) {
    userObj = localAccounts.find(a => a.id === userId);
    if (!userObj) return res.status(404).json({ error: 'User not found.' });
  }

  // Generate 6-digit random code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  emailCodes[userId] = { code, expiresAt };

  // Log in a highlighted console banner for development
  console.log('\n┌────────────────────────────────────────────────────────┐');
  console.log(`│ [MFA EMAIL] Verification Code for: ${userObj.email.padEnd(20)} │`);
  console.log(`│ CODE: ${code}                                             │`);
  console.log('└────────────────────────────────────────────────────────┘\n');

  return res.json({ success: true, message: 'Verification code sent to email.' });
});

// MFA Route: Verify Login Code (TOTP or Email)
app.post('/api/auth/mfa/verify', async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) {
    return res.status(400).json({ error: 'User ID and verification code are required.' });
  }

  let userObj = null;

  if (!useFallback) {
    try {
      const { data: user, error: fetchErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (user) userObj = user;
    } catch (err) {
      console.warn("[WARNING] Supabase user query failed. Falling back to local db:", err.message);
    }
  }

  if (!userObj) {
    userObj = localAccounts.find(a => a.id === userId);
    if (!userObj) return res.status(404).json({ error: 'User not found.' });
  }

  if (!userObj.mfa_enabled) {
    return res.status(400).json({ error: 'MFA is not enabled for this account.' });
  }

  if (userObj.mfa_type === 'totp') {
    const isCodeValid = verifyTOTP(code, userObj.mfa_secret);
    if (!isCodeValid) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }
  } else if (userObj.mfa_type === 'email') {
    const cached = emailCodes[userId];
    if (!cached || cached.code !== code || cached.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired email verification code.' });
    }
    delete emailCodes[userId]; // Consume code
  } else {
    return res.status(400).json({ error: 'Unsupported MFA method.' });
  }

  const { password: _, mfa_secret: __, ...userWithoutPassword } = userObj;
  return res.json({ data: userWithoutPassword });
});

// Authentication Route: Change Password
app.post('/api/auth/change-password', async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body;
  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields (userId, currentPassword, newPassword) are required.' });
  }

  const currentHashed = hashPassword(currentPassword);
  const newHashed = hashPassword(newPassword);

  let userObj = null;

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase password update failed. Falling back to local db:", err.message);
    }
  }

  // Fallback local db
  userObj = localAccounts.find(a => a.id === userId);
  if (!userObj) return res.status(404).json({ error: 'User not found.' });

  if (userObj.password !== currentHashed) {
    return res.status(400).json({ error: 'Incorrect current password.' });
  }

  userObj.password = newHashed;
  return res.json({ success: true, message: 'Password updated successfully.' });
});

// Authentication Route: Disable MFA
app.post('/api/auth/mfa/disable', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  let userObj = null;

  if (!useFallback) {
    try {
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
      console.warn("[WARNING] Supabase MFA disable failed. Falling back to local db:", err.message);
    }
  }

  // Fallback local db
  userObj = localAccounts.find(a => a.id === userId);
  if (!userObj) return res.status(404).json({ error: 'User not found.' });

  userObj.mfa_enabled = false;
  userObj.mfa_type = 'none';
  userObj.mfa_secret = null;

  const { password: _, mfa_secret: __, ...userWithoutPassword } = userObj;
  return res.json({ data: userWithoutPassword });
});




// Patients Route: Fetch List
app.get('/api/patients', async (req, res) => {
  if (!useFallback) {
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
      console.warn("[WARNING] Supabase query failed. Falling back to local db:", err.message);
      useFallback = true;
    }
  }

  // Fallback DB
  let filtered = [...localPatients];
  if (req.query.search) {
    const search = req.query.search.toLowerCase();
    filtered = filtered.filter(p => p.name.toLowerCase().includes(search) || p.id.toString().includes(search));
  }
  if (req.query.letter) {
    const letter = req.query.letter.toUpperCase();
    filtered = filtered.filter(p => p.name.toUpperCase().startsWith(letter));
  }
  filtered.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ data: filtered });
});

// Patients Route: Register New Patient
app.post('/api/patients', async (req, res) => {
  const { name, section, age, gender, status, status_color, date_of_birth, grade_level, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, graduation_year } = req.body;
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

  if (!useFallback) {
    try {
      const { data, error } = await supabase.from('patients').insert([{
        name, section, age: ageParsed, gender, status: status || 'Active', status_color: status_color || 'green',
        date_of_birth: date_of_birth || null,
        grade_level: grade_level || null,
        allergies: allergies || 'None',
        chronic_conditions: chronic_conditions || 'None',
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
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
      console.warn("[WARNING] Supabase insert failed. Falling back to local db:", err.message);
      useFallback = true;
    }
  }

  // Fallback DB
  const newPatient = {
    id: nextPatientId++,
    name, section, age: ageParsed, gender, status: status || 'Active', status_color: status_color || 'green',
    date_of_birth: date_of_birth || null,
    grade_level: grade_level || null,
    allergies: allergies || 'None',
    chronic_conditions: chronic_conditions || 'None',
    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
    graduation_year: gradYearParsed,
    created_at: new Date().toISOString()
  };
  localPatients.push(newPatient);

  // Seed default immunizations for new patient in fallback store
  const defaultVaccines = [
    { vaccine: 'Measles (MMR)', req: 2 },
    { vaccine: 'Polio (IPV)', req: 4 },
    { vaccine: 'Hepatitis B', req: 3 },
    { vaccine: 'Varicella (Chickenpox)', req: 2 }
  ];
  defaultVaccines.forEach((v, idx) => {
    localImmunizations.push({
      id: 'i_seed_' + newPatient.id + '_' + idx,
      patient_id: newPatient.id,
      vaccine_name: v.vaccine,
      doses_received: 0,
      doses_required: v.req
    });
  });

  localVisitLogs.push({
    id: 'l_' + Date.now(),
    patient_id: newPatient.id,
    event_type: 'Check-in',
    details: 'Patient registered and checked in.',
    performed_by: practitioner.email,
    created_at: new Date().toISOString()
  });

  // Trigger Simulated Parent Notification
  triggerParentNotification(newPatient.id, 'registered and checked into the school clinic.');

  res.json({ data: newPatient });
});

// Patients Route: Fetch Detail (Demographics + Vitals + SOAP + Orders + Logs + Immunizations + Consents + Excuse Slips)
app.get('/api/patients/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid patient ID' });

  const practitioner = getPractitioner(req);
  const isRestrictedRole = practitioner.role === 'teacher' || practitioner.role === 'guidance_counselor' || practitioner.role === 'guidance counselor';

  // Audit Log: Record Viewed
  const auditDetails = `Patient record viewed by ${practitioner.name} (${practitioner.role})${isRestrictedRole ? ' [REDACTED VIEW]' : ''}`;

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase query failed. Falling back to local db:", err.message);
      useFallback = true;
    }
  }

  // Fallback DB
  const patient = { ...localPatients.find(p => p.id === id) };
  if (!patient.id) return res.status(404).json({ error: 'Patient not found' });

  // Log view action in fallback store
  localVisitLogs.push({
    id: 'l_' + Date.now(),
    patient_id: id,
    event_type: 'Record Viewed',
    details: auditDetails,
    performed_by: practitioner.email,
    created_at: new Date().toISOString()
  });

  let vitals = [];
  let soapNotes = [];
  let orders = [];
  let immunizations = [];
  let consents = [];
  let logs = [];
  const excuseSlips = localExcuseSlips.filter(e => e.patient_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!isRestrictedRole) {
    vitals = localVitals.filter(v => v.patient_id === id).sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
    soapNotes = localSoapNotes.filter(s => s.patient_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    orders = localOrders.filter(o => o.patient_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    immunizations = localImmunizations.filter(i => i.patient_id === id).sort((a, b) => a.vaccine_name.localeCompare(b.vaccine_name));
    consents = localParentalConsents.filter(c => c.patient_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    logs = localVisitLogs.filter(l => l.patient_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else {
    // Only show non-sensitive logs
    logs = localVisitLogs.filter(l => l.patient_id === id && l.event_type === 'Check-in').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    patient.allergies = 'Restricted View';
    patient.chronic_conditions = 'Restricted View';
  }

  res.json({
    data: {
      ...patient,
      vitals,
      soapNotes,
      orders,
      logs,
      immunizations,
      consents,
      excuseSlips
    }
  });
});

// Patients Route: Update Patient Demographics
app.put('/api/patients/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid patient ID' });

  const {
    name, section, age, gender, status, status_color,
    date_of_birth, grade_level, allergies, chronic_conditions,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
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
    graduation_year: gradYearParsed
  };

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase update failed. Falling back to local db:", err.message);
      useFallback = true;
    }
  }

  // Fallback local db
  const patient = localPatients.find(p => p.id === id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  Object.assign(patient, updates);

  localVisitLogs.push({
    id: 'l_' + Date.now(),
    patient_id: id,
    event_type: 'Demographics Updated',
    details: `Patient demographics updated by ${practitioner.name} (${practitioner.role})`,
    performed_by: practitioner.email,
    created_at: new Date().toISOString()
  });

  res.json({ data: patient });
});

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

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase immunization update failed. Falling back to local db:", err.message);
      useFallback = true;
    }
  }

  // Fallback local db
  let record = localImmunizations.find(i => i.patient_id === patientId && i.vaccine_name === vaccine_name);
  if (record) {
    record.doses_received = parseInt(doses_received);
  } else {
    record = {
      id: 'i_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      patient_id: patientId,
      vaccine_name,
      doses_received: parseInt(doses_received),
      doses_required: parseInt(doses_required)
    };
    localImmunizations.push(record);
  }

  // Audit Log Fallback
  localVisitLogs.push({
    id: 'l_' + Date.now(),
    patient_id: patientId,
    event_type: 'Immunization Updated',
    details: auditDetails,
    performed_by: practitioner.email,
    created_at: new Date().toISOString()
  });

  return res.json({ data: record });
});

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

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase insert failed. Falling back to local db:", err.message);
      useFallback = true;
    }
  }

  // Fallback DB
  const newNote = {
    id: 's_' + Date.now(),
    patient_id: id,
    subjective, objective, assessment, plan, disposition,
    created_at: new Date().toISOString()
  };
  localSoapNotes.push(newNote);
  localVisitLogs.push({
    id: 'l_' + Date.now(),
    patient_id: id,
    event_type: 'Clinical Note Added',
    details: auditDetails,
    performed_by: practitioner.email,
    created_at: new Date().toISOString()
  });
  res.json({ data: newNote });
});

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

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase insert failed. Falling back to local db:", err.message);
      useFallback = true;
    }
  }

  // Fallback DB
  const newOrder = {
    id: 'o_' + Date.now(),
    patient_id: id,
    medication, dosage, strength, form, route, administered_by, consent: !!consent,
    created_at: new Date().toISOString()
  };
  localOrders.push(newOrder);
  localVisitLogs.push({
    id: 'l_' + Date.now(),
    patient_id: id,
    event_type: 'Medication Ordered',
    details: auditDetails,
    performed_by: practitioner.email,
    created_at: new Date().toISOString()
  });

  // Trigger Simulated Parent Notification in Fallback
  triggerParentNotification(id, `Medication Administered: ${medication} ${dosage} given by ${administered_by}.`);

  res.json({ data: newOrder });
});

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

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase insert failed. Falling back to local db:", err.message);
      useFallback = true;
    }
  }

  // Fallback DB
  const newVitals = {
    id: 'v_' + Date.now(),
    patient_id: id,
    temperature: parseFloat(temperature),
    heart_rate: parseInt(heart_rate),
    blood_pressure,
    o2_sat: parseInt(o2_sat),
    respiratory_rate: parseInt(respiratory_rate),
    recorded_at: new Date().toISOString()
  };
  localVitals.push(newVitals);
  localVisitLogs.push({
    id: 'l_' + Date.now(),
    patient_id: id,
    event_type: 'Vitals Recorded',
    details: auditDetails,
    performed_by: practitioner.email,
    created_at: new Date().toISOString()
  });
  res.json({ data: newVitals });
});

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

  if (!useFallback) {
    try {
      const { data, error } = await supabase.from('visit_logs').insert([{
        patient_id: id,
        event_type: 'Check-in',
        details: chief_complaint,
        performed_by: practitioner.email
      }]).select();
      if (error) throw error;

      // Trigger Simulated Parent Notification on Check-in
      triggerParentNotification(id, `checked into the school clinic. Reason: ${chief_complaint}`);

      return res.json({ data: data[0] });
    } catch (err) {
      console.warn("[WARNING] Supabase insert failed. Falling back to local db:", err.message);
      useFallback = true;
    }
  }

  // Fallback DB
  const newLog = {
    id: 'l_' + Date.now(),
    patient_id: id,
    event_type: 'Check-in',
    details: chief_complaint,
    performed_by: practitioner.email,
    created_at: new Date().toISOString()
  };
  localVisitLogs.push(newLog);

  // Trigger Simulated Parent Notification in Fallback
  triggerParentNotification(id, `checked into the school clinic. Reason: ${chief_complaint}`);

  res.json({ data: newLog });
});

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

  if (!useFallback) {
    try {
      // 1. Total Patients
      const { count: pCount } = await supabase.from('patients').select('*', { count: 'exact', head: true });
      totalPatients = pCount || 0;

      // 2. Check-ins Today
      const { count: cCount } = await supabase.from('visit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'Check-in')
        .gte('created_at', startOfDay.toISOString());
      checkinsToday = cCount || 0;

      // 3. Paracetamol Stock (starting at 120 and decrementing per order)
      const { count: pOrdersCount } = await supabase.from('medication_orders')
        .select('*', { count: 'exact', head: true })
        .ilike('medication', '%paracetamol%');
      paracetamolStock = Math.max(0, 120 - (pOrdersCount || 0));

      // 4. Sent Home Today (disposition count)
      const { count: shCount } = await supabase.from('soap_notes')
        .select('*', { count: 'exact', head: true })
        .eq('disposition', 'Sent Home')
        .gte('created_at', startOfDay.toISOString());
      sentHomeToday = shCount || 0;

      // 5. Occupied Beds List (patients with status 'Under Observation')
      const { data: bedPatients } = await supabase.from('patients')
        .select('id, name, section, gender, age, created_at')
        .eq('status', 'Under Observation');

      if (bedPatients && bedPatients.length > 0) {
        const bedPatientIds = bedPatients.map(p => p.id);
        const { data: logs } = await supabase.from('visit_logs')
          .select('patient_id, created_at')
          .eq('event_type', 'Check-in')
          .in('patient_id', bedPatientIds)
          .order('created_at', { ascending: false });

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
      const { data: vitalsToday } = await supabase.from('vitals')
        .select('*, patients(name, section, gender, age)')
        .gte('recorded_at', startOfDay.toISOString())
        .order('recorded_at', { ascending: false });

      const highRiskMap = {};
      if (vitalsToday) {
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
      }

      highRiskPatients = Object.values(highRiskMap).map(p => ({
        ...p,
        alerts: Array.from(p.alerts)
      }));
      activeAlerts = highRiskPatients.length;

      // 7. Outbreak Detection
      const { data: recentLogs } = await supabase.from('visit_logs')
        .select('*, patients(section)')
        .eq('event_type', 'Check-in')
        .gte('created_at', fortyEightHoursAgo.toISOString());

      const sectionFluPatients = {};

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
        outbreakAlert
      });
    } catch (err) {
      console.warn("[WARNING] Supabase stats query failed. Falling back to local db:", err.message);
    }
  }

  // Fallback DB
  totalPatients = localPatients.length;
  checkinsToday = localVisitLogs.filter(l => l.event_type === 'Check-in' && new Date(l.created_at) >= startOfDay).length;

  const localPOrders = localOrders.filter(o => o.medication && o.medication.toLowerCase().includes('paracetamol'));
  paracetamolStock = Math.max(0, 120 - localPOrders.length);

  sentHomeToday = localSoapNotes.filter(s => s.disposition === 'Sent Home' && new Date(s.created_at) >= startOfDay).length;

  const bedPatientsLocal = localPatients.filter(p => p.status === 'Under Observation');
  const localPatientIds = bedPatientsLocal.map(p => p.id);
  
  if (localPatientIds.length > 0) {
    const logsLocal = localVisitLogs.filter(l => l.event_type === 'Check-in' && localPatientIds.includes(l.patient_id));
    logsLocal.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    const entryTimesMapLocal = {};
    for (const log of logsLocal) {
      if (!entryTimesMapLocal[log.patient_id]) {
        entryTimesMapLocal[log.patient_id] = log.created_at;
      }
    }

    occupiedBedsList = bedPatientsLocal.map(p => ({
      id: p.id,
      name: p.name,
      section: p.section,
      gender: p.gender,
      age: p.age,
      entryTime: entryTimesMapLocal[p.id] || p.created_at
    }));
  }
  bedsOccupied = occupiedBedsList.length;

  const vitalsTodayLocal = localVitals.filter(v => new Date(v.recorded_at) >= startOfDay);
  const highRiskMapLocal = {};
  for (const v of vitalsTodayLocal) {
    const alerts = checkVitals(v);
    if (alerts.length > 0) {
      const patientId = v.patient_id;
      const p = localPatients.find(p => p.id === patientId) || {};
      if (!highRiskMapLocal[patientId]) {
        highRiskMapLocal[patientId] = {
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
      alerts.forEach(a => highRiskMapLocal[patientId].alerts.add(a));
    }
  }

  highRiskPatients = Object.values(highRiskMapLocal).map(p => ({
    ...p,
    alerts: Array.from(p.alerts)
  }));
  activeAlerts = highRiskPatients.length;

  // Fallback Outbreak Detection
  const recentLogsLocal = localVisitLogs.filter(l => l.event_type === 'Check-in' && new Date(l.created_at) >= fortyEightHoursAgo);
  const sectionFluPatientsLocal = {};

  for (const log of recentLogsLocal) {
    const complaint = (log.details || '').toLowerCase();
    const hasFluSymptom = fluKeywords.some(kw => complaint.includes(kw));
    const p = localPatients.find(x => x.id === log.patient_id) || {};
    const section = p.section;

    if (hasFluSymptom && section && section !== 'Unassigned' && section.trim() !== '') {
      if (!sectionFluPatientsLocal[section]) {
        sectionFluPatientsLocal[section] = new Set();
      }
      sectionFluPatientsLocal[section].add(log.patient_id);
    }
  }

  for (const section of Object.keys(sectionFluPatientsLocal)) {
    if (sectionFluPatientsLocal[section].size >= 5) {
      outbreakAlert = {
        section,
        count: sectionFluPatientsLocal[section].size,
        message: `⚠️ Outbreak Warning: ${sectionFluPatientsLocal[section].size} students from section ${section} checked in with flu-like symptoms in the last 48 hours!`
      };
      break;
    }
  }

  res.json({
    totalPatients,
    checkinsToday,
    activeAlerts,
    bedsOccupied,
    paracetamolStock,
    sentHomeToday,
    occupiedBedsList,
    highRiskPatients,
    outbreakAlert
  });
});

// Dashboard Route: Activity Audit Log
app.get('/api/dashboard/activity', async (req, res) => {
  const dateParam = req.query.date || new Date().toISOString().split('T')[0];
  const targetDate = new Date(dateParam);
  const startOfTarget = new Date(targetDate.setHours(0, 0, 0, 0));
  const endOfTarget = new Date(targetDate.setHours(23, 59, 59, 999));

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase activity query failed. Falling back to local db:", err.message);
    }
  }

  // Fallback DB
  const logs = localVisitLogs.filter(l => {
    const d = new Date(l.created_at);
    return d >= startOfTarget && d <= endOfTarget;
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const formatted = logs.map(l => {
    const p = localPatients.find(p => p.id === l.patient_id);
    return {
      id: l.id,
      patient_id: l.patient_id,
      patient_name: p ? p.name : 'Unknown Patient',
      event_type: l.event_type,
      details: l.details,
      created_at: l.created_at
    };
  });
  res.json({ data: formatted });
});

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

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase trends query failed. Falling back to local db:", err.message);
    }
  }

  // Fallback DB
  weekdays.forEach((day, index) => {
    const start = getWeekdayDate(index + 1);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const count = localVisitLogs.filter(c => {
      const cd = new Date(c.created_at);
      return c.event_type === 'Check-in' && cd >= start && cd <= end;
    }).length;
    trendData[day] = count;
  });

  res.json({ data: trendData });
});

// Patients Route: Get Parental Consents
app.get('/api/patients/:id/consents', async (req, res) => {
  const patientId = parseInt(req.params.id);
  if (isNaN(patientId)) return res.status(400).json({ error: 'Invalid patient ID' });
  if (!useFallback) {
    try {
      const { data, error } = await supabase.from('parental_consents').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ data: data || [] });
    } catch (err) {
      console.warn("[WARNING] Supabase query failed. Falling back to local db:", err.message);
    }
  }
  const filtered = localParentalConsents.filter(c => c.patient_id === patientId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ data: filtered });
});

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

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase insert failed. Falling back to local db:", err.message);
    }
  }
  const newConsent = {
    id: 'c_' + Date.now(),
    patient_id: patientId,
    consent_type, document_name, parent_name, date_granted: parsedDateGranted, notes,
    created_at: new Date().toISOString()
  };
  localParentalConsents.push(newConsent);
  localVisitLogs.push({
    id: 'l_' + Date.now(),
    patient_id: patientId,
    event_type: 'Consent Form Registered',
    details: auditDetails,
    performed_by: practitioner.email,
    created_at: new Date().toISOString()
  });
  res.json({ data: newConsent });
});

// Patients Route: Get Excuse Slips
app.get('/api/patients/:id/excuse-slips', async (req, res) => {
  const patientId = parseInt(req.params.id);
  if (isNaN(patientId)) return res.status(400).json({ error: 'Invalid patient ID' });
  if (!useFallback) {
    try {
      const { data, error } = await supabase.from('excuse_slips').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ data: data || [] });
    } catch (err) {
      console.warn("[WARNING] Supabase query failed. Falling back to local db:", err.message);
    }
  }
  const filtered = localExcuseSlips.filter(e => e.patient_id === patientId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ data: filtered });
});

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

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase insert failed. Falling back to local db:", err.message);
    }
  }
  const newSlip = {
    id: 'e_' + Date.now(),
    patient_id: patientId,
    excuse_reason, start_date, end_date, teacher_notified, verification_hash,
    created_by: practitioner.email,
    created_at: new Date().toISOString()
  };
  localExcuseSlips.push(newSlip);
  localVisitLogs.push({
    id: 'l_' + Date.now(),
    patient_id: patientId,
    event_type: 'Excuse Slip Issued',
    details: auditDetails,
    performed_by: practitioner.email,
    created_at: new Date().toISOString()
  });
  res.json({ data: newSlip });
});

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

  if (!useFallback) {
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
      console.warn("[WARNING] Supabase purge failed. Falling back to local db:", err.message);
    }
  }

  // Fallback DB
  const initialCount = localPatients.length;
  localPatients = localPatients.filter(p => !p.graduation_year || p.graduation_year > cutoffYear);
  deletedCount = initialCount - localPatients.length;

  res.json({ success: true, message: `Successfully purged ${deletedCount} student records graduated on or before ${cutoffYear}.` });
});

// Admin Route: Get Simulated Notifications Log
app.get('/api/admin/notifications', (req, res) => {
  res.json({ data: simulatedNotifications });
});

// Start Server
app.listen(PORT, () => {
  console.log(`EMR Backend Server running on port ${PORT}`);
});

