-- A historical document acknowledgment is not an explicit departure approval.
ALTER TABLE excuse_slips ADD COLUMN IF NOT EXISTS departure_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE excuse_slips ADD COLUMN IF NOT EXISTS departure_approved_at TIMESTAMPTZ;
