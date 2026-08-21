-- Phase 1 follow-up: invitation lifecycle and durable notification delivery leases.
-- Additive and idempotent; never modifies legacy D1 migrations.

CREATE TABLE IF NOT EXISTS v2_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role_key TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  invited_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  accepted_user_id TEXT,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT v2_invitation_status CHECK (status IN ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  CONSTRAINT v2_invitation_email CHECK (length(email) BETWEEN 3 AND 320)
);

CREATE INDEX IF NOT EXISTS v2_invitation_org_status_email_idx
  ON v2_invitations(organization_id, status, email);
CREATE INDEX IF NOT EXISTS v2_invitation_token_status_idx
  ON v2_invitations(token_hash, status);

ALTER TABLE v2_notification_outbox
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS lease_token TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS v2_outbox_org_due_idx
  ON v2_notification_outbox(organization_id, status, next_attempt_at);
CREATE UNIQUE INDEX IF NOT EXISTS v2_delivery_outbox_attempt_uidx
  ON v2_notification_deliveries(outbox_id, attempt);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'v2_invitations' AND policyname = 'v2_tenant_scope') THEN
    CREATE POLICY v2_tenant_scope ON v2_invitations
      USING (
        organization_id::text = current_setting('app.organization_id', true)
        OR token_hash = current_setting('app.invitation_hash', true)
      )
      WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
  END IF;
END $$;

ALTER TABLE v2_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_invitations FORCE ROW LEVEL SECURITY;

-- The application role is intentionally non-bypass-RLS. Re-apply grants after
-- disposable schema rebuilds and on every idempotent migration run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO v2_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO v2_app';
  END IF;
END $$;
