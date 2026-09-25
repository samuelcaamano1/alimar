-- 024_order_file_visibility.sql
-- Explicit customer visibility for order file links.

ALTER TABLE order_files
  ADD COLUMN IF NOT EXISTS customer_visible boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS order_files_customer_visible_idx
  ON order_files (order_id, created_at DESC)
  WHERE archived_at IS NULL AND customer_visible IS TRUE;
