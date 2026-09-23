-- 011_quotes.sql
-- Presupuestos guardados con snapshot financiero inmutable.

CREATE SEQUENCE IF NOT EXISTS quote_number_seq START WITH 1;

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number bigint NOT NULL DEFAULT nextval('quote_number_seq') UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  title varchar(160) NOT NULL,
  customer_name varchar(120),
  customer_phone varchar(40),
  job_type varchar(24) NOT NULL
    CHECK (job_type IN ('paper-print','3d-print','manual')),
  quantity integer NOT NULL CHECK (quantity > 0),
  valid_until date,
  notes text,
  snapshot jsonb NOT NULL,
  direct_cost numeric(14,2) NOT NULL CHECK (direct_cost >= 0),
  light_cost numeric(14,2) NOT NULL CHECK (light_cost >= 0),
  wear_cost numeric(14,2) NOT NULL CHECK (wear_cost >= 0),
  real_cost numeric(14,2) NOT NULL CHECK (real_cost >= 0),
  profit_percent numeric(8,2) NOT NULL CHECK (profit_percent >= 0),
  suggested_unit_price numeric(14,2) NOT NULL CHECK (suggested_unit_price >= 0),
  total_price numeric(14,2) NOT NULL CHECK (total_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quotes_status_created_idx
  ON quotes (status, created_at DESC);

CREATE INDEX quotes_customer_created_idx
  ON quotes (customer_name, created_at DESC);
