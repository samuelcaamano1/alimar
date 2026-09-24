-- 021_api_rate_limits.sql
-- Distributed request throttling for login and public mutations.
-- Stores only SHA-256 hashes of client identifiers, never raw IP addresses.

CREATE TABLE IF NOT EXISTS api_rate_limits (
  scope varchar(64) NOT NULL,
  key_hash char(64) NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0
    CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key_hash)
);

CREATE INDEX IF NOT EXISTS api_rate_limits_updated_at_idx
  ON api_rate_limits (updated_at);
