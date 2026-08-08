-- Phase 4: tenant-scoped dataset and model registry.
-- This migration records provenance and reproducibility metadata only. It does
-- not import upstream datasets, store model weights, or activate prediction.

CREATE TABLE IF NOT EXISTS v2_model_component_pins (
  component_key TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  license TEXT NOT NULL,
  license_evidence_status TEXT NOT NULL CHECK (license_evidence_status IN ('VERIFIED','REVIEW_REQUIRED','BLOCKED')),
  upstream_ref TEXT NOT NULL,
  upstream_commit TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  patch_status TEXT NOT NULL DEFAULT 'NONE',
  compatibility_test TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (component_key IN ('KGCNN_KERAS_UNLOCKED','TRANSFORMER_CNN','OSMO_PUBLICATIONS'))
);

ALTER TABLE v2_model_component_pins ADD COLUMN IF NOT EXISTS patch_status TEXT NOT NULL DEFAULT 'NONE';

CREATE TABLE IF NOT EXISTS v2_datasets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  dataset_key TEXT NOT NULL CHECK (dataset_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  task TEXT NOT NULL CHECK (length(trim(task)) BETWEEN 1 AND 240),
  status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (status IN ('DRAFT','REVIEW_REQUIRED','APPROVED','ARCHIVED','BLOCKED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dataset_key)
);

CREATE TABLE IF NOT EXISTS v2_dataset_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  dataset_id TEXT NOT NULL REFERENCES v2_datasets(id) ON DELETE CASCADE,
  version TEXT NOT NULL CHECK (length(trim(version)) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (status IN ('REVIEW_REQUIRED','APPROVED','ARCHIVED','BLOCKED')),
  source_repository TEXT NOT NULL CHECK (length(trim(source_repository)) <= 2048),
  source_path TEXT,
  source_commit TEXT NOT NULL CHECK (length(trim(source_commit)) BETWEEN 1 AND 160),
  citation TEXT NOT NULL CHECK (length(trim(citation)) BETWEEN 1 AND 4000),
  source_version TEXT NOT NULL CHECK (length(trim(source_version)) BETWEEN 1 AND 160),
  schema_version TEXT NOT NULL CHECK (length(trim(schema_version)) BETWEEN 1 AND 120),
  content_checksum TEXT NOT NULL CHECK (content_checksum ~ '^[a-f0-9]{64}$'),
  material_universe_hash TEXT NOT NULL CHECK (material_universe_hash ~ '^[a-f0-9]{64}$'),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  review_notes TEXT,
  approved_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dataset_id, version),
  UNIQUE (organization_id, dataset_id, content_checksum)
);

CREATE TABLE IF NOT EXISTS v2_dataset_licenses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  dataset_version_id TEXT NOT NULL REFERENCES v2_dataset_versions(id) ON DELETE CASCADE,
  spdx_id TEXT NOT NULL CHECK (length(trim(spdx_id)) BETWEEN 1 AND 120),
  attribution TEXT NOT NULL CHECK (length(trim(attribution)) BETWEEN 1 AND 4000),
  usage_policy TEXT NOT NULL CHECK (length(trim(usage_policy)) BETWEEN 1 AND 4000),
  evidence_url TEXT,
  evidence_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (evidence_status IN ('VERIFIED','REVIEW_REQUIRED','BLOCKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dataset_version_id)
);

CREATE TABLE IF NOT EXISTS v2_dataset_transformations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  dataset_version_id TEXT NOT NULL REFERENCES v2_dataset_versions(id) ON DELETE CASCADE,
  transformation_key TEXT NOT NULL CHECK (length(trim(transformation_key)) BETWEEN 1 AND 120),
  transformation_version TEXT NOT NULL CHECK (length(trim(transformation_version)) BETWEEN 1 AND 120),
  code_ref TEXT NOT NULL CHECK (length(trim(code_ref)) BETWEEN 1 AND 2048),
  configuration_hash TEXT NOT NULL CHECK (configuration_hash ~ '^[a-f0-9]{64}$'),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash TEXT NOT NULL CHECK (output_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dataset_version_id, transformation_key, transformation_version, output_hash)
);

CREATE TABLE IF NOT EXISTS v2_dataset_artifacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  dataset_version_id TEXT NOT NULL REFERENCES v2_dataset_versions(id) ON DELETE CASCADE,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('MANIFEST','SPLIT','TRAINING','VALIDATION','TEST','LICENSE_EVIDENCE','METRICS')),
  storage_ref TEXT NOT NULL CHECK (length(trim(storage_ref)) BETWEEN 1 AND 2048),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  schema_version TEXT NOT NULL CHECK (length(trim(schema_version)) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dataset_version_id, artifact_kind, content_hash)
);

