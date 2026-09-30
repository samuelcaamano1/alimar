-- 033_combined_quote_projects.sql
-- Presupuestos que combinan múltiples procesos + recetas reutilizables.

ALTER TABLE quotes
  DROP CONSTRAINT IF EXISTS quotes_job_type_check;

ALTER TABLE quotes
  ADD CONSTRAINT quotes_job_type_check
  CHECK (job_type IN ('paper-print','3d-print','manual','combined'));

CREATE TABLE IF NOT EXISTS quote_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL UNIQUE,
  recipe jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_templates_updated_idx
  ON quote_templates (updated_at DESC);
