-- Phase 8: tenant-scoped production manufacturing, release, and finished goods.
-- Raw material consumption continues to use the Phase 2 inventory ledger. Finished
-- goods deliberately have their own lot and immutable ledger; this migration never
-- attaches finished goods to v2_inventory_* or v2_shipments.

CREATE TABLE IF NOT EXISTS v2_production_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL CHECK (length(trim(order_number)) BETWEEN 2 AND 80),
  formula_version_id TEXT NOT NULL REFERENCES v2_formula_versions(id) ON DELETE RESTRICT,
  formula_snapshot_id TEXT,
  qc_specification_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PLANNED','READY_FOR_WEIGHING','WEIGHING','COMPOUNDING','CONDITIONING','FILTRATION','FILLING','QC','HOLD','REWORK','RELEASED','REJECTED','CANCELLED','CLOSED')),
  target_bulk_g NUMERIC(18,6) NOT NULL CHECK (target_bulk_g > 0),
  target_output_g NUMERIC(18,6) CHECK (target_output_g IS NULL OR target_output_g > 0),
  planned_start_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  equipment_ref TEXT CHECK (equipment_ref IS NULL OR length(trim(equipment_ref)) BETWEEN 1 AND 240),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  hold_reason TEXT CHECK (hold_reason IS NULL OR length(hold_reason) <= 2000),
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 2000),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  updated_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (due_at IS NULL OR planned_start_at IS NULL OR due_at >= planned_start_at),
  UNIQUE (organization_id, order_number)
);

CREATE TABLE IF NOT EXISTS v2_production_formula_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  formula_version_id TEXT NOT NULL REFERENCES v2_formula_versions(id) ON DELETE RESTRICT,
  formula_content_hash TEXT NOT NULL CHECK (formula_content_hash ~ '^[a-f0-9]{64}$'),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  captured_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, production_order_id),
  UNIQUE (organization_id, production_order_id, snapshot_hash)
);

CREATE TABLE IF NOT EXISTS v2_production_material_requirements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  component_snapshot JSONB NOT NULL CHECK (jsonb_typeof(component_snapshot) = 'object'),
  formula_component_hash TEXT NOT NULL CHECK (formula_component_hash ~ '^[a-f0-9]{64}$'),
  planned_quantity_g NUMERIC(18,6) NOT NULL CHECK (planned_quantity_g > 0),
  tolerance_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (tolerance_g >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ALLOCATED','WEIGHED','CONSUMED','SHORT','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, production_order_id, material_id)
);

CREATE TABLE IF NOT EXISTS v2_production_allocations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL REFERENCES v2_production_material_requirements(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  inventory_lot_id TEXT NOT NULL REFERENCES v2_inventory_lots(id) ON DELETE RESTRICT,
  inventory_reservation_id TEXT REFERENCES v2_inventory_reservations(id) ON DELETE RESTRICT,
  allocated_quantity_g NUMERIC(18,6) NOT NULL CHECK (allocated_quantity_g > 0),
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','ALLOCATED','CONSUMED','RELEASED','CANCELLED','EXPIRED')),
  allocated_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_production_weighing_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  lab_weighing_session_id TEXT NOT NULL UNIQUE REFERENCES v2_lab_weighing_sessions(id) ON DELETE RESTRICT,
  sequence_number INTEGER NOT NULL DEFAULT 1 CHECK (sequence_number > 0),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','CONFIRMED','ABORTED','CORRECTED')),
  planned_total_g NUMERIC(18,6) CHECK (planned_total_g IS NULL OR planned_total_g > 0),
  actual_total_g NUMERIC(18,6) CHECK (actual_total_g IS NULL OR actual_total_g > 0),
  started_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  confirmed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, production_order_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS v2_production_material_usages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL REFERENCES v2_production_material_requirements(id) ON DELETE RESTRICT,
  allocation_id TEXT NOT NULL REFERENCES v2_production_allocations(id) ON DELETE RESTRICT,
  weighing_session_id TEXT NOT NULL REFERENCES v2_production_weighing_sessions(id) ON DELETE RESTRICT,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  lot_id TEXT NOT NULL REFERENCES v2_inventory_lots(id) ON DELETE RESTRICT,
  lab_weighing_line_id TEXT NOT NULL REFERENCES v2_lab_weighing_lines(id) ON DELETE RESTRICT,
  inventory_movement_id TEXT NOT NULL REFERENCES v2_inventory_movements(id) ON DELETE RESTRICT,
  planned_quantity_g NUMERIC(18,6) CHECK (planned_quantity_g IS NULL OR planned_quantity_g > 0),
  actual_quantity_g NUMERIC(18,6) NOT NULL CHECK (actual_quantity_g > 0),
  cost_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cost_snapshot) = 'object'),
  cost_snapshot_hash TEXT NOT NULL CHECK (cost_snapshot_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'COMMITTED' CHECK (status IN ('COMMITTED','REVERSED')),
  reversal_movement_id TEXT REFERENCES v2_inventory_movements(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ,
  UNIQUE (organization_id, inventory_movement_id),
  UNIQUE (organization_id, lab_weighing_line_id)
);

CREATE TABLE IF NOT EXISTS v2_production_process_steps (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('COMPOUNDING','CONDITIONING','FILTRATION','FILLING')),
  sequence_number INTEGER NOT NULL DEFAULT 1 CHECK (sequence_number > 0),
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','SKIPPED','FAILED')),
  planned_parameters JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(planned_parameters) = 'object'),
  actual_parameters JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(actual_parameters) = 'object'),
  started_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  completed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
  UNIQUE (organization_id, production_order_id, stage, sequence_number)
);

