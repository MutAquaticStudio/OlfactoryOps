-- Opaque Worker session credentials. Session record IDs remain audit references only.
CREATE TABLE IF NOT EXISTS auth_session_credentials (
  session_id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL UNIQUE,
  credential_version INTEGER NOT NULL DEFAULT 1,
  issued_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES auth_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_session_credentials_secret_hash
  ON auth_session_credentials(secret_hash);

-- Existing cookies contained predictable auth_sessions.id values. They never gain a
-- credential row, and this migration records their invalidation explicitly.
UPDATE auth_sessions
SET
  status = 'REVOKED',
  revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_reason = COALESCE(revoked_reason, 'LEGACY_SESSION_CREDENTIAL_REVOKED'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM auth_session_credentials AS credentials
    WHERE credentials.session_id = auth_sessions.id
  );
