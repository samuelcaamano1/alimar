-- 029_admin_accounts.sql
-- Cuenta administrativa persistida en Neon; la contraseña legacy queda sólo como bootstrap inicial.

CREATE TABLE IF NOT EXISTS admin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(160) NOT NULL,
  password_hash text NOT NULL,
  name varchar(100) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(email)) >= 3),
  CHECK (length(trim(name)) >= 2),
  CHECK (length(password_hash) >= 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_email_unique_idx
  ON admin_accounts (lower(email));

-- Alimar usa una única cuenta administrativa activa por ahora.
CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_single_active_idx
  ON admin_accounts ((1))
  WHERE active = true;