CREATE TABLE IF NOT EXISTS v2_production_qc_specifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  formula_version_id TEXT REFERENCES v2_formula_versions(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  version_label TEXT NOT NULL CHECK (length(trim(version_label)) BETWEEN 1 AND 120),
  specification JSONB NOT NULL CHECK (jsonb_typeof(specification) = 'object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name, version_label),
  UNIQUE (organization_id, name, content_hash)
);

CREATE TABLE IF NOT EXISTS v2_production_qc_results (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  qc_specification_id TEXT NOT NULL REFERENCES v2_production_qc_specifications(id) ON DELETE RESTRICT,
  check_key TEXT NOT NULL CHECK (check_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  result_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (result_status IN ('PENDING','PASSED','FAILED','NOT_APPLICABLE','INVALIDATED')),
  observed_value JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(observed_value) IN ('object','string','number','boolean')),
  evaluation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evaluation_snapshot) = 'object'),
  evidence_snapshot_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_snapshot_ids) = 'array'),
  recorded_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, production_order_id, qc_specification_id, check_key)
);

CREATE TABLE IF NOT EXISTS v2_production_deviations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  requirement_id TEXT,
  process_step_id TEXT,
  qc_result_id TEXT,
  weighing_session_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('MATERIAL','WEIGHING','PROCESS','QC','DOCUMENTATION','EQUIPMENT','OTHER')),
  severity TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_INVESTIGATION','CAPA_REQUIRED','CLOSED','VOIDED')),
  disposition TEXT CHECK (disposition IN ('CONTINUE','HOLD','REWORK','REJECT')),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 4000),
  immediate_action TEXT CHECK (immediate_action IS NULL OR length(immediate_action) <= 2000),
  root_cause TEXT CHECK (root_cause IS NULL OR length(root_cause) <= 4000),
  detected_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'CLOSED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL) OR status <> 'CLOSED')
);

CREATE TABLE IF NOT EXISTS v2_production_capa_actions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  deviation_id TEXT NOT NULL REFERENCES v2_production_deviations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('CORRECTIVE','PREVENTIVE')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','EFFECTIVENESS_PENDING','EFFECTIVE','INEFFECTIVE','CANCELLED')),
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 2000),
  owner_user_id TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  verification_plan TEXT CHECK (verification_plan IS NULL OR length(verification_plan) <= 2000),
  completion_notes TEXT CHECK (completion_notes IS NULL OR length(completion_notes) <= 2000),
  completed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  verified_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_production_yield_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  input_consumed_g NUMERIC(18,6) NOT NULL CHECK (input_consumed_g >= 0),
  bulk_output_g NUMERIC(18,6) NOT NULL CHECK (bulk_output_g >= 0),
  filled_output_g NUMERIC(18,6) CHECK (filled_output_g IS NULL OR filled_output_g >= 0),
  waste_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (waste_g >= 0),
  rework_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (rework_g >= 0),
  expected_loss_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (expected_loss_g >= 0),
  reconciliation_delta_g NUMERIC(18,6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED','RECONCILED','REVIEW_REQUIRED','VOIDED')),
  rationale TEXT CHECK (rationale IS NULL OR length(rationale) <= 2000),
  recorded_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (filled_output_g IS NULL OR filled_output_g <= bulk_output_g),
  UNIQUE (organization_id, production_order_id, revision)
);

