-- Formula Intelligence remains tenant-scoped and uses the durable agent run as
-- its execution journal. Projects and proposals are not formula drafts until a
-- perfumer explicitly confirms a save operation.

CREATE TABLE IF NOT EXISTS formula_intelligence_runs (
  run_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workflow_kind TEXT NOT NULL CHECK (workflow_kind IN ('DESIGN_STUDIO', 'REFORMULATION_OPTIMIZER')),
  config_json TEXT NOT NULL,
  project_id TEXT,
  baseline_formula_id TEXT,
  baseline_version TEXT,
  created_by_user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_formula_intelligence_runs_org_project
  ON formula_intelligence_runs(organization_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS formula_design_projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  brand_id TEXT,
  created_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('BRIEFED', 'IN_PROGRESS', 'IN_REVIEW', 'SELECTED', 'ARCHIVED')),
  name TEXT NOT NULL,
  brief_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  selected_direction_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_formula_design_projects_org_creator
  ON formula_design_projects(organization_id, created_by_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS formula_design_directions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 3),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'SHARED', 'SELECTED', 'SAVED', 'ARCHIVED')),
  safe_summary_json TEXT NOT NULL,
  proposal_json TEXT NOT NULL,
  shared_by_user_id TEXT,
  shared_at TEXT,
  saved_formula_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, sequence),
  FOREIGN KEY (project_id) REFERENCES formula_design_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_formula_design_directions_org_project
  ON formula_design_directions(organization_id, project_id, sequence ASC);

CREATE TABLE IF NOT EXISTS formula_design_feedback (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  direction_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (direction_id, user_id),
  FOREIGN KEY (project_id) REFERENCES formula_design_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (direction_id) REFERENCES formula_design_directions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_formula_design_feedback_org_project
  ON formula_design_feedback(organization_id, project_id, created_at ASC);

CREATE TABLE IF NOT EXISTS formula_optimizer_candidates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  baseline_formula_id TEXT NOT NULL,
  baseline_version TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 3),
  status TEXT NOT NULL CHECK (status IN ('READY', 'PENDING_SAVE', 'SAVED', 'ARCHIVED')),
  summary_json TEXT NOT NULL,
  proposal_json TEXT NOT NULL,
  saved_formula_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id, sequence),
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_formula_optimizer_candidates_org_run
  ON formula_optimizer_candidates(organization_id, run_id, sequence ASC);
