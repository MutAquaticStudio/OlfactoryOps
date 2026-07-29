-- Formula Intelligence hardening. Recipient shares are deliberately separate
-- from the legacy direction status so no historical global share is inferred.

CREATE TABLE IF NOT EXISTS formula_design_direction_shares (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  direction_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  allow_material_names INTEGER NOT NULL DEFAULT 0 CHECK (allow_material_names IN (0, 1)),
  shared_by_user_id TEXT NOT NULL,
  shared_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (direction_id, recipient_user_id),
  FOREIGN KEY (project_id) REFERENCES formula_design_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (direction_id) REFERENCES formula_design_directions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_formula_direction_shares_recipient
  ON formula_design_direction_shares(organization_id, recipient_user_id, revoked_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_formula_direction_shares_direction
  ON formula_design_direction_shares(organization_id, direction_id, revoked_at);

CREATE TABLE IF NOT EXISTS agent_formula_draft_saves (
  confirmation_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  formula_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CREATING', 'COMPLETED', 'FAILED', 'EXPIRED')),
  lease_token TEXT,
  lease_expires_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (confirmation_id) REFERENCES agent_confirmations(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_formula_draft_saves_formula
  ON agent_formula_draft_saves(organization_id, formula_id);
CREATE INDEX IF NOT EXISTS idx_agent_formula_draft_saves_state
  ON agent_formula_draft_saves(organization_id, status, lease_expires_at);

CREATE TABLE IF NOT EXISTS tenant_audit_chain_heads (
  organization_id TEXT PRIMARY KEY,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  last_hash TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_retention
  ON agent_artifacts(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_events_retention
  ON tenant_audit_events(organization_id, at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_org_user_status_created
  ON agent_runs(organization_id, user_id, status, created_at DESC);

-- Legacy SHARED rows were visible to every user. Retain only the original brief
-- creator as an explicit recipient and keep material names hidden by default.
INSERT OR IGNORE INTO formula_design_direction_shares (
  id, organization_id, project_id, direction_id, recipient_user_id,
  allow_material_names, shared_by_user_id, shared_at, created_at, updated_at
)
SELECT
  'backfill-' || d.id,
  d.organization_id,
  d.project_id,
  d.id,
  p.created_by_user_id,
  0,
  COALESCE(d.shared_by_user_id, p.created_by_user_id),
  COALESCE(d.shared_at, d.updated_at),
  d.created_at,
  d.updated_at
FROM formula_design_directions d
JOIN formula_design_projects p ON p.id = d.project_id AND p.organization_id = d.organization_id
WHERE d.shared_at IS NOT NULL;

INSERT OR IGNORE INTO tenant_audit_chain_heads (organization_id, last_sequence, last_hash, updated_at)
SELECT c.organization_id, c.sequence, c.event_hash, datetime('now')
FROM tenant_audit_chain_events c
WHERE c.sequence = (
  SELECT MAX(tail.sequence) FROM tenant_audit_chain_events tail WHERE tail.organization_id = c.organization_id
);
