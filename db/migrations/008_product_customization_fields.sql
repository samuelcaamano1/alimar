-- 008_product_customization_fields.sql
-- Campos configurables de personalización por producto y snapshot para pedidos.

CREATE TABLE product_customization_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label varchar(80) NOT NULL,
  field_type varchar(20) NOT NULL
    CHECK (field_type IN ('text', 'textarea', 'number', 'date', 'select')),
  placeholder varchar(120),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  max_length smallint NOT NULL DEFAULT 120
    CHECK (max_length BETWEEN 1 AND 500),
  sort_order integer NOT NULL DEFAULT 0
    CHECK (sort_order >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(options) = 'array')
);

CREATE INDEX product_customization_fields_product_sort_idx
  ON product_customization_fields (product_id, active, sort_order, created_at);

ALTER TABLE order_items
  ADD COLUMN customization_values jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_customization_values_array_check
  CHECK (jsonb_typeof(customization_values) = 'array');
