-- Phase 4-6 completion records. This migration is additive: historical V1 and
-- V2 migrations are intentionally untouched. Every relationship below carries
-- organization_id so a future query cannot attach a valid foreign identifier
-- from another tenant.

CREATE TABLE IF NOT EXISTS v2_dataset_sources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  dataset_version_id TEXT NOT NULL REFERENCES v2_dataset_versions(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('PUBLICATION','INTERNAL','DERIVED')),
  repository TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  publication_title TEXT,
  authors TEXT,
  license_spdx TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  provenance_status TEXT NOT NULL CHECK (provenance_status IN ('VERIFIED','REVIEW_REQUIRED','BLOCKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dataset_version_id, repository, source_ref)
);

CREATE TABLE IF NOT EXISTS v2_dataset_splits (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  dataset_version_id TEXT NOT NULL REFERENCES v2_dataset_versions(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL CHECK (strategy IN ('RANDOM','SCAFFOLD_GROUP','STRUCTURE_GROUP','TIME_SPLIT')),
  seed INTEGER NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parameters) = 'object'),
  split_hash TEXT NOT NULL CHECK (split_hash ~ '^[a-f0-9]{64}$'),
  leakage_status TEXT NOT NULL CHECK (leakage_status IN ('PASS','FAIL','NOT_EVALUATED')),
  quality_report JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(quality_report) = 'object'),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dataset_version_id, split_hash)
);

CREATE TABLE IF NOT EXISTS v2_training_configs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  training_run_id TEXT NOT NULL REFERENCES v2_training_runs(id) ON DELETE CASCADE,
  code_ref TEXT NOT NULL,
  runtime_version TEXT NOT NULL,
  hyperparameters JSONB NOT NULL CHECK (jsonb_typeof(hyperparameters) = 'object'),
  feature_schema_hash TEXT NOT NULL CHECK (feature_schema_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, training_run_id)
);

CREATE TABLE IF NOT EXISTS v2_olfactory_benchmarks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  dataset_version_id TEXT NOT NULL REFERENCES v2_dataset_versions(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  task_schema JSONB NOT NULL CHECK (jsonb_typeof(task_schema) = 'object'),
  split_id TEXT REFERENCES v2_dataset_splits(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','VALIDATED','ARCHIVED','BLOCKED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dataset_version_id, name)
);

CREATE TABLE IF NOT EXISTS v2_fusion_experiments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  benchmark_id TEXT NOT NULL REFERENCES v2_olfactory_benchmarks(id) ON DELETE CASCADE,
  fusion_kind TEXT NOT NULL CHECK (fusion_kind IN ('SINGLE','LATE_FUSION','LEARNED_FUSION','ENSEMBLE')),
  input_representations JSONB NOT NULL CHECK (jsonb_typeof(input_representations) = 'array'),
  normalization TEXT NOT NULL,
  configuration JSONB NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  evaluation JSONB NOT NULL CHECK (jsonb_typeof(evaluation) = 'object'),
  artifact_hash TEXT NOT NULL CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, benchmark_id, fusion_kind, artifact_hash)
);

-- Keep benchmark-owned embeddings distinct from the legacy Phase 5 material
-- embedding table. Historical migrations already own v2_odor_embeddings.
CREATE TABLE IF NOT EXISTS v2_model_odor_embeddings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  model_version_id TEXT NOT NULL REFERENCES v2_model_versions(id) ON DELETE RESTRICT,
  benchmark_id TEXT NOT NULL REFERENCES v2_olfactory_benchmarks(id) ON DELETE RESTRICT,
  embedding_ref TEXT NOT NULL,
  dimension INTEGER NOT NULL CHECK (dimension > 0 AND dimension <= 4096),
  normalization TEXT NOT NULL,
  artifact_hash TEXT NOT NULL CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
  index_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, material_id, model_version_id, artifact_hash)
);

CREATE TABLE IF NOT EXISTS v2_model_odor_predictions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  model_version_id TEXT NOT NULL REFERENCES v2_model_versions(id) ON DELETE RESTRICT,
  benchmark_id TEXT NOT NULL REFERENCES v2_olfactory_benchmarks(id) ON DELETE RESTRICT,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  output JSONB NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  uncertainty DOUBLE PRECISION NOT NULL CHECK (uncertainty >= 0 AND uncertainty <= 1),
  calibration_status TEXT NOT NULL CHECK (calibration_status IN ('CALIBRATED','LOW_CONFIDENCE','OUT_OF_DOMAIN','NOT_EVALUATED')),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','LOW_CONFIDENCE','NOT_EVALUATED','OUT_OF_DOMAIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, material_id, model_version_id, input_hash)
);

