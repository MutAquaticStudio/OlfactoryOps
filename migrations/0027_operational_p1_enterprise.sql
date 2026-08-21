-- Operational P1: tenant-scoped compliance, receipt quality, landed cost, and production quality evidence.
-- Legacy batches and purchase orders remain readable through existing normalized tables; no historic QC is fabricated.

CREATE TABLE IF NOT EXISTS material_compliance_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPROVED', 'REVIEW_REQUIRED', 'BLOCKED')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_material_compliance_profiles_organization_status
  ON material_compliance_profiles(organization_id, status);

CREATE TABLE IF NOT EXISTS supplier_material_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPROVED', 'REVIEW_REQUIRED', 'BLOCKED')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_material_profiles_organization_status
  ON supplier_material_profiles(organization_id, status);

CREATE TABLE IF NOT EXISTS procurement_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUARANTINE', 'INSPECTED', 'ACCEPTED', 'RETURNED')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_procurement_receipts_organization_status
  ON procurement_receipts(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS landed_cost_allocations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'POSTED'),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_landed_cost_allocations_organization_receipt
  ON landed_cost_allocations(organization_id, entity_id);

CREATE TABLE IF NOT EXISTS production_qc_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_production_qc_templates_organization_formula
  ON production_qc_templates(organization_id, entity_id, status);

CREATE TABLE IF NOT EXISTS production_qc_results (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'PASSED', 'FAILED', 'NOT_APPLICABLE')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_production_qc_results_organization_batch
  ON production_qc_results(organization_id, entity_id, status);

CREATE TABLE IF NOT EXISTS production_yield_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECORDED', 'RECONCILED')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_production_yield_records_organization_batch
  ON production_yield_records(organization_id, entity_id, status);

CREATE TABLE IF NOT EXISTS operation_idempotency_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED')),
  response_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (organization_id, operation, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_operation_idempotency_records_expiry
  ON operation_idempotency_records(created_at);
