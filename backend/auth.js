const crypto = require('node:crypto');
const express = require('express');
const {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  validEmail,
  validatePassword,
  verifyPassword
} = require('./security');

const SESSION_HOURS = 8;
const LOGIN_WINDOW_MINUTES = 15;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;
const VALID_ROLES = new Set(['physician', 'nurse', 'teacher', 'guidance_counselor', 'admin']);

function isProduction() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function getPractitioner(req) {
  return req.user || null;
}

function safeAccount(account) {
  if (!account) return null;
  const { password, is_active, ...safe } = account;
  return safe;
}

async function writeAudit(database, { accountId = null, method, resource, ip, result = 'success' }) {
  await database.query(
    'INSERT INTO security_audit_events (account_id, request_method, resource, client_ip, result) VALUES ($1, $2, $3, $4, $5)',
    [accountId, method, resource, ip || null, result]
  );
}

function createApiAuthMiddleware(database) {
  return async (req, res, next) => {
    const path = req.originalUrl.split('?')[0];
    const publicRoute =
      (req.method === 'GET' && path === '/api/health') ||
      (req.method === 'POST' && path === '/api/auth/login') ||
      ((req.method === 'GET' || req.method === 'POST') && path === '/api/notifications/respond') ||
      ((req.method === 'GET' || req.method === 'POST') && /^\/api\/excuse-slips\/[0-9a-f-]+\/acknowledge$/i.test(path));

    if (publicRoute) return next();

    const authorization = req.get('authorization') || '';
    const tokenMatch = authorization.match(/^Bearer ([A-Za-z0-9_-]{40,})$/);
    if (!tokenMatch) return res.status(401).json({ error: 'Authentication required.' });

    const tokenHash = hashSessionToken(tokenMatch[1]);
    try {
      const sessionResult = await database.query(
        `SELECT s.account_id, a.name, a.email, a.role
         FROM auth_sessions AS s
         JOIN accounts AS a ON a.id = s.account_id
         WHERE s.token_hash = $1
           AND s.expires_at > NOW()
           AND a.is_active = TRUE`,
        [tokenHash]
      );
      const account = sessionResult.rows[0];
      if (!account) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

      req.user = { id: account.account_id, name: account.name, email: account.email, role: account.role };
      req.authSession = { tokenHash, accountId: account.account_id };

      await database.query('UPDATE auth_sessions SET last_seen_at = NOW() WHERE token_hash = $1', [tokenHash]);
      await writeAudit(database, {
        accountId: req.user.id,
        method: req.method,
        resource: path,
        ip: req.ip
      });
      return next();
    } catch (error) {
      console.error('[AUTH] Session validation or audit failed:', error.message);
      return res.status(503).json({ error: 'Authentication is temporarily unavailable.' });
    }
  };
}

async function isLoginLocked(database, email, ip) {
  const result = await database.query(
    'SELECT locked_until FROM auth_login_attempts WHERE email = $1 AND ip_address = $2',
    [email, ip]
  );
  const lockedUntil = result.rows[0]?.locked_until;
  return lockedUntil ? new Date(lockedUntil).getTime() > Date.now() : false;
}

async function recordFailedLogin(database, email, ip) {
  await database.query(
    `INSERT INTO auth_login_attempts (email, ip_address, attempts, window_started_at)
     VALUES ($1, $2, 1, NOW())
     ON CONFLICT (email, ip_address) DO UPDATE SET
       attempts = CASE
         WHEN auth_login_attempts.window_started_at < NOW() - INTERVAL '${LOGIN_WINDOW_MINUTES} minutes' THEN 1
         ELSE auth_login_attempts.attempts + 1
       END,
       window_started_at = CASE
         WHEN auth_login_attempts.window_started_at < NOW() - INTERVAL '${LOGIN_WINDOW_MINUTES} minutes' THEN NOW()
         ELSE auth_login_attempts.window_started_at
       END,
       locked_until = CASE
         WHEN auth_login_attempts.window_started_at < NOW() - INTERVAL '${LOGIN_WINDOW_MINUTES} minutes' THEN NULL
         WHEN auth_login_attempts.attempts + 1 >= ${MAX_LOGIN_ATTEMPTS} THEN NOW() + INTERVAL '${LOGIN_LOCK_MINUTES} minutes'
         ELSE auth_login_attempts.locked_until
       END`,
    [email, ip]
  );
}

async function clearFailedLogins(database, email) {
  await database.query('DELETE FROM auth_login_attempts WHERE email = $1', [email]);
}

