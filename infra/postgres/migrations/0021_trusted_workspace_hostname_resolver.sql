-- Staging tenant routing requires a minimal trusted hostname lookup before an
-- organization context exists. This function deliberately returns only the
-- active organization id for one exact hostname; all tenant data remains
-- protected by normal RLS after the router establishes that context.
CREATE OR REPLACE FUNCTION public.v2_resolve_active_workspace_hostname(p_hostname TEXT)
RETURNS TABLE (organization_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT hostname.organization_id
  FROM public.v2_workspace_hostnames AS hostname
  INNER JOIN public.v2_organizations AS organization
    ON organization.id = hostname.organization_id
  WHERE hostname.hostname = lower(btrim(p_hostname))
    AND hostname.status = 'ACTIVE'
    AND organization.status = 'ACTIVE'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.v2_resolve_active_workspace_hostname(TEXT) FROM PUBLIC;

-- Local disposable-RLS verification creates v2_app after the migration chain
-- in some runs. The staging runtime-role configurator grants the same narrow
-- privilege explicitly after applying the current chain.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.v2_resolve_active_workspace_hostname(TEXT) TO v2_app';
  END IF;
END $$;