CREATE TABLE IF NOT EXISTS v2_production_rework_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  source_finished_good_lot_id TEXT,
  quantity_g NUMERIC(18,6) NOT NULL CHECK (quantity_g > 0),
  target_stage TEXT NOT NULL CHECK (target_stage IN ('COMPOUNDING','CONDITIONING','FILTRATION','FILLING')),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS v2_production_releases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RELEASED','REJECTED','CANCELLED')),
  gate_snapshot JSONB NOT NULL CHECK (jsonb_typeof(gate_snapshot) = 'object'),
  gate_checksum TEXT NOT NULL CHECK (gate_checksum ~ '^[a-f0-9]{64}$'),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 2000),
  released_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  rejected_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'RELEASED' AND released_by IS NOT NULL AND released_at IS NOT NULL) OR (status = 'REJECTED' AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL) OR status IN ('PENDING','CANCELLED')),
  UNIQUE (organization_id, production_order_id)
);

CREATE TABLE IF NOT EXISTS v2_finished_good_lots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE RESTRICT,
  production_release_id TEXT NOT NULL REFERENCES v2_production_releases(id) ON DELETE RESTRICT,
  formula_version_id TEXT NOT NULL REFERENCES v2_formula_versions(id) ON DELETE RESTRICT,
  formula_snapshot_id TEXT NOT NULL REFERENCES v2_production_formula_snapshots(id) ON DELETE RESTRICT,
  lot_number TEXT NOT NULL CHECK (length(trim(lot_number)) BETWEEN 2 AND 80),
  initial_quantity_g NUMERIC(18,6) NOT NULL CHECK (initial_quantity_g > 0),
  location TEXT NOT NULL CHECK (length(trim(location)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'QUARANTINE' CHECK (status IN ('QUARANTINE','RELEASED','HOLD','REWORK','REJECTED','EXHAUSTED','EXPIRED','ARCHIVED')),
  manufactured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  released_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at >= manufactured_at),
  CHECK ((status = 'RELEASED' AND released_by IS NOT NULL AND released_at IS NOT NULL) OR status <> 'RELEASED'),
  UNIQUE (organization_id, lot_number),
  UNIQUE (organization_id, production_release_id)
);

