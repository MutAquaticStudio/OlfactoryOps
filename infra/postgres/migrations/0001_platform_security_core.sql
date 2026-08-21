-- OlfactoryOps V2 Phase 1: Platform Security Core
-- PostgreSQL is the only V2 writer. This chain is independent from legacy D1 0001-0044.

CREATE TABLE IF NOT EXISTS v2_organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_org_slug_format CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$')
);

CREATE TABLE IF NOT EXISTS v2_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS v2_role_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, role_key)
);

CREATE TABLE IF NOT EXISTS v2_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  token_verifier_hash TEXT NOT NULL UNIQUE,
  csrf_verifier_hash TEXT NOT NULL,
  device_label TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  rotated_from_id TEXT,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);

CREATE TABLE IF NOT EXISTS v2_email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS v2_workspace_hostnames (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'DEFAULT',
  status TEXT NOT NULL DEFAULT 'PENDING',
  provider_ref TEXT,
  validation_status TEXT,
  ssl_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS v2_workspace_branding (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES v2_organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  logo_object_ref TEXT,
  favicon_object_ref TEXT,
  accent_color TEXT,
  footer_text TEXT,
  locale TEXT NOT NULL DEFAULT 'en-US',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  billing_mode TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES v2_plans(id),
  status TEXT NOT NULL DEFAULT 'MANAGED_BETA',
  provider_ref TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS v2_entitlements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'MANAGED_BETA',
  expires_at TIMESTAMPTZ,
  UNIQUE (organization_id, capability)
);

CREATE TABLE IF NOT EXISTS v2_usage_limits (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value INTEGER NOT NULL,
  period TEXT NOT NULL DEFAULT 'LIFETIME',
  used INTEGER NOT NULL DEFAULT 0,
  UNIQUE (organization_id, key, period)
);

CREATE TABLE IF NOT EXISTS v2_notification_preferences (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (organization_id, user_id, event_type, channel)
);

CREATE TABLE IF NOT EXISTS v2_notification_outbox (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  recipient_user_id TEXT,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key, channel)
);

CREATE TABLE IF NOT EXISTS v2_notification_deliveries (
  id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL REFERENCES v2_notification_outbox(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  error_code TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_push_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, endpoint_hash)
);

CREATE TABLE IF NOT EXISTS v2_consent_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES v2_organizations(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  withdrawn_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS v2_privacy_export_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES v2_organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  artifact_ref TEXT
);

CREATE TABLE IF NOT EXISTS v2_workspace_export_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  artifact_ref TEXT
);

CREATE TABLE IF NOT EXISTS v2_erasure_review_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES v2_organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS v2_audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  payload_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_observability_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  api_status TEXT NOT NULL,
  database_status TEXT NOT NULL,
  queue_status TEXT NOT NULL,
  email_status TEXT NOT NULL,
  push_status TEXT NOT NULL,
  billing_status TEXT NOT NULL,
  domain_status TEXT NOT NULL,
  degraded_count INTEGER NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO v2_plans (id, name, billing_mode, capabilities, limits)
VALUES ('managed_beta', 'Managed beta', 'MANAGED_BETA',
  '["workspace.access","notifications.in_app","privacy.export.self"]'::jsonb,
  '{"members":25,"storageMb":1024,"aiRuns":0}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS v2_memberships_user_status_idx ON v2_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS v2_memberships_org_status_idx ON v2_memberships(organization_id, status);
CREATE INDEX IF NOT EXISTS v2_sessions_user_revoked_idx ON v2_sessions(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS v2_sessions_org_revoked_idx ON v2_sessions(organization_id, revoked_at);
CREATE INDEX IF NOT EXISTS v2_email_verifications_user_idx ON v2_email_verifications(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS v2_hostnames_org_status_idx ON v2_workspace_hostnames(organization_id, status);
CREATE INDEX IF NOT EXISTS v2_hostnames_active_idx ON v2_workspace_hostnames(hostname, status);
CREATE INDEX IF NOT EXISTS v2_outbox_due_idx ON v2_notification_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS v2_audit_org_created_idx ON v2_audit_events(organization_id, created_at);
CREATE INDEX IF NOT EXISTS v2_audit_org_action_idx ON v2_audit_events(organization_id, action);

-- Defense-in-depth tenant policies. API repositories set app.organization_id and app.user_id
-- in the transaction before touching tenant-owned rows.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_memberships','v2_role_policies','v2_sessions','v2_email_verifications',
    'v2_workspace_hostnames','v2_workspace_branding','v2_subscriptions',
    'v2_entitlements','v2_usage_limits','v2_notification_preferences',
    'v2_notification_outbox','v2_notification_deliveries','v2_push_subscriptions',
    'v2_consent_records','v2_privacy_export_requests','v2_workspace_export_requests',
    'v2_erasure_review_requests','v2_audit_events','v2_observability_snapshots'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    IF t = 'v2_memberships' THEN
      EXECUTE 'CREATE POLICY v2_tenant_scope ON v2_memberships USING (organization_id::text = current_setting(''app.organization_id'', true) OR user_id::text = current_setting(''app.user_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))';
    ELSIF t = 'v2_sessions' THEN
      EXECUTE 'CREATE POLICY v2_tenant_scope ON v2_sessions USING (organization_id::text = current_setting(''app.organization_id'', true) OR token_verifier_hash = current_setting(''app.session_hash'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))';
    ELSIF t = 'v2_workspace_hostnames' THEN
      EXECUTE 'CREATE POLICY v2_tenant_scope ON v2_workspace_hostnames USING (organization_id::text = current_setting(''app.organization_id'', true) OR hostname = current_setting(''app.request_hostname'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))';
    ELSIF t = 'v2_email_verifications' THEN
      EXECUTE 'CREATE POLICY v2_tenant_scope ON v2_email_verifications USING (organization_id::text = current_setting(''app.organization_id'', true) OR token_hash = current_setting(''app.verification_hash'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))';
    ELSE
      EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE v2_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v2_org_scope ON v2_organizations;
CREATE POLICY v2_org_scope ON v2_organizations
  USING (v2_organizations.id::text = current_setting('app.organization_id', true) OR EXISTS (SELECT 1 FROM v2_memberships m WHERE m.organization_id = v2_organizations.id AND m.user_id::text = current_setting('app.user_id', true)))
  WITH CHECK (id::text = current_setting('app.organization_id', true));

ALTER TABLE v2_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v2_user_scope ON v2_users;
CREATE POLICY v2_user_scope ON v2_users
  USING (id::text = current_setting('app.user_id', true) OR lower(email) = lower(current_setting('app.login_email', true)))
  WITH CHECK (id::text = current_setting('app.user_id', true));

CREATE OR REPLACE FUNCTION v2_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'V2_AUDIT_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS v2_audit_append_only ON v2_audit_events;
CREATE TRIGGER v2_audit_append_only
  BEFORE UPDATE OR DELETE ON v2_audit_events
  FOR EACH ROW EXECUTE FUNCTION v2_reject_audit_mutation();
REVOKE UPDATE, DELETE ON v2_audit_events FROM PUBLIC;
