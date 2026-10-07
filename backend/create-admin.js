const readline = require('node:readline');
const { database } = require('./database');
const { hashPassword, validEmail, validatePassword } = require('./security');

function ask(question) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => prompt.question(question, (answer) => {
    prompt.close();
    resolve(answer.trim());
  }));
}

function askSecret(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      reject(new Error('Run this command in an interactive terminal so the password can be entered safely.'));
      return;
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(question);
    let value = '';

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdout.write('\n');
    };

    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('Cancelled.'));
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(value);
        return;
      }
      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }
      if (character && !key.ctrl && !key.meta) value += character;
    };

    process.stdin.on('keypress', onKeypress);
  });
}

async function main() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('Set DATABASE_URL to the Neon database before creating the administrator.');
    }

    await database.initialize();
    const currentAdmins = await database.query("SELECT COUNT(*)::int AS count FROM accounts WHERE role = 'admin' AND is_active = TRUE");
    if (Number(currentAdmins.rows[0].count) > 0) {
      throw new Error('An active administrator already exists. Ask an administrator to create this account.');
    }

    const name = await ask('Administrator name: ');
    const email = (await ask('Administrator email: ')).toLowerCase();
    const password = await askSecret('Password (hidden): ');
    const passwordAgain = await askSecret('Confirm password (hidden): ');

    if (!name || name.length > 120) throw new Error('Enter a name of 1 to 120 characters.');
    if (!validEmail(email)) throw new Error('Enter a valid email address.');
    const passwordError = validatePassword(password);
    if (passwordError) throw new Error(passwordError);
    if (password !== passwordAgain) throw new Error('Passwords do not match.');

    const passwordHash = await hashPassword(password);
    const created = await database.query(
      `INSERT INTO accounts (name, email, password, role, is_active)
       VALUES ($1, $2, $3, 'admin', TRUE)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, name, email, role`,
      [name, email, passwordHash]
    );
    if (!created.rows[0]) throw new Error('An account with that email already exists.');
    console.log('Administrator account created for ' + created.rows[0].email + '.');
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error('[ADMIN SETUP] ' + error.message);
  process.exitCode = 1;
});
