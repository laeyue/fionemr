ALTER TABLE immunizations
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE medication_orders
  ADD COLUMN IF NOT EXISTS dose_amount NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS dose_unit TEXT;

ALTER TABLE patients
  ALTER COLUMN allergies SET DEFAULT 'Unknown - not reviewed',
  ALTER COLUMN chronic_conditions SET DEFAULT 'Unknown - not reviewed';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'immunizations_verification_status_check') THEN
    ALTER TABLE immunizations
      ADD CONSTRAINT immunizations_verification_status_check
      CHECK (verification_status IN ('unknown', 'verified'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medication_orders_dose_amount_positive_check') THEN
    ALTER TABLE medication_orders
      ADD CONSTRAINT medication_orders_dose_amount_positive_check
      CHECK (dose_amount IS NULL OR dose_amount > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medication_orders_dose_unit_check') THEN
    ALTER TABLE medication_orders
      ADD CONSTRAINT medication_orders_dose_unit_check
      CHECK (dose_unit IS NULL OR dose_unit IN ('mg', 'g', 'mcg', 'mL', 'tablet', 'capsule', 'puff', 'drop', 'patch', 'application', 'other'));
  END IF;
END $$;
