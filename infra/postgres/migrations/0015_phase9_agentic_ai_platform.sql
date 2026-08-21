-- Phase 9: governed agent runtime platform. This migration layers versioned
-- definitions and durable evidence around the Phase 6 agent runtime without
-- changing its run/event replay contract.

CREATE TABLE IF NOT EXISTS v2_agent_definitions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL CHECK (agent_key ~ '^[a-z][a-z0-9-]{0,79}$'),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR length(trim(description)) <= 2000),
  source_kind TEXT NOT NULL DEFAULT 'TENANT' CHECK (source_kind IN ('SYSTEM','TENANT')),
  bootstrap_key TEXT CHECK (bootstrap_key IS NULL OR bootstrap_key ~ '^[a-z][a-z0-9-]{0,79}$'),
  active_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_definitions_key_unique UNIQUE (organization_id, agent_key),
  CONSTRAINT v2_agent_definitions_bootstrap_key_unique UNIQUE (organization_id, bootstrap_key),
  CONSTRAINT v2_agent_definitions_bootstrap_marker_check CHECK ((source_kind = 'SYSTEM') = (bootstrap_key IS NOT NULL)),
  CONSTRAINT v2_agent_definitions_org_id_unique UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS v2_agent_workflows (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  workflow_key TEXT NOT NULL CHECK (workflow_key ~ '^[a-z][a-z0-9-]{0,79}(?:/[a-z0-9][a-z0-9._-]{0,79})?$'),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR length(trim(description)) <= 2000),
  source_kind TEXT NOT NULL DEFAULT 'TENANT' CHECK (source_kind IN ('SYSTEM','TENANT')),
  bootstrap_key TEXT CHECK (bootstrap_key IS NULL OR bootstrap_key ~ '^[a-z][a-z0-9-]{0,79}$'),
  active_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_workflows_key_unique UNIQUE (organization_id, workflow_key),
  CONSTRAINT v2_agent_workflows_bootstrap_key_unique UNIQUE (organization_id, bootstrap_key),
  CONSTRAINT v2_agent_workflows_bootstrap_marker_check CHECK ((source_kind = 'SYSTEM') = (bootstrap_key IS NOT NULL)),
  CONSTRAINT v2_agent_workflows_org_id_unique UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS v2_agent_tools (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL CHECK (tool_key ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  source_kind TEXT NOT NULL DEFAULT 'TENANT' CHECK (source_kind IN ('SYSTEM','TENANT')),
  bootstrap_key TEXT CHECK (bootstrap_key IS NULL OR bootstrap_key ~ '^[a-z][a-z0-9-]{0,79}$'),
  active_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_tools_key_unique UNIQUE (organization_id, tool_key),
  CONSTRAINT v2_agent_tools_bootstrap_key_unique UNIQUE (organization_id, bootstrap_key),
  CONSTRAINT v2_agent_tools_bootstrap_marker_check CHECK ((source_kind = 'SYSTEM') = (bootstrap_key IS NOT NULL)),
  CONSTRAINT v2_agent_tools_org_id_unique UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS v2_agent_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL CHECK (policy_key ~ '^[a-z][a-z0-9-]{0,79}$'),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  source_kind TEXT NOT NULL DEFAULT 'TENANT' CHECK (source_kind IN ('SYSTEM','TENANT')),
  bootstrap_key TEXT CHECK (bootstrap_key IS NULL OR bootstrap_key ~ '^[a-z][a-z0-9-]{0,79}$'),
  active_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_policies_key_unique UNIQUE (organization_id, policy_key),
  CONSTRAINT v2_agent_policies_bootstrap_key_unique UNIQUE (organization_id, bootstrap_key),
  CONSTRAINT v2_agent_policies_bootstrap_marker_check CHECK ((source_kind = 'SYSTEM') = (bootstrap_key IS NOT NULL)),
  CONSTRAINT v2_agent_policies_org_id_unique UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS v2_agent_definition_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  agent_definition_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  protocol_version TEXT NOT NULL CHECK (length(trim(protocol_version)) BETWEEN 1 AND 80),
  instruction_template_key TEXT NOT NULL CHECK (instruction_template_key ~ '^[a-z][a-z0-9._-]{0,159}$'),
  instruction_template_version TEXT NOT NULL CHECK (length(trim(instruction_template_version)) BETWEEN 1 AND 80),
  instruction_template_hash TEXT NOT NULL CHECK (instruction_template_hash ~ '^[a-f0-9]{64}$'),
  input_schema JSONB NOT NULL CHECK (jsonb_typeof(input_schema) = 'object' AND octet_length(input_schema::text) <= 65536),
  output_schema JSONB NOT NULL CHECK (jsonb_typeof(output_schema) = 'object' AND octet_length(output_schema::text) <= 65536),
  model_policy JSONB NOT NULL CHECK (jsonb_typeof(model_policy) = 'object' AND octet_length(model_policy::text) <= 65536),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')),
  published_by TEXT REFERENCES v2_users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_definition_version_number_unique UNIQUE (organization_id, agent_definition_id, version_number),
  CONSTRAINT v2_agent_definition_version_hash_unique UNIQUE (organization_id, agent_definition_id, content_hash),
  CONSTRAINT v2_agent_definition_versions_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_definition_version_publication_check CHECK ((status = 'DRAFT' AND published_by IS NULL AND published_at IS NULL) OR (status IN ('PUBLISHED','RETIRED') AND published_by IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT v2_agent_definition_version_definition_tenant_fk
    FOREIGN KEY (organization_id, agent_definition_id)
    REFERENCES v2_agent_definitions(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS v2_agent_tool_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  mode TEXT NOT NULL CHECK (mode IN ('READ_ONLY','MUTATING')),
  adapter_key TEXT NOT NULL CHECK (adapter_key ~ '^[a-z][a-z0-9._-]{0,159}$'),
  required_permissions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(required_permissions) = 'array' AND jsonb_array_length(required_permissions) <= 64),
  input_schema JSONB NOT NULL CHECK (jsonb_typeof(input_schema) = 'object' AND octet_length(input_schema::text) <= 65536),
  output_schema JSONB NOT NULL CHECK (jsonb_typeof(output_schema) = 'object' AND octet_length(output_schema::text) <= 65536),
  timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 100 AND 120000),
  retry_policy JSONB NOT NULL CHECK (jsonb_typeof(retry_policy) = 'object' AND octet_length(retry_policy::text) <= 16384),
  confirmation_policy JSONB NOT NULL CHECK (jsonb_typeof(confirmation_policy) = 'object' AND octet_length(confirmation_policy::text) <= 16384),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')),
  published_by TEXT REFERENCES v2_users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_tool_version_number_unique UNIQUE (organization_id, tool_id, version_number),
  CONSTRAINT v2_agent_tool_version_hash_unique UNIQUE (organization_id, tool_id, content_hash),
  CONSTRAINT v2_agent_tool_versions_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_tool_version_publication_check CHECK ((status = 'DRAFT' AND published_by IS NULL AND published_at IS NULL) OR (status IN ('PUBLISHED','RETIRED') AND published_by IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT v2_agent_tool_version_mutation_confirmation_check
    CHECK (mode = 'READ_ONLY' OR confirmation_policy @> '{"required": true}'::jsonb),
  CONSTRAINT v2_agent_tool_version_mutation_adapter_check
    CHECK (mode = 'READ_ONLY' OR adapter_key = 'formula.candidate_save_draft'),
  CONSTRAINT v2_agent_tool_version_tool_tenant_fk
    FOREIGN KEY (organization_id, tool_id)
    REFERENCES v2_agent_tools(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS v2_agent_policy_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  allowed_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_capabilities) = 'array' AND jsonb_array_length(allowed_capabilities) <= 128),
  provider_policy JSONB NOT NULL CHECK (jsonb_typeof(provider_policy) = 'object' AND octet_length(provider_policy::text) <= 65536),
  data_handling_policy JSONB NOT NULL CHECK (jsonb_typeof(data_handling_policy) = 'object' AND octet_length(data_handling_policy::text) <= 65536),
  confirmation_policy JSONB NOT NULL CHECK (jsonb_typeof(confirmation_policy) = 'object' AND octet_length(confirmation_policy::text) <= 16384),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')),
  published_by TEXT REFERENCES v2_users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_policy_version_number_unique UNIQUE (organization_id, policy_id, version_number),
  CONSTRAINT v2_agent_policy_version_hash_unique UNIQUE (organization_id, policy_id, content_hash),
  CONSTRAINT v2_agent_policy_versions_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_policy_version_publication_check CHECK ((status = 'DRAFT' AND published_by IS NULL AND published_at IS NULL) OR (status IN ('PUBLISHED','RETIRED') AND published_by IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT v2_agent_policy_version_policy_tenant_fk
    FOREIGN KEY (organization_id, policy_id)
    REFERENCES v2_agent_policies(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS v2_agent_workflow_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  agent_definition_version_id TEXT NOT NULL,
  policy_version_id TEXT NOT NULL,
  workflow_graph JSONB NOT NULL CHECK (jsonb_typeof(workflow_graph) = 'object' AND octet_length(workflow_graph::text) <= 65536),
  input_schema JSONB NOT NULL CHECK (jsonb_typeof(input_schema) = 'object' AND octet_length(input_schema::text) <= 65536),
  output_schema JSONB NOT NULL CHECK (jsonb_typeof(output_schema) = 'object' AND octet_length(output_schema::text) <= 65536),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')),
  published_by TEXT REFERENCES v2_users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_workflow_version_number_unique UNIQUE (organization_id, workflow_id, version_number),
  CONSTRAINT v2_agent_workflow_version_hash_unique UNIQUE (organization_id, workflow_id, content_hash),
  CONSTRAINT v2_agent_workflow_versions_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_workflow_version_publication_check CHECK ((status = 'DRAFT' AND published_by IS NULL AND published_at IS NULL) OR (status IN ('PUBLISHED','RETIRED') AND published_by IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT v2_agent_workflow_version_workflow_tenant_fk
    FOREIGN KEY (organization_id, workflow_id)
    REFERENCES v2_agent_workflows(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_agent_workflow_version_definition_tenant_fk
    FOREIGN KEY (organization_id, agent_definition_version_id)
    REFERENCES v2_agent_definition_versions(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_agent_workflow_version_policy_tenant_fk
    FOREIGN KEY (organization_id, policy_version_id)
    REFERENCES v2_agent_policy_versions(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS v2_agent_workflow_tool_bindings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  workflow_version_id TEXT NOT NULL,
  tool_version_id TEXT NOT NULL,
  node_key TEXT NOT NULL CHECK (node_key ~ '^[a-z][a-z0-9._-]{0,119}$'),
  max_invocations INTEGER NOT NULL DEFAULT 1 CHECK (max_invocations BETWEEN 1 AND 100),
  confirmation_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_workflow_bind_node_unique UNIQUE (organization_id, workflow_version_id, node_key),
  CONSTRAINT v2_agent_workflow_bind_tool_unique UNIQUE (organization_id, workflow_version_id, tool_version_id, node_key),
  CONSTRAINT v2_agent_workflow_tool_bindings_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_workflow_bind_workflow_tenant_fk
    FOREIGN KEY (organization_id, workflow_version_id)
    REFERENCES v2_agent_workflow_versions(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_agent_workflow_bind_tool_tenant_fk
    FOREIGN KEY (organization_id, tool_version_id)
    REFERENCES v2_agent_tool_versions(organization_id, id) ON DELETE RESTRICT
);

-- Phase 6 rows retain their existing workflow text, correlation id, sequence,
-- and replay behavior. Null version references identify legacy runs.
ALTER TABLE v2_agent_runs
  ADD COLUMN IF NOT EXISTS protocol_version TEXT NOT NULL DEFAULT 'phase6/v1',
  ADD COLUMN IF NOT EXISTS agent_definition_version_id TEXT,
  ADD COLUMN IF NOT EXISTS workflow_version_id TEXT,
  ADD COLUMN IF NOT EXISTS policy_version_id TEXT,
  ADD COLUMN IF NOT EXISTS parent_run_id TEXT,
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS causation_event_id TEXT;

ALTER TABLE v2_agent_jobs
  ADD COLUMN IF NOT EXISTS protocol_version TEXT NOT NULL DEFAULT 'phase6/v1',
  ADD COLUMN IF NOT EXISTS policy_version_id TEXT,
  ADD COLUMN IF NOT EXISTS run_node_id TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

ALTER TABLE v2_agent_events
  ADD COLUMN IF NOT EXISTS protocol_version TEXT NOT NULL DEFAULT 'phase6/v1',
  ADD COLUMN IF NOT EXISTS event_schema_version TEXT NOT NULL DEFAULT 'phase6/v1',
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS causation_event_id TEXT,
  ADD COLUMN IF NOT EXISTS run_node_id TEXT;

ALTER TABLE v2_agent_tool_calls
  ADD COLUMN IF NOT EXISTS tool_version_id TEXT,
  ADD COLUMN IF NOT EXISTS policy_version_id TEXT,
  ADD COLUMN IF NOT EXISTS run_node_id TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS invocation_key TEXT,
  ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS input_schema_version TEXT,
  ADD COLUMN IF NOT EXISTS output_schema_version TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

ALTER TABLE v2_agent_artifacts
  ADD COLUMN IF NOT EXISTS protocol_version TEXT NOT NULL DEFAULT 'phase6/v1',
  ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT 'phase6/v1',
  ADD COLUMN IF NOT EXISTS run_node_id TEXT,
  ADD COLUMN IF NOT EXISTS redaction_status TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

ALTER TABLE v2_agent_confirmations
  ADD COLUMN IF NOT EXISTS protocol_version TEXT NOT NULL DEFAULT 'phase6/v1',
  ADD COLUMN IF NOT EXISTS confirmation_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS policy_version_id TEXT,
  ADD COLUMN IF NOT EXISTS decision_rationale_hash TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

CREATE TABLE IF NOT EXISTS v2_agent_run_nodes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  workflow_node_key TEXT NOT NULL CHECK (workflow_node_key ~ '^[a-z][a-z0-9._-]{0,119}$'),
  node_kind TEXT NOT NULL CHECK (node_kind IN ('AGENT','TOOL','PROVIDER','ARTIFACT','ROUTER','CONFIRMATION','TERMINAL')),
  status TEXT NOT NULL CHECK (status IN ('PENDING','READY','RUNNING','WAITING_FOR_TOOL','WAITING_FOR_CONFIRMATION','SUCCEEDED','FAILED','SKIPPED','CANCELLED')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 100),
  input_hash TEXT CHECK (input_hash IS NULL OR input_hash ~ '^[a-f0-9]{64}$'),
  output_hash TEXT CHECK (output_hash IS NULL OR output_hash ~ '^[a-f0-9]{64}$'),
  error_code TEXT CHECK (error_code IS NULL OR length(trim(error_code)) BETWEEN 1 AND 120),
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 160),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_run_node_attempt_unique UNIQUE (organization_id, run_id, workflow_node_key, attempt),
  CONSTRAINT v2_agent_run_nodes_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_run_node_complete_after_start CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
  CONSTRAINT v2_agent_run_node_run_tenant_fk
    FOREIGN KEY (organization_id, run_id)
    REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v2_agent_run_messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  run_node_id TEXT,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  message_role TEXT NOT NULL CHECK (message_role IN ('SYSTEM','USER','ASSISTANT','TOOL','EVENT')),
  message_kind TEXT NOT NULL CHECK (message_kind IN ('INPUT','OUTPUT','SUMMARY','ERROR','STATUS')),
  schema_version TEXT NOT NULL CHECK (length(trim(schema_version)) BETWEEN 1 AND 80),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 65536),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  redaction_status TEXT NOT NULL DEFAULT 'NONE' CHECK (redaction_status IN ('NONE','REDACTED','OMITTED')),
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_run_message_sequence_unique UNIQUE (organization_id, run_id, sequence),
  CONSTRAINT v2_agent_run_messages_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_run_message_run_tenant_fk
    FOREIGN KEY (organization_id, run_id)
    REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_agent_run_message_node_tenant_fk
    FOREIGN KEY (organization_id, run_node_id)
    REFERENCES v2_agent_run_nodes(organization_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v2_agent_confirmation_intents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  run_node_id TEXT,
  tool_call_id TEXT,
  policy_version_id TEXT NOT NULL,
  intent_key TEXT NOT NULL CHECK (intent_key ~ '^[A-Z][A-Z0-9_]{1,119}$'),
  intent_type TEXT NOT NULL CHECK (intent_type IN ('TOOL_INVOCATION','DOMAIN_MUTATION','EXTERNAL_SIDE_EFFECT')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
  action_payload JSONB NOT NULL CHECK (jsonb_typeof(action_payload) = 'object' AND octet_length(action_payload::text) <= 65536),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_confirmation_intent_unique UNIQUE (organization_id, run_id, intent_key, payload_hash),
  CONSTRAINT v2_agent_confirmation_intents_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_confirmation_intent_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT v2_agent_confirmation_intent_run_tenant_fk
    FOREIGN KEY (organization_id, run_id)
    REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_agent_confirmation_intent_node_tenant_fk
    FOREIGN KEY (organization_id, run_node_id)
    REFERENCES v2_agent_run_nodes(organization_id, id) ON DELETE SET NULL,
  CONSTRAINT v2_agent_confirmation_intent_policy_tenant_fk
    FOREIGN KEY (organization_id, policy_version_id)
    REFERENCES v2_agent_policy_versions(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS v2_agent_provider_usages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  run_node_id TEXT,
  tool_call_id TEXT,
  provider_key TEXT NOT NULL CHECK (provider_key ~ '^[a-z][a-z0-9._-]{0,119}$'),
  model_identifier TEXT NOT NULL CHECK (length(trim(model_identifier)) BETWEEN 1 AND 200),
  provider_api_version TEXT CHECK (provider_api_version IS NULL OR length(trim(provider_api_version)) BETWEEN 1 AND 120),
  usage_status TEXT NOT NULL CHECK (usage_status IN ('RECORDED','ESTIMATED','NOT_CONFIGURED','FAILED')),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response_hash TEXT CHECK (response_hash IS NULL OR response_hash ~ '^[a-f0-9]{64}$'),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  total_cost_micros BIGINT NOT NULL DEFAULT 0 CHECK (total_cost_micros >= 0),
  currency_code TEXT NOT NULL DEFAULT 'USD' CHECK (currency_code ~ '^[A-Z]{3}$'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_provider_usage_request_unique UNIQUE (organization_id, run_id, provider_key, request_hash),
  CONSTRAINT v2_agent_provider_usages_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_provider_usage_complete_after_start CHECK (completed_at IS NULL OR completed_at >= started_at),
  CONSTRAINT v2_agent_provider_usage_run_tenant_fk
    FOREIGN KEY (organization_id, run_id)
    REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_agent_provider_usage_node_tenant_fk
    FOREIGN KEY (organization_id, run_node_id)
    REFERENCES v2_agent_run_nodes(organization_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v2_agent_evaluations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  run_node_id TEXT,
  policy_version_id TEXT NOT NULL,
  evaluation_key TEXT NOT NULL CHECK (evaluation_key ~ '^[a-z][a-z0-9._-]{0,119}$'),
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('RUN','RUN_NODE','TOOL_CALL','ARTIFACT','WORKFLOW_VERSION')),
  subject_ref TEXT NOT NULL CHECK (length(trim(subject_ref)) BETWEEN 1 AND 160),
  evaluator_kind TEXT NOT NULL CHECK (evaluator_kind IN ('RULE','HUMAN','PROVIDER')),
  status TEXT NOT NULL CHECK (status IN ('PENDING','PASSED','FAILED','INCONCLUSIVE')),
  score NUMERIC(6,5) CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_summary) = 'object' AND octet_length(result_summary::text) <= 65536),
  result_hash TEXT NOT NULL CHECK (result_hash ~ '^[a-f0-9]{64}$'),
  evaluated_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_evaluation_unique UNIQUE (organization_id, run_id, evaluation_key, subject_kind, subject_ref, result_hash),
  CONSTRAINT v2_agent_evaluations_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_evaluation_run_tenant_fk
    FOREIGN KEY (organization_id, run_id)
    REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_agent_evaluation_node_tenant_fk
    FOREIGN KEY (organization_id, run_node_id)
    REFERENCES v2_agent_run_nodes(organization_id, id) ON DELETE SET NULL,
  CONSTRAINT v2_agent_evaluation_policy_tenant_fk
    FOREIGN KEY (organization_id, policy_version_id)
    REFERENCES v2_agent_policy_versions(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS v2_agent_lineage_refs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  originating_event_id TEXT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('RUN_INPUT','RUN_OUTPUT','ARTIFACT','TOOL_INPUT','TOOL_OUTPUT','PROVIDER_REQUEST','PROVIDER_RESPONSE','EVALUATION_CASE','EVALUATION_RESULT','DOMAIN_RECORD')),
  source_ref TEXT NOT NULL CHECK (length(trim(source_ref)) BETWEEN 1 AND 160),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('RUN_INPUT','RUN_OUTPUT','ARTIFACT','TOOL_INPUT','TOOL_OUTPUT','PROVIDER_REQUEST','PROVIDER_RESPONSE','EVALUATION_CASE','EVALUATION_RESULT','DOMAIN_RECORD')),
  target_ref TEXT NOT NULL CHECK (length(trim(target_ref)) BETWEEN 1 AND 160),
  relation_type TEXT NOT NULL CHECK (relation_type IN ('DERIVED_FROM','CONSUMED','PRODUCED','EVALUATED','GROUNDED_BY','CONFIRMED_BY')),
  source_content_hash TEXT CHECK (source_content_hash IS NULL OR source_content_hash ~ '^[a-f0-9]{64}$'),
  target_content_hash TEXT CHECK (target_content_hash IS NULL OR target_content_hash ~ '^[a-f0-9]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384),
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_lineage_ref_unique UNIQUE (organization_id, run_id, source_kind, source_ref, target_kind, target_ref, relation_type),
  CONSTRAINT v2_agent_lineage_refs_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_lineage_ref_run_tenant_fk
    FOREIGN KEY (organization_id, run_id)
    REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE
);

-- Supply composite parent keys for the P6 records now referenced by Phase 9,
-- then bind every new association to its tenant as well as its identifier.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_agent_runs','v2_agent_jobs','v2_agent_events','v2_agent_tool_calls','v2_agent_artifacts','v2_agent_confirmations',
    'v2_agent_definitions','v2_agent_definition_versions','v2_agent_workflows','v2_agent_workflow_versions',
    'v2_agent_tools','v2_agent_tool_versions','v2_agent_policies','v2_agent_policy_versions','v2_agent_workflow_tool_bindings',
    'v2_agent_run_nodes','v2_agent_run_messages','v2_agent_confirmation_intents','v2_agent_provider_usages','v2_agent_evaluations','v2_agent_lineage_refs'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = format('%s_org_id_unique', t)) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (organization_id, id)', t, format('%s_org_id_unique', t));
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_run_protocol_version_check') THEN
    ALTER TABLE v2_agent_runs ADD CONSTRAINT v2_agent_run_protocol_version_check CHECK (length(trim(protocol_version)) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_job_protocol_version_check') THEN
    ALTER TABLE v2_agent_jobs ADD CONSTRAINT v2_agent_job_protocol_version_check CHECK (length(trim(protocol_version)) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_event_protocol_version_check') THEN
    ALTER TABLE v2_agent_events ADD CONSTRAINT v2_agent_event_protocol_version_check CHECK (length(trim(protocol_version)) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_event_schema_version_check') THEN
    ALTER TABLE v2_agent_events ADD CONSTRAINT v2_agent_event_schema_version_check CHECK (length(trim(event_schema_version)) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_tool_call_attempt_check') THEN
    ALTER TABLE v2_agent_tool_calls ADD CONSTRAINT v2_agent_tool_call_attempt_check CHECK (attempt BETWEEN 1 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_tool_version_mutation_adapter_check') THEN
    ALTER TABLE v2_agent_tool_versions ADD CONSTRAINT v2_agent_tool_version_mutation_adapter_check CHECK (mode = 'READ_ONLY' OR adapter_key = 'formula.candidate_save_draft');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_artifact_protocol_version_check') THEN
    ALTER TABLE v2_agent_artifacts ADD CONSTRAINT v2_agent_artifact_protocol_version_check CHECK (length(trim(protocol_version)) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_artifact_schema_version_check') THEN
    ALTER TABLE v2_agent_artifacts ADD CONSTRAINT v2_agent_artifact_schema_version_check CHECK (length(trim(schema_version)) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_artifact_redaction_status_check') THEN
    ALTER TABLE v2_agent_artifacts ADD CONSTRAINT v2_agent_artifact_redaction_status_check CHECK (redaction_status IN ('NONE','REDACTED','OMITTED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_confirmation_protocol_version_check') THEN
    ALTER TABLE v2_agent_confirmations ADD CONSTRAINT v2_agent_confirmation_protocol_version_check CHECK (length(trim(protocol_version)) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_confirmation_rationale_hash_check') THEN
    ALTER TABLE v2_agent_confirmations ADD CONSTRAINT v2_agent_confirmation_rationale_hash_check CHECK (decision_rationale_hash IS NULL OR decision_rationale_hash ~ '^[a-f0-9]{64}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_definition_active_version_tenant_fk') THEN
    ALTER TABLE v2_agent_definitions ADD CONSTRAINT v2_agent_definition_active_version_tenant_fk FOREIGN KEY (organization_id, active_version_id) REFERENCES v2_agent_definition_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_workflow_active_version_tenant_fk') THEN
    ALTER TABLE v2_agent_workflows ADD CONSTRAINT v2_agent_workflow_active_version_tenant_fk FOREIGN KEY (organization_id, active_version_id) REFERENCES v2_agent_workflow_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_tool_active_version_tenant_fk') THEN
    ALTER TABLE v2_agent_tools ADD CONSTRAINT v2_agent_tool_active_version_tenant_fk FOREIGN KEY (organization_id, active_version_id) REFERENCES v2_agent_tool_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_policy_active_version_tenant_fk') THEN
    ALTER TABLE v2_agent_policies ADD CONSTRAINT v2_agent_policy_active_version_tenant_fk FOREIGN KEY (organization_id, active_version_id) REFERENCES v2_agent_policy_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_run_definition_version_tenant_fk') THEN
    ALTER TABLE v2_agent_runs ADD CONSTRAINT v2_agent_run_definition_version_tenant_fk FOREIGN KEY (organization_id, agent_definition_version_id) REFERENCES v2_agent_definition_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_run_workflow_version_tenant_fk') THEN
    ALTER TABLE v2_agent_runs ADD CONSTRAINT v2_agent_run_workflow_version_tenant_fk FOREIGN KEY (organization_id, workflow_version_id) REFERENCES v2_agent_workflow_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_run_policy_version_tenant_fk') THEN
    ALTER TABLE v2_agent_runs ADD CONSTRAINT v2_agent_run_policy_version_tenant_fk FOREIGN KEY (organization_id, policy_version_id) REFERENCES v2_agent_policy_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_run_parent_tenant_fk') THEN
    ALTER TABLE v2_agent_runs ADD CONSTRAINT v2_agent_run_parent_tenant_fk FOREIGN KEY (organization_id, parent_run_id) REFERENCES v2_agent_runs(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_run_causation_event_tenant_fk') THEN
    ALTER TABLE v2_agent_runs ADD CONSTRAINT v2_agent_run_causation_event_tenant_fk FOREIGN KEY (organization_id, causation_event_id) REFERENCES v2_agent_events(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_job_policy_tenant_fk') THEN
    ALTER TABLE v2_agent_jobs ADD CONSTRAINT v2_agent_job_policy_tenant_fk FOREIGN KEY (organization_id, policy_version_id) REFERENCES v2_agent_policy_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_job_node_tenant_fk') THEN
    ALTER TABLE v2_agent_jobs ADD CONSTRAINT v2_agent_job_node_tenant_fk FOREIGN KEY (organization_id, run_node_id) REFERENCES v2_agent_run_nodes(organization_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_event_causation_tenant_fk') THEN
    ALTER TABLE v2_agent_events ADD CONSTRAINT v2_agent_event_causation_tenant_fk FOREIGN KEY (organization_id, causation_event_id) REFERENCES v2_agent_events(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_event_node_tenant_fk') THEN
    ALTER TABLE v2_agent_events ADD CONSTRAINT v2_agent_event_node_tenant_fk FOREIGN KEY (organization_id, run_node_id) REFERENCES v2_agent_run_nodes(organization_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_tool_call_version_tenant_fk') THEN
    ALTER TABLE v2_agent_tool_calls ADD CONSTRAINT v2_agent_tool_call_version_tenant_fk FOREIGN KEY (organization_id, tool_version_id) REFERENCES v2_agent_tool_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_tool_call_policy_tenant_fk') THEN
    ALTER TABLE v2_agent_tool_calls ADD CONSTRAINT v2_agent_tool_call_policy_tenant_fk FOREIGN KEY (organization_id, policy_version_id) REFERENCES v2_agent_policy_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_tool_call_node_tenant_fk') THEN
    ALTER TABLE v2_agent_tool_calls ADD CONSTRAINT v2_agent_tool_call_node_tenant_fk FOREIGN KEY (organization_id, run_node_id) REFERENCES v2_agent_run_nodes(organization_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_tool_call_intent_tenant_fk') THEN
    ALTER TABLE v2_agent_tool_calls ADD CONSTRAINT v2_agent_tool_call_intent_tenant_fk FOREIGN KEY (organization_id, confirmation_intent_id) REFERENCES v2_agent_confirmation_intents(organization_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_artifact_node_tenant_fk') THEN
    ALTER TABLE v2_agent_artifacts ADD CONSTRAINT v2_agent_artifact_node_tenant_fk FOREIGN KEY (organization_id, run_node_id) REFERENCES v2_agent_run_nodes(organization_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_confirmation_intent_tenant_fk') THEN
    ALTER TABLE v2_agent_confirmations ADD CONSTRAINT v2_agent_confirmation_intent_tenant_fk FOREIGN KEY (organization_id, confirmation_intent_id) REFERENCES v2_agent_confirmation_intents(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_confirmation_policy_tenant_fk') THEN
    ALTER TABLE v2_agent_confirmations ADD CONSTRAINT v2_agent_confirmation_policy_tenant_fk FOREIGN KEY (organization_id, policy_version_id) REFERENCES v2_agent_policy_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_confirmation_intent_tool_tenant_fk') THEN
    ALTER TABLE v2_agent_confirmation_intents ADD CONSTRAINT v2_agent_confirmation_intent_tool_tenant_fk FOREIGN KEY (organization_id, tool_call_id) REFERENCES v2_agent_tool_calls(organization_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_provider_usage_tool_tenant_fk') THEN
    ALTER TABLE v2_agent_provider_usages ADD CONSTRAINT v2_agent_provider_usage_tool_tenant_fk FOREIGN KEY (organization_id, tool_call_id) REFERENCES v2_agent_tool_calls(organization_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_lineage_event_tenant_fk') THEN
    ALTER TABLE v2_agent_lineage_refs ADD CONSTRAINT v2_agent_lineage_event_tenant_fk FOREIGN KEY (organization_id, originating_event_id) REFERENCES v2_agent_events(organization_id, id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS v2_agent_tool_calls_invocation_key_unique
  ON v2_agent_tool_calls(organization_id, run_id, invocation_key)
  WHERE invocation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS v2_agent_runs_phase9_versions_idx
  ON v2_agent_runs(organization_id, workflow_version_id, policy_version_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_agent_run_nodes_status_idx
  ON v2_agent_run_nodes(organization_id, run_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS v2_agent_run_messages_replay_idx
  ON v2_agent_run_messages(organization_id, run_id, sequence);
CREATE INDEX IF NOT EXISTS v2_agent_confirmation_intents_pending_idx
  ON v2_agent_confirmation_intents(organization_id, run_id, expires_at ASC);
CREATE INDEX IF NOT EXISTS v2_agent_provider_usages_run_idx
  ON v2_agent_provider_usages(organization_id, run_id, provider_key, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_agent_evaluations_run_idx
  ON v2_agent_evaluations(organization_id, run_id, evaluation_key, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_agent_lineage_refs_run_idx
  ON v2_agent_lineage_refs(organization_id, run_id, created_at ASC);

-- Persisted runtime payloads are metadata/evidence envelopes, never raw
-- prompts, hidden reasoning, credentials, or authorization material. The
-- check is intentionally narrow and recursive so ordinary domain references
-- and schema metadata remain valid.
CREATE OR REPLACE FUNCTION public.v2_agent_runtime_payload_is_safe(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  WITH RECURSIVE walk(value) AS (
    SELECT candidate
    UNION ALL
    SELECT child.value
    FROM walk
    CROSS JOIN LATERAL (
      SELECT object_values.value
      FROM jsonb_each(CASE WHEN jsonb_typeof(walk.value) = 'object' THEN walk.value ELSE '{}'::jsonb END) AS object_values(key, value)
      UNION ALL
      SELECT array_values.value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(walk.value) = 'array' THEN walk.value ELSE '[]'::jsonb END) AS array_values(value)
    ) AS child
  )
  SELECT candidate IS NOT NULL
    AND jsonb_typeof(candidate) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM walk
      CROSS JOIN LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(walk.value) = 'object' THEN walk.value ELSE '{}'::jsonb END) AS object_keys(key)
      WHERE lower(regexp_replace(object_keys.key, '[-_]', '', 'g')) = ANY (ARRAY['prompt','systemprompt','reasoning','chainofthought','apikey','authorization','secret','token'])
    );
$$;

CREATE OR REPLACE FUNCTION public.v2_reject_agent_runtime_unsafe_payload()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE candidate JSONB;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'v2_agent_events' THEN candidate := NEW.payload;
    WHEN 'v2_agent_artifacts' THEN candidate := NEW.payload;
    WHEN 'v2_agent_run_messages' THEN candidate := NEW.payload;
    WHEN 'v2_agent_confirmation_intents' THEN candidate := NEW.action_payload;
    ELSE RAISE EXCEPTION 'V2_AGENT_RUNTIME_PAYLOAD_TRIGGER_MISCONFIGURED';
  END CASE;
  IF NOT public.v2_agent_runtime_payload_is_safe(candidate) THEN
    RAISE EXCEPTION 'V2_AGENT_RUNTIME_UNSAFE_PAYLOAD';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v2_agent_event_safe_payload ON v2_agent_events;
CREATE TRIGGER v2_agent_event_safe_payload BEFORE INSERT OR UPDATE OF payload ON v2_agent_events FOR EACH ROW EXECUTE FUNCTION public.v2_reject_agent_runtime_unsafe_payload();
DROP TRIGGER IF EXISTS v2_agent_artifact_safe_payload ON v2_agent_artifacts;
CREATE TRIGGER v2_agent_artifact_safe_payload BEFORE INSERT OR UPDATE OF payload ON v2_agent_artifacts FOR EACH ROW EXECUTE FUNCTION public.v2_reject_agent_runtime_unsafe_payload();
DROP TRIGGER IF EXISTS v2_agent_run_message_safe_payload ON v2_agent_run_messages;
CREATE TRIGGER v2_agent_run_message_safe_payload BEFORE INSERT OR UPDATE OF payload ON v2_agent_run_messages FOR EACH ROW EXECUTE FUNCTION public.v2_reject_agent_runtime_unsafe_payload();
DROP TRIGGER IF EXISTS v2_agent_confirmation_intent_safe_payload ON v2_agent_confirmation_intents;
CREATE TRIGGER v2_agent_confirmation_intent_safe_payload BEFORE INSERT OR UPDATE OF action_payload ON v2_agent_confirmation_intents FOR EACH ROW EXECUTE FUNCTION public.v2_reject_agent_runtime_unsafe_payload();

-- Identities may advance their active pointer, but runtime selection may only
-- target an immutable PUBLISHED snapshot. DRAFT/RETIRED versions remain
-- durable evidence and cannot be selected accidentally.
CREATE OR REPLACE FUNCTION public.v2_require_agent_active_version_published()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE is_published BOOLEAN;
BEGIN
  IF NEW.active_version_id IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE organization_id = $1 AND id = $2 AND status = ''PUBLISHED'')', TG_ARGV[0])
    INTO is_published
    USING NEW.organization_id, NEW.active_version_id;
  IF NOT is_published THEN
    RAISE EXCEPTION 'V2_AGENT_ACTIVE_VERSION_NOT_PUBLISHED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v2_agent_definition_active_version_published ON v2_agent_definitions;
CREATE TRIGGER v2_agent_definition_active_version_published
  BEFORE INSERT OR UPDATE OF active_version_id ON v2_agent_definitions
  FOR EACH ROW EXECUTE FUNCTION public.v2_require_agent_active_version_published('v2_agent_definition_versions');
DROP TRIGGER IF EXISTS v2_agent_workflow_active_version_published ON v2_agent_workflows;
CREATE TRIGGER v2_agent_workflow_active_version_published
  BEFORE INSERT OR UPDATE OF active_version_id ON v2_agent_workflows
  FOR EACH ROW EXECUTE FUNCTION public.v2_require_agent_active_version_published('v2_agent_workflow_versions');
DROP TRIGGER IF EXISTS v2_agent_tool_active_version_published ON v2_agent_tools;
CREATE TRIGGER v2_agent_tool_active_version_published
  BEFORE INSERT OR UPDATE OF active_version_id ON v2_agent_tools
  FOR EACH ROW EXECUTE FUNCTION public.v2_require_agent_active_version_published('v2_agent_tool_versions');
DROP TRIGGER IF EXISTS v2_agent_policy_active_version_published ON v2_agent_policies;
CREATE TRIGGER v2_agent_policy_active_version_published
  BEFORE INSERT OR UPDATE OF active_version_id ON v2_agent_policies
  FOR EACH ROW EXECUTE FUNCTION public.v2_require_agent_active_version_published('v2_agent_policy_versions');

-- A runnable workflow snapshot is only meaningful when its immutable
-- definition, policy, and bound tool snapshots are already PUBLISHED. This
-- also covers direct insert-as-PUBLISHED bootstrap records.
CREATE OR REPLACE FUNCTION public.v2_require_agent_workflow_dependencies_published()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE definition_is_published BOOLEAN;
DECLARE policy_is_published BOOLEAN;
DECLARE tools_are_published BOOLEAN;
DECLARE workflow_status TEXT;
DECLARE tool_is_published BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'v2_agent_workflow_versions' THEN
    IF NEW.status <> 'PUBLISHED' THEN
      RETURN NEW;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM v2_agent_definition_versions
      WHERE organization_id = NEW.organization_id
        AND id = NEW.agent_definition_version_id
        AND status = 'PUBLISHED'
    ) INTO definition_is_published;
    SELECT EXISTS (
      SELECT 1 FROM v2_agent_policy_versions
      WHERE organization_id = NEW.organization_id
        AND id = NEW.policy_version_id
        AND status = 'PUBLISHED'
    ) INTO policy_is_published;
    SELECT NOT EXISTS (
      SELECT 1
      FROM v2_agent_workflow_tool_bindings AS binding
      JOIN v2_agent_tool_versions AS tool_version
        ON tool_version.organization_id = binding.organization_id
       AND tool_version.id = binding.tool_version_id
      WHERE binding.organization_id = NEW.organization_id
        AND binding.workflow_version_id = NEW.id
        AND tool_version.status <> 'PUBLISHED'
    ) INTO tools_are_published;
    IF NOT definition_is_published OR NOT policy_is_published OR NOT tools_are_published THEN
      RAISE EXCEPTION 'V2_AGENT_WORKFLOW_DEPENDENCY_NOT_PUBLISHED';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'v2_agent_workflow_tool_bindings' THEN
    SELECT status INTO workflow_status
    FROM v2_agent_workflow_versions
    WHERE organization_id = NEW.organization_id AND id = NEW.workflow_version_id;
    IF workflow_status = 'PUBLISHED' THEN
      SELECT EXISTS (
        SELECT 1 FROM v2_agent_tool_versions
        WHERE organization_id = NEW.organization_id
          AND id = NEW.tool_version_id
          AND status = 'PUBLISHED'
      ) INTO tool_is_published;
      IF NOT tool_is_published THEN
        RAISE EXCEPTION 'V2_AGENT_WORKFLOW_TOOL_NOT_PUBLISHED';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'V2_AGENT_WORKFLOW_DEPENDENCY_TRIGGER_MISCONFIGURED';
END;
$$;

DROP TRIGGER IF EXISTS v2_agent_workflow_version_published_dependencies ON v2_agent_workflow_versions;
CREATE TRIGGER v2_agent_workflow_version_published_dependencies
  BEFORE INSERT OR UPDATE OF status ON v2_agent_workflow_versions
  FOR EACH ROW EXECUTE FUNCTION public.v2_require_agent_workflow_dependencies_published();
DROP TRIGGER IF EXISTS v2_agent_workflow_binding_published_dependencies ON v2_agent_workflow_tool_bindings;
CREATE TRIGGER v2_agent_workflow_binding_published_dependencies
  BEFORE INSERT OR UPDATE ON v2_agent_workflow_tool_bindings
  FOR EACH ROW EXECUTE FUNCTION public.v2_require_agent_workflow_dependencies_published();

-- Version rows and durable evidence are append-only. Run nodes retain updates
-- because a worker must safely advance their execution status. Existing P6
-- event records intentionally remain untouched so their replay behavior stays
-- backwards compatible.
CREATE OR REPLACE FUNCTION public.v2_reject_agent_runtime_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'V2_AGENT_RUNTIME_APPEND_ONLY';
END;
$$;

-- A version snapshot's payload is immutable. Its lifecycle can make exactly
-- one narrow transition: DRAFT to PUBLISHED, or either non-terminal snapshot
-- to RETIRED. Runtime activation remains separately restricted to PUBLISHED.
CREATE OR REPLACE FUNCTION public.v2_guard_agent_runtime_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE active_reference_exists BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'V2_AGENT_RUNTIME_VERSION_APPEND_ONLY';
  END IF;
  IF to_jsonb(NEW) - ARRAY['status', 'published_by', 'published_at'] <> to_jsonb(OLD) - ARRAY['status', 'published_by', 'published_at'] THEN
    RAISE EXCEPTION 'V2_AGENT_RUNTIME_VERSION_IMMUTABLE';
  END IF;
  -- Switching an active immutable snapshot to RETIRED would make an identity
  -- pointer (or an active workflow dependency) non-runnable without a new
  -- published revision. Advance the replacement first, then retire the old
  -- snapshot.
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'RETIRED' THEN
    CASE TG_TABLE_NAME
      WHEN 'v2_agent_definition_versions' THEN
        SELECT EXISTS (
          SELECT 1 FROM v2_agent_definitions
          WHERE organization_id = OLD.organization_id AND active_version_id = OLD.id
        ) OR EXISTS (
          SELECT 1
          FROM v2_agent_workflows AS workflow
          JOIN v2_agent_workflow_versions AS workflow_version
            ON workflow_version.organization_id = workflow.organization_id
           AND workflow_version.id = workflow.active_version_id
          WHERE workflow.organization_id = OLD.organization_id
            AND workflow_version.agent_definition_version_id = OLD.id
        ) INTO active_reference_exists;
      WHEN 'v2_agent_policy_versions' THEN
        SELECT EXISTS (
          SELECT 1 FROM v2_agent_policies
          WHERE organization_id = OLD.organization_id AND active_version_id = OLD.id
        ) OR EXISTS (
          SELECT 1
          FROM v2_agent_workflows AS workflow
          JOIN v2_agent_workflow_versions AS workflow_version
            ON workflow_version.organization_id = workflow.organization_id
           AND workflow_version.id = workflow.active_version_id
          WHERE workflow.organization_id = OLD.organization_id
            AND workflow_version.policy_version_id = OLD.id
        ) INTO active_reference_exists;
      WHEN 'v2_agent_tool_versions' THEN
        SELECT EXISTS (
          SELECT 1 FROM v2_agent_tools
          WHERE organization_id = OLD.organization_id AND active_version_id = OLD.id
        ) OR EXISTS (
          SELECT 1
          FROM v2_agent_workflows AS workflow
          JOIN v2_agent_workflow_tool_bindings AS binding
            ON binding.organization_id = workflow.organization_id
           AND binding.workflow_version_id = workflow.active_version_id
          WHERE workflow.organization_id = OLD.organization_id
            AND binding.tool_version_id = OLD.id
        ) INTO active_reference_exists;
      WHEN 'v2_agent_workflow_versions' THEN
        SELECT EXISTS (
          SELECT 1 FROM v2_agent_workflows
          WHERE organization_id = OLD.organization_id AND active_version_id = OLD.id
        ) INTO active_reference_exists;
      ELSE
        active_reference_exists := FALSE;
    END CASE;
    IF active_reference_exists THEN
      RAISE EXCEPTION 'V2_AGENT_ACTIVE_VERSION_CANNOT_RETIRE';
    END IF;
  END IF;
  IF (OLD.status = 'DRAFT' AND NEW.status = 'PUBLISHED')
    OR (OLD.status IN ('DRAFT', 'PUBLISHED') AND NEW.status = 'RETIRED') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'V2_AGENT_RUNTIME_VERSION_LIFECYCLE_INVALID';
END;
$$;

DROP TRIGGER IF EXISTS v2_agent_definition_version_append_only ON v2_agent_definition_versions;
CREATE TRIGGER v2_agent_definition_version_append_only BEFORE UPDATE OR DELETE ON v2_agent_definition_versions FOR EACH ROW EXECUTE FUNCTION public.v2_guard_agent_runtime_version_mutation();
DROP TRIGGER IF EXISTS v2_agent_workflow_version_append_only ON v2_agent_workflow_versions;
CREATE TRIGGER v2_agent_workflow_version_append_only BEFORE UPDATE OR DELETE ON v2_agent_workflow_versions FOR EACH ROW EXECUTE FUNCTION public.v2_guard_agent_runtime_version_mutation();
DROP TRIGGER IF EXISTS v2_agent_tool_version_append_only ON v2_agent_tool_versions;
CREATE TRIGGER v2_agent_tool_version_append_only BEFORE UPDATE OR DELETE ON v2_agent_tool_versions FOR EACH ROW EXECUTE FUNCTION public.v2_guard_agent_runtime_version_mutation();
DROP TRIGGER IF EXISTS v2_agent_policy_version_append_only ON v2_agent_policy_versions;
CREATE TRIGGER v2_agent_policy_version_append_only BEFORE UPDATE OR DELETE ON v2_agent_policy_versions FOR EACH ROW EXECUTE FUNCTION public.v2_guard_agent_runtime_version_mutation();
DROP TRIGGER IF EXISTS v2_agent_workflow_tool_binding_append_only ON v2_agent_workflow_tool_bindings;
CREATE TRIGGER v2_agent_workflow_tool_binding_append_only BEFORE UPDATE OR DELETE ON v2_agent_workflow_tool_bindings FOR EACH ROW EXECUTE FUNCTION public.v2_reject_agent_runtime_immutable_mutation();
DROP TRIGGER IF EXISTS v2_agent_run_message_append_only ON v2_agent_run_messages;
CREATE TRIGGER v2_agent_run_message_append_only BEFORE UPDATE OR DELETE ON v2_agent_run_messages FOR EACH ROW EXECUTE FUNCTION public.v2_reject_agent_runtime_immutable_mutation();
DROP TRIGGER IF EXISTS v2_agent_confirmation_intent_append_only ON v2_agent_confirmation_intents;
CREATE TRIGGER v2_agent_confirmation_intent_append_only BEFORE UPDATE OR DELETE ON v2_agent_confirmation_intents FOR EACH ROW EXECUTE FUNCTION public.v2_reject_agent_runtime_immutable_mutation();
DROP TRIGGER IF EXISTS v2_agent_provider_usage_append_only ON v2_agent_provider_usages;
CREATE TRIGGER v2_agent_provider_usage_append_only BEFORE UPDATE OR DELETE ON v2_agent_provider_usages FOR EACH ROW EXECUTE FUNCTION public.v2_reject_agent_runtime_immutable_mutation();
DROP TRIGGER IF EXISTS v2_agent_evaluation_append_only ON v2_agent_evaluations;
CREATE TRIGGER v2_agent_evaluation_append_only BEFORE UPDATE OR DELETE ON v2_agent_evaluations FOR EACH ROW EXECUTE FUNCTION public.v2_reject_agent_runtime_immutable_mutation();
DROP TRIGGER IF EXISTS v2_agent_lineage_ref_append_only ON v2_agent_lineage_refs;
CREATE TRIGGER v2_agent_lineage_ref_append_only BEFORE UPDATE OR DELETE ON v2_agent_lineage_refs FOR EACH ROW EXECUTE FUNCTION public.v2_reject_agent_runtime_immutable_mutation();

REVOKE UPDATE, DELETE ON
  v2_agent_definition_versions, v2_agent_workflow_versions, v2_agent_tool_versions, v2_agent_policy_versions,
  v2_agent_workflow_tool_bindings, v2_agent_run_messages, v2_agent_confirmation_intents,
  v2_agent_provider_usages, v2_agent_evaluations, v2_agent_lineage_refs
  FROM PUBLIC;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_agent_definitions','v2_agent_definition_versions','v2_agent_workflows','v2_agent_workflow_versions',
    'v2_agent_tools','v2_agent_tool_versions','v2_agent_policies','v2_agent_policy_versions','v2_agent_workflow_tool_bindings',
    'v2_agent_run_nodes','v2_agent_run_messages','v2_agent_confirmation_intents','v2_agent_provider_usages',
    'v2_agent_evaluations','v2_agent_lineage_refs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON v2_agent_definitions, v2_agent_definition_versions, v2_agent_workflows, v2_agent_workflow_versions, v2_agent_tools, v2_agent_tool_versions, v2_agent_policies, v2_agent_policy_versions, v2_agent_workflow_tool_bindings, v2_agent_run_nodes, v2_agent_run_messages, v2_agent_confirmation_intents, v2_agent_provider_usages, v2_agent_evaluations, v2_agent_lineage_refs TO v2_app';
  END IF;
END $$;

-- Policy documents are persisted per tenant, so a registry/default update is
-- not sufficient for existing workspaces. Preserve all explicit grants and
-- change a version only when one of the role's required agent capabilities is
-- absent. The matrix mirrors the Phase 9 platform defaults.
WITH role_grants(role_key, permission) AS (
  VALUES
    ('Owner', 'agent.execute'), ('Owner', 'agent.view'), ('Owner', 'agent.observe'), ('Owner', 'agent.evaluate'), ('Owner', 'agent.confirmWrite'), ('Owner', 'agent.manageTools'),
    ('Admin', 'agent.execute'), ('Admin', 'agent.view'), ('Admin', 'agent.observe'), ('Admin', 'agent.evaluate'), ('Admin', 'agent.confirmWrite'), ('Admin', 'agent.manageTools'),
    ('Lab Manager', 'agent.view'), ('Lab Manager', 'agent.execute'),
    ('Perfumer', 'agent.view'), ('Perfumer', 'agent.execute'), ('Perfumer', 'agent.confirmWrite'),
    ('R&D Scientist', 'agent.view'), ('R&D Scientist', 'agent.execute'), ('R&D Scientist', 'agent.evaluate'),
    ('Lab Technician', 'agent.view'), ('Lab Technician', 'agent.execute'),
    ('Procurement', 'agent.view'), ('Procurement', 'agent.execute'),
    ('Finance', 'agent.view'), ('Finance', 'agent.execute'),
    ('Viewer', 'agent.view')
), affected_roles AS (
  SELECT DISTINCT role_key FROM role_grants
)
UPDATE v2_role_policies AS policy
SET
  permissions = (
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM (
      SELECT existing.permission
      FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
      UNION
      SELECT grant_row.permission
      FROM role_grants AS grant_row
      WHERE grant_row.role_key = policy.role_key
    ) AS merged
  ),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key IN (SELECT role_key FROM affected_roles)
  AND EXISTS (
    SELECT 1
    FROM role_grants AS required
    WHERE required.role_key = policy.role_key
      AND NOT policy.permissions ? required.permission
  );

-- Phase 9 evidence is immutable only once a row participates in the governed
-- runtime protocol. Phase 6 rows keep their historical mutation behavior,
-- while a P9 row cannot be changed into a legacy row to evade the guard.
CREATE OR REPLACE FUNCTION public.v2_guard_agent_runtime_p9_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.protocol_version = 'agent-runtime/v1' THEN
      RAISE EXCEPTION 'V2_AGENT_RUNTIME_PROTOCOL_APPEND_ONLY';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.protocol_version = 'agent-runtime/v1'
    OR NEW.protocol_version = 'agent-runtime/v1' THEN
    RAISE EXCEPTION 'V2_AGENT_RUNTIME_PROTOCOL_APPEND_ONLY';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v2_agent_event_p9_append_only ON v2_agent_events;
CREATE TRIGGER v2_agent_event_p9_append_only
  BEFORE UPDATE OR DELETE ON v2_agent_events
  FOR EACH ROW EXECUTE FUNCTION public.v2_guard_agent_runtime_p9_evidence_mutation();
DROP TRIGGER IF EXISTS v2_agent_artifact_p9_append_only ON v2_agent_artifacts;
CREATE TRIGGER v2_agent_artifact_p9_append_only
  BEFORE UPDATE OR DELETE ON v2_agent_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.v2_guard_agent_runtime_p9_evidence_mutation();

-- A node evaluation must reference a node from the same run, not merely any
-- node that happens to share the tenant. The parent composite key is purpose-
-- built for this association and leaves nullable run_node_id evaluations valid.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_run_nodes_org_run_id_unique') THEN
    ALTER TABLE v2_agent_run_nodes
      ADD CONSTRAINT v2_agent_run_nodes_org_run_id_unique UNIQUE (organization_id, run_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_confirmations_org_run_id_unique') THEN
    ALTER TABLE v2_agent_confirmations
      ADD CONSTRAINT v2_agent_confirmations_org_run_id_unique UNIQUE (organization_id, run_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_confirmation_intents_org_run_id_unique') THEN
    ALTER TABLE v2_agent_confirmation_intents
      ADD CONSTRAINT v2_agent_confirmation_intents_org_run_id_unique UNIQUE (organization_id, run_id, id);
  END IF;
END $$;

ALTER TABLE v2_agent_evaluations
  DROP CONSTRAINT IF EXISTS v2_agent_evaluation_node_tenant_fk;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_evaluation_node_run_tenant_fk') THEN
    ALTER TABLE v2_agent_evaluations
      ADD CONSTRAINT v2_agent_evaluation_node_run_tenant_fk
      FOREIGN KEY (organization_id, run_id, run_node_id)
      REFERENCES v2_agent_run_nodes(organization_id, run_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Confirmation effects model the durable handoff from an approved intent to
-- the Formula service. They are mutable state machines because recovery needs
-- to record bounded attempts, unlike the immutable request/evidence records.
CREATE TABLE IF NOT EXISTS v2_agent_confirmation_effects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  confirmation_id TEXT NOT NULL,
  confirmation_intent_id TEXT NOT NULL,
  effect_key TEXT NOT NULL CHECK (effect_key ~ '^[a-z][a-z0-9._-]{0,159}$'),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPLYING','APPLIED','FAILED')),
  result_ref TEXT,
  error_code TEXT CHECK (error_code IS NULL OR length(trim(error_code)) BETWEEN 1 AND 120),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  claim_token_hash TEXT CHECK (claim_token_hash IS NULL OR claim_token_hash ~ '^[a-f0-9]{64}$'),
  claim_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_agent_confirmation_effects_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_confirmation_effect_confirmation_unique UNIQUE (organization_id, confirmation_id),
  CONSTRAINT v2_agent_confirmation_effect_complete_after_start CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
  CONSTRAINT v2_agent_confirmation_effect_run_tenant_fk
    FOREIGN KEY (organization_id, run_id)
    REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_agent_confirmation_effect_confirmation_run_tenant_fk
    FOREIGN KEY (organization_id, run_id, confirmation_id)
    REFERENCES v2_agent_confirmations(organization_id, run_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_agent_confirmation_effect_intent_run_tenant_fk
    FOREIGN KEY (organization_id, run_id, confirmation_intent_id)
    REFERENCES v2_agent_confirmation_intents(organization_id, run_id, id) ON DELETE CASCADE
);

-- Active reservations make per-actor run quotas observable and race-safe when
-- paired with the runtime's transaction advisory lock. A terminal run releases
-- rather than deletes its reservation so concurrency evidence remains durable.
CREATE TABLE IF NOT EXISTS v2_agent_run_quota_reservations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  CONSTRAINT v2_agent_run_quota_reservations_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_agent_run_quota_reservation_run_unique UNIQUE (organization_id, run_id),
  CONSTRAINT v2_agent_run_quota_reservation_lifecycle_check
    CHECK ((status = 'ACTIVE' AND released_at IS NULL) OR (status = 'RELEASED' AND released_at IS NOT NULL)),
  CONSTRAINT v2_agent_run_quota_reservation_run_tenant_fk
    FOREIGN KEY (organization_id, run_id)
    REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'v2_agent_run_quota_reservation_run_tenant_fk'
      AND NOT condeferrable
  ) THEN
    ALTER TABLE v2_agent_run_quota_reservations
      DROP CONSTRAINT v2_agent_run_quota_reservation_run_tenant_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_run_quota_reservation_run_tenant_fk') THEN
    ALTER TABLE v2_agent_run_quota_reservations
      ADD CONSTRAINT v2_agent_run_quota_reservation_run_tenant_fk
      FOREIGN KEY (organization_id, run_id)
      REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- The Phase 6 base table was intentionally permissive while no external
-- provider existed. A recorded or completed provider response now requires a
-- bounded provenance hash; NOT_CONFIGURED remains a truthful no-call state.
ALTER TABLE v2_agent_provider_usages
  DROP CONSTRAINT IF EXISTS v2_agent_provider_usages_usage_status_check;
ALTER TABLE v2_agent_provider_usages
  DROP CONSTRAINT IF EXISTS v2_agent_provider_usage_status_check;
ALTER TABLE v2_agent_provider_usages
  DROP CONSTRAINT IF EXISTS v2_agent_provider_usage_response_provenance_check;
ALTER TABLE v2_agent_provider_usages
  ADD CONSTRAINT v2_agent_provider_usage_status_check
    CHECK (usage_status IN ('COMPLETED','RECORDED','ESTIMATED','NOT_CONFIGURED','FAILED'));
ALTER TABLE v2_agent_provider_usages
  ADD CONSTRAINT v2_agent_provider_usage_response_provenance_check
    CHECK (usage_status NOT IN ('COMPLETED','RECORDED') OR response_hash IS NOT NULL);

-- Formula confirmation processing may claim work before it calls the owning
-- domain service. PROCESSING prevents another recovery worker from treating an
-- accepted confirmation as an unclaimed terminal decision.
ALTER TABLE v2_agent_confirmations
  DROP CONSTRAINT IF EXISTS v2_agent_confirmations_status_check;
ALTER TABLE v2_agent_confirmations
  DROP CONSTRAINT IF EXISTS v2_agent_confirmation_status_check;
ALTER TABLE v2_agent_confirmations
  ADD CONSTRAINT v2_agent_confirmation_status_check
    CHECK (status IN ('PENDING','PROCESSING','ACCEPTED','REJECTED','EXPIRED','CANCELLED'));

-- The agent confirmation saga is a cross-service handoff. A fenced effect
-- claim prevents concurrent confirmers from invoking the Formula write, while
-- the Formula-level origin invariant remains the final duplicate-write guard.
ALTER TABLE v2_agent_confirmation_effects
  ADD COLUMN IF NOT EXISTS claim_token_hash TEXT CHECK (claim_token_hash IS NULL OR claim_token_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS v2_agent_confirmation_effects_run_idx
  ON v2_agent_confirmation_effects(organization_id, run_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS v2_agent_confirmation_effects_claim_idx
  ON v2_agent_confirmation_effects(organization_id, confirmation_id, status, claim_expires_at ASC);
CREATE INDEX IF NOT EXISTS v2_agent_run_quota_reservations_actor_idx
  ON v2_agent_run_quota_reservations(organization_id, actor_user_id, status, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS v2_formula_drafts_origin_reference_unique
  ON v2_formula_drafts(organization_id, formula_project_id, origin_type, origin_reference_id)
  WHERE origin_reference_id IS NOT NULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_agent_confirmation_effects', 'v2_agent_run_quota_reservations'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON v2_agent_confirmation_effects, v2_agent_run_quota_reservations TO v2_app';
  END IF;
END $$;
