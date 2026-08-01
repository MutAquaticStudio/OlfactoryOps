-- Competitive Moat phases 6-9: tenant-private sensory memory and immutable
-- preference-profile history. Lineage remains a deterministic read projection
-- over normalized operating records, not a second graph source of truth.

CREATE TABLE IF NOT EXISTS fragrance_sensory_memory (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  trial_id TEXT NOT NULL,
  formula_id TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ACCEPT', 'REVISE', 'REJECT')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, trial_id),
  FOREIGN KEY (trial_id) REFERENCES fragrance_trials(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fragrance_sensory_memory_formula
  ON fragrance_sensory_memory(organization_id, formula_id, formula_version, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_preference_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
  confidence TEXT NOT NULL CHECK (confidence IN ('INSUFFICIENT', 'LOW', 'MEDIUM', 'HIGH')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, version),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_workspace_preference_profiles_latest
  ON workspace_preference_profiles(organization_id, version DESC);

CREATE TABLE IF NOT EXISTS approved_material_substitutions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  source_material_id TEXT NOT NULL,
  replacement_material_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPROVED', 'ARCHIVED')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, source_material_id, replacement_material_id),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_approved_material_substitutions_source
  ON approved_material_substitutions(organization_id, source_material_id, status, updated_at DESC);
