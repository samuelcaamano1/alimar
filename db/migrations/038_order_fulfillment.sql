-- ALIMAR 1SHOP.15 - ENTREGA Y RETIRO

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_method varchar(20);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_area varchar(120);

CREATE INDEX IF NOT EXISTS orders_fulfillment_method_idx
  ON orders (fulfillment_method, created_at DESC)
  WHERE fulfillment_method IS NOT NULL;
