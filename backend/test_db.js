require('dotenv').config();
const { database } = require('./database');

database.initialize()
  .then(async () => {
    const status = await database.health();
    console.log('Neon database connection check passed (' + status.mode + ').');
  })
  .catch((error) => {
    console.error('Neon database connection check failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => database.close());
