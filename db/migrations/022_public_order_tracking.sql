-- 022_public_order_tracking.sql
-- Private public-facing tracking token for each order.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS public_tracking_token uuid;

UPDATE orders
SET public_tracking_token = gen_random_uuid()
WHERE public_tracking_token IS NULL;

ALTER TABLE orders
  ALTER COLUMN public_tracking_token SET DEFAULT gen_random_uuid();

ALTER TABLE orders
  ALTER COLUMN public_tracking_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_public_tracking_token_uidx
  ON orders (public_tracking_token);
