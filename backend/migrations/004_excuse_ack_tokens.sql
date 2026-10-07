ALTER TABLE excuse_slips
  ADD COLUMN IF NOT EXISTS acknowledgment_token_hash TEXT;
