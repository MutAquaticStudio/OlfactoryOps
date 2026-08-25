-- Harden global platform configuration and scientific provenance registries.
-- These tables are migration/admin managed. Application runtimes read them,
-- but browser-facing database roles must never mutate their contents.

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'v2_plans',
    'v2_scientific_component_pins',
    'v2_model_component_pins'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS v2_platform_registry_runtime_read ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY v2_platform_registry_runtime_read ON public.%I FOR SELECT TO PUBLIC USING (current_user IN (''v2_app'', ''hyperdrive_user''))',
      table_name
    );
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON TABLE
  public.v2_plans,
  public.v2_scientific_component_pins,
  public.v2_model_component_pins
FROM PUBLIC;

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
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.v2_plans IS
  'Platform-owned plan configuration. Runtime read-only; mutations are migration/admin controlled.';
COMMENT ON TABLE public.v2_scientific_component_pins IS
  'Global append-only scientific provenance registry. Runtime read-only; mutations are migration/admin controlled.';
COMMENT ON TABLE public.v2_model_component_pins IS
  'Global append-only model provenance registry. Runtime read-only; mutations are migration/admin controlled.';
