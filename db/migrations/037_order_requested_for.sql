-- ALIMAR 1SHOP.14 - FECHA NECESARIA DEL CLIENTE

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS requested_for date;

CREATE INDEX IF NOT EXISTS orders_requested_for_idx
  ON orders (requested_for, created_at DESC)
  WHERE requested_for IS NOT NULL;
