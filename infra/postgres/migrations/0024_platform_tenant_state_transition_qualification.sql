-- Qualify every relation reference in the bounded platform lifecycle procedure.
-- The return-table field names are PL/pgSQL variables; unqualified references
-- can therefore become ambiguous at runtime under PostgreSQL.

CREATE OR REPLACE FUNCTION v2_platform_set_tenant_state(
  p_organization_id TEXT,
  p_next_status TEXT,
  p_reason TEXT,
  p_idempotency_key TEXT,
  p_correlation_id TEXT
) RETURNS TABLE (organization_id TEXT, status TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  previous_status TEXT;
  recorded_status TEXT;
BEGIN
  PERFORM v2_platform_require_role(ARRAY['PLATFORM_OWNER', 'PLATFORM_ADMIN']);
  IF p_next_status NOT IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED') OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'invalid platform state transition' USING ERRCODE = '22023';
  END IF;

  SELECT org.status
    INTO previous_status
    FROM public.v2_organizations AS org
   WHERE org.id = p_organization_id
   FOR UPDATE;
  IF previous_status IS NULL THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT org.status
    INTO recorded_status
    FROM public.v2_platform_tenant_state_events AS event
    JOIN public.v2_organizations AS org ON org.id = event.organization_id
   WHERE event.actor_user_id = v2_platform_current_user_id()
     AND event.idempotency_key = p_idempotency_key
   ORDER BY event.created_at DESC
   LIMIT 1;
  IF recorded_status IS NOT NULL THEN
    RETURN QUERY SELECT p_organization_id, recorded_status;
    RETURN;
  END IF;

  UPDATE public.v2_organizations AS org
     SET status = p_next_status,
         updated_at = now()
   WHERE org.id = p_organization_id;

  INSERT INTO public.v2_platform_tenant_state_events (
    id, organization_id, previous_status, next_status, reason, actor_user_id,
    idempotency_key, correlation_id
  ) VALUES (
    'pte_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    p_organization_id, previous_status, p_next_status, trim(p_reason),
    v2_platform_current_user_id(), p_idempotency_key, p_correlation_id
  );

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
