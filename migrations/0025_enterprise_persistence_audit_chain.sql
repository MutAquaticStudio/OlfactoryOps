CREATE TABLE IF NOT EXISTS persistence_metadata (
  metadata_key TEXT PRIMARY KEY,
  metadata_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_credentials (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  password_set_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_records (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_email_expiry
  ON password_reset_records(email, expires_at);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_org_status
  ON import_jobs(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS legal_acceptance_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  document TEXT NOT NULL,
  version TEXT NOT NULL,
  record_json TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id, document, version)
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_org_user
  ON legal_acceptance_records(organization_id, user_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_org_status
  ON privacy_requests(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS saas_custom_domains (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL,
  record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (hostname),
  UNIQUE (organization_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_saas_custom_domains_org_status
  ON saas_custom_domains(organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS inventory_approval_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_approval_requests_org_status
  ON inventory_approval_requests(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS operation_approval_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operation_approval_requests_org_status
  ON operation_approval_requests(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_chain_events (
  event_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  previous_hash TEXT,
  event_hash TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (organization_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_audit_chain_org_sequence
  ON audit_chain_events(organization_id, sequence DESC);
