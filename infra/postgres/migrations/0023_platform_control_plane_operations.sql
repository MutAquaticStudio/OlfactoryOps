-- Platform control-plane operations remain bounded server-side calls. They do
-- not grant the Hyperdrive role global table access or BYPASSRLS.

CREATE TABLE IF NOT EXISTS v2_platform_mutation_receipts (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  route_key TEXT NOT NULL CHECK (route_key ~ '^[a-z][a-z0-9_.]{2,120}$'),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 200),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_platform_mutation_receipt_unique UNIQUE (actor_user_id, route_key, idempotency_key)
);

CREATE TABLE IF NOT EXISTS v2_platform_workspace_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE RESTRICT,
  request_kind TEXT NOT NULL CHECK (request_kind IN ('WORKSPACE_EXPORT','ERASURE_REVIEW','HOSTNAME_REFRESH')),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','NOT_CONFIGURED','COMPLETED','CANCELLED')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  requested_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 200),
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_platform_workspace_request_unique UNIQUE (organization_id, request_kind, requested_by, idempotency_key)
);

CREATE INDEX IF NOT EXISTS v2_platform_mutation_receipts_actor_created_idx
  ON v2_platform_mutation_receipts (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_platform_workspace_requests_org_created_idx
  ON v2_platform_workspace_requests (organization_id, created_at DESC);

ALTER TABLE v2_platform_mutation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_platform_mutation_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE v2_platform_workspace_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_platform_workspace_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v2_platform_mutation_receipts_policy ON v2_platform_mutation_receipts;
CREATE POLICY v2_platform_mutation_receipts_policy ON v2_platform_mutation_receipts FOR ALL
  USING (actor_user_id = v2_platform_current_user_id())
  WITH CHECK (actor_user_id = v2_platform_current_user_id());

DROP POLICY IF EXISTS v2_platform_workspace_requests_policy ON v2_platform_workspace_requests;
CREATE POLICY v2_platform_workspace_requests_policy ON v2_platform_workspace_requests FOR ALL
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR']))
  WITH CHECK (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']));

-- Platform evidence is append-only. Requests have a lifecycle, but audit,
-- mutation receipts, and tenant-state history are immutable facts.
DROP TRIGGER IF EXISTS v2_platform_audit_events_append_only ON v2_platform_audit_events;
CREATE TRIGGER v2_platform_audit_events_append_only BEFORE UPDATE OR DELETE ON v2_platform_audit_events
  FOR EACH ROW EXECUTE FUNCTION v2_reject_audit_mutation();
DROP TRIGGER IF EXISTS v2_platform_tenant_state_events_append_only ON v2_platform_tenant_state_events;
CREATE TRIGGER v2_platform_tenant_state_events_append_only BEFORE UPDATE OR DELETE ON v2_platform_tenant_state_events
  FOR EACH ROW EXECUTE FUNCTION v2_reject_audit_mutation();
DROP TRIGGER IF EXISTS v2_platform_mutation_receipts_append_only ON v2_platform_mutation_receipts;
CREATE TRIGGER v2_platform_mutation_receipts_append_only BEFORE UPDATE OR DELETE ON v2_platform_mutation_receipts
  FOR EACH ROW EXECUTE FUNCTION v2_reject_audit_mutation();

CREATE OR REPLACE FUNCTION v2_platform_require_role(p_roles TEXT[])
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT v2_platform_has_role(p_roles) THEN
    RAISE EXCEPTION 'platform authorization denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION v2_platform_workspace_directory(p_search TEXT DEFAULT '')
RETURNS TABLE (
  id TEXT, name TEXT, slug TEXT, status TEXT, created_at TIMESTAMPTZ,
  hostname TEXT, members INTEGER, sessions INTEGER, plan_id TEXT, plan_name TEXT,
  subscription_status TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR']);
  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.status, o.created_at,
    (SELECT h.hostname FROM v2_workspace_hostnames h WHERE h.organization_id = o.id AND h.kind = 'DEFAULT' ORDER BY h.created_at ASC LIMIT 1),
    (SELECT count(*)::int FROM v2_memberships m WHERE m.organization_id = o.id AND m.status = 'ACTIVE'),
    (SELECT count(*)::int FROM v2_sessions s WHERE s.organization_id = o.id AND s.revoked_at IS NULL),
    (SELECT s.plan_id FROM v2_subscriptions s WHERE s.organization_id = o.id ORDER BY s.started_at DESC LIMIT 1),
    (SELECT p.name FROM v2_subscriptions s JOIN v2_plans p ON p.id = s.plan_id WHERE s.organization_id = o.id ORDER BY s.started_at DESC LIMIT 1),
    (SELECT s.status FROM v2_subscriptions s WHERE s.organization_id = o.id ORDER BY s.started_at DESC LIMIT 1)
  FROM v2_organizations o
  WHERE (coalesce(trim(p_search), '') = '' OR o.name ILIKE '%' || trim(p_search) || '%' OR o.slug ILIKE '%' || trim(p_search) || '%')
  ORDER BY o.created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION v2_platform_workspace_detail(p_organization_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result JSONB;
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR']);
  SELECT jsonb_build_object(
    'workspace', jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'status', o.status, 'createdAt', o.created_at),
    'hostnames', COALESCE((SELECT jsonb_agg(jsonb_build_object('hostname', h.hostname, 'kind', h.kind, 'status', h.status, 'validationStatus', h.validation_status, 'sslStatus', h.ssl_status) ORDER BY h.created_at)
      FROM v2_workspace_hostnames h WHERE h.organization_id = o.id), '[]'::jsonb),
    'plan', COALESCE((SELECT jsonb_build_object('id', p.id, 'name', p.name, 'billingMode', p.billing_mode, 'status', s.status, 'endsAt', s.ends_at)
      FROM v2_subscriptions s JOIN v2_plans p ON p.id = s.plan_id WHERE s.organization_id = o.id ORDER BY s.started_at DESC LIMIT 1), '{}'::jsonb),
    'entitlements', COALESCE((SELECT jsonb_object_agg(e.capability, jsonb_build_object('enabled', e.enabled, 'source', e.source, 'expiresAt', e.expires_at))
      FROM v2_entitlements e WHERE e.organization_id = o.id), '{}'::jsonb),
    'limits', COALESCE((SELECT jsonb_object_agg(l.key, jsonb_build_object('value', l.value, 'used', l.used, 'period', l.period))
      FROM v2_usage_limits l WHERE l.organization_id = o.id), '{}'::jsonb),
    'requestSummary', COALESCE((SELECT jsonb_object_agg(r.request_kind, r.status)
      FROM (SELECT DISTINCT ON (request_kind) request_kind, status FROM v2_platform_workspace_requests WHERE organization_id = o.id ORDER BY request_kind, created_at DESC) r), '{}'::jsonb)
  ) INTO result
  FROM v2_organizations o WHERE o.id = p_organization_id;
  IF result IS NULL THEN RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION v2_platform_overview_snapshot()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR']);
  RETURN jsonb_build_object(
    'activeWorkspaces', (SELECT count(*)::int FROM v2_organizations WHERE status = 'ACTIVE'),
    'suspendedWorkspaces', (SELECT count(*)::int FROM v2_organizations WHERE status = 'SUSPENDED'),
    'archivedWorkspaces', (SELECT count(*)::int FROM v2_organizations WHERE status = 'ARCHIVED'),
    'activeUsers', (SELECT count(*)::int FROM v2_users WHERE status = 'ACTIVE'),
    'activeSessions', (SELECT count(*)::int FROM v2_sessions WHERE revoked_at IS NULL AND absolute_expires_at > now()),
    'pendingPrivacyReviews', (SELECT count(*)::int FROM v2_erasure_review_requests WHERE status IN ('REQUESTED','REVIEW_REQUIRED')),
    'pendingWorkspaceRequests', (SELECT count(*)::int FROM v2_platform_workspace_requests WHERE status IN ('REQUESTED','NOT_CONFIGURED'))
  );
END;
$$;

CREATE OR REPLACE FUNCTION v2_platform_revoke_workspace_sessions(p_organization_id TEXT, p_reason TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE affected INTEGER;
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN']);
  IF length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'invalid reason' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM v2_organizations WHERE id = p_organization_id) THEN RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = 'PLATFORM_REVOKE:' || left(trim(p_reason), 160)
   WHERE organization_id = p_organization_id AND revoked_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION v2_platform_request_workspace_action(p_organization_id TEXT, p_kind TEXT, p_reason TEXT, p_idempotency_key TEXT, p_correlation_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE request_id TEXT;
DECLARE current_status TEXT;
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN']);
  IF p_kind NOT IN ('WORKSPACE_EXPORT','ERASURE_REVIEW','HOSTNAME_REFRESH') OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'invalid workspace request' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM v2_organizations WHERE id = p_organization_id) THEN RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002'; END IF;
  SELECT id, status INTO request_id, current_status FROM v2_platform_workspace_requests
   WHERE organization_id = p_organization_id AND request_kind = p_kind AND requested_by = v2_platform_current_user_id() AND idempotency_key = p_idempotency_key;
  IF request_id IS NULL THEN
    request_id := 'pwr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
    current_status := CASE WHEN p_kind = 'HOSTNAME_REFRESH' THEN 'NOT_CONFIGURED' ELSE 'REQUESTED' END;
    INSERT INTO v2_platform_workspace_requests (id, organization_id, request_kind, status, reason, requested_by, idempotency_key, correlation_id)
      VALUES (request_id, p_organization_id, p_kind, current_status, trim(p_reason), v2_platform_current_user_id(), p_idempotency_key, p_correlation_id);
  END IF;
  RETURN jsonb_build_object('id', request_id, 'organizationId', p_organization_id, 'kind', p_kind, 'status', current_status);
END;
$$;

CREATE OR REPLACE FUNCTION v2_platform_set_workspace_entitlement(p_organization_id TEXT, p_capability TEXT, p_enabled BOOLEAN, p_expires_at TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE entitlement_id TEXT;
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']);
  IF p_capability !~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$' THEN RAISE EXCEPTION 'invalid capability' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM v2_organizations WHERE id = p_organization_id) THEN RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002'; END IF;
  entitlement_id := 'ent_platform_' || substr(md5(p_organization_id || p_capability), 1, 20);
  INSERT INTO v2_entitlements (id, organization_id, capability, enabled, source, expires_at)
    VALUES (entitlement_id, p_organization_id, p_capability, p_enabled, 'PLATFORM', p_expires_at)
    ON CONFLICT (organization_id, capability) DO UPDATE SET enabled = EXCLUDED.enabled, source = 'PLATFORM', expires_at = EXCLUDED.expires_at;
  INSERT INTO v2_platform_feature_overrides (id, organization_id, capability, enabled, source, expires_at, updated_by)
    VALUES ('pfo_' || substr(md5(p_organization_id || p_capability), 1, 24), p_organization_id, p_capability, p_enabled, 'PLATFORM', p_expires_at, v2_platform_current_user_id())
    ON CONFLICT (organization_id, capability) DO UPDATE SET enabled = EXCLUDED.enabled, source = 'PLATFORM', expires_at = EXCLUDED.expires_at, updated_by = EXCLUDED.updated_by, version = v2_platform_feature_overrides.version + 1, updated_at = now();
  RETURN jsonb_build_object('organizationId', p_organization_id, 'capability', p_capability, 'enabled', p_enabled, 'expiresAt', p_expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION v2_platform_assign_workspace_plan(p_organization_id TEXT, p_plan_id TEXT, p_ends_at TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE plan_row RECORD;
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']);
  SELECT id, name, billing_mode, capabilities, limits INTO plan_row FROM v2_plans WHERE id = p_plan_id AND active = true;
  IF plan_row.id IS NULL THEN RAISE EXCEPTION 'active plan not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM v2_organizations WHERE id = p_organization_id) THEN RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO v2_subscriptions (id, organization_id, plan_id, status, started_at, ends_at)
    VALUES ('sub_platform_' || substr(md5(p_organization_id || p_plan_id || clock_timestamp()::text), 1, 20), p_organization_id, p_plan_id, 'MANAGED_BETA', now(), p_ends_at);
  UPDATE v2_entitlements SET enabled = false, source = 'PLATFORM_PLAN'
   WHERE organization_id = p_organization_id AND source IN ('MANAGED_BETA','PLATFORM_PLAN')
     AND capability NOT IN (SELECT jsonb_array_elements_text(plan_row.capabilities));
  INSERT INTO v2_entitlements (id, organization_id, capability, enabled, source)
    SELECT 'ent_plan_' || substr(md5(p_organization_id || feature), 1, 20), p_organization_id, feature, true, 'PLATFORM_PLAN'
    FROM jsonb_array_elements_text(plan_row.capabilities) AS feature
    ON CONFLICT (organization_id, capability) DO UPDATE SET enabled = true, source = 'PLATFORM_PLAN', expires_at = NULL;
  INSERT INTO v2_usage_limits (id, organization_id, key, value, period, used)
    SELECT 'limit_plan_' || substr(md5(p_organization_id || entry.key), 1, 20), p_organization_id, entry.key, (entry.value)::integer, 'LIFETIME', 0
    FROM jsonb_each_text(plan_row.limits) AS entry(key, value)
    WHERE entry.value ~ '^[0-9]+$'
    ON CONFLICT (organization_id, key, period) DO UPDATE SET value = EXCLUDED.value, used = LEAST(v2_usage_limits.used, EXCLUDED.value);
  RETURN jsonb_build_object('organizationId', p_organization_id, 'planId', plan_row.id, 'planName', plan_row.name, 'billingMode', plan_row.billing_mode, 'endsAt', p_ends_at);
END;
$$;

CREATE OR REPLACE FUNCTION v2_platform_set_workspace_limit(p_organization_id TEXT, p_key TEXT, p_value INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']);
  IF p_key !~ '^[a-z][a-z0-9_.]{1,119}$' OR p_value < 0 OR p_value > 1000000000 THEN
    RAISE EXCEPTION 'invalid usage limit' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM v2_organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO v2_usage_limits (id, organization_id, key, value, period, used)
    VALUES ('limit_platform_' || substr(md5(p_organization_id || p_key), 1, 20), p_organization_id, p_key, p_value, 'LIFETIME', 0)
    ON CONFLICT (organization_id, key, period) DO UPDATE SET value = EXCLUDED.value, used = LEAST(v2_usage_limits.used, EXCLUDED.value);
  RETURN jsonb_build_object('organizationId', p_organization_id, 'key', p_key, 'value', p_value, 'period', 'LIFETIME');
END;
$$;

CREATE OR REPLACE FUNCTION v2_platform_set_operator_status(p_operator_id TEXT, p_next_status TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target_user_id TEXT;
DECLARE target_role TEXT;
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER']);
  IF p_next_status NOT IN ('ACTIVE','DISABLED') THEN RAISE EXCEPTION 'invalid operator status' USING ERRCODE = '22023'; END IF;
  SELECT user_id, role_key INTO target_user_id, target_role FROM v2_platform_operators WHERE id = p_operator_id FOR UPDATE;
  IF target_user_id IS NULL THEN RAISE EXCEPTION 'operator not found' USING ERRCODE = 'P0002'; END IF;
  IF target_user_id = v2_platform_current_user_id() THEN RAISE EXCEPTION 'self status rotation is denied' USING ERRCODE = '42501'; END IF;
  IF target_role = 'PLATFORM_OWNER' AND p_next_status = 'DISABLED' AND (SELECT count(*) FROM v2_platform_operators WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE') <= 1 THEN
    RAISE EXCEPTION 'last platform owner cannot be disabled' USING ERRCODE = '23514';
  END IF;
  UPDATE v2_platform_operators SET status = p_next_status, updated_at = now() WHERE id = p_operator_id;
  IF p_next_status = 'DISABLED' THEN
    UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = 'PLATFORM_OPERATOR_DISABLED' WHERE user_id = target_user_id AND revoked_at IS NULL;
  END IF;
  RETURN jsonb_build_object('id', p_operator_id, 'status', p_next_status);
END;
$$;

CREATE OR REPLACE FUNCTION v2_platform_set_operator_role(p_operator_id TEXT, p_next_role TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target_user_id TEXT;
DECLARE target_role TEXT;
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER']);
  IF p_next_role NOT IN ('PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR') THEN
    RAISE EXCEPTION 'invalid platform operator role' USING ERRCODE = '22023';
  END IF;
  SELECT user_id, role_key INTO target_user_id, target_role FROM v2_platform_operators WHERE id = p_operator_id FOR UPDATE;
  IF target_user_id IS NULL THEN RAISE EXCEPTION 'operator not found' USING ERRCODE = 'P0002'; END IF;
  IF target_user_id = v2_platform_current_user_id() THEN RAISE EXCEPTION 'self role rotation is denied' USING ERRCODE = '42501'; END IF;
  IF target_role = 'PLATFORM_OWNER' AND p_next_role <> 'PLATFORM_OWNER'
     AND (SELECT count(*) FROM v2_platform_operators WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE') <= 1 THEN
    RAISE EXCEPTION 'last platform owner cannot be demoted' USING ERRCODE = '23514';
  END IF;
  UPDATE v2_platform_operators SET role_key = p_next_role, updated_at = now() WHERE id = p_operator_id;
  RETURN jsonb_build_object('id', p_operator_id, 'role', p_next_role);
END;
$$;

-- The core tables retain their tenant policies. These narrowly scoped,
-- additive policies permit only an authenticated Platform Operator to read the
-- metadata used by the control plane, and only the bounded security-definer
-- procedures above to change state. Formula, scientific, document, and other
-- tenant-IP tables receive no platform-wide policy.
DROP POLICY IF EXISTS v2_platform_org_directory_read ON v2_organizations;
CREATE POLICY v2_platform_org_directory_read ON v2_organizations FOR SELECT
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR']));
DROP POLICY IF EXISTS v2_platform_org_lifecycle_write ON v2_organizations;
CREATE POLICY v2_platform_org_lifecycle_write ON v2_organizations FOR UPDATE
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN']))
  WITH CHECK (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN']));
DROP POLICY IF EXISTS v2_platform_user_metadata_read ON v2_users;
CREATE POLICY v2_platform_user_metadata_read ON v2_users FOR SELECT
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR']));
DROP POLICY IF EXISTS v2_platform_membership_metadata_read ON v2_memberships;
CREATE POLICY v2_platform_membership_metadata_read ON v2_memberships FOR SELECT
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR']));
DROP POLICY IF EXISTS v2_platform_session_metadata_read ON v2_sessions;
CREATE POLICY v2_platform_session_metadata_read ON v2_sessions FOR SELECT
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SECURITY_AUDITOR']));
DROP POLICY IF EXISTS v2_platform_session_revoke ON v2_sessions;
CREATE POLICY v2_platform_session_revoke ON v2_sessions FOR UPDATE
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN']))
  WITH CHECK (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN']));
DROP POLICY IF EXISTS v2_platform_hostname_metadata_read ON v2_workspace_hostnames;
CREATE POLICY v2_platform_hostname_metadata_read ON v2_workspace_hostnames FOR SELECT
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR']));
DROP POLICY IF EXISTS v2_platform_subscription_metadata_read ON v2_subscriptions;
CREATE POLICY v2_platform_subscription_metadata_read ON v2_subscriptions FOR SELECT
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_SECURITY_AUDITOR']));
DROP POLICY IF EXISTS v2_platform_entitlement_metadata_read ON v2_entitlements;
CREATE POLICY v2_platform_entitlement_metadata_read ON v2_entitlements FOR SELECT
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']));
DROP POLICY IF EXISTS v2_platform_entitlement_write ON v2_entitlements;
CREATE POLICY v2_platform_entitlement_write ON v2_entitlements FOR ALL
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']))
  WITH CHECK (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']));
DROP POLICY IF EXISTS v2_platform_limit_metadata_read ON v2_usage_limits;
CREATE POLICY v2_platform_limit_metadata_read ON v2_usage_limits FOR SELECT
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']));
DROP POLICY IF EXISTS v2_platform_limit_write ON v2_usage_limits;
CREATE POLICY v2_platform_limit_write ON v2_usage_limits FOR ALL
  USING (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']))
  WITH CHECK (v2_platform_has_role(ARRAY['PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_BILLING']));

REVOKE ALL ON FUNCTION v2_platform_require_role(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_platform_workspace_directory(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_platform_workspace_detail(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_platform_overview_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_platform_revoke_workspace_sessions(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_platform_request_workspace_action(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_platform_set_workspace_entitlement(TEXT, TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_platform_assign_workspace_plan(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_platform_set_workspace_limit(TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_platform_set_operator_status(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION v2_platform_set_operator_role(TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    GRANT EXECUTE ON FUNCTION v2_platform_workspace_directory(TEXT), v2_platform_workspace_detail(TEXT), v2_platform_overview_snapshot(), v2_platform_revoke_workspace_sessions(TEXT, TEXT), v2_platform_request_workspace_action(TEXT, TEXT, TEXT, TEXT, TEXT), v2_platform_set_workspace_entitlement(TEXT, TEXT, BOOLEAN, TIMESTAMPTZ), v2_platform_assign_workspace_plan(TEXT, TEXT, TIMESTAMPTZ), v2_platform_set_workspace_limit(TEXT, TEXT, INTEGER), v2_platform_set_operator_status(TEXT, TEXT), v2_platform_set_operator_role(TEXT, TEXT) TO v2_app;
  END IF;
END $$;
