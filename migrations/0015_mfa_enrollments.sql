CREATE TABLE IF NOT EXISTS mfa_enrollments (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  recovery_code_hashes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mfa_enrollments_org_verified
  ON mfa_enrollments(organization_id, verified_at);
