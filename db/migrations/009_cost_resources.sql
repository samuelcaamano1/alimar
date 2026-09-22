-- 009_cost_resources.sql
-- Base editable de costos para la calculadora inteligente del admin.

CREATE TABLE cost_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  category varchar(24) NOT NULL
    CHECK (
      category IN (
        'paper',
        'ink',
        'filament',
        'paint',
        'energy',
        'machine',
        'labor',
        'consumable',
        'other'
      )
    ),
  detail varchar(160),
  unit varchar(20) NOT NULL
    CHECK (
      unit IN (
        'unit',
        'sheet',
        'g',
        'kg',
        'ml',
        'l',
        'm',
        'kwh',
        'minute',
        'hour'
      )
    ),
  purchase_price numeric(14,4) NOT NULL CHECK (purchase_price > 0),
  package_quantity numeric(14,4) NOT NULL CHECK (package_quantity > 0),
  waste_percent numeric(6,2) NOT NULL DEFAULT 0
    CHECK (waste_percent >= 0 AND waste_percent <= 100),
  notes varchar(280),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cost_resources_active_category_name_idx
  ON cost_resources (active, category, name);
