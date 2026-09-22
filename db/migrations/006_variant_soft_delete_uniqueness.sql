-- 006_variant_soft_delete_uniqueness.sql
-- Permite volver a usar el mismo nombre de variante después de una baja lógica.

ALTER TABLE product_variants
  DROP CONSTRAINT IF EXISTS product_variants_product_id_name_key;

CREATE UNIQUE INDEX product_variants_active_name_idx
  ON product_variants (product_id, name)
  WHERE active = true;
