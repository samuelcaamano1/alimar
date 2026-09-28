-- 031_customer_password_resets.sql
-- Recuperación de contraseña de clientes mediante links de un solo uso.

CREATE TABLE IF NOT EXISTS customer_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_password_resets_account_idx
  ON customer_password_resets (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_password_resets_expiry_idx
  ON customer_password_resets (expires_at)
  WHERE used_at IS NULL;
