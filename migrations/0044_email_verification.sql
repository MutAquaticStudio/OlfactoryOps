-- Email verification is an account-security record, not a tenant policy flag.
-- Tokens are stored only as one-way hashes and are never copied to D1 snapshots,
-- audit evidence, notifications, or API responses.
CREATE TABLE IF NOT EXISTS email_verification_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verification_scope
  ON email_verification_records (organization_id, user_id, email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_verification_active
  ON email_verification_records (email, expires_at, verified_at, revoked_at);
