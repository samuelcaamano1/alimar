-- 007_product_sort_order.sql
-- Orden manual de productos dentro de cada categoría.

ALTER TABLE products
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0);

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY category_id
      ORDER BY featured DESC, name ASC, created_at ASC
    ) - 1 AS next_sort
  FROM products
)
UPDATE products p
SET sort_order = ranked.next_sort
FROM ranked
WHERE p.id = ranked.id;

CREATE INDEX products_category_sort_idx
  ON products (category_id, active, sort_order, name);
