-- 017_order_actual_costs.sql
-- Costo real final del pedido para comparar estimación vs producción.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS actual_cost numeric(14,2)
  CHECK (actual_cost IS NULL OR actual_cost >= 0);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS actual_cost_note varchar(500);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS actual_cost_updated_at timestamptz;
