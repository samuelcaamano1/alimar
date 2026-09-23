-- 016_quote_response_feedback.sql
-- Motivo opcional cuando el cliente decide no avanzar.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS customer_response_reason varchar(24)
  CHECK (
    customer_response_reason IS NULL
    OR customer_response_reason IN ('price','timing','cancelled','other')
  );

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS customer_response_note varchar(500);

CREATE INDEX IF NOT EXISTS quotes_customer_response_reason_idx
  ON quotes (customer_response_reason)
  WHERE customer_response_reason IS NOT NULL;
