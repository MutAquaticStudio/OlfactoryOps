-- Phase 11: deterministic reformulation, governed master-data import, and
-- reviewable bulk operations. These records are tenant-owned V2 evidence;
-- no legacy optimizer/import surface or global material catalogue is revived.

-- Formula drafts originating from a Phase 11 advisory candidate remain drafts
-- until the existing Formula review/approval workflow approves them.
ALTER TABLE v2_formula_drafts DROP CONSTRAINT IF EXISTS v2_formula_drafts_origin_type_check;
ALTER TABLE v2_formula_drafts
  ADD CONSTRAINT v2_formula_drafts_origin_type_check
  CHECK (origin_type IN ('MANUAL','DESIGN_CANDIDATE','AGENT_ADVISORY','REFORMULATION_OPTIMIZER'));

CREATE TABLE IF NOT EXISTS v2_reformulation_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  parent_formula_version_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SOLVING','COMPLETED','FAILED','CANCELLED','ARCHIVED')),
  parent_formula_content_hash TEXT NOT NULL CHECK (parent_formula_content_hash ~ '^[a-f0-9]{64}$'),
  material_universe_snapshot JSONB NOT NULL CHECK (jsonb_typeof(material_universe_snapshot) = 'object'),
  material_universe_hash TEXT NOT NULL CHECK (material_universe_hash ~ '^[a-f0-9]{64}$'),
  constraint_snapshot JSONB NOT NULL CHECK (jsonb_typeof(constraint_snapshot) = 'object'),
  constraint_hash TEXT NOT NULL CHECK (constraint_hash ~ '^[a-f0-9]{64}$'),
  objective_weights JSONB NOT NULL CHECK (jsonb_typeof(objective_weights) = 'object'),
  objective_hash TEXT NOT NULL CHECK (objective_hash ~ '^[a-f0-9]{64}$'),
  solver_config JSONB NOT NULL CHECK (jsonb_typeof(solver_config) = 'object'),
  solver_config_hash TEXT NOT NULL CHECK (solver_config_hash ~ '^[a-f0-9]{64}$'),
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence_snapshot) = 'object'),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  result_hash TEXT CHECK (result_hash IS NULL OR result_hash ~ '^[a-f0-9]{64}$'),
  solver_version TEXT NOT NULL DEFAULT 'reformulation/1' CHECK (length(trim(solver_version)) BETWEEN 1 AND 120),
  random_seed INTEGER NOT NULL DEFAULT 0 CHECK (random_seed >= 0),
  failure_code TEXT CHECK (failure_code IS NULL OR length(trim(failure_code)) BETWEEN 1 AND 120),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_reformulation_runs_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_reformulation_runs_formula_tenant_fk FOREIGN KEY (organization_id, parent_formula_version_id)
    REFERENCES v2_formula_versions(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_reformulation_runs_completion_check CHECK ((status IN ('COMPLETED','FAILED','CANCELLED','ARCHIVED') AND completed_at IS NOT NULL) OR status NOT IN ('COMPLETED','FAILED','CANCELLED','ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS v2_reformulation_candidates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  reformulation_run_id TEXT NOT NULL,
  candidate_number INTEGER NOT NULL CHECK (candidate_number > 0),
  status TEXT NOT NULL DEFAULT 'ADVISORY' CHECK (status IN ('ADVISORY','SAVED_AS_DRAFT','REJECTED','ARCHIVED')),
  component_proposal JSONB NOT NULL CHECK (jsonb_typeof(component_proposal) = 'array' AND jsonb_array_length(component_proposal) BETWEEN 1 AND 250),
  component_hash TEXT NOT NULL CHECK (component_hash ~ '^[a-f0-9]{64}$'),
  scorecard JSONB NOT NULL CHECK (jsonb_typeof(scorecard) = 'object'),
  evidence_snapshot JSONB NOT NULL CHECK (jsonb_typeof(evidence_snapshot) = 'object'),
  result_hash TEXT NOT NULL CHECK (result_hash ~ '^[a-f0-9]{64}$'),
  saved_formula_draft_id TEXT,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_reformulation_candidates_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_reformulation_candidates_number_unique UNIQUE (organization_id, reformulation_run_id, candidate_number),
  CONSTRAINT v2_reformulation_candidates_run_tenant_fk FOREIGN KEY (organization_id, reformulation_run_id)
    REFERENCES v2_reformulation_runs(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_reformulation_candidates_draft_tenant_fk FOREIGN KEY (organization_id, saved_formula_draft_id)
    REFERENCES v2_formula_drafts(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS v2_reformulation_candidate_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  reformulation_candidate_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('SAVE_AS_DRAFT','REJECT','ARCHIVE')),
  formula_project_id TEXT,
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 2000),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  decided_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_reformulation_candidate_reviews_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_reformulation_candidate_reviews_candidate_tenant_fk FOREIGN KEY (organization_id, reformulation_candidate_id)
    REFERENCES v2_reformulation_candidates(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_reformulation_candidate_reviews_project_tenant_fk FOREIGN KEY (organization_id, formula_project_id)
    REFERENCES v2_formula_projects(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_reformulation_candidate_reviews_project_check CHECK ((decision = 'SAVE_AS_DRAFT' AND formula_project_id IS NOT NULL) OR (decision <> 'SAVE_AS_DRAFT' AND formula_project_id IS NULL))
);

CREATE TABLE IF NOT EXISTS v2_import_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  import_kind TEXT NOT NULL CHECK (import_kind IN ('MATERIALS','SUPPLIERS','SUPPLIER_OFFERS','OPENING_INVENTORY')),
  source_format TEXT NOT NULL CHECK (source_format IN ('CSV','XLSX')),
  source_name TEXT NOT NULL CHECK (length(trim(source_name)) BETWEEN 1 AND 240),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(mapping) = 'object'),
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PARSED','VALIDATED','COMMITTED','FAILED','CANCELLED')),
  dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  parsed_row_count INTEGER NOT NULL DEFAULT 0 CHECK (parsed_row_count >= 0),
  valid_row_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_row_count >= 0),
  invalid_row_count INTEGER NOT NULL DEFAULT 0 CHECK (invalid_row_count >= 0),
  duplicate_row_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_row_count >= 0),
  committed_row_count INTEGER NOT NULL DEFAULT 0 CHECK (committed_row_count >= 0),
  confirmation_token_hash TEXT CHECK (confirmation_token_hash IS NULL OR confirmation_token_hash ~ '^[a-f0-9]{64}$'),
  confirmation_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  validation_hash TEXT NOT NULL CHECK (validation_hash ~ '^[a-f0-9]{64}$'),
  failure_code TEXT CHECK (failure_code IS NULL OR length(trim(failure_code)) BETWEEN 1 AND 120),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  committed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_import_jobs_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_import_jobs_source_validation_mode_unique UNIQUE (organization_id, import_kind, source_hash, validation_hash, dry_run),
  CONSTRAINT v2_import_jobs_commit_check CHECK ((status = 'COMMITTED' AND committed_by IS NOT NULL AND committed_at IS NOT NULL) OR status <> 'COMMITTED')
);
ALTER TABLE v2_import_jobs ADD COLUMN IF NOT EXISTS confirmation_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes');
ALTER TABLE v2_import_jobs DROP CONSTRAINT IF EXISTS v2_import_jobs_source_unique;
ALTER TABLE v2_import_jobs DROP CONSTRAINT IF EXISTS v2_import_jobs_source_mode_unique;
ALTER TABLE v2_import_jobs ADD COLUMN IF NOT EXISTS validation_hash TEXT;
UPDATE v2_import_jobs SET validation_hash = source_hash WHERE validation_hash IS NULL;
ALTER TABLE v2_import_jobs ALTER COLUMN validation_hash SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_import_jobs_source_validation_mode_unique'
      AND conrelid = 'v2_import_jobs'::regclass
  ) THEN
    ALTER TABLE v2_import_jobs
      ADD CONSTRAINT v2_import_jobs_source_validation_mode_unique
      UNIQUE (organization_id, import_kind, source_hash, validation_hash, dry_run);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS v2_import_rows (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  import_job_id TEXT NOT NULL,
  source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
  source_row_hash TEXT NOT NULL CHECK (source_row_hash ~ '^[a-f0-9]{64}$'),
  normalized_row JSONB NOT NULL CHECK (jsonb_typeof(normalized_row) = 'object'),
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array'),
  status TEXT NOT NULL CHECK (status IN ('VALID','INVALID','DUPLICATE','SKIPPED','COMMITTED')),
  target_type TEXT,
  target_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_import_rows_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_import_rows_job_row_unique UNIQUE (organization_id, import_job_id, source_row_number),
  CONSTRAINT v2_import_rows_job_tenant_fk FOREIGN KEY (organization_id, import_job_id)
    REFERENCES v2_import_jobs(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v2_import_commits (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  import_job_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  result_report JSONB NOT NULL CHECK (jsonb_typeof(result_report) = 'object'),
  result_hash TEXT NOT NULL CHECK (result_hash ~ '^[a-f0-9]{64}$'),
  committed_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_import_commits_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_import_commits_job_unique UNIQUE (organization_id, import_job_id),
  CONSTRAINT v2_import_commits_job_tenant_fk FOREIGN KEY (organization_id, import_job_id)
    REFERENCES v2_import_jobs(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v2_dataops_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  import_job_id TEXT NOT NULL,
  adapter_key TEXT NOT NULL CHECK (adapter_key IN ('LOCAL_QUALITY_GATE','VEXO')),
  status TEXT NOT NULL CHECK (status IN ('SUCCEEDED','NOT_CONFIGURED','FAILED')),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  output_summary JSONB NOT NULL CHECK (jsonb_typeof(output_summary) = 'object'),
  output_hash TEXT NOT NULL CHECK (output_hash ~ '^[a-f0-9]{64}$'),
  failure_code TEXT CHECK (failure_code IS NULL OR length(trim(failure_code)) BETWEEN 1 AND 120),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_dataops_runs_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_dataops_runs_job_tenant_fk FOREIGN KEY (organization_id, import_job_id)
    REFERENCES v2_import_jobs(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v2_bulk_operations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('MATERIAL_STATUS','SUPPLIER_STATUS','SUPPLIER_OFFER_STATUS')),
  status TEXT NOT NULL DEFAULT 'PREVIEWED' CHECK (status IN ('PREVIEWED','CONFIRMED','COMPLETED','FAILED','CANCELLED')),
  target_ids JSONB NOT NULL CHECK (jsonb_typeof(target_ids) = 'array' AND jsonb_array_length(target_ids) BETWEEN 1 AND 200),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 1000),
  preview_report JSONB NOT NULL CHECK (jsonb_typeof(preview_report) = 'object'),
  preview_hash TEXT NOT NULL CHECK (preview_hash ~ '^[a-f0-9]{64}$'),
  confirmation_token_hash TEXT NOT NULL CHECK (confirmation_token_hash ~ '^[a-f0-9]{64}$'),
  confirmation_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  result_report JSONB,
  result_hash TEXT CHECK (result_hash IS NULL OR result_hash ~ '^[a-f0-9]{64}$'),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  executed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_bulk_operations_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_bulk_operations_execution_check CHECK ((status = 'COMPLETED' AND executed_by IS NOT NULL AND executed_at IS NOT NULL AND result_report IS NOT NULL) OR status <> 'COMPLETED')
);
ALTER TABLE v2_bulk_operations ADD COLUMN IF NOT EXISTS confirmation_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes');

CREATE INDEX IF NOT EXISTS v2_reformulation_runs_org_status_idx ON v2_reformulation_runs(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_reformulation_candidates_org_run_idx ON v2_reformulation_candidates(organization_id, reformulation_run_id, candidate_number);
CREATE INDEX IF NOT EXISTS v2_import_jobs_org_kind_status_idx ON v2_import_jobs(organization_id, import_kind, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_import_rows_org_job_status_idx ON v2_import_rows(organization_id, import_job_id, status, source_row_number);
CREATE INDEX IF NOT EXISTS v2_dataops_runs_org_job_idx ON v2_dataops_runs(organization_id, import_job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_bulk_operations_org_status_idx ON v2_bulk_operations(organization_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.v2_reject_phase11_append_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Phase 11 audit evidence cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS v2_reformulation_candidate_reviews_append_only ON v2_reformulation_candidate_reviews;
CREATE TRIGGER v2_reformulation_candidate_reviews_append_only BEFORE UPDATE OR DELETE ON v2_reformulation_candidate_reviews
  FOR EACH ROW EXECUTE FUNCTION public.v2_reject_phase11_append_mutation();
DROP TRIGGER IF EXISTS v2_import_commits_append_only ON v2_import_commits;
CREATE TRIGGER v2_import_commits_append_only BEFORE UPDATE OR DELETE ON v2_import_commits
  FOR EACH ROW EXECUTE FUNCTION public.v2_reject_phase11_append_mutation();
REVOKE UPDATE, DELETE ON v2_reformulation_candidate_reviews, v2_import_commits FROM PUBLIC;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_reformulation_runs','v2_reformulation_candidates','v2_reformulation_candidate_reviews',
    'v2_import_jobs','v2_import_rows','v2_import_commits','v2_dataops_runs','v2_bulk_operations'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON v2_reformulation_runs, v2_reformulation_candidates, v2_reformulation_candidate_reviews, v2_import_jobs, v2_import_rows, v2_import_commits, v2_dataops_runs, v2_bulk_operations TO v2_app';
  END IF;
END $$;

-- Existing role policies are persisted JSON. Extend them additively so a
-- tenant upgraded from P10 retains its custom grants and has no dead P11 UI.
UPDATE v2_role_policies AS policy
SET permissions = (
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT existing.permission FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
    UNION
    SELECT required.permission FROM jsonb_array_elements_text(CASE policy.role_key
      WHEN 'Owner' THEN '["optimizer.view","optimizer.run","optimizer.review","imports.view","imports.preview","imports.commit","bulk.preview","bulk.execute","dataops.view","dataops.run"]'::jsonb
      WHEN 'Admin' THEN '["optimizer.view","optimizer.run","optimizer.review","imports.view","imports.preview","imports.commit","bulk.preview","bulk.execute","dataops.view","dataops.run"]'::jsonb
      WHEN 'Perfumer' THEN '["optimizer.view","optimizer.run","optimizer.review"]'::jsonb
      WHEN 'R&D Scientist' THEN '["optimizer.view","optimizer.run","dataops.view"]'::jsonb
      WHEN 'Lab Manager' THEN '["imports.view","imports.preview","imports.commit","bulk.preview","bulk.execute","dataops.view","dataops.run"]'::jsonb
      WHEN 'Procurement' THEN '["imports.view","imports.preview","imports.commit","bulk.preview","bulk.execute","dataops.view"]'::jsonb
      ELSE '[]'::jsonb
    END) AS required(permission)
  ) AS merged
), version = policy.version + 1, updated_at = now()
WHERE policy.role_key IN ('Owner','Admin','Perfumer','R&D Scientist','Lab Manager','Procurement')
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(CASE policy.role_key
      WHEN 'Owner' THEN '["optimizer.view","optimizer.run","optimizer.review","imports.view","imports.preview","imports.commit","bulk.preview","bulk.execute","dataops.view","dataops.run"]'::jsonb
      WHEN 'Admin' THEN '["optimizer.view","optimizer.run","optimizer.review","imports.view","imports.preview","imports.commit","bulk.preview","bulk.execute","dataops.view","dataops.run"]'::jsonb
      WHEN 'Perfumer' THEN '["optimizer.view","optimizer.run","optimizer.review"]'::jsonb
      WHEN 'R&D Scientist' THEN '["optimizer.view","optimizer.run","dataops.view"]'::jsonb
      WHEN 'Lab Manager' THEN '["imports.view","imports.preview","imports.commit","bulk.preview","bulk.execute","dataops.view","dataops.run"]'::jsonb
      WHEN 'Procurement' THEN '["imports.view","imports.preview","imports.commit","bulk.preview","bulk.execute","dataops.view"]'::jsonb
      ELSE '[]'::jsonb
    END) AS required(permission)
    WHERE NOT (policy.permissions ? required.permission)
  );
