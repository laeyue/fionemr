const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { database } = require('./database');
const { hashPassword } = require('./security');

const DEV_HOST = 'ep-quiet-base-b3y4j6n8.c-4.ap-southeast-1.aws.neon.tech';
const credentialsPath = path.join(__dirname, '.dev-accounts.json');
const roles = ['admin', 'physician', 'nurse', 'teacher', 'guidance_counselor'];

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('Development seeding is disabled in production.');
  const target = new URL(process.env.DATABASE_URL || '');
  if (target.hostname.replace('-pooler.', '.') !== DEV_HOST || target.pathname !== '/fionemr') {
    throw new Error('Refusing to seed: DATABASE_URL must target the dedicated development branch and fionemr database.');
  }
  if (fs.existsSync(credentialsPath)) throw new Error('Development credentials already exist in .dev-accounts.json. Seeding will not reset existing passwords.');
  await database.initialize();
  const accounts = [];
  for (const role of roles) {
    const password = crypto.randomBytes(24).toString('base64url');
    accounts.push({ role, email: role.replace('_', '-') + '@dev.fionemr.test', password, hash: await hashPassword(password) });
  }
  await database.transaction(async (tx) => {
    for (const account of accounts) {
      await tx.query('INSERT INTO accounts (name, email, password, role, is_active) VALUES ($1, $2, $3, $4, TRUE)',
        ['Development ' + account.role.replace('_', ' '), account.email, account.hash, account.role]);
    }
    // If credentials cannot be saved, roll back the account inserts too.
    fs.writeFileSync(credentialsPath, JSON.stringify({ environment: 'development', branch: 'development', accounts: accounts.map(({ hash, ...account }) => account) }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  });
  console.log('Created ' + accounts.length + ' development accounts. Credentials saved to backend/.dev-accounts.json (ignored by Git).');
  for (const account of accounts) console.log(account.role + ': ' + account.email);
}

main().catch((error) => { console.error('Development account seed failed:', error.message); process.exitCode = 1; }).finally(() => database.close());
