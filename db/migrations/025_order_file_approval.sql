-- 025_order_file_approval.sql
-- Customer approval workflow for shared design files.

ALTER TABLE order_files
  ADD COLUMN IF NOT EXISTS approval_status varchar(24) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approval_comment varchar(500),
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_responded_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_files_approval_status_check'
  ) THEN
    ALTER TABLE order_files
      ADD CONSTRAINT order_files_approval_status_check
      CHECK (approval_status IN ('not_required', 'pending', 'approved', 'changes_requested'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS order_files_pending_approval_idx
  ON order_files (order_id, approval_requested_at DESC)
  WHERE archived_at IS NULL
    AND customer_visible IS TRUE
    AND kind = 'design'
    AND approval_status = 'pending';
