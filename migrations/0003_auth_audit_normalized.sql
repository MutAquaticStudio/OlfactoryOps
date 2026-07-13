CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  role TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL,
  mfa_verified INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  csrf_token TEXT,
  revoked_at TEXT,
  revoked_reason TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_org_status
  ON auth_sessions(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_email_status
  ON auth_sessions(email, status);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  request_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_at
  ON audit_events(at);

CREATE INDEX IF NOT EXISTS idx_audit_events_action
  ON audit_events(action);
