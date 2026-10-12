-- ALIMAR 1SHOP.12 - COMBOS DE PRODUCTOS

CREATE TABLE IF NOT EXISTS product_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  slug varchar(140) NOT NULL UNIQUE,
  short_description varchar(320),
  bundle_price numeric(12,2) NOT NULL CHECK (bundle_price >= 0),
  featured boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_bundles_active_sort_idx
  ON product_bundles (active, featured DESC, sort_order, name);

CREATE TABLE IF NOT EXISTS product_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity smallint NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, product_id)
);

CREATE INDEX IF NOT EXISTS product_bundle_items_bundle_idx
  ON product_bundle_items (bundle_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS product_bundle_items_product_idx
  ON product_bundle_items (product_id);
