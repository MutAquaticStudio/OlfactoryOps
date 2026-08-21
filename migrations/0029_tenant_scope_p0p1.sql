-- Tenant-isolation cutover for authorization, audit evidence, and customization.
-- Legacy global rows are quarantined below. No migration infers a tenant owner.

CREATE TABLE IF NOT EXISTS tenant_role_policies (
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL,
  mfa_required INTEGER NOT NULL DEFAULT 0,
  permissions_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, role),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_role_policies_org_role
  ON tenant_role_policies(organization_id, role);

CREATE TABLE IF NOT EXISTS platform_role_policies (
  role TEXT PRIMARY KEY,
  mfa_required INTEGER NOT NULL DEFAULT 0,
  permissions_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  organization_id TEXT NOT NULL,
  flag_key TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  phase INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, flag_key),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_org_phase
  ON tenant_feature_flags(organization_id, phase, flag_key);

CREATE TABLE IF NOT EXISTS tenant_numbering_sequences (
  organization_id TEXT NOT NULL,
  sequence_key TEXT NOT NULL,
  pattern TEXT NOT NULL,
  next_value INTEGER NOT NULL,
  scope TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, sequence_key),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_custom_fields (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  entity TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  options_json TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, entity, field_key),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_custom_fields_org_entity_status
  ON tenant_custom_fields(organization_id, entity, status);

CREATE TABLE IF NOT EXISTS tenant_audit_events (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  request_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id),
  UNIQUE (id),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_events_org_at
  ON tenant_audit_events(organization_id, at DESC, id DESC);

CREATE TABLE IF NOT EXISTS platform_audit_events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  request_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_events_at
  ON platform_audit_events(at DESC, id DESC);

CREATE TABLE IF NOT EXISTS tenant_audit_chain_events (
  event_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  previous_hash TEXT,
  event_hash TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (organization_id, sequence),
  FOREIGN KEY (organization_id, event_id)
    REFERENCES tenant_audit_events(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_chain_org_sequence
  ON tenant_audit_chain_events(organization_id, sequence DESC);

-- Preserve ambiguous historical rows for a controlled owner-only cutover.
-- They remain intentionally unread by the application until explicit ownership is supplied.
CREATE TABLE IF NOT EXISTS tenant_isolation_legacy_role_policies (
  role TEXT NOT NULL,
  scope TEXT NOT NULL,
  mfa_required INTEGER NOT NULL,
  permissions_json TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  quarantined_at TEXT NOT NULL,
  PRIMARY KEY (role, scope)
);

INSERT OR IGNORE INTO tenant_isolation_legacy_role_policies (
  role, scope, mfa_required, permissions_json, source_updated_at, quarantined_at
)
SELECT role, scope, mfa_required, permissions_json, updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM role_policies
WHERE scope <> 'platform';

INSERT OR IGNORE INTO platform_role_policies (role, mfa_required, permissions_json, updated_at)
SELECT role, mfa_required, permissions_json, updated_at
FROM role_policies
WHERE scope = 'platform';

CREATE TABLE IF NOT EXISTS tenant_isolation_legacy_customization_records (
  source_table TEXT NOT NULL,
  source_key TEXT NOT NULL,
  record_json TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  quarantined_at TEXT NOT NULL,
  PRIMARY KEY (source_table, source_key)
);

INSERT OR IGNORE INTO tenant_isolation_legacy_customization_records (
  source_table, source_key, record_json, source_updated_at, quarantined_at
)
SELECT 'feature_flags', flag_key,
  json_object('flagKey', flag_key, 'label', label, 'enabled', enabled, 'phase', phase),
  updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM feature_flags;

INSERT OR IGNORE INTO tenant_isolation_legacy_customization_records (
  source_table, source_key, record_json, source_updated_at, quarantined_at
)
SELECT 'numbering_sequences', sequence_key,
  json_object('sequenceKey', sequence_key, 'pattern', pattern, 'nextValue', next_value, 'scope', scope),
  updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM numbering_sequences;

INSERT OR IGNORE INTO tenant_isolation_legacy_customization_records (
  source_table, source_key, record_json, source_updated_at, quarantined_at
)
SELECT 'custom_fields', id,
  json_object('id', id, 'entity', entity, 'fieldKey', field_key, 'label', label, 'fieldType', field_type,
    'required', required, 'optionsJson', options_json, 'status', status),
  updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM custom_fields;

CREATE TABLE IF NOT EXISTS tenant_isolation_legacy_audit_events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  request_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  quarantined_at TEXT NOT NULL
);

INSERT OR IGNORE INTO tenant_isolation_legacy_audit_events (
  id, at, actor, action, entity, request_id, outcome, source_updated_at, quarantined_at
)
SELECT id, at, actor, action, entity, request_id, outcome, updated_at,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM audit_events;

CREATE TABLE IF NOT EXISTS tenant_isolation_legacy_audit_chains (
  event_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  previous_hash TEXT,
  event_hash TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  quarantined_at TEXT NOT NULL
);

INSERT OR IGNORE INTO tenant_isolation_legacy_audit_chains (
  event_id, organization_id, sequence, previous_hash, event_hash, recorded_at, quarantined_at
)
SELECT event_id, organization_id, sequence, previous_hash, event_hash, recorded_at,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM audit_chain_events;

INSERT INTO persistence_metadata (metadata_key, metadata_value, updated_at)
VALUES ('tenant-isolation-p0p1', 'legacy-global-records-quarantined', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(metadata_key) DO UPDATE SET
  metadata_value = excluded.metadata_value,
  updated_at = excluded.updated_at;
