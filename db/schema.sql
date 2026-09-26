-- Idempotent schema for Tiger Cloud / PostgreSQL. No Timescale extension required.
CREATE TABLE IF NOT EXISTS knowledge_items (
  owner_id text NOT NULL,
  id text NOT NULL,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  asset bytea,
  mime text,
  PRIMARY KEY (owner_id, id),
  CHECK (jsonb_typeof(document) = 'object'),
  CHECK (document->>'id' = id),
  CHECK ((document->>'version')::integer > 0),
  CHECK (asset IS NULL OR octet_length(asset) <= 3145728)
);
CREATE INDEX IF NOT EXISTS knowledge_items_owner_created
  ON knowledge_items (owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS request_limits (
  owner_id text NOT NULL,
  window_id bigint NOT NULL,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id, window_id)
);
CREATE INDEX IF NOT EXISTS request_limits_expiry ON request_limits (expires_at);