CREATE TABLE IF NOT EXISTS v2_finished_good_ledger_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  finished_good_lot_id TEXT NOT NULL REFERENCES v2_finished_good_lots(id) ON DELETE RESTRICT,
  production_order_id TEXT REFERENCES v2_production_orders(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('PRODUCTION_OUTPUT','QUALITY_HOLD','QUALITY_RELEASE','REWORK_CONSUMPTION','WASTE','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN','RESERVATION','RELEASE_RESERVATION','FULFILLMENT')),
  quantity_g NUMERIC(18,6) NOT NULL CHECK (quantity_g > 0),
  from_bucket TEXT CHECK (from_bucket IN ('QUARANTINE','AVAILABLE','HOLD','REWORK','RESERVED')),
  to_bucket TEXT CHECK (to_bucket IN ('QUARANTINE','AVAILABLE','HOLD','REWORK','RESERVED')),
  reference_type TEXT NOT NULL CHECK (length(trim(reference_type)) BETWEEN 1 AND 120),
  reference_id TEXT NOT NULL CHECK (length(trim(reference_id)) BETWEEN 1 AND 160),
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 200),
  actor_user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_bucket IS NOT NULL OR to_bucket IS NOT NULL),
  CHECK (
    (movement_type = 'PRODUCTION_OUTPUT' AND from_bucket IS NULL AND to_bucket = 'QUARANTINE')
    OR (movement_type = 'QUALITY_HOLD' AND from_bucket IN ('QUARANTINE','AVAILABLE') AND to_bucket = 'HOLD')
    OR (movement_type = 'QUALITY_RELEASE' AND from_bucket IN ('QUARANTINE','HOLD') AND to_bucket = 'AVAILABLE')
    OR (movement_type = 'REWORK_CONSUMPTION' AND from_bucket IN ('QUARANTINE','AVAILABLE','HOLD') AND to_bucket = 'REWORK')
    OR (movement_type = 'WASTE' AND from_bucket IS NOT NULL AND to_bucket IS NULL)
    OR (movement_type = 'ADJUSTMENT_IN' AND from_bucket IS NULL AND to_bucket IS NOT NULL)
    OR (movement_type = 'ADJUSTMENT_OUT' AND from_bucket IS NOT NULL AND to_bucket IS NULL)
    OR (movement_type = 'RETURN' AND from_bucket IS NULL AND to_bucket IN ('QUARANTINE','AVAILABLE'))
    OR (movement_type = 'RESERVATION' AND from_bucket = 'AVAILABLE' AND to_bucket = 'RESERVED')
    OR (movement_type = 'RELEASE_RESERVATION' AND from_bucket = 'RESERVED' AND to_bucket = 'AVAILABLE')
    OR (movement_type = 'FULFILLMENT' AND from_bucket = 'RESERVED' AND to_bucket IS NULL)
  ),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS v2_production_genealogy_edges (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  from_entity_type TEXT NOT NULL CHECK (from_entity_type IN ('PRODUCTION_ORDER','FORMULA_VERSION','FORMULA_SNAPSHOT','MATERIAL','RAW_MATERIAL_LOT','RAW_MATERIAL_USAGE','WEIGHING_SESSION','PROCESS_STEP','QC_SPECIFICATION','QC_RESULT','DEVIATION','CAPA_ACTION','YIELD_RECORD','REWORK_RECORD','RELEASE','FINISHED_GOOD_LOT','FINISHED_GOOD_LEDGER_ENTRY','DOCUMENT_SNAPSHOT')),
  from_entity_id TEXT NOT NULL CHECK (length(trim(from_entity_id)) BETWEEN 1 AND 160),
  to_entity_type TEXT NOT NULL CHECK (to_entity_type IN ('PRODUCTION_ORDER','FORMULA_VERSION','FORMULA_SNAPSHOT','MATERIAL','RAW_MATERIAL_LOT','RAW_MATERIAL_USAGE','WEIGHING_SESSION','PROCESS_STEP','QC_SPECIFICATION','QC_RESULT','DEVIATION','CAPA_ACTION','YIELD_RECORD','REWORK_RECORD','RELEASE','FINISHED_GOOD_LOT','FINISHED_GOOD_LEDGER_ENTRY','DOCUMENT_SNAPSHOT')),
  to_entity_id TEXT NOT NULL CHECK (length(trim(to_entity_id)) BETWEEN 1 AND 160),
  edge_type TEXT NOT NULL CHECK (edge_type IN ('USES_FORMULA_VERSION','SNAPSHOTS_FORMULA','REQUIRES_MATERIAL','ALLOCATES_RAW_LOT','WEIGHED_FROM_RAW_LOT','CONSUMES_RAW_LOT','PROCESSED_BY','INSPECTED_BY','HAS_DEVIATION','MITIGATED_BY','YIELDED','REWORKS','RELEASED_AS','DOCUMENTED_BY','MOVES_FINISHED_GOOD')),
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence_snapshot) = 'object'),
  created_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, production_order_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, edge_type)
);

CREATE TABLE IF NOT EXISTS v2_production_document_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  production_order_id TEXT NOT NULL REFERENCES v2_production_orders(id) ON DELETE CASCADE,
  document_kind TEXT NOT NULL CHECK (document_kind IN ('FORMULA','MATERIAL_SDS','MATERIAL_COA','PROCESS_RECORD','QC_EVIDENCE','RELEASE_EVIDENCE','OTHER')),
  object_ref TEXT NOT NULL CHECK (length(trim(object_ref)) BETWEEN 1 AND 2048),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  version_label TEXT CHECK (version_label IS NULL OR length(trim(version_label)) BETWEEN 1 AND 160),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
  captured_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, production_order_id, document_kind, object_ref, content_hash)
);

