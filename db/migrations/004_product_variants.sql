-- 004_product_variants.sql
-- Variantes de producto/servicio para tamaños, formatos y opciones con precio opcional.

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  price_override numeric(12,2)
    CHECK (price_override IS NULL OR price_override >= 0),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name)
);

CREATE INDEX product_variants_product_sort_idx
  ON product_variants (product_id, active, sort_order, name);
