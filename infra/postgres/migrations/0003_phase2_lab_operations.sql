-- Phase 2: tenant-owned material, supplier, inventory, weighing, and procurement core.
-- Additive V2 migration. Legacy D1 migrations remain untouched.

CREATE TABLE IF NOT EXISTS v2_molecular_identities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  resolution_status TEXT NOT NULL DEFAULT 'NOT_RESOLVED' CHECK (resolution_status IN ('NOT_RESOLVED','RESOLVED','REJECTED')),
  canonical_smiles TEXT,
  inchikey TEXT,
  structure_hash TEXT,
  canonicalization_version TEXT,
  rdkit_version TEXT,
  created_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_molecular_identity_unresolved CHECK (resolution_status <> 'NOT_RESOLVED' OR (canonical_smiles IS NULL AND inchikey IS NULL AND structure_hash IS NULL))
);

CREATE TABLE IF NOT EXISTS v2_materials (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  internal_code TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW_REQUIRED','ACTIVE','BLOCKED','ARCHIVED')),
  molecular_identity_id TEXT REFERENCES v2_molecular_identities(id) ON DELETE SET NULL,
  sensory_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, internal_code)
);

CREATE TABLE IF NOT EXISTS v2_material_identifiers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('CAS','INCI','FEMA','EINECS','CUSTOM')),
  identifier_value TEXT NOT NULL CHECK (length(trim(identifier_value)) BETWEEN 1 AND 160),
  source TEXT,
  review_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (review_status IN ('APPROVED','REVIEW_REQUIRED','BLOCKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, material_id, identifier_type, identifier_value)
);

CREATE TABLE IF NOT EXISTS v2_material_compliance (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  jurisdiction TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPROVED','REVIEW_REQUIRED','BLOCKED','NOT_EVALUATED')),
  source TEXT NOT NULL,
  source_version TEXT NOT NULL,
  effective_at TIMESTAMPTZ,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_ref TEXT,
  reviewed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, material_id, jurisdiction, category, source_version)
);

CREATE TABLE IF NOT EXISTS v2_material_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('SDS','COA','SPECIFICATION','COMPLIANCE','OTHER')),
  status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (status IN ('DRAFT','REVIEW_REQUIRED','APPROVED','ARCHIVED')),
  object_ref TEXT NOT NULL,
  content_hash TEXT,
  version TEXT,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, material_id, kind, object_ref)
);

CREATE TABLE IF NOT EXISTS v2_suppliers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL CHECK (length(trim(legal_name)) BETWEEN 1 AND 200),
  trade_name TEXT,
  primary_email TEXT,
  primary_phone TEXT,
  locations JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  lead_time_days INTEGER,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','SUSPENDED','ARCHIVED')),
  quality_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, legal_name)
);

CREATE TABLE IF NOT EXISTS v2_supplier_offers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES v2_suppliers(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  trade_name TEXT,
  grade TEXT,
  minimum_order_quantity NUMERIC(18,6) NOT NULL CHECK (minimum_order_quantity >= 0),
  unit TEXT NOT NULL CHECK (unit IN ('G','KG')),
  unit_price NUMERIC(18,6) NOT NULL CHECK (unit_price >= 0),
  currency CHAR(3) NOT NULL,
  lead_time_days INTEGER,
  pack_size NUMERIC(18,6),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','EXPIRED','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, supplier_id, product_code, material_id)
);

CREATE TABLE IF NOT EXISTS v2_supplier_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES v2_suppliers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('CERTIFICATE','SPECIFICATION','QUALITY','OTHER')),
  status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (status IN ('DRAFT','REVIEW_REQUIRED','APPROVED','ARCHIVED')),
  object_ref TEXT NOT NULL,
  content_hash TEXT,
  version TEXT,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, supplier_id, kind, object_ref)
);

CREATE TABLE IF NOT EXISTS v2_supplier_offer_price_history (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  supplier_offer_id TEXT NOT NULL REFERENCES v2_supplier_offers(id) ON DELETE CASCADE,
  unit_price NUMERIC(18,6) NOT NULL CHECK (unit_price >= 0),
  currency CHAR(3) NOT NULL,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  changed_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_inventory_lots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  supplier_id TEXT REFERENCES v2_suppliers(id) ON DELETE SET NULL,
  supplier_offer_id TEXT REFERENCES v2_supplier_offers(id) ON DELETE SET NULL,
  supplier_lot TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  manufactured_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUARANTINE' CHECK (status IN ('QUARANTINE','AVAILABLE','HOLD','REJECTED','EXHAUSTED','EXPIRED','ARCHIVED')),
  quality_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (quality_status IN ('PENDING','PASSED','FAILED','NOT_REQUIRED')),
  landed_unit_cost NUMERIC(18,8),
  currency CHAR(3),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_lot_expiry_after_manufacture CHECK (expires_at IS NULL OR manufactured_at IS NULL OR expires_at >= manufactured_at)
);