CREATE TABLE IF NOT EXISTS v2_formula_provenance (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  formula_draft_id TEXT REFERENCES v2_formula_drafts(id) ON DELETE CASCADE,
  formula_version_id TEXT REFERENCES v2_formula_versions(id) ON DELETE CASCADE,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('MANUAL','DESIGN_STUDIO','PARENT_VERSION','REFORMULATION_OPTIMIZER')),
  origin_ref TEXT,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (formula_draft_id IS NOT NULL OR formula_version_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS v2_design_constraint_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  design_project_id TEXT NOT NULL REFERENCES v2_design_projects(id) ON DELETE CASCADE,
  brief_version_id TEXT NOT NULL REFERENCES v2_design_brief_versions(id) ON DELETE CASCADE,
  constraints JSONB NOT NULL CHECK (jsonb_typeof(constraints) = 'object'),
  constraint_hash TEXT NOT NULL CHECK (constraint_hash ~ '^[a-f0-9]{64}$'),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, design_project_id, brief_version_id, constraint_hash)
);

CREATE TABLE IF NOT EXISTS v2_design_candidate_evaluations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES v2_design_candidates(id) ON DELETE CASCADE,
  dimensions JSONB NOT NULL CHECK (jsonb_typeof(dimensions) = 'object'),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, candidate_id, evidence_hash)
);

CREATE TABLE IF NOT EXISTS v2_design_recipient_shares (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES v2_design_candidates(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  allow_material_names BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (organization_id, candidate_id, recipient_user_id)
);

CREATE TABLE IF NOT EXISTS v2_design_feedback (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES v2_design_candidates(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_agent_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  creator_user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  workflow_key TEXT NOT NULL,
  workflow_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','WAITING_FOR_CONFIRMATION','SUCCEEDED','FAILED','CANCELLED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
  lease_token_hash TEXT,
  lease_expires_at TIMESTAMPTZ,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_agent_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES v2_agent_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','LEASED','SUCCEEDED','FAILED','CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 3),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token_hash TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, run_id)
);

CREATE TABLE IF NOT EXISTS v2_agent_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES v2_agent_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 65536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, run_id, sequence),
  UNIQUE (organization_id, run_id, id)
);

CREATE TABLE IF NOT EXISTS v2_agent_tool_calls (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES v2_agent_runs(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('REQUESTED','SUCCEEDED','FAILED','DENIED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_agent_artifacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES v2_agent_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 65536),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_agent_confirmations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES v2_agent_runs(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
  result_ref TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  decided_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, run_id, action_key)
);

CREATE TABLE IF NOT EXISTS v2_material_evidence_sources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('MATERIAL_PROFILE','COMPLIANCE','DOCUMENT','SUPPLIER_OFFER')),
  source_ref TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPROVED','ARCHIVED','INVALIDATED')),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, material_id, source_kind, source_ref, version)
);

CREATE TABLE IF NOT EXISTS v2_material_evidence_chunks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES v2_material_evidence_sources(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  excerpt TEXT NOT NULL CHECK (length(excerpt) <= 1200),
  excerpt_hash TEXT NOT NULL CHECK (excerpt_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_id, ordinal)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_dataset_sources','v2_dataset_splits','v2_training_configs','v2_olfactory_benchmarks','v2_fusion_experiments','v2_model_odor_embeddings','v2_model_odor_predictions',
    'v2_formula_provenance','v2_design_constraint_snapshots','v2_design_candidate_evaluations','v2_design_recipient_shares','v2_design_feedback',
    'v2_agent_runs','v2_agent_jobs','v2_agent_events','v2_agent_tool_calls','v2_agent_artifacts','v2_agent_confirmations',
    'v2_material_evidence_sources','v2_material_evidence_chunks'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS v2_agent_events_replay_idx ON v2_agent_events (organization_id, run_id, sequence);
CREATE INDEX IF NOT EXISTS v2_agent_jobs_reclaim_idx ON v2_agent_jobs (organization_id, status, lease_expires_at, available_at);
CREATE INDEX IF NOT EXISTS v2_agent_confirmations_pending_idx ON v2_agent_confirmations (organization_id, run_id, status, expires_at);
CREATE INDEX IF NOT EXISTS v2_material_evidence_query_idx ON v2_material_evidence_sources (organization_id, material_id, status);
