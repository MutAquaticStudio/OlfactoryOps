-- Fragrance Operating Memory v1. Trials are tenant-private evidence records;
-- lab usage remains the sole source of inventory movements.

ALTER TABLE lab_usage_records ADD COLUMN trial_id TEXT;
CREATE INDEX IF NOT EXISTS idx_lab_usage_records_trial ON lab_usage_records(trial_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fragrance_trials (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  formula_id TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN (
    'PLANNED', 'RELEASED_FOR_TRIAL', 'MIXED', 'CONDITIONING', 'EVALUATING', 'DECIDED', 'CANCELLED'
  )),
  sample_code TEXT NOT NULL,
  record_json TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, sample_code),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fragrance_trials_org_lifecycle_updated
  ON fragrance_trials(organization_id, lifecycle, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fragrance_trials_formula_version
  ON fragrance_trials(organization_id, formula_id, formula_version, updated_at DESC);

CREATE TABLE IF NOT EXISTS fragrance_trial_usage_links (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  trial_id TEXT NOT NULL,
  usage_id TEXT NOT NULL,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, trial_id),
  UNIQUE (organization_id, usage_id),
  FOREIGN KEY (trial_id) REFERENCES fragrance_trials(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fragrance_sensory_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  trial_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (trial_id) REFERENCES fragrance_trials(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fragrance_sensory_sessions_trial
  ON fragrance_sensory_sessions(organization_id, trial_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS fragrance_sensory_observations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  trial_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  evaluator_ref TEXT NOT NULL,
  timepoint TEXT NOT NULL CHECK (timepoint IN ('OPENING', 'HEART', 'DRYDOWN', 'LONGEVITY', 'OVERALL')),
  record_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, session_id, evaluator_ref, timepoint),
  FOREIGN KEY (trial_id) REFERENCES fragrance_trials(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES fragrance_sensory_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fragrance_sensory_observations_trial
  ON fragrance_sensory_observations(organization_id, trial_id, timepoint, submitted_at DESC);

CREATE TABLE IF NOT EXISTS fragrance_trial_public_links (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  trial_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (trial_id) REFERENCES fragrance_trials(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES fragrance_sensory_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fragrance_trial_public_links_token
  ON fragrance_trial_public_links(token_hash, expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS fragrance_trial_decisions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  trial_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('ACCEPT', 'REVISE', 'REJECT')),
  record_json TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, trial_id),
  FOREIGN KEY (trial_id) REFERENCES fragrance_trials(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