CREATE TABLE IF NOT EXISTS v2_inventory_movements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  lot_id TEXT NOT NULL REFERENCES v2_inventory_lots(id) ON DELETE RESTRICT,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('RECEIPT','TRANSFER','RESERVE','RELEASE_RESERVATION','CONSUMPTION','ADJUSTMENT','RETURN','WASTE')),
  quantity_delta_g NUMERIC(18,6) NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  reversal_of_id TEXT REFERENCES v2_inventory_movements(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_ledger_nonzero_or_reservation CHECK (quantity_delta_g <> 0 OR movement_type IN ('RESERVE','RELEASE_RESERVATION','TRANSFER')),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS v2_inventory_reservations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  lot_id TEXT NOT NULL REFERENCES v2_inventory_lots(id) ON DELETE RESTRICT,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  quantity_g NUMERIC(18,6) NOT NULL CHECK (quantity_g > 0),
  context_type TEXT NOT NULL,
  context_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED','CONSUMED','EXPIRED','CANCELLED')),
  consumed_quantity_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (consumed_quantity_g >= 0 AND consumed_quantity_g <= quantity_g),
  expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_lab_weighing_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL CHECK (context_type IN ('FORMULA','TRIAL','PRODUCTION','AD_HOC')),
  context_id TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','CONFIRMED','ABORTED','CORRECTED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  confirmed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_lab_weighing_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES v2_lab_weighing_sessions(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  lot_id TEXT REFERENCES v2_inventory_lots(id) ON DELETE RESTRICT,
  reservation_id TEXT REFERENCES v2_inventory_reservations(id) ON DELETE RESTRICT,
  requested_g NUMERIC(18,6) NOT NULL CHECK (requested_g > 0),
  actual_g NUMERIC(18,6),
  tolerance_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (tolerance_g >= 0),
  consumption_movement_id TEXT REFERENCES v2_inventory_movements(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_purchase_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  requested_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_purchase_request_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  purchase_request_id TEXT NOT NULL REFERENCES v2_purchase_requests(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  requested_quantity_g NUMERIC(18,6) NOT NULL CHECK (requested_quantity_g > 0),
  preferred_supplier_id TEXT REFERENCES v2_suppliers(id) ON DELETE SET NULL,
  required_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_purchase_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES v2_suppliers(id) ON DELETE RESTRICT,
  purchase_request_id TEXT REFERENCES v2_purchase_requests(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
  currency CHAR(3) NOT NULL,
  approved_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_purchase_order_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  purchase_order_id TEXT NOT NULL REFERENCES v2_purchase_orders(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  supplier_offer_id TEXT REFERENCES v2_supplier_offers(id) ON DELETE SET NULL,
  ordered_quantity_g NUMERIC(18,6) NOT NULL CHECK (ordered_quantity_g > 0),
  unit_price NUMERIC(18,6),
  received_quantity_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (received_quantity_g >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_shipments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  purchase_order_id TEXT NOT NULL REFERENCES v2_purchase_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_TRANSIT','DELIVERED','LOST','CANCELLED')),
  carrier TEXT,
  tracking_reference TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_goods_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  purchase_order_id TEXT REFERENCES v2_purchase_orders(id) ON DELETE SET NULL,
  shipment_id TEXT REFERENCES v2_shipments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('DRAFT','RECEIVED','INSPECTING','CLOSED','RETURNED')),
  freight_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (freight_cost >= 0),
  duty_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (duty_cost >= 0),
  insurance_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (insurance_cost >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  received_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_goods_receipt_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  goods_receipt_id TEXT NOT NULL REFERENCES v2_goods_receipts(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  supplier_offer_id TEXT REFERENCES v2_supplier_offers(id) ON DELETE SET NULL,
  inventory_lot_id TEXT NOT NULL REFERENCES v2_inventory_lots(id) ON DELETE RESTRICT,
  supplier_lot TEXT,
  quantity_g NUMERIC(18,6) NOT NULL CHECK (quantity_g > 0),
  unit_price NUMERIC(18,6),
  inspection_disposition TEXT NOT NULL DEFAULT 'PENDING' CHECK (inspection_disposition IN ('PENDING','ACCEPT','REJECT','RETURN','HOLD','REVIEW_REQUIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_receipt_inspections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  goods_receipt_line_id TEXT NOT NULL REFERENCES v2_goods_receipt_lines(id) ON DELETE CASCADE,
  disposition TEXT NOT NULL CHECK (disposition IN ('ACCEPT','REJECT','RETURN','HOLD','REVIEW_REQUIRED')),
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  inspected_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_landed_cost_allocations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  goods_receipt_id TEXT NOT NULL REFERENCES v2_goods_receipts(id) ON DELETE CASCADE,
  goods_receipt_line_id TEXT NOT NULL REFERENCES v2_goods_receipt_lines(id) ON DELETE CASCADE,
  inventory_lot_id TEXT NOT NULL REFERENCES v2_inventory_lots(id) ON DELETE RESTRICT,
  allocated_cost NUMERIC(18,6) NOT NULL CHECK (allocated_cost >= 0),
  landed_unit_cost NUMERIC(18,8) NOT NULL CHECK (landed_unit_cost >= 0),
  currency CHAR(3) NOT NULL,
  posted_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, goods_receipt_line_id)
);

CREATE TABLE IF NOT EXISTS v2_return_authorizations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  goods_receipt_line_id TEXT NOT NULL REFERENCES v2_goods_receipt_lines(id) ON DELETE RESTRICT,
  inventory_lot_id TEXT NOT NULL REFERENCES v2_inventory_lots(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','SHIPPED','CLOSED','CANCELLED')),
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_operation_idempotency (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  route TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, actor_user_id, route, idempotency_key)
);

CREATE INDEX IF NOT EXISTS v2_materials_org_status_idx ON v2_materials(organization_id, status, name);
CREATE INDEX IF NOT EXISTS v2_supplier_offers_org_material_idx ON v2_supplier_offers(organization_id, material_id, status);
CREATE INDEX IF NOT EXISTS v2_supplier_offer_price_history_offer_idx ON v2_supplier_offer_price_history(organization_id, supplier_offer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_inventory_lots_fefo_idx ON v2_inventory_lots(organization_id, material_id, status, quality_status, expires_at, created_at);
CREATE INDEX IF NOT EXISTS v2_inventory_movements_lot_created_idx ON v2_inventory_movements(organization_id, lot_id, created_at);
CREATE INDEX IF NOT EXISTS v2_reservations_lot_status_idx ON v2_inventory_reservations(organization_id, lot_id, status, expires_at);
CREATE INDEX IF NOT EXISTS v2_receipt_lines_org_lot_idx ON v2_goods_receipt_lines(organization_id, inventory_lot_id);
CREATE INDEX IF NOT EXISTS v2_idempotency_lookup_idx ON v2_operation_idempotency(organization_id, actor_user_id, route, idempotency_key);

-- Keep the additive migration idempotent when a disposable verification database
-- was initialized with an earlier revision of this still-unreleased migration.
ALTER TABLE v2_inventory_reservations ADD COLUMN IF NOT EXISTS consumed_quantity_g NUMERIC(18,6) NOT NULL DEFAULT 0;
ALTER TABLE v2_inventory_reservations DROP CONSTRAINT IF EXISTS v2_inventory_reservations_consumed_quantity_g_check;
ALTER TABLE v2_inventory_reservations ADD CONSTRAINT v2_inventory_reservations_consumed_quantity_g_check CHECK (consumed_quantity_g >= 0 AND consumed_quantity_g <= quantity_g);
ALTER TABLE v2_lab_weighing_lines ADD COLUMN IF NOT EXISTS reservation_id TEXT REFERENCES v2_inventory_reservations(id) ON DELETE RESTRICT;
ALTER TABLE v2_inventory_movements DROP CONSTRAINT IF EXISTS v2_ledger_nonzero_or_reservation;
ALTER TABLE v2_inventory_movements ADD CONSTRAINT v2_ledger_nonzero_or_reservation CHECK (quantity_delta_g <> 0 OR movement_type IN ('RESERVE','RELEASE_RESERVATION','TRANSFER'));
ALTER TABLE v2_goods_receipt_lines DROP CONSTRAINT IF EXISTS v2_goods_receipt_lines_inspection_disposition_check;
ALTER TABLE v2_goods_receipt_lines ADD CONSTRAINT v2_goods_receipt_lines_inspection_disposition_check CHECK (inspection_disposition IN ('PENDING','ACCEPT','REJECT','RETURN','HOLD','REVIEW_REQUIRED'));
ALTER TABLE v2_receipt_inspections DROP CONSTRAINT IF EXISTS v2_receipt_inspections_disposition_check;
ALTER TABLE v2_receipt_inspections ADD CONSTRAINT v2_receipt_inspections_disposition_check CHECK (disposition IN ('ACCEPT','REJECT','RETURN','HOLD','REVIEW_REQUIRED'));
ALTER TABLE v2_receipt_inspections DROP CONSTRAINT IF EXISTS v2_receipt_inspections_organization_id_goods_receipt_line_id_key;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_molecular_identities','v2_materials','v2_material_identifiers','v2_material_compliance','v2_material_documents',
    'v2_suppliers','v2_supplier_offers','v2_supplier_documents','v2_supplier_offer_price_history','v2_inventory_lots','v2_inventory_movements','v2_inventory_reservations',
    'v2_lab_weighing_sessions','v2_lab_weighing_lines','v2_purchase_requests','v2_purchase_request_lines','v2_purchase_orders','v2_purchase_order_lines',
    'v2_shipments','v2_goods_receipts','v2_goods_receipt_lines','v2_receipt_inspections','v2_landed_cost_allocations',
    'v2_return_authorizations','v2_operation_idempotency'
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
