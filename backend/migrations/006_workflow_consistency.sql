ALTER TABLE patients ADD COLUMN IF NOT EXISTS observation_started_at TIMESTAMPTZ;
UPDATE patients p SET observation_started_at = (
  SELECT max(l.created_at) FROM visit_logs l WHERE l.patient_id = p.id AND l.event_type = 'Bed Observation'
    AND l.details = 'Admitted to clinic bed for observation.'
) WHERE p.status = 'Under Observation' AND p.observation_started_at IS NULL;
ALTER TABLE excuse_slips ADD COLUMN IF NOT EXISTS teacher_notification_requested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE excuse_slips ADD COLUMN IF NOT EXISTS checkout_at TIMESTAMPTZ;
UPDATE excuse_slips SET teacher_notification_requested = TRUE, teacher_notified = 'Unconfirmed'
  WHERE lower(teacher_notified) IN ('yes', 'true');
ALTER TABLE email_alerts ADD COLUMN IF NOT EXISTS dedup_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_alerts_dedup_key ON email_alerts(dedup_key) WHERE dedup_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS clinical_action_requests (
  request_key UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  request_fingerprint TEXT NOT NULL,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
