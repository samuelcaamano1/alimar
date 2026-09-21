-- 002_catalog_base.sql
-- Base del catálogo MVP de Alimar. Sin variantes, stock ni archivos binarios.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  slug varchar(100) NOT NULL UNIQUE,
  description varchar(240),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name varchar(120) NOT NULL,
  slug varchar(140) NOT NULL UNIQUE,
  short_description varchar(280),
  description text,
  kind varchar(20) NOT NULL CHECK (kind IN ('service', 'product')),
  pricing_mode varchar(20) NOT NULL DEFAULT 'fixed'
    CHECK (pricing_mode IN ('fixed', 'from', 'quote')),
  base_price numeric(12,2)
    CHECK (base_price IS NULL OR base_price >= 0),
  estimated_days smallint
    CHECK (estimated_days IS NULL OR estimated_days > 0),
  customization_allowed boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (pricing_mode = 'quote' AND base_price IS NULL)
    OR
    (pricing_mode IN ('fixed', 'from') AND base_price IS NOT NULL)
  )
);

CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text varchar(180),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX categories_active_sort_idx
  ON categories (active, sort_order, name);

CREATE INDEX products_catalog_idx
  ON products (active, category_id, featured, name);

CREATE INDEX product_images_product_sort_idx
  ON product_images (product_id, sort_order);

CREATE UNIQUE INDEX product_images_one_primary_idx
  ON product_images (product_id)
  WHERE is_primary;
