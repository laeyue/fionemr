const { spawnSync } = require('node:child_process');

const result = spawnSync(process.execPath, ['--test', 'test/backend.test.js'], {
  cwd: __dirname,
  env: {
    ...process.env,
    EMAIL_MODE: 'simulate'
  },
  stdio: 'inherit'
});

process.exitCode = result.status === null ? 1 : result.status;
