-- Phase 3: isolated scientific structure and feature artifacts.
-- V2 PostgreSQL remains authoritative. Legacy D1 migrations remain untouched.

ALTER TABLE v2_molecular_identities ADD COLUMN IF NOT EXISTS inchi TEXT;
ALTER TABLE v2_molecular_identities ADD COLUMN IF NOT EXISTS input_hash TEXT;
ALTER TABLE v2_molecular_identities ADD COLUMN IF NOT EXISTS output_hash TEXT;
ALTER TABLE v2_molecular_identities ADD COLUMN IF NOT EXISTS standardization_version TEXT;
ALTER TABLE v2_molecular_identities ADD COLUMN IF NOT EXISTS molecular_graph JSONB;
ALTER TABLE v2_molecular_identities ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS v2_scientific_component_pins (
  component_key TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  license TEXT NOT NULL,
  upstream_ref TEXT NOT NULL,
  upstream_commit TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  runtime_version TEXT NOT NULL,
  patch_status TEXT NOT NULL,
  compatibility_test TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (component_key IN ('RDKIT','BCFP','MOLFTP','OSMORDRED','RDKIT_PYPI'))
);

CREATE TABLE IF NOT EXISTS v2_scientific_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  requested_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  operation TEXT NOT NULL CHECK (operation IN ('STRUCTURE_NORMALIZE','FEATURE_GENERATE')),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','RETRYING','SUCCEEDED','FAILED','CANCELLED','BLOCKED')),
  request_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  runtime_version TEXT,
  component_manifest_hash TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (organization_id, requested_by, operation, idempotency_key)
);

CREATE TABLE IF NOT EXISTS v2_scientific_artifacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  job_id TEXT NOT NULL REFERENCES v2_scientific_jobs(id) ON DELETE RESTRICT,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('STRUCTURE','ECFP','BCFP','MOLFTP','OSMORDRED')),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','REVIEW_REQUIRED','NOT_EVALUATED','NOT_ENOUGH_EVIDENCE','NOT_CONFIGURED','BLOCKED')),
  schema_version TEXT NOT NULL,
  component_key TEXT NOT NULL,
  component_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  storage_ref TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, artifact_kind)
);

CREATE INDEX IF NOT EXISTS v2_scientific_jobs_lookup_idx ON v2_scientific_jobs(organization_id, material_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_scientific_artifacts_lookup_idx ON v2_scientific_artifacts(organization_id, material_id, artifact_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_molecular_identities_structure_hash_idx ON v2_molecular_identities(organization_id, structure_hash) WHERE structure_hash IS NOT NULL;

INSERT INTO v2_scientific_component_pins (component_key, repository, license, upstream_ref, upstream_commit, adapter_version, runtime_version, patch_status, compatibility_test, manifest_hash)
VALUES
  ('RDKIT', 'https://github.com/rdkit/rdkit', 'BSD-3-Clause', 'Release_2026_03_5', 'de8add1e32ff6d3c4e4e406f64b703b662dff1d6', 'structure-adapter/1.0.0', 'rdkit=2026.3.5', 'NONE', 'scientific_runtime.tests.test_rdkit', 'c1a0d70cafc7857223a904e12886ff2aaf82b7a1223160649f81872376b59d54'),
  ('RDKIT_PYPI', 'https://github.com/osmoai/rdkit-pypi', 'BSD-3-Clause', 'commit:7893ac5053c9db20761767d02085a13594778eee', '7893ac5053c9db20761767d02085a13594778eee', 'wheel-reference/1.0.0', 'rdkit=2026.3.5', 'NONE', 'scientific_runtime.tests.test_rdkit', 'd5dc51ba06c9f479bd413dbb9bc245b0aab04228eb03e1b649ba0004bf22196d'),
  ('BCFP', 'https://github.com/osmoai/bcfp', 'BSD-3-Clause', 'commit:4753262e2ae6eb231be318c40623c8ab166d8ec5', '4753262e2ae6eb231be318c40623c8ab166d8ec5', 'bcfp-adapter/1.0.0', 'conda-forge rdkit=2026.03', 'NONE', 'scientific_runtime.tests.test_bcfp', 'b8f0044e82fbb78b2ab179c8e3f57ddea12aac49c5ec35793c0d84bd6f38757b'),
  ('MOLFTP', 'https://github.com/osmoai/molftp', 'BSD-3-Clause', 'commit:98ffcb67ccfae9a0407f85f20cc76da49c784568', '98ffcb67ccfae9a0407f85f20cc76da49c784568', 'molftp-adapter/1.0.0', 'conda-forge rdkit=2026.03', 'NONE', 'scientific_runtime.tests.test_molftp', '2c21121be167adbb7f3a91f4a4516bb0aff6de56ed3101588f372910f453aaca'),
  ('OSMORDRED', 'https://github.com/osmoai/osmordred', 'BSD-3-Clause', 'commit:07b8d22f570712c6ab3527dde195aad42fef4679', '07b8d22f570712c6ab3527dde195aad42fef4679', 'osmordred-adapter/1.0.0', 'isolated rdkit=2023.09.3', 'PACKAGING_README_COPY_ONLY; ISOLATED_RDKIT_2023_09_3_RUNTIME', 'scientific_runtime.tests.test_osmordred', '170eeca477d43185df414b80bc169f2977a356ec04ceb2db4e6b4bf5ed6af92f')
ON CONFLICT (component_key) DO UPDATE SET
  repository = EXCLUDED.repository,
  license = EXCLUDED.license,
  upstream_ref = EXCLUDED.upstream_ref,
  upstream_commit = EXCLUDED.upstream_commit,
  adapter_version = EXCLUDED.adapter_version,
  runtime_version = EXCLUDED.runtime_version,
  patch_status = EXCLUDED.patch_status,
  compatibility_test = EXCLUDED.compatibility_test,
  manifest_hash = EXCLUDED.manifest_hash;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['v2_scientific_jobs','v2_scientific_artifacts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON v2_scientific_jobs, v2_scientific_artifacts TO v2_app';
    EXECUTE 'GRANT SELECT ON v2_scientific_component_pins TO v2_app';
  END IF;
END $$;
