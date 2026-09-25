-- 023_order_files.sql
-- Internal file/link registry for customer references and production assets.

CREATE TABLE IF NOT EXISTS order_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind varchar(24) NOT NULL CHECK (
    kind IN ('reference', 'design', 'production', 'print', '3d', 'other')
  ),
  label varchar(120) NOT NULL,
  url text NOT NULL CHECK (char_length(url) <= 4000),
  note varchar(500),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_files_order_active_idx
  ON order_files (order_id, created_at DESC)
  WHERE archived_at IS NULL;
