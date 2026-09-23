-- 014_public_quote_approval.sql
-- Link público privado por token para que el cliente vea y acepte su presupuesto.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS public_token uuid;

UPDATE quotes
SET public_token = gen_random_uuid()
WHERE public_token IS NULL;

ALTER TABLE quotes
  ALTER COLUMN public_token SET DEFAULT gen_random_uuid();

ALTER TABLE quotes
  ALTER COLUMN public_token SET NOT NULL;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS customer_responded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_public_token_unique_idx
  ON quotes (public_token);
