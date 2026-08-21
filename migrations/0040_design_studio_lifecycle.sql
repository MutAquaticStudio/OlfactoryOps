-- Design Studio brief lifecycle. Archived projects stay recoverable for 30 days;
-- the scheduled purge only removes work that has no durable downstream evidence.
ALTER TABLE formula_design_projects ADD COLUMN formula_type_hint TEXT CHECK (formula_type_hint IN ('ACCORD', 'FINE_FRAGRANCE'));
ALTER TABLE formula_design_projects ADD COLUMN archived_at TEXT;
ALTER TABLE formula_design_projects ADD COLUMN archived_by_user_id TEXT;
ALTER TABLE formula_design_projects ADD COLUMN archive_previous_status TEXT;
ALTER TABLE formula_design_projects ADD COLUMN purge_after TEXT;

CREATE INDEX IF NOT EXISTS idx_formula_design_projects_retention
  ON formula_design_projects (organization_id, status, purge_after);
