-- 015_quote_follow_up.sql
-- Seguimiento comercial: cuándo se envió y último recordatorio.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

UPDATE quotes
SET sent_at = COALESCE(sent_at, updated_at, created_at)
WHERE status IN ('sent', 'accepted')
  AND sent_at IS NULL;

CREATE INDEX IF NOT EXISTS quotes_follow_up_idx
  ON quotes (status, valid_until, sent_at, last_reminded_at);
