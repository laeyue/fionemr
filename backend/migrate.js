require('dotenv').config();

// Neon migrations use a direct connection; normal application traffic uses pooling.
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;

const { database } = require('./database');

database.initialize()
  .then(() => console.log('[DATABASE] Migrations are up to date (' + database.mode + ').'))
  .catch((error) => {
    console.error('[DATABASE] Migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => database.close());
