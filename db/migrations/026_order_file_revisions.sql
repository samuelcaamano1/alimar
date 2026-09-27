-- 026_order_file_revisions.sql
-- Explicit design revision chains without rewriting existing approval history.

ALTER TABLE order_files
  ADD COLUMN IF NOT EXISTS design_series_id uuid,
  ADD COLUMN IF NOT EXISTS revision_number integer,
  ADD COLUMN IF NOT EXISTS supersedes_file_id uuid REFERENCES order_files(id) ON DELETE SET NULL;

UPDATE order_files
SET
  design_series_id = id,
  revision_number = 1
WHERE kind = 'design'
  AND (design_series_id IS NULL OR revision_number IS NULL);

ALTER TABLE order_files
  DROP CONSTRAINT IF EXISTS order_files_design_revision_metadata_chk;

ALTER TABLE order_files
  ADD CONSTRAINT order_files_design_revision_metadata_chk CHECK (
    (
      kind = 'design'
      AND design_series_id IS NOT NULL
      AND revision_number IS NOT NULL
      AND revision_number >= 1
    )
    OR
    (
      kind <> 'design'
      AND design_series_id IS NULL
      AND revision_number IS NULL
      AND supersedes_file_id IS NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS order_files_design_revision_unique_idx
  ON order_files (design_series_id, revision_number)
  WHERE kind = 'design' AND design_series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_files_design_series_idx
  ON order_files (design_series_id, revision_number DESC, created_at DESC)
  WHERE kind = 'design' AND archived_at IS NULL;
