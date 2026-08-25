-- Harden global platform configuration and scientific provenance registries.
-- A governed NOLOGIN role authorizes bounded server reads. Table owners retain
-- migration-only INSERT/UPDATE access under FORCE RLS; clients never do.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_platform_registry_reader') THEN
    CREATE ROLE v2_platform_registry_reader
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'v2_platform_registry_reader'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)
  ) THEN
    RAISE EXCEPTION 'v2_platform_registry_reader exists with unsafe attributes';
  END IF;
END $$;

DO $$
DECLARE
  table_name TEXT;
  table_owner TEXT;
  plan_function_owner TEXT;
  read_expression TEXT;
BEGIN
  SELECT pg_get_userbyid(p.proowner)
  INTO plan_function_owner
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'v2_platform_assign_workspace_plan'
    AND pg_get_function_identity_arguments(p.oid) = 'p_organization_id text, p_plan_id text, p_ends_at timestamp with time zone';

  IF plan_function_owner IS NULL THEN
    RAISE EXCEPTION 'v2_platform_assign_workspace_plan owner could not be resolved';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'v2_plans',
    'v2_scientific_component_pins',
    'v2_model_component_pins'
  ] LOOP
    SELECT pg_get_userbyid(c.relowner)
    INTO table_owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = table_name AND c.relkind IN ('r', 'p');

    IF table_owner IS NULL THEN
      RAISE EXCEPTION 'platform registry table owner could not be resolved: %', table_name;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS v2_platform_registry_runtime_read ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS v2_platform_registry_admin_insert ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS v2_platform_registry_admin_update ON public.%I', table_name);

    read_expression := format(
      'pg_has_role(current_user, %L, ''MEMBER'') OR pg_has_role(current_user, %L, ''MEMBER'')',
      'v2_platform_registry_reader',
      table_owner
    );
    IF table_name = 'v2_plans' AND plan_function_owner <> table_owner THEN
      read_expression := read_expression || format(
        ' OR pg_has_role(current_user, %L, ''MEMBER'')',
        plan_function_owner
      );
      EXECUTE format('GRANT SELECT ON TABLE public.v2_plans TO %I', plan_function_owner);
    END IF;

    EXECUTE format(
      'CREATE POLICY v2_platform_registry_runtime_read ON public.%I FOR SELECT TO PUBLIC USING (%s)',
      table_name,
      read_expression
    );
    EXECUTE format(
      'CREATE POLICY v2_platform_registry_admin_insert ON public.%I FOR INSERT TO %I WITH CHECK (pg_has_role(current_user, %L, ''MEMBER''))',
      table_name,
      table_owner,
      table_owner
    );
    EXECUTE format(
      'CREATE POLICY v2_platform_registry_admin_update ON public.%I FOR UPDATE TO %I USING (pg_has_role(current_user, %L, ''MEMBER'')) WITH CHECK (pg_has_role(current_user, %L, ''MEMBER''))',
      table_name,
      table_owner,
      table_owner,
      table_owner
    );
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON TABLE
  public.v2_plans,
  public.v2_scientific_component_pins,
  public.v2_model_component_pins
FROM PUBLIC;

GRANT SELECT ON TABLE
  public.v2_plans,
  public.v2_scientific_component_pins,
  public.v2_model_component_pins
TO v2_platform_registry_reader;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.v2_plans, public.v2_scientific_component_pins, public.v2_model_component_pins FROM %I',
        role_name
      );
      EXECUTE format('REVOKE v2_platform_registry_reader FROM %I', role_name);
    END IF;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['v2_app', 'hyperdrive_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.v2_plans, public.v2_scientific_component_pins, public.v2_model_component_pins FROM %I',
        role_name
      );
      EXECUTE format(
        'GRANT SELECT ON TABLE public.v2_plans, public.v2_scientific_component_pins, public.v2_model_component_pins TO %I',
        role_name
      );
      EXECUTE format('GRANT v2_platform_registry_reader TO %I', role_name);
    END IF;
  END LOOP;
END $$;

COMMENT ON ROLE v2_platform_registry_reader IS
  'NOLOGIN policy-membership role for read-only V2 platform registry access.';
COMMENT ON TABLE public.v2_plans IS
  'Platform-owned plan configuration. Runtime read-only; mutations are migration/admin controlled.';
COMMENT ON TABLE public.v2_scientific_component_pins IS
  'Global append-only scientific provenance registry. Runtime read-only; mutations are migration/admin controlled.';
COMMENT ON TABLE public.v2_model_component_pins IS
  'Global append-only model provenance registry. Runtime read-only; mutations are migration/admin controlled.';