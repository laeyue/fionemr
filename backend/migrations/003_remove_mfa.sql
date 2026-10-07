ALTER TABLE accounts
  DROP COLUMN IF EXISTS mfa_enabled,
  DROP COLUMN IF EXISTS mfa_type,
  DROP COLUMN IF EXISTS mfa_secret;
