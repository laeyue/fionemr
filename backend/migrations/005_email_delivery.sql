ALTER TABLE email_alerts ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE email_alerts ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE email_alerts ADD COLUMN IF NOT EXISTS delivery_error TEXT;
ALTER TABLE email_alerts ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_alerts ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE email_alerts ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_email_delivery_status ON email_alerts(delivery_status);
