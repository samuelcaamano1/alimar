-- 003_orders_base.sql
-- Pedidos web persistidos antes de continuar la conversación por WhatsApp.

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_code varchar(24) NOT NULL UNIQUE,
  request_id uuid NOT NULL UNIQUE,
  status varchar(24) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','confirmed','in_progress','ready','completed','cancelled')),
  customer_name varchar(100) NOT NULL,
  customer_phone varchar(40) NOT NULL,
  customer_email varchar(160),
  customer_notes varchar(500),
  known_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (known_total >= 0),
  has_quote boolean NOT NULL DEFAULT false,
  source varchar(20) NOT NULL DEFAULT 'web' CHECK (source IN ('web')),
  whatsapp_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name varchar(120) NOT NULL,
  kind varchar(20) NOT NULL CHECK (kind IN ('service', 'product')),
  pricing_mode varchar(20) NOT NULL CHECK (pricing_mode IN ('fixed', 'from', 'quote')),
  unit_price numeric(12,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  quantity smallint NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  line_total numeric(12,2) CHECK (line_total IS NULL OR line_total >= 0),
  customization_note varchar(240),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (pricing_mode = 'quote' AND unit_price IS NULL AND line_total IS NULL)
    OR
    (pricing_mode IN ('fixed', 'from') AND unit_price IS NOT NULL AND line_total IS NOT NULL)
  )
);

CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,
  from_status varchar(24),
  to_status varchar(24),
  note varchar(300),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_status_created_idx ON orders (status, created_at DESC);
CREATE INDEX orders_created_idx ON orders (created_at DESC);
CREATE INDEX order_items_order_idx ON order_items (order_id, created_at);
CREATE INDEX order_events_order_idx ON order_events (order_id, created_at);
