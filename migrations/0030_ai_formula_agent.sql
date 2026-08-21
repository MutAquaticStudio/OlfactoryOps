-- Durable, tenant-scoped formula research agent runtime. All JSON payloads are
-- application-validated against src/data/agentRuntime.ts before persistence.

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED')),
  input_brief TEXT NOT NULL,
  current_node_id TEXT,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  protocol_version TEXT NOT NULL,
  last_event_sequence INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  provider TEXT NOT NULL,
  model_name TEXT,
  provider_context_ciphertext TEXT,
  usage_json TEXT,
  error_summary TEXT,
  cancel_requested_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_org_user_updated ON agent_runs(organization_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_org_status ON agent_runs(organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_claim ON agent_jobs(status, available_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_org_run ON agent_jobs(organization_id, run_id);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STREAMING', 'COMPLETED', 'FAILED')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_run_created ON agent_messages(run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS agent_nodes (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'QUEUED', 'RUNNING', 'WAITING_FOR_CONFIRMATION', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING')),
  attempt INTEGER NOT NULL DEFAULT 0,
  input_json TEXT,
  output_json TEXT,
  validation_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE,
  UNIQUE (run_id, node_type)
);
CREATE INDEX IF NOT EXISTS idx_agent_nodes_org_run ON agent_nodes(organization_id, run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('READ_ONLY', 'MUTATING')),
  status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'RUNNING', 'COMPLETED', 'FAILED', 'WAITING_FOR_CONFIRMATION')),
  input_json TEXT NOT NULL,
  output_json TEXT,
  error_summary TEXT,
  idempotency_key TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES agent_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run_created ON agent_tool_calls(run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS agent_events (
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence),
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_events_org_run_sequence ON agent_events(organization_id, run_id, sequence ASC);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_version INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PARTIAL', 'COMPLETED', 'FAILED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE,
  UNIQUE (run_id, artifact_type)
);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_org_run ON agent_artifacts(organization_id, run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS agent_confirmations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
  response_idempotency_key TEXT,
  responded_by_user_id TEXT,
  responded_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES agent_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE,
  UNIQUE (run_id, operation, status)
);
CREATE INDEX IF NOT EXISTS idx_agent_confirmations_org_status ON agent_confirmations(organization_id, status, expires_at);
