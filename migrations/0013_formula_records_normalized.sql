CREATE TABLE IF NOT EXISTS formula_records (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  formula_type TEXT NOT NULL,
  workflow_status TEXT NOT NULL,
  status TEXT NOT NULL,
  version TEXT NOT NULL,
  draft_revision INTEGER NOT NULL,
  record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_formula_records_org_workflow
  ON formula_records(organization_id, workflow_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_formula_records_org_type
  ON formula_records(organization_id, formula_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS formula_version_records (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  formula_id TEXT NOT NULL,
  formula_code TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  checksum TEXT NOT NULL,
  record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, formula_id, version)
);

CREATE INDEX IF NOT EXISTS idx_formula_versions_formula_created
  ON formula_version_records(organization_id, formula_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_formula_versions_org_status
  ON formula_version_records(organization_id, status, created_at DESC);
