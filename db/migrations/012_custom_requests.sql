-- 012_custom_requests.sql
-- Solicitudes personalizadas enviadas desde la tienda.

CREATE SEQUENCE IF NOT EXISTS custom_request_number_seq START WITH 1;

CREATE TABLE custom_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  request_number bigint NOT NULL DEFAULT nextval('custom_request_number_seq') UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','reviewing','quoted','closed')),
  customer_name varchar(120) NOT NULL,
  customer_phone varchar(40) NOT NULL,
  request_type varchar(24) NOT NULL
    CHECK (request_type IN ('paper','3d','event','design','other')),
  quantity integer
    CHECK (quantity IS NULL OR quantity > 0),
  needed_date date,
  dimensions varchar(120),
  theme varchar(240),
  description text NOT NULL,
  reference_url varchar(500),
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX custom_requests_status_created_idx
  ON custom_requests (status, created_at DESC);

CREATE INDEX custom_requests_customer_created_idx
  ON custom_requests (customer_name, created_at DESC);
