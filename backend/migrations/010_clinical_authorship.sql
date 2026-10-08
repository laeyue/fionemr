-- Snapshot the authenticated author's identity at the time of documentation.
-- Legacy records remain NULL: do not infer an author from nearby audit events.
ALTER TABLE soap_notes
  ADD COLUMN IF NOT EXISTS author_name TEXT,
  ADD COLUMN IF NOT EXISTS author_email TEXT,
  ADD COLUMN IF NOT EXISTS author_role TEXT;

ALTER TABLE vitals
  ADD COLUMN IF NOT EXISTS recorded_by TEXT;
