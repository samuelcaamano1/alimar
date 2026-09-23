-- 019_order_delivery_schedule.sql
-- Fechas prometidas, prioridad y notas de producción/entrega.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS promised_for date,
  ADD COLUMN IF NOT EXISTS production_priority varchar(12) NOT NULL DEFAULT 'normal'
    CHECK (production_priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS delivery_note varchar(500),
  ADD COLUMN IF NOT EXISTS schedule_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_active_promised_for_idx
  ON orders (
    promised_for ASC,
    production_priority,
    updated_at ASC
  )
  WHERE status IN ('confirmed', 'in_progress', 'ready');

CREATE INDEX IF NOT EXISTS orders_active_unscheduled_idx
  ON orders (updated_at ASC)
  WHERE status IN ('confirmed', 'in_progress', 'ready')
    AND promised_for IS NULL;
