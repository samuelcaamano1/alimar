-- 010_cost_resource_print_unit.sql
-- La tinta se presupuesta por rendimiento de impresiones, no por mililitros.

ALTER TABLE cost_resources
  DROP CONSTRAINT IF EXISTS cost_resources_unit_check;

ALTER TABLE cost_resources
  ADD CONSTRAINT cost_resources_unit_check
  CHECK (
    unit IN (
      'unit',
      'sheet',
      'print',
      'g',
      'kg',
      'ml',
      'l',
      'm',
      'kwh',
      'minute',
      'hour'
    )
  );
