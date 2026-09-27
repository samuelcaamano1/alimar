-- 028_customer_accounts.sql
-- Cuentas de clientes, sesiones y propiedad de pedidos/solicitudes.

CREATE TABLE IF NOT EXISTS customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(160) NOT NULL,
  password_hash varchar(255) NOT NULL,
  name varchar(100) NOT NULL,
  phone varchar(40) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_email_unique_idx
  ON customer_accounts (lower(email));

CREATE TABLE IF NOT EXISTS customer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_sessions_account_idx
  ON customer_sessions (account_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS customer_sessions_expiry_idx
  ON customer_sessions (expires_at);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_account_id uuid
    REFERENCES customer_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_customer_account_created_idx
  ON orders (customer_account_id, created_at DESC)
  WHERE customer_account_id IS NOT NULL;

ALTER TABLE custom_requests
  ADD COLUMN IF NOT EXISTS customer_account_id uuid
    REFERENCES customer_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS custom_requests_customer_account_created_idx
  ON custom_requests (customer_account_id, created_at DESC)
  WHERE customer_account_id IS NOT NULL;
