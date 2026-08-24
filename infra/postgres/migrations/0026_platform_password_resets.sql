-- RC13 adds an additive, opaque-token V2 password-reset capability. The
-- delivery token is never stored here; only its server-side verifier hash is.

CREATE TABLE IF NOT EXISTS v2_password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT v2_password_reset_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS v2_password_resets_user_idx
  ON v2_password_resets(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS v2_password_resets_organization_created_idx
  ON v2_password_resets(organization_id, created_at DESC);

ALTER TABLE v2_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_password_resets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v2_tenant_scope ON v2_password_resets;
CREATE POLICY v2_tenant_scope ON v2_password_resets
  USING (
    user_id::text = current_setting('app.user_id', true)
    OR token_hash = current_setting('app.password_reset_hash', true)
  )
  WITH CHECK (user_id::text = current_setting('app.user_id', true));

-- A reset is a trusted server-side credential transition. Permit the scoped
-- repository transaction to revoke every V2 session for that authenticated
-- user, while preserving tenant context for ordinary session operations.
DROP POLICY IF EXISTS v2_tenant_scope ON v2_sessions;
CREATE POLICY v2_tenant_scope ON v2_sessions
  USING (
    organization_id::text = current_setting('app.organization_id', true)
    OR user_id::text = current_setting('app.user_id', true)
    OR token_verifier_hash = current_setting('app.session_hash', true)
  )
  WITH CHECK (
    organization_id::text = current_setting('app.organization_id', true)
    OR user_id::text = current_setting('app.user_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON v2_password_resets TO v2_app;
  END IF;
END $$;
