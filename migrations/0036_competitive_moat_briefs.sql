-- Competitive Moat phase 1: immutable Design Studio brief lineage.
-- This migration is additive. Existing projects retain their original
-- brief_json and are backfilled as explicitly unstructured legacy records.

ALTER TABLE formula_design_projects ADD COLUMN current_brief_version_id TEXT;

CREATE TABLE IF NOT EXISTS formula_design_brief_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  state TEXT NOT NULL CHECK (state IN ('RAW', 'REVIEW_REQUIRED', 'REVIEWED', 'LEGACY_UNSTRUCTURED')),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 0),
  raw_brief TEXT NOT NULL,
  structured_brief_json TEXT,
  unresolved_questions_json TEXT NOT NULL,
  compiler_mode TEXT NOT NULL CHECK (compiler_mode IN ('MANUAL', 'NOT_CONFIGURED', 'LEGACY')),
  compiler_template_version TEXT,
  checksum TEXT NOT NULL,
  idempotency_key TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, project_id, version_number),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (project_id) REFERENCES formula_design_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_formula_design_brief_versions_project
  ON formula_design_brief_versions(organization_id, project_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_formula_design_brief_versions_creator
  ON formula_design_brief_versions(organization_id, created_by_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS formula_design_constraint_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  brief_version_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  constraints_hash TEXT NOT NULL,
  material_universe_hash TEXT,
  material_universe_state TEXT NOT NULL CHECK (material_universe_state IN ('NOT_EVALUATED', 'PINNED')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, brief_version_id),
  FOREIGN KEY (project_id) REFERENCES formula_design_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (brief_version_id) REFERENCES formula_design_brief_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_formula_design_constraint_snapshots_project
  ON formula_design_constraint_snapshots(organization_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS formula_design_generation_contexts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  brief_version_id TEXT NOT NULL,
  constraint_snapshot_id TEXT NOT NULL,
  material_universe_hash TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, run_id),
  FOREIGN KEY (project_id) REFERENCES formula_design_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (brief_version_id) REFERENCES formula_design_brief_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (constraint_snapshot_id) REFERENCES formula_design_constraint_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_formula_design_generation_contexts_project
  ON formula_design_generation_contexts(organization_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS formula_design_direction_evaluations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  direction_id TEXT NOT NULL,
  constraint_snapshot_id TEXT NOT NULL,
  evaluation_version INTEGER NOT NULL DEFAULT 1,
  evaluation_json TEXT NOT NULL,
  evaluation_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, direction_id, evaluation_version),
  FOREIGN KEY (project_id) REFERENCES formula_design_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (direction_id) REFERENCES formula_design_directions(id) ON DELETE CASCADE,
  FOREIGN KEY (constraint_snapshot_id) REFERENCES formula_design_constraint_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_formula_design_direction_evaluations_run
  ON formula_design_direction_evaluations(organization_id, run_id, direction_id);

-- Do not infer reviewed data while backfilling. The legacy version simply
-- records the old source so existing projects remain compatible until reviewed.
INSERT OR IGNORE INTO formula_design_brief_versions (
  id, organization_id, project_id, version_number, state, schema_version,
  raw_brief, structured_brief_json, unresolved_questions_json, compiler_mode,
  compiler_template_version, checksum, idempotency_key, created_by_user_id, created_at
)
SELECT
  'legacy-brief-' || p.id,
  p.organization_id,
  p.id,
  1,
  'LEGACY_UNSTRUCTURED',
  0,
  COALESCE(NULLIF(json_extract(p.brief_json, '$.creativeBrief'), ''), p.name),
  NULL,
  '[]',
  'LEGACY',
  NULL,
  'legacy:' || p.id,
  'legacy:' || p.id,
  p.created_by_user_id,
  p.created_at
FROM formula_design_projects p;

UPDATE formula_design_projects
SET current_brief_version_id = 'legacy-brief-' || id
WHERE current_brief_version_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_formula_design_projects_current_brief
  ON formula_design_projects(organization_id, current_brief_version_id, updated_at DESC);
