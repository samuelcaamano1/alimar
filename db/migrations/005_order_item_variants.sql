-- 005_order_item_variants.sql
-- Snapshot de la variante elegida en cada ítem del pedido.

ALTER TABLE order_items
  ADD COLUMN variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  ADD COLUMN variant_name varchar(80);

CREATE INDEX order_items_variant_idx
  ON order_items (variant_id)
  WHERE variant_id IS NOT NULL;
