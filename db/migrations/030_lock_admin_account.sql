-- 030_lock_admin_account.sql
-- Seguridad: Alimar no permite auto-registro administrativo.
-- Se invalida cualquier cuenta/sesión administrativa anterior creando una única cuenta nueva.

DELETE FROM admin_accounts;

INSERT INTO admin_accounts (
  id,
  email,
  password_hash,
  name,
  active,
  last_login_at,
  created_at,
  updated_at
)
VALUES (
  gen_random_uuid(),
  'stefideotools@gmail.com',
  'scrypt$8b9725e3b16b16a504d1fe414b6d234b$4eb102fecd11e06d79134db4bd910aa3eb0278b50539006fa91b0cce70c93a1c1f699571c74a8acc8c41b79c9dff65afb9f8ea30089a7dd1214bdde1f2e378b6',
  'Administrador',
  true,
  NULL,
  now(),
  now()
);

ALTER TABLE admin_accounts
  DROP CONSTRAINT IF EXISTS admin_accounts_locked_email_check;

ALTER TABLE admin_accounts
  ADD CONSTRAINT admin_accounts_locked_email_check
  CHECK (lower(email) = 'stefideotools@gmail.com');
