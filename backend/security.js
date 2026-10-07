const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const PASSWORD_HASH_PREFIX = 'scrypt$';
const SCRYPT_OPTIONS = { N: 1 << 15, r: 8, p: 3, maxmem: 128 * 1024 * 1024 };

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return [
    'scrypt',
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString('hex'),
    derived.toString('hex')
  ].join('$');
}

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return { valid: false, needsRehash: false };

  if (storedHash.startsWith(PASSWORD_HASH_PREFIX)) {
    const [, n, r, p, saltHex, hashHex] = storedHash.split('$');
    if (
      Number(n) !== SCRYPT_OPTIONS.N ||
      Number(r) !== SCRYPT_OPTIONS.r ||
      Number(p) !== SCRYPT_OPTIONS.p ||
      !/^[a-f0-9]{32}$/i.test(saltHex || '') ||
      !/^[a-f0-9]{128}$/i.test(hashHex || '')
    ) {
      return { valid: false, needsRehash: false };
    }

    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_OPTIONS);
    return {
      valid: crypto.timingSafeEqual(actual, expected),
      needsRehash: false
    };
  }

  // Upgrade hashes written by the previous local-only SHA-256 login flow.
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const expected = Buffer.from(storedHash, 'hex');
    const actual = Buffer.from(sha256(password), 'hex');
    return {
      valid: crypto.timingSafeEqual(actual, expected),
      needsRehash: true
    };
  }

  return { valid: false, needsRehash: false };
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashSessionToken(token) {
  return sha256(token);
}

function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 15) return 'Password must be at least 15 characters long.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return null;
}

module.exports = {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  sha256,
  validEmail,
  validatePassword,
  verifyPassword
};