async function createSession(database, accountId) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  await database.query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
  await database.query(
    `INSERT INTO auth_sessions (token_hash, account_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '${SESSION_HOURS} hours')`,
    [tokenHash, accountId]
  );
  return token;
}

function createAuthRouter(database) {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!validEmail(email) || !password || password.length > 128) {
      return res.status(400).json({ error: 'Enter a valid email address and password.' });
    }

    const ip = String(req.ip || req.socket.remoteAddress || 'unknown').slice(0, 100);
    try {
      if (await isLoginLocked(database, email, ip)) {
        return res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
      }

      const accountResult = await database.query(
        'SELECT id, name, email, password, role, is_active, created_at FROM accounts WHERE email = $1 LIMIT 1',
        [email]
      );
      const account = accountResult.rows[0];
      const verification = account && account.is_active
        ? await verifyPassword(password, account.password)
        : { valid: false, needsRehash: false };

      if (!verification.valid) {
        await recordFailedLogin(database, email, ip);
        await writeAudit(database, { accountId: account?.id || null, method: 'POST', resource: '/api/auth/login', ip, result: 'failure' });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (verification.needsRehash) {
        const upgradedHash = await hashPassword(password);
        await database.query('UPDATE accounts SET password = $1 WHERE id = $2', [upgradedHash, account.id]);
      }

      await clearFailedLogins(database, email);
      const accessToken = await createSession(database, account.id);
      await writeAudit(database, { accountId: account.id, method: 'POST', resource: '/api/auth/login', ip });
      return res.json({ data: safeAccount(account), accessToken });
    } catch (error) {
      console.error('[AUTH] Login failed:', error.message);
      return res.status(503).json({ error: 'Sign-in is temporarily unavailable.' });
    }
  });

  router.post('/logout', async (req, res) => {
    try {
      await database.query('DELETE FROM auth_sessions WHERE token_hash = $1', [req.authSession.tokenHash]);
      return res.json({ success: true });
    } catch (error) {
      console.error('[AUTH] Logout failed:', error.message);
      return res.status(503).json({ error: 'Sign-out is temporarily unavailable.' });
    }
  });

  router.post('/change-password', async (req, res) => {
    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
    const passwordError = validatePassword(newPassword);
    if (!currentPassword || passwordError) {
      return res.status(400).json({ error: passwordError || 'Current password is required.' });
    }

    try {
      const accountResult = await database.query(
        'SELECT id, password FROM accounts WHERE id = $1 AND is_active = TRUE',
        [req.user.id]
      );
      const account = accountResult.rows[0];
      if (!account) return res.status(401).json({ error: 'Authentication required.' });

      const verification = await verifyPassword(currentPassword, account.password);
      if (!verification.valid) return res.status(400).json({ error: 'Current password is incorrect.' });

      const passwordHash = await hashPassword(newPassword);
      await database.query('UPDATE accounts SET password = $1 WHERE id = $2', [passwordHash, req.user.id]);
      await database.query(
        'DELETE FROM auth_sessions WHERE account_id = $1 AND token_hash <> $2',
        [req.user.id, req.authSession.tokenHash]
      );
      return res.json({ success: true, message: 'Password updated. Other sessions have been signed out.' });
    } catch (error) {
      console.error('[AUTH] Password change failed:', error.message);
      return res.status(503).json({ error: 'Password change is temporarily unavailable.' });
    }
  });

  router.post('/register', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only administrators can create staff accounts.' });

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const role = typeof req.body.role === 'string' ? req.body.role : '';
    const passwordError = validatePassword(password);

    if (!name || name.length > 120 || !validEmail(email) || !VALID_ROLES.has(role) || passwordError) {
      return res.status(400).json({ error: passwordError || 'Enter a name, valid email, and supported staff role.' });
    }

    try {
      const passwordHash = await hashPassword(password);
      const result = await database.query(
        `INSERT INTO accounts (name, email, password, role, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, name, email, role, created_at`,
        [name, email, passwordHash, role]
      );
      if (!result.rows[0]) return res.status(409).json({ error: 'An account with that email already exists.' });
      return res.status(201).json({ data: result.rows[0] });
    } catch (error) {
      console.error('[AUTH] Account creation failed:', error.message);
      return res.status(503).json({ error: 'Account creation is temporarily unavailable.' });
    }
  });

  return router;
}

module.exports = { createApiAuthMiddleware, createAuthRouter, getPractitioner };
