-- Idempotent schema for Tiger Cloud / PostgreSQL. No Timescale extension required.
CREATE TABLE IF NOT EXISTS knowledge_items (
  owner_id text NOT NULL,
  id text NOT NULL,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  asset bytea, -- legacy: files uploaded before object storage
  asset_path text, -- object key in the Supabase Storage "assets" bucket
  mime text,
  PRIMARY KEY (owner_id, id),
  CHECK (jsonb_typeof(document) = 'object'),
  CHECK (document->>'id' = id),
  CHECK ((document->>'version')::integer > 0),
  CHECK (asset IS NULL OR octet_length(asset) <= 3145728)
);
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS asset_path text;
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
-- Supabase exposes public tables over its REST API; RLS with no policies closes that path.
-- The app connects as the table owner, which bypasses RLS.
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_limits ENABLE ROW LEVEL SECURITY;
