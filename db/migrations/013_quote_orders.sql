-- 013_quote_orders.sql
-- Permite convertir un presupuesto aceptado en pedido sin duplicarlo.

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_source_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_source_check
  CHECK (source IN ('web', 'quote'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS quote_id uuid
  REFERENCES quotes(id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_quote_id_unique_idx
  ON orders (quote_id)
  WHERE quote_id IS NOT NULL;
