-- 027_order_delivery_check.sql
-- Control final manual antes de entregar o cerrar un PED.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_check_note varchar(500);

CREATE INDEX IF NOT EXISTS orders_delivery_check_pending_idx
  ON orders (production_priority DESC, promised_for ASC, updated_at ASC)
  WHERE status IN ('confirmed', 'in_progress', 'ready')
    AND production_stage = 'ready_for_delivery'
    AND delivery_checked_at IS NULL;