CREATE TABLE IF NOT EXISTS v2_model_architectures (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  architecture_key TEXT NOT NULL CHECK (architecture_key IN ('KGCNN','TRANSFORMER_CNN')),
  version TEXT NOT NULL CHECK (length(trim(version)) BETWEEN 1 AND 120),
  component_key TEXT NOT NULL REFERENCES v2_model_component_pins(component_key) ON DELETE RESTRICT,
  configuration_hash TEXT NOT NULL CHECK (configuration_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, architecture_key, version, configuration_hash)
);

CREATE TABLE IF NOT EXISTS v2_feature_contracts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  contract_key TEXT NOT NULL CHECK (length(trim(contract_key)) BETWEEN 1 AND 120),
  version TEXT NOT NULL CHECK (length(trim(version)) BETWEEN 1 AND 120),
  feature_kinds JSONB NOT NULL CHECK (jsonb_typeof(feature_kinds) = 'array'),
  schema_hash TEXT NOT NULL CHECK (schema_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, contract_key, version, schema_hash)
);

CREATE TABLE IF NOT EXISTS v2_models (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL CHECK (model_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  intended_use TEXT NOT NULL CHECK (length(trim(intended_use)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (status IN ('DRAFT','REVIEW_REQUIRED','APPROVED','ARCHIVED','BLOCKED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, model_key)
);

CREATE TABLE IF NOT EXISTS v2_model_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES v2_models(id) ON DELETE CASCADE,
  version TEXT NOT NULL CHECK (length(trim(version)) BETWEEN 1 AND 120),
  architecture_id TEXT NOT NULL REFERENCES v2_model_architectures(id) ON DELETE RESTRICT,
  feature_contract_id TEXT NOT NULL REFERENCES v2_feature_contracts(id) ON DELETE RESTRICT,
  training_task TEXT NOT NULL CHECK (length(trim(training_task)) BETWEEN 1 AND 500),
  stage TEXT NOT NULL DEFAULT 'RESEARCH' CHECK (stage IN ('RESEARCH','CANDIDATE','PRODUCTION','RETIRED')),
  status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (status IN ('DRAFT','REVIEW_REQUIRED','APPROVED','ARCHIVED','BLOCKED')),
  model_card JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, model_id, version)
);

CREATE TABLE IF NOT EXISTS v2_model_checkpoints (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  model_version_id TEXT NOT NULL REFERENCES v2_model_versions(id) ON DELETE CASCADE,
  storage_ref TEXT NOT NULL CHECK (length(trim(storage_ref)) BETWEEN 1 AND 2048),
  checkpoint_hash TEXT NOT NULL CHECK (checkpoint_hash ~ '^[a-f0-9]{64}$'),
  format TEXT NOT NULL CHECK (format IN ('KERAS','TENSORFLOW_SAVEDMODEL','H5','ONNX','OTHER')),
  status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK (status IN ('PENDING_VERIFICATION','VERIFIED','REVOKED','BLOCKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  UNIQUE (organization_id, model_version_id, checkpoint_hash)
);

CREATE TABLE IF NOT EXISTS v2_training_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  model_version_id TEXT NOT NULL REFERENCES v2_model_versions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','RUNNING','SUCCEEDED','FAILED','CANCELLED','BLOCKED')),
  seed INTEGER NOT NULL,
  split_strategy TEXT NOT NULL CHECK (split_strategy IN ('SCAFFOLD_GROUP','TIME_SPLIT')),
  split_manifest_hash TEXT NOT NULL CHECK (split_manifest_hash ~ '^[a-f0-9]{64}$'),
  configuration_hash TEXT NOT NULL CHECK (configuration_hash ~ '^[a-f0-9]{64}$'),
  leakage_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (leakage_status IN ('PENDING','PASS','FAIL','NOT_EVALUATED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (organization_id, model_version_id, split_manifest_hash, configuration_hash)
);

CREATE TABLE IF NOT EXISTS v2_training_dataset_relations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  training_run_id TEXT NOT NULL REFERENCES v2_training_runs(id) ON DELETE CASCADE,
  dataset_version_id TEXT NOT NULL REFERENCES v2_dataset_versions(id) ON DELETE RESTRICT,
  split_role TEXT NOT NULL CHECK (split_role IN ('TRAIN','VALIDATION','TEST')),
  split_artifact_hash TEXT NOT NULL CHECK (split_artifact_hash ~ '^[a-f0-9]{64}$'),
  group_set_hash TEXT NOT NULL CHECK (group_set_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, training_run_id, split_role),
  UNIQUE (organization_id, training_run_id, dataset_version_id, split_role)
);

CREATE TABLE IF NOT EXISTS v2_evaluation_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  model_version_id TEXT NOT NULL REFERENCES v2_model_versions(id) ON DELETE RESTRICT,
  training_run_id TEXT NOT NULL REFERENCES v2_training_runs(id) ON DELETE RESTRICT,
  dataset_version_id TEXT NOT NULL REFERENCES v2_dataset_versions(id) ON DELETE RESTRICT,
  protocol_version TEXT NOT NULL CHECK (length(trim(protocol_version)) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (status IN ('REVIEW_REQUIRED','APPROVED','BLOCKED')),
  leakage_status TEXT NOT NULL CHECK (leakage_status IN ('PASS','FAIL','NOT_EVALUATED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, model_version_id, training_run_id, dataset_version_id, protocol_version)
);

CREATE TABLE IF NOT EXISTS v2_model_metrics (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  evaluation_run_id TEXT NOT NULL REFERENCES v2_evaluation_runs(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL CHECK (metric_key ~ '^[a-z][a-z0-9_.-]{1,119}$'),
  metric_value DOUBLE PRECISION NOT NULL,
  unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, evaluation_run_id, metric_key)
);

-- RLS protects application queries, while these composite constraints protect
-- the same tenant boundary inside every stored relationship. The original
-- single-column foreign keys remain for identifier integrity; the composite
-- keys prevent a valid identifier from another organization being attached by
-- a future query that accidentally omits a parent tenant predicate.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_datasets_org_id_unique') THEN
    ALTER TABLE v2_datasets ADD CONSTRAINT v2_datasets_org_id_unique UNIQUE (organization_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_dataset_versions_org_id_unique') THEN
    ALTER TABLE v2_dataset_versions ADD CONSTRAINT v2_dataset_versions_org_id_unique UNIQUE (organization_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_models_org_id_unique') THEN
    ALTER TABLE v2_models ADD CONSTRAINT v2_models_org_id_unique UNIQUE (organization_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_architectures_org_id_unique') THEN
    ALTER TABLE v2_model_architectures ADD CONSTRAINT v2_model_architectures_org_id_unique UNIQUE (organization_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_feature_contracts_org_id_unique') THEN
    ALTER TABLE v2_feature_contracts ADD CONSTRAINT v2_feature_contracts_org_id_unique UNIQUE (organization_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_versions_org_id_unique') THEN
    ALTER TABLE v2_model_versions ADD CONSTRAINT v2_model_versions_org_id_unique UNIQUE (organization_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_training_runs_org_id_unique') THEN
    ALTER TABLE v2_training_runs ADD CONSTRAINT v2_training_runs_org_id_unique UNIQUE (organization_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_evaluation_runs_org_id_unique') THEN
    ALTER TABLE v2_evaluation_runs ADD CONSTRAINT v2_evaluation_runs_org_id_unique UNIQUE (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_dataset_versions_dataset_tenant_fk') THEN
    ALTER TABLE v2_dataset_versions ADD CONSTRAINT v2_dataset_versions_dataset_tenant_fk FOREIGN KEY (organization_id, dataset_id) REFERENCES v2_datasets(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_dataset_licenses_version_tenant_fk') THEN
    ALTER TABLE v2_dataset_licenses ADD CONSTRAINT v2_dataset_licenses_version_tenant_fk FOREIGN KEY (organization_id, dataset_version_id) REFERENCES v2_dataset_versions(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_dataset_transformations_version_tenant_fk') THEN
    ALTER TABLE v2_dataset_transformations ADD CONSTRAINT v2_dataset_transformations_version_tenant_fk FOREIGN KEY (organization_id, dataset_version_id) REFERENCES v2_dataset_versions(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_dataset_artifacts_version_tenant_fk') THEN
    ALTER TABLE v2_dataset_artifacts ADD CONSTRAINT v2_dataset_artifacts_version_tenant_fk FOREIGN KEY (organization_id, dataset_version_id) REFERENCES v2_dataset_versions(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_versions_model_tenant_fk') THEN
    ALTER TABLE v2_model_versions ADD CONSTRAINT v2_model_versions_model_tenant_fk FOREIGN KEY (organization_id, model_id) REFERENCES v2_models(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_versions_architecture_tenant_fk') THEN
    ALTER TABLE v2_model_versions ADD CONSTRAINT v2_model_versions_architecture_tenant_fk FOREIGN KEY (organization_id, architecture_id) REFERENCES v2_model_architectures(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_versions_feature_contract_tenant_fk') THEN
    ALTER TABLE v2_model_versions ADD CONSTRAINT v2_model_versions_feature_contract_tenant_fk FOREIGN KEY (organization_id, feature_contract_id) REFERENCES v2_feature_contracts(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_checkpoints_version_tenant_fk') THEN
    ALTER TABLE v2_model_checkpoints ADD CONSTRAINT v2_model_checkpoints_version_tenant_fk FOREIGN KEY (organization_id, model_version_id) REFERENCES v2_model_versions(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_training_runs_version_tenant_fk') THEN
    ALTER TABLE v2_training_runs ADD CONSTRAINT v2_training_runs_version_tenant_fk FOREIGN KEY (organization_id, model_version_id) REFERENCES v2_model_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_training_relations_run_tenant_fk') THEN
    ALTER TABLE v2_training_dataset_relations ADD CONSTRAINT v2_training_relations_run_tenant_fk FOREIGN KEY (organization_id, training_run_id) REFERENCES v2_training_runs(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_training_relations_dataset_tenant_fk') THEN
    ALTER TABLE v2_training_dataset_relations ADD CONSTRAINT v2_training_relations_dataset_tenant_fk FOREIGN KEY (organization_id, dataset_version_id) REFERENCES v2_dataset_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_evaluation_runs_model_tenant_fk') THEN
    ALTER TABLE v2_evaluation_runs ADD CONSTRAINT v2_evaluation_runs_model_tenant_fk FOREIGN KEY (organization_id, model_version_id) REFERENCES v2_model_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_evaluation_runs_training_tenant_fk') THEN
    ALTER TABLE v2_evaluation_runs ADD CONSTRAINT v2_evaluation_runs_training_tenant_fk FOREIGN KEY (organization_id, training_run_id) REFERENCES v2_training_runs(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_evaluation_runs_dataset_tenant_fk') THEN
    ALTER TABLE v2_evaluation_runs ADD CONSTRAINT v2_evaluation_runs_dataset_tenant_fk FOREIGN KEY (organization_id, dataset_version_id) REFERENCES v2_dataset_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_metrics_evaluation_tenant_fk') THEN
    ALTER TABLE v2_model_metrics ADD CONSTRAINT v2_model_metrics_evaluation_tenant_fk FOREIGN KEY (organization_id, evaluation_run_id) REFERENCES v2_evaluation_runs(organization_id, id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS v2_dataset_versions_lookup_idx ON v2_dataset_versions(organization_id, dataset_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_model_versions_lookup_idx ON v2_model_versions(organization_id, model_id, stage, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_training_runs_lookup_idx ON v2_training_runs(organization_id, model_version_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_evaluation_runs_lookup_idx ON v2_evaluation_runs(organization_id, model_version_id, status, created_at DESC);

INSERT INTO v2_model_component_pins (component_key, repository, license, license_evidence_status, upstream_ref, upstream_commit, adapter_version, patch_status, compatibility_test, manifest_hash)
VALUES
  ('KGCNN_KERAS_UNLOCKED', 'https://github.com/osmoai/kgcnn-keras-unlocked', 'MIT', 'VERIFIED', 'commit:24d8b61214405f855d8a893469dfc59c0ea6c075', '24d8b61214405f855d8a893469dfc59c0ea6c075', 'kgcnn-adapter/1.0.0', 'KERAS_CORE_0_1_7_SYMBOLIC_COMPAT_PATCH', 'model_runtime.tests.test_kgcnn_forward', 'ce6d435a20a05042632b7cb883f90f40ebe6f0a2180024621cda280befd48162'),
  ('TRANSFORMER_CNN', 'https://github.com/osmoai/transformer-CNN', 'MIT', 'REVIEW_REQUIRED', 'commit:4db725b5e549af7697215d8cc7a6e8a2a952dca5', '4db725b5e549af7697215d8cc7a6e8a2a952dca5', 'transformer-cnn-adapter/1.0.0', 'NONE', 'model_runtime.tests.test_transformer_cnn_forward', '3d9a1f25825f5b8b4d30b881232806703ad9c17bf494bf6203f6f65de126af3c'),
  ('OSMO_PUBLICATIONS', 'https://github.com/osmoai/publications', 'Apache-2.0 (code); CC-BY-4.0 (datasets)', 'VERIFIED', 'commit:5aa9d2cd06a9b4dcae8b5fce2ec5e5d0f763fbd8', '5aa9d2cd06a9b4dcae8b5fce2ec5e5d0f763fbd8', 'publication-dataset-adapter/1.0.0', 'NONE', 'model_dataset.tests.test_source_provenance', '0656fb3f35b5fdd097a8f74c46f9267da4c0561996074209eb22e6c5d348fae4')
ON CONFLICT (component_key) DO UPDATE SET
  repository = EXCLUDED.repository,
  license = EXCLUDED.license,
  license_evidence_status = EXCLUDED.license_evidence_status,
  upstream_ref = EXCLUDED.upstream_ref,
  upstream_commit = EXCLUDED.upstream_commit,
  adapter_version = EXCLUDED.adapter_version,
  patch_status = EXCLUDED.patch_status,
  compatibility_test = EXCLUDED.compatibility_test,
  manifest_hash = EXCLUDED.manifest_hash;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_datasets','v2_dataset_versions','v2_dataset_licenses','v2_dataset_transformations','v2_dataset_artifacts',
    'v2_model_architectures','v2_feature_contracts','v2_models','v2_model_versions','v2_model_checkpoints',
    'v2_training_runs','v2_training_dataset_relations','v2_evaluation_runs','v2_model_metrics'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO v2_app';
    EXECUTE 'GRANT SELECT ON v2_model_component_pins TO v2_app';
  END IF;
END $$;