CREATE INDEX IF NOT EXISTS v2_production_orders_org_status_schedule_idx ON v2_production_orders(organization_id, status, planned_start_at, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_production_formula_snapshots_org_order_idx ON v2_production_formula_snapshots(organization_id, production_order_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS v2_production_requirements_org_order_status_idx ON v2_production_material_requirements(organization_id, production_order_id, status, material_id);
CREATE INDEX IF NOT EXISTS v2_production_allocations_org_order_status_idx ON v2_production_allocations(organization_id, production_order_id, status, inventory_lot_id);
CREATE INDEX IF NOT EXISTS v2_production_weighing_org_order_status_idx ON v2_production_weighing_sessions(organization_id, production_order_id, status, sequence_number);
CREATE INDEX IF NOT EXISTS v2_production_usages_org_order_idx ON v2_production_material_usages(organization_id, production_order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_production_process_org_order_stage_idx ON v2_production_process_steps(organization_id, production_order_id, stage, sequence_number);
CREATE INDEX IF NOT EXISTS v2_production_qc_specs_org_formula_status_idx ON v2_production_qc_specifications(organization_id, formula_version_id, status, name);
CREATE INDEX IF NOT EXISTS v2_production_qc_results_org_order_idx ON v2_production_qc_results(organization_id, production_order_id, result_status, recorded_at DESC);
CREATE INDEX IF NOT EXISTS v2_production_deviations_org_order_idx ON v2_production_deviations(organization_id, production_order_id, status, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS v2_production_capa_org_deviation_idx ON v2_production_capa_actions(organization_id, deviation_id, status, due_at);
CREATE INDEX IF NOT EXISTS v2_production_yield_org_order_idx ON v2_production_yield_records(organization_id, production_order_id, revision DESC);
CREATE INDEX IF NOT EXISTS v2_production_rework_org_order_idx ON v2_production_rework_records(organization_id, production_order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_production_release_org_order_idx ON v2_production_releases(organization_id, production_order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_finished_good_lots_org_status_idx ON v2_finished_good_lots(organization_id, status, expires_at, manufactured_at);
CREATE INDEX IF NOT EXISTS v2_finished_good_ledger_org_lot_idx ON v2_finished_good_ledger_entries(organization_id, finished_good_lot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_production_genealogy_org_order_idx ON v2_production_genealogy_edges(organization_id, production_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_production_documents_org_order_idx ON v2_production_document_snapshots(organization_id, production_order_id, status, captured_at DESC);

-- A finished-good balance is always derived from its dedicated ledger. Ledger
-- events, pinned formula snapshots, and lineage edges cannot be rewritten or
-- deleted; corrections create an explicit compensating event instead.
CREATE OR REPLACE FUNCTION public.v2_reject_production_append_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'V2_PRODUCTION_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS v2_finished_good_ledger_append_only ON v2_finished_good_ledger_entries;
CREATE TRIGGER v2_finished_good_ledger_append_only
  BEFORE UPDATE OR DELETE ON v2_finished_good_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.v2_reject_production_append_mutation();

DROP TRIGGER IF EXISTS v2_production_formula_snapshot_append_only ON v2_production_formula_snapshots;
CREATE TRIGGER v2_production_formula_snapshot_append_only
  BEFORE UPDATE OR DELETE ON v2_production_formula_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.v2_reject_production_append_mutation();

DROP TRIGGER IF EXISTS v2_production_genealogy_append_only ON v2_production_genealogy_edges;
CREATE TRIGGER v2_production_genealogy_append_only
  BEFORE UPDATE OR DELETE ON v2_production_genealogy_edges
  FOR EACH ROW EXECUTE FUNCTION public.v2_reject_production_append_mutation();

REVOKE UPDATE, DELETE ON v2_finished_good_ledger_entries, v2_production_formula_snapshots, v2_production_genealogy_edges FROM PUBLIC;

-- Add tenant-composite parent keys and foreign keys after all Phase 8 tables
-- exist. This makes every direct association tenant-safe even if an
-- accidentally under-scoped repository query is introduced later.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_inventory_reservations',
    'v2_production_orders','v2_production_formula_snapshots','v2_production_material_requirements','v2_production_allocations',
    'v2_production_weighing_sessions','v2_production_material_usages','v2_production_process_steps','v2_production_qc_specifications',
    'v2_production_qc_results','v2_production_deviations','v2_production_capa_actions','v2_production_yield_records','v2_production_rework_records',
    'v2_production_releases','v2_finished_good_lots','v2_finished_good_ledger_entries','v2_production_genealogy_edges','v2_production_document_snapshots'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = format('%s_org_id_unique', t)) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (organization_id, id)', t, format('%s_org_id_unique', t));
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_order_formula_tenant_fk') THEN ALTER TABLE v2_production_orders ADD CONSTRAINT v2_production_order_formula_tenant_fk FOREIGN KEY (organization_id, formula_version_id) REFERENCES v2_formula_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_order_snapshot_tenant_fk') THEN ALTER TABLE v2_production_orders ADD CONSTRAINT v2_production_order_snapshot_tenant_fk FOREIGN KEY (organization_id, formula_snapshot_id) REFERENCES v2_production_formula_snapshots(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_order_qc_spec_tenant_fk') THEN ALTER TABLE v2_production_orders ADD CONSTRAINT v2_production_order_qc_spec_tenant_fk FOREIGN KEY (organization_id, qc_specification_id) REFERENCES v2_production_qc_specifications(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_snapshot_order_tenant_fk') THEN ALTER TABLE v2_production_formula_snapshots ADD CONSTRAINT v2_production_snapshot_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_snapshot_formula_tenant_fk') THEN ALTER TABLE v2_production_formula_snapshots ADD CONSTRAINT v2_production_snapshot_formula_tenant_fk FOREIGN KEY (organization_id, formula_version_id) REFERENCES v2_formula_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_requirement_order_tenant_fk') THEN ALTER TABLE v2_production_material_requirements ADD CONSTRAINT v2_production_requirement_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_requirement_material_tenant_fk') THEN ALTER TABLE v2_production_material_requirements ADD CONSTRAINT v2_production_requirement_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_allocation_order_tenant_fk') THEN ALTER TABLE v2_production_allocations ADD CONSTRAINT v2_production_allocation_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_allocation_requirement_tenant_fk') THEN ALTER TABLE v2_production_allocations ADD CONSTRAINT v2_production_allocation_requirement_tenant_fk FOREIGN KEY (organization_id, requirement_id) REFERENCES v2_production_material_requirements(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_allocation_material_tenant_fk') THEN ALTER TABLE v2_production_allocations ADD CONSTRAINT v2_production_allocation_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_allocation_lot_tenant_fk') THEN ALTER TABLE v2_production_allocations ADD CONSTRAINT v2_production_allocation_lot_tenant_fk FOREIGN KEY (organization_id, inventory_lot_id) REFERENCES v2_inventory_lots(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_allocation_reservation_tenant_fk') THEN ALTER TABLE v2_production_allocations ADD CONSTRAINT v2_production_allocation_reservation_tenant_fk FOREIGN KEY (organization_id, inventory_reservation_id) REFERENCES v2_inventory_reservations(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_weighing_order_tenant_fk') THEN ALTER TABLE v2_production_weighing_sessions ADD CONSTRAINT v2_production_weighing_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_weighing_lab_tenant_fk') THEN ALTER TABLE v2_production_weighing_sessions ADD CONSTRAINT v2_production_weighing_lab_tenant_fk FOREIGN KEY (organization_id, lab_weighing_session_id) REFERENCES v2_lab_weighing_sessions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_usage_order_tenant_fk') THEN ALTER TABLE v2_production_material_usages ADD CONSTRAINT v2_production_usage_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_usage_requirement_tenant_fk') THEN ALTER TABLE v2_production_material_usages ADD CONSTRAINT v2_production_usage_requirement_tenant_fk FOREIGN KEY (organization_id, requirement_id) REFERENCES v2_production_material_requirements(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_usage_allocation_tenant_fk') THEN ALTER TABLE v2_production_material_usages ADD CONSTRAINT v2_production_usage_allocation_tenant_fk FOREIGN KEY (organization_id, allocation_id) REFERENCES v2_production_allocations(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_usage_weighing_tenant_fk') THEN ALTER TABLE v2_production_material_usages ADD CONSTRAINT v2_production_usage_weighing_tenant_fk FOREIGN KEY (organization_id, weighing_session_id) REFERENCES v2_production_weighing_sessions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_usage_material_tenant_fk') THEN ALTER TABLE v2_production_material_usages ADD CONSTRAINT v2_production_usage_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_usage_lot_tenant_fk') THEN ALTER TABLE v2_production_material_usages ADD CONSTRAINT v2_production_usage_lot_tenant_fk FOREIGN KEY (organization_id, lot_id) REFERENCES v2_inventory_lots(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_usage_line_tenant_fk') THEN ALTER TABLE v2_production_material_usages ADD CONSTRAINT v2_production_usage_line_tenant_fk FOREIGN KEY (organization_id, lab_weighing_line_id) REFERENCES v2_lab_weighing_lines(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_usage_movement_tenant_fk') THEN ALTER TABLE v2_production_material_usages ADD CONSTRAINT v2_production_usage_movement_tenant_fk FOREIGN KEY (organization_id, inventory_movement_id) REFERENCES v2_inventory_movements(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_usage_reversal_tenant_fk') THEN ALTER TABLE v2_production_material_usages ADD CONSTRAINT v2_production_usage_reversal_tenant_fk FOREIGN KEY (organization_id, reversal_movement_id) REFERENCES v2_inventory_movements(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_process_order_tenant_fk') THEN ALTER TABLE v2_production_process_steps ADD CONSTRAINT v2_production_process_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_qc_spec_formula_tenant_fk') THEN ALTER TABLE v2_production_qc_specifications ADD CONSTRAINT v2_production_qc_spec_formula_tenant_fk FOREIGN KEY (organization_id, formula_version_id) REFERENCES v2_formula_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_qc_result_order_tenant_fk') THEN ALTER TABLE v2_production_qc_results ADD CONSTRAINT v2_production_qc_result_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_qc_result_spec_tenant_fk') THEN ALTER TABLE v2_production_qc_results ADD CONSTRAINT v2_production_qc_result_spec_tenant_fk FOREIGN KEY (organization_id, qc_specification_id) REFERENCES v2_production_qc_specifications(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_deviation_order_tenant_fk') THEN ALTER TABLE v2_production_deviations ADD CONSTRAINT v2_production_deviation_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_deviation_requirement_tenant_fk') THEN ALTER TABLE v2_production_deviations ADD CONSTRAINT v2_production_deviation_requirement_tenant_fk FOREIGN KEY (organization_id, requirement_id) REFERENCES v2_production_material_requirements(organization_id, id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_deviation_process_tenant_fk') THEN ALTER TABLE v2_production_deviations ADD CONSTRAINT v2_production_deviation_process_tenant_fk FOREIGN KEY (organization_id, process_step_id) REFERENCES v2_production_process_steps(organization_id, id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_deviation_qc_tenant_fk') THEN ALTER TABLE v2_production_deviations ADD CONSTRAINT v2_production_deviation_qc_tenant_fk FOREIGN KEY (organization_id, qc_result_id) REFERENCES v2_production_qc_results(organization_id, id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_deviation_weighing_tenant_fk') THEN ALTER TABLE v2_production_deviations ADD CONSTRAINT v2_production_deviation_weighing_tenant_fk FOREIGN KEY (organization_id, weighing_session_id) REFERENCES v2_production_weighing_sessions(organization_id, id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_capa_deviation_tenant_fk') THEN ALTER TABLE v2_production_capa_actions ADD CONSTRAINT v2_production_capa_deviation_tenant_fk FOREIGN KEY (organization_id, deviation_id) REFERENCES v2_production_deviations(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_yield_order_tenant_fk') THEN ALTER TABLE v2_production_yield_records ADD CONSTRAINT v2_production_yield_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_rework_order_tenant_fk') THEN ALTER TABLE v2_production_rework_records ADD CONSTRAINT v2_production_rework_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_rework_fg_lot_tenant_fk') THEN ALTER TABLE v2_production_rework_records ADD CONSTRAINT v2_production_rework_fg_lot_tenant_fk FOREIGN KEY (organization_id, source_finished_good_lot_id) REFERENCES v2_finished_good_lots(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_release_order_tenant_fk') THEN ALTER TABLE v2_production_releases ADD CONSTRAINT v2_production_release_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_finished_good_lot_order_tenant_fk') THEN ALTER TABLE v2_finished_good_lots ADD CONSTRAINT v2_finished_good_lot_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_finished_good_lot_release_tenant_fk') THEN ALTER TABLE v2_finished_good_lots ADD CONSTRAINT v2_finished_good_lot_release_tenant_fk FOREIGN KEY (organization_id, production_release_id) REFERENCES v2_production_releases(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_finished_good_lot_formula_tenant_fk') THEN ALTER TABLE v2_finished_good_lots ADD CONSTRAINT v2_finished_good_lot_formula_tenant_fk FOREIGN KEY (organization_id, formula_version_id) REFERENCES v2_formula_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_finished_good_lot_snapshot_tenant_fk') THEN ALTER TABLE v2_finished_good_lots ADD CONSTRAINT v2_finished_good_lot_snapshot_tenant_fk FOREIGN KEY (organization_id, formula_snapshot_id) REFERENCES v2_production_formula_snapshots(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_finished_good_ledger_lot_tenant_fk') THEN ALTER TABLE v2_finished_good_ledger_entries ADD CONSTRAINT v2_finished_good_ledger_lot_tenant_fk FOREIGN KEY (organization_id, finished_good_lot_id) REFERENCES v2_finished_good_lots(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_finished_good_ledger_order_tenant_fk') THEN ALTER TABLE v2_finished_good_ledger_entries ADD CONSTRAINT v2_finished_good_ledger_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_genealogy_order_tenant_fk') THEN ALTER TABLE v2_production_genealogy_edges ADD CONSTRAINT v2_production_genealogy_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_production_document_order_tenant_fk') THEN ALTER TABLE v2_production_document_snapshots ADD CONSTRAINT v2_production_document_order_tenant_fk FOREIGN KEY (organization_id, production_order_id) REFERENCES v2_production_orders(organization_id, id) ON DELETE CASCADE; END IF;
END $$;

