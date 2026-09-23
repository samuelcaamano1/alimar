-- 018_order_payments.sql
-- Cobros, saldo y total acordado por pedido.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS agreed_total numeric(14,2)
  CHECK (agreed_total IS NULL OR agreed_total >= 0);

-- Los pedidos creados desde un PRE ya tienen un total final cerrado.
-- Los pedidos web sin ítems "a cotizar" también tienen total conocido completo.
UPDATE orders
SET agreed_total = known_total
WHERE agreed_total IS NULL
  AND known_total IS NOT NULL
  AND known_total >= 0
  AND (
    quote_id IS NOT NULL
    OR has_quote = false
  );

CREATE TABLE IF NOT EXISTS order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
    REFERENCES orders(id)
    ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL
    CHECK (amount > 0),
  payment_method varchar(24) NOT NULL
    CHECK (
      payment_method IN (
        'cash',
        'transfer',
        'mercadopago',
        'card',
        'other'
      )
    ),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  reference varchar(120),
  note varchar(500),
  voided_at timestamptz,
  void_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_payments_order_id_idx
  ON order_payments (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_payments_paid_on_idx
  ON order_payments (paid_on DESC)
  WHERE voided_at IS NULL;
