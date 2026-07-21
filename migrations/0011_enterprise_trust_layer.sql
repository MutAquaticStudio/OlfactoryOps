CREATE TABLE IF NOT EXISTS sso_configs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  domain TEXT NOT NULL,
  status TEXT NOT NULL,
  issuer_url TEXT NOT NULL,
  metadata_url TEXT,
  client_id TEXT,
  acs_url TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  domain_verified_at TEXT,
  jit_provisioning INTEGER NOT NULL DEFAULT 0,
  enforce_sso INTEGER NOT NULL DEFAULT 0,
  scim_json TEXT NOT NULL,
  role_mapping_json TEXT NOT NULL,
  config_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sso_configs_domain ON sso_configs(domain);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  label TEXT NOT NULL,
  prefix TEXT NOT NULL,
  last_four TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  rotated_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  status TEXT NOT NULL,
  secret_hash TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_status ON api_keys(organization_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_secret_hash ON api_keys(secret_hash);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  url TEXT NOT NULL,
  events_json TEXT NOT NULL,
  status TEXT NOT NULL,
  last_delivery TEXT NOT NULL,
  created_at TEXT NOT NULL,
  owner TEXT NOT NULL,
  signing_secret_last_four TEXT NOT NULL,
  signing_secret_rotated_at TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org_status ON webhooks(organization_id, status);

CREATE TABLE IF NOT EXISTS audit_export_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  format TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  download_url TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  audit_event_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_org_created ON audit_export_jobs(organization_id, created_at);
