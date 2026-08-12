-- Phase 10 production-control-plane foundation. Platform authority is wholly
-- separate from tenant membership and is never implemented by BYPASSRLS.

CREATE TABLE IF NOT EXISTS v2_platform_operators (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES v2_users(id) ON DELETE RESTRICT,
  role_key TEXT NOT NULL CHECK (role_key IN ('PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  mfa_required BOOLEAN NOT NULL DEFAULT true,
  totp_secret_ciphertext TEXT,
  created_by TEXT REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_platform_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 3 AND 160),
  outcome TEXT NOT NULL CHECK (outcome IN ('ALLOWED','DENIED','FAILED')),
  subject_type TEXT NOT NULL CHECK (length(subject_type) BETWEEN 1 AND 120),
  subject_id TEXT,
  reason TEXT,
  correlation_id TEXT NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT,
  payload_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_platform_feature_overrides (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES v2_organizations(id) ON DELETE CASCADE,
  capability TEXT NOT NULL CHECK (length(capability) BETWEEN 3 AND 160),
  enabled BOOLEAN NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('PLATFORM','SUPPORT','MIGRATION')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at TIMESTAMPTZ,
  updated_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_platform_feature_override_scope UNIQUE NULLS NOT DISTINCT (organization_id, capability)
);

CREATE TABLE IF NOT EXISTS v2_platform_tenant_state_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE RESTRICT,
  previous_status TEXT NOT NULL,
  next_status TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  actor_user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_platform_tenant_state_idempotency UNIQUE (actor_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS v2_platform_audit_events_created_idx ON v2_platform_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS v2_platform_audit_events_subject_idx ON v2_platform_audit_events (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_platform_tenant_state_events_org_idx ON v2_platform_tenant_state_events (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION v2_platform_current_user_id()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.platform_user_id', true), '')
$$;

CREATE OR REPLACE FUNCTION v2_platform_has_role(p_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM v2_platform_operators
    WHERE user_id = v2_platform_current_user_id()
      AND status = 'ACTIVE'
      AND role_key = ANY(p_roles)
  )
$$;

REVOKE ALL ON FUNCTION v2_platform_has_role(TEXT[]) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    GRANT EXECUTE ON FUNCTION v2_platform_has_role(TEXT[]) TO v2_app;
  END IF;
END $$;

ALTER TABLE v2_platform_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_platform_operators FORCE ROW LEVEL SECURITY;
ALTER TABLE v2_platform_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_platform_audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE v2_platform_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_platform_feature_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE v2_platform_tenant_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_platform_tenant_state_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v2_platform_operators_select ON v2_platform_operators;
CREATE POLICY v2_platform_operators_select ON v2_platform_operators FOR SELECT
  USING (user_id = v2_platform_current_user_id() OR v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SECURITY_AUDITOR']));
DROP POLICY IF EXISTS v2_platform_operators_modify ON v2_platform_operators;
CREATE POLICY v2_platform_operators_modify ON v2_platform_operators FOR ALL
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER']))
  WITH CHECK (v2_platform_has_role(ARRAY['PLATFORM_OWNER']));

DROP POLICY IF EXISTS v2_platform_audit_events_read ON v2_platform_audit_events;
CREATE POLICY v2_platform_audit_events_read ON v2_platform_audit_events FOR SELECT
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SECURITY_AUDITOR']));
DROP POLICY IF EXISTS v2_platform_audit_events_insert ON v2_platform_audit_events;
CREATE POLICY v2_platform_audit_events_insert ON v2_platform_audit_events FOR INSERT
  WITH CHECK (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR']));

DROP POLICY IF EXISTS v2_platform_feature_overrides_policy ON v2_platform_feature_overrides;
CREATE POLICY v2_platform_feature_overrides_policy ON v2_platform_feature_overrides FOR ALL
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']))
  WITH CHECK (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']));
DROP POLICY IF EXISTS v2_platform_tenant_state_events_policy ON v2_platform_tenant_state_events;
CREATE POLICY v2_platform_tenant_state_events_policy ON v2_platform_tenant_state_events FOR ALL
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SECURITY_AUDITOR']))
  WITH CHECK (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN']));

-- The runtime role calls only this bounded state transition. It can never use
-- global table visibility or arbitrary SQL as a substitute for this function.
CREATE OR REPLACE FUNCTION v2_platform_set_tenant_state(
  p_organization_id TEXT,
  p_next_status TEXT,
  p_reason TEXT,
  p_idempotency_key TEXT,
  p_correlation_id TEXT
) RETURNS TABLE (organization_id TEXT, status TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  previous TEXT;
BEGIN
  IF NOT v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN']) THEN
    RAISE EXCEPTION 'platform authorization denied' USING ERRCODE = '42501';
  END IF;
  IF p_next_status NOT IN ('ACTIVE','SUSPENDED','ARCHIVED') OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'invalid platform state transition' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO previous FROM v2_organizations WHERE id = p_organization_id FOR UPDATE;
  IF previous IS NULL THEN RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM v2_platform_tenant_state_events WHERE actor_user_id = v2_platform_current_user_id() AND idempotency_key = p_idempotency_key) THEN
    RETURN QUERY SELECT p_organization_id, (SELECT o.status FROM v2_organizations o WHERE o.id = p_organization_id);
    RETURN;
  END IF;
  UPDATE v2_organizations SET status = p_next_status WHERE id = p_organization_id;
  INSERT INTO v2_platform_tenant_state_events (id, organization_id, previous_status, next_status, reason, actor_user_id, idempotency_key, correlation_id)
  VALUES ('pte_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24), p_organization_id, previous, p_next_status, p_reason, v2_platform_current_user_id(), p_idempotency_key, p_correlation_id);
  RETURN QUERY SELECT p_organization_id, p_next_status;
END;
$$;
REVOKE ALL ON FUNCTION v2_platform_set_tenant_state(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    GRANT EXECUTE ON FUNCTION v2_platform_set_tenant_state(TEXT, TEXT, TEXT, TEXT, TEXT) TO v2_app;
  END IF;
END $$;