-- Existing tenant policies keep all explicit grants. Lab Manager receives the
-- planning and deviation responsibilities; Lab Technician receives only the
-- controlled execution/read set. QC approval and release stay absent from Lab
-- Technician.
UPDATE v2_role_policies AS policy
SET
  permissions = (
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM (
      SELECT existing.permission
      FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
      UNION
      SELECT required_permission
      FROM unnest(ARRAY[
        'production.view', 'production.create', 'production.plan', 'production.allocate', 'production.weigh', 'production.process',
        'production.qc.record', 'production.deviation.manage', 'production.cancel', 'production.close', 'production.documents.view', 'production.documents.manage', 'production.finishedGoods.view'
      ]::TEXT[]) AS required(required_permission)
    ) AS merged
  ),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key = 'Lab Manager'
  AND EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'production.view', 'production.create', 'production.plan', 'production.allocate', 'production.weigh', 'production.process',
      'production.qc.record', 'production.deviation.manage', 'production.cancel', 'production.close', 'production.documents.view', 'production.documents.manage', 'production.finishedGoods.view'
    ]::TEXT[]) AS required(required_permission)
    WHERE NOT policy.permissions ? required.required_permission
  );

UPDATE v2_role_policies AS policy
SET
  permissions = (
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM (
      SELECT existing.permission
      FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
      UNION
      SELECT required_permission
      FROM unnest(ARRAY[
        'production.view', 'production.weigh', 'production.process', 'production.qc.record', 'production.documents.view', 'production.finishedGoods.view'
      ]::TEXT[]) AS required(required_permission)
    ) AS merged
  ),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key = 'Lab Technician'
  AND EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'production.view', 'production.weigh', 'production.process', 'production.qc.record', 'production.documents.view', 'production.finishedGoods.view'
    ]::TEXT[]) AS required(required_permission)
    WHERE NOT policy.permissions ? required.required_permission
  );

UPDATE v2_role_policies AS policy
SET
  permissions = (
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM (
      SELECT existing.permission
      FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
      UNION ALL SELECT 'production.qc.approve'
    ) AS merged
  ),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key = 'Lab Manager'
  AND NOT policy.permissions ? 'production.qc.approve';

-- Standard tenant fencing applies to every tenant-owned Phase 8 record,
-- including the separate finished-good ledger.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_production_orders','v2_production_formula_snapshots','v2_production_material_requirements','v2_production_allocations',
    'v2_production_weighing_sessions','v2_production_material_usages','v2_production_process_steps','v2_production_qc_specifications',
    'v2_production_qc_results','v2_production_deviations','v2_production_capa_actions','v2_production_yield_records','v2_production_rework_records',
    'v2_production_releases','v2_finished_good_lots','v2_finished_good_ledger_entries','v2_production_genealogy_edges','v2_production_document_snapshots'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO v2_app';
  END IF;
END $$;
