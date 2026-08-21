-- Phase 10: Commerce is deliberately separate from procurement inbound
-- shipments and raw-material inventory. Sales may allocate only released
-- finished-good lots through their own reservation aggregate and the Phase 8
-- finished-good ledger.

CREATE TABLE IF NOT EXISTS v2_customers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  customer_code TEXT NOT NULL CHECK (customer_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ON_HOLD','ARCHIVED')),
  payment_terms TEXT,
  commercial_notes TEXT,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_customers_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_customers_code_unique UNIQUE (organization_id, customer_code)
);

CREATE TABLE IF NOT EXISTS v2_customer_contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  email TEXT,
  phone TEXT,
  role_label TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_customer_contacts_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_customer_contact_customer_tenant_fk FOREIGN KEY (organization_id, customer_id)
    REFERENCES v2_customers(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_customer_contact_channel_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS v2_customer_addresses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  address_kind TEXT NOT NULL CHECK (address_kind IN ('BILLING','SHIPPING')),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  recipient_name TEXT NOT NULL CHECK (length(trim(recipient_name)) BETWEEN 1 AND 160),
  line1 TEXT NOT NULL CHECK (length(trim(line1)) BETWEEN 1 AND 200),
  line2 TEXT,
  city TEXT NOT NULL CHECK (length(trim(city)) BETWEEN 1 AND 120),
  region TEXT,
  postal_code TEXT,
  country_code TEXT NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_customer_addresses_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_customer_address_customer_tenant_fk FOREIGN KEY (organization_id, customer_id)
    REFERENCES v2_customers(organization_id, id) ON DELETE CASCADE
);

-- A product row is the commercially sellable SKU. parent_product_id and
-- variant_label retain a bounded variant relation without turning commerce
-- into a general-purpose product information system.
CREATE TABLE IF NOT EXISTS v2_commerce_products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  parent_product_id TEXT,
  sku TEXT NOT NULL CHECK (sku ~ '^[A-Z0-9][A-Z0-9._-]{1,79}$'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  variant_label TEXT,
  product_kind TEXT NOT NULL DEFAULT 'FINISHED_GOOD' CHECK (product_kind IN ('FINISHED_GOOD','SERVICE')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  formula_version_id TEXT,
  description TEXT,
  pack_size_g NUMERIC(18,6),
  pack_label TEXT,
  availability_policy TEXT NOT NULL DEFAULT 'RELEASED_LOTS_ONLY' CHECK (availability_policy IN ('RELEASED_LOTS_ONLY','ALLOW_BACKORDER')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_commerce_products_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_commerce_products_sku_unique UNIQUE (organization_id, sku),
  CONSTRAINT v2_commerce_product_parent_tenant_fk FOREIGN KEY (organization_id, parent_product_id)
    REFERENCES v2_commerce_products(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_commerce_product_formula_tenant_fk FOREIGN KEY (organization_id, formula_version_id)
    REFERENCES v2_formula_versions(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_commerce_product_pack_check CHECK ((product_kind = 'FINISHED_GOOD' AND pack_size_g IS NOT NULL AND pack_size_g > 0 AND formula_version_id IS NOT NULL) OR (product_kind = 'SERVICE' AND pack_size_g IS NULL AND formula_version_id IS NULL))
);

-- The Phase 10 migration is intentionally re-runnable in disposable QA
-- environments. These additive guards also repair an early local draft that
-- created commerce products before the Formula Version pin was finalized.
ALTER TABLE v2_commerce_products ADD COLUMN IF NOT EXISTS formula_version_id TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_commerce_product_formula_tenant_fk') THEN
    ALTER TABLE v2_commerce_products
      ADD CONSTRAINT v2_commerce_product_formula_tenant_fk
      FOREIGN KEY (organization_id, formula_version_id)
      REFERENCES v2_formula_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_commerce_product_pack_check') THEN
    ALTER TABLE v2_commerce_products DROP CONSTRAINT v2_commerce_product_pack_check;
  END IF;
  ALTER TABLE v2_commerce_products
    ADD CONSTRAINT v2_commerce_product_pack_check
    CHECK (
      (product_kind = 'FINISHED_GOOD' AND pack_size_g IS NOT NULL AND pack_size_g > 0 AND formula_version_id IS NOT NULL)
      OR (product_kind = 'SERVICE' AND pack_size_g IS NULL AND formula_version_id IS NULL)
    );
END $$;

CREATE TABLE IF NOT EXISTS v2_commerce_product_prices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  currency_code TEXT NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  unit_price NUMERIC(18,6) NOT NULL CHECK (unit_price >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_commerce_product_prices_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_commerce_price_product_tenant_fk FOREIGN KEY (organization_id, product_id)
    REFERENCES v2_commerce_products(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_commerce_price_period_check CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE TABLE IF NOT EXISTS v2_quotes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL CHECK (quote_number ~ '^[A-Z0-9][A-Z0-9._/-]{1,79}$'),
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
  currency_code TEXT NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  valid_until TIMESTAMPTZ NOT NULL,
  payment_terms TEXT,
  shipping_terms TEXT,
  notes TEXT,
  current_version_id TEXT,
  accepted_at TIMESTAMPTZ,
  accepted_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_quotes_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_quotes_number_unique UNIQUE (organization_id, quote_number),
  CONSTRAINT v2_quotes_customer_tenant_fk FOREIGN KEY (organization_id, customer_id)
    REFERENCES v2_customers(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_quote_acceptance_check CHECK ((status = 'ACCEPTED' AND accepted_at IS NOT NULL AND accepted_by IS NOT NULL) OR status <> 'ACCEPTED')
);

CREATE TABLE IF NOT EXISTS v2_quote_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_quote_versions_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_quote_version_quote_tenant_fk FOREIGN KEY (organization_id, quote_id)
    REFERENCES v2_quotes(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_quote_version_unique UNIQUE (organization_id, quote_id, version_number),
  CONSTRAINT v2_quote_version_content_unique UNIQUE (organization_id, quote_id, content_hash)
);

CREATE TABLE IF NOT EXISTS v2_quote_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  quote_version_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  quantity_units NUMERIC(18,6) NOT NULL CHECK (quantity_units > 0),
  unit_price NUMERIC(18,6) NOT NULL CHECK (unit_price >= 0),
  currency_code TEXT NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  notes TEXT,
  product_snapshot JSONB NOT NULL CHECK (jsonb_typeof(product_snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_quote_lines_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_quote_line_version_tenant_fk FOREIGN KEY (organization_id, quote_version_id)
    REFERENCES v2_quote_versions(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_quote_line_product_tenant_fk FOREIGN KEY (organization_id, product_id)
    REFERENCES v2_commerce_products(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_quote_line_unique UNIQUE (organization_id, quote_version_id, line_number),
  CONSTRAINT v2_quote_line_product_unique UNIQUE (organization_id, quote_version_id, product_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_quote_current_version_tenant_fk') THEN
    ALTER TABLE v2_quotes
      ADD CONSTRAINT v2_quote_current_version_tenant_fk
      FOREIGN KEY (organization_id, current_version_id) REFERENCES v2_quote_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS v2_sales_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL CHECK (order_number ~ '^[A-Z0-9][A-Z0-9._/-]{1,79}$'),
  customer_id TEXT NOT NULL,
  quote_id TEXT,
  quote_version_id TEXT,
  billing_address_id TEXT,
  shipping_address_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONFIRMED','ALLOCATING','PARTIALLY_ALLOCATED','ALLOCATED','PARTIALLY_FULFILLED','FULFILLED','CANCELLED','CLOSED')),
  currency_code TEXT NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  payment_terms TEXT,
  shipping_terms TEXT,
  requested_delivery_at TIMESTAMPTZ,
  notes TEXT,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_sales_orders_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_orders_number_unique UNIQUE (organization_id, order_number),
  CONSTRAINT v2_sales_order_customer_tenant_fk FOREIGN KEY (organization_id, customer_id)
    REFERENCES v2_customers(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_order_quote_tenant_fk FOREIGN KEY (organization_id, quote_id)
    REFERENCES v2_quotes(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_order_quote_version_tenant_fk FOREIGN KEY (organization_id, quote_version_id)
    REFERENCES v2_quote_versions(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_order_billing_address_tenant_fk FOREIGN KEY (organization_id, billing_address_id)
    REFERENCES v2_customer_addresses(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_order_shipping_address_tenant_fk FOREIGN KEY (organization_id, shipping_address_id)
    REFERENCES v2_customer_addresses(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS v2_sales_order_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  sales_order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quote_line_id TEXT,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  quantity_units NUMERIC(18,6) NOT NULL CHECK (quantity_units > 0),
  requested_quantity_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (requested_quantity_g >= 0),
  allocated_quantity_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (allocated_quantity_g >= 0),
  fulfilled_quantity_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (fulfilled_quantity_g >= 0),
  returned_quantity_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (returned_quantity_g >= 0),
  unit_price NUMERIC(18,6) NOT NULL CHECK (unit_price >= 0),
  currency_code TEXT NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  product_snapshot JSONB NOT NULL CHECK (jsonb_typeof(product_snapshot) = 'object'),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_sales_order_lines_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_order_line_order_tenant_fk FOREIGN KEY (organization_id, sales_order_id)
    REFERENCES v2_sales_orders(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_sales_order_line_product_tenant_fk FOREIGN KEY (organization_id, product_id)
    REFERENCES v2_commerce_products(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_order_line_quote_tenant_fk FOREIGN KEY (organization_id, quote_line_id)
    REFERENCES v2_quote_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_order_line_unique UNIQUE (organization_id, sales_order_id, line_number),
  CONSTRAINT v2_sales_order_line_product_unique UNIQUE (organization_id, sales_order_id, product_id),
  CONSTRAINT v2_sales_order_line_quantities_check CHECK (fulfilled_quantity_g <= allocated_quantity_g AND returned_quantity_g <= fulfilled_quantity_g)
);

CREATE TABLE IF NOT EXISTS v2_sales_order_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  sales_order_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) BETWEEN 1 AND 120),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  actor_user_id TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_sales_order_events_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_order_event_order_tenant_fk FOREIGN KEY (organization_id, sales_order_id)
    REFERENCES v2_sales_orders(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v2_sales_finished_good_reservations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  sales_order_id TEXT NOT NULL,
  sales_order_line_id TEXT NOT NULL,
  finished_good_lot_id TEXT NOT NULL,
  quantity_g NUMERIC(18,6) NOT NULL CHECK (quantity_g > 0),
  fulfilled_quantity_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (fulfilled_quantity_g >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED','CONSUMED','EXPIRED')),
  reservation_ledger_entry_id TEXT NOT NULL,
  released_ledger_entry_id TEXT,
  expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  CONSTRAINT v2_sales_reservations_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_reservation_order_tenant_fk FOREIGN KEY (organization_id, sales_order_id)
    REFERENCES v2_sales_orders(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_sales_reservation_line_tenant_fk FOREIGN KEY (organization_id, sales_order_line_id)
    REFERENCES v2_sales_order_lines(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_sales_reservation_lot_tenant_fk FOREIGN KEY (organization_id, finished_good_lot_id)
    REFERENCES v2_finished_good_lots(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_reservation_ledger_tenant_fk FOREIGN KEY (organization_id, reservation_ledger_entry_id)
    REFERENCES v2_finished_good_ledger_entries(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_reservation_release_ledger_tenant_fk FOREIGN KEY (organization_id, released_ledger_entry_id)
    REFERENCES v2_finished_good_ledger_entries(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_reservation_quantity_check CHECK (fulfilled_quantity_g <= quantity_g),
  CONSTRAINT v2_sales_reservation_line_lot_unique UNIQUE (organization_id, sales_order_line_id, finished_good_lot_id)
);

CREATE TABLE IF NOT EXISTS v2_sales_fulfillments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  sales_order_id TEXT NOT NULL,
  fulfillment_number TEXT NOT NULL CHECK (fulfillment_number ~ '^[A-Z0-9][A-Z0-9._/-]{1,79}$'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PICKING','PACKED','SHIPPED','DELIVERED','CANCELLED')),
  carrier TEXT,
  service TEXT,
  tracking_number TEXT,
  package_count INTEGER NOT NULL DEFAULT 1 CHECK (package_count > 0),
  notes TEXT,
  picked_at TIMESTAMPTZ,
  packed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_sales_fulfillments_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_fulfillment_order_tenant_fk FOREIGN KEY (organization_id, sales_order_id)
    REFERENCES v2_sales_orders(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_sales_fulfillment_number_unique UNIQUE (organization_id, fulfillment_number)
);

CREATE TABLE IF NOT EXISTS v2_sales_fulfillment_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  fulfillment_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  sales_order_line_id TEXT NOT NULL,
  finished_good_lot_id TEXT NOT NULL,
  quantity_g NUMERIC(18,6) NOT NULL CHECK (quantity_g > 0),
  fulfillment_ledger_entry_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_sales_fulfillment_lines_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_fulfillment_line_fulfillment_tenant_fk FOREIGN KEY (organization_id, fulfillment_id)
    REFERENCES v2_sales_fulfillments(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_sales_fulfillment_line_reservation_tenant_fk FOREIGN KEY (organization_id, reservation_id)
    REFERENCES v2_sales_finished_good_reservations(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_fulfillment_line_order_line_tenant_fk FOREIGN KEY (organization_id, sales_order_line_id)
    REFERENCES v2_sales_order_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_fulfillment_line_lot_tenant_fk FOREIGN KEY (organization_id, finished_good_lot_id)
    REFERENCES v2_finished_good_lots(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_fulfillment_line_ledger_tenant_fk FOREIGN KEY (organization_id, fulfillment_ledger_entry_id)
    REFERENCES v2_finished_good_ledger_entries(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_fulfillment_line_unique UNIQUE (organization_id, fulfillment_id, reservation_id)
);

CREATE TABLE IF NOT EXISTS v2_sales_shipments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  fulfillment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','EXCEPTION','CANCELLED')),
  carrier TEXT,
  service TEXT,
  tracking_number TEXT,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  exception_code TEXT,
  status_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(status_metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_sales_shipments_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_shipment_fulfillment_tenant_fk FOREIGN KEY (organization_id, fulfillment_id)
    REFERENCES v2_sales_fulfillments(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_shipment_fulfillment_unique UNIQUE (organization_id, fulfillment_id)
);

CREATE TABLE IF NOT EXISTS v2_sales_return_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  return_number TEXT NOT NULL CHECK (return_number ~ '^[A-Z0-9][A-Z0-9._/-]{1,79}$'),
  sales_order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','AUTHORIZED','RECEIVED','INSPECTING','DISPOSITIONED','CLOSED','REJECTED','CANCELLED')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  authorization_rationale TEXT,
  inspection_notes TEXT,
  requested_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  authorized_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  received_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_sales_returns_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_return_number_unique UNIQUE (organization_id, return_number),
  CONSTRAINT v2_sales_return_order_tenant_fk FOREIGN KEY (organization_id, sales_order_id)
    REFERENCES v2_sales_orders(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS v2_sales_return_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  return_request_id TEXT NOT NULL,
  sales_order_line_id TEXT NOT NULL,
  requested_quantity_g NUMERIC(18,6) NOT NULL CHECK (requested_quantity_g > 0),
  received_quantity_g NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (received_quantity_g >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_sales_return_lines_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_return_line_request_tenant_fk FOREIGN KEY (organization_id, return_request_id)
    REFERENCES v2_sales_return_requests(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_sales_return_line_order_line_tenant_fk FOREIGN KEY (organization_id, sales_order_line_id)
    REFERENCES v2_sales_order_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_return_line_order_unique UNIQUE (organization_id, return_request_id, sales_order_line_id),
  CONSTRAINT v2_sales_return_line_received_check CHECK (received_quantity_g <= requested_quantity_g)
);

-- Receipt records are immutable physical custody evidence. A return line may
-- span multiple shipped lots, so lot and ledger provenance must never live on
-- the mutable aggregate line itself.
CREATE TABLE IF NOT EXISTS v2_sales_return_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  return_line_id TEXT NOT NULL,
  finished_good_lot_id TEXT NOT NULL,
  quantity_g NUMERIC(18,6) NOT NULL CHECK (quantity_g > 0),
  disposition TEXT NOT NULL DEFAULT 'QUARANTINE' CHECK (disposition = 'QUARANTINE'),
  return_ledger_entry_id TEXT NOT NULL,
  received_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_sales_return_receipts_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_return_receipt_line_tenant_fk FOREIGN KEY (organization_id, return_line_id)
    REFERENCES v2_sales_return_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_return_receipt_lot_tenant_fk FOREIGN KEY (organization_id, finished_good_lot_id)
    REFERENCES v2_finished_good_lots(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_return_receipt_ledger_tenant_fk FOREIGN KEY (organization_id, return_ledger_entry_id)
    REFERENCES v2_finished_good_ledger_entries(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_return_receipt_ledger_unique UNIQUE (organization_id, return_ledger_entry_id)
);

-- A quality disposition is a separate immutable decision. Physical custody
-- remains in the receipt record; this table records the evidence-backed
-- terminal decision over the complete received return.
CREATE TABLE IF NOT EXISTS v2_sales_return_dispositions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  return_request_id TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('HOLD_FOR_QUALITY','REJECT_TO_WASTE','RELEASE_TO_AVAILABLE')),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 2000),
  evidence_document_snapshot_ids JSONB NOT NULL CHECK (jsonb_typeof(evidence_document_snapshot_ids) = 'array' AND jsonb_array_length(evidence_document_snapshot_ids) BETWEEN 1 AND 40),
  outcome_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(outcome_snapshot) = 'object'),
  decided_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_sales_return_dispositions_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_sales_return_disposition_request_tenant_fk FOREIGN KEY (organization_id, return_request_id)
    REFERENCES v2_sales_return_requests(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_sales_return_disposition_request_unique UNIQUE (organization_id, return_request_id)
);

CREATE TABLE IF NOT EXISTS v2_commerce_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('QUOTE','ORDER','FULFILLMENT','RETURN')),
  subject_id TEXT NOT NULL,
  document_kind TEXT NOT NULL CHECK (document_kind IN ('QUOTE','ORDER_CONFIRMATION','PACKING_LIST','SHIPMENT_STATUS','RETURN_AUTHORIZATION','RETURN_QC')),
  object_ref TEXT NOT NULL CHECK (length(trim(object_ref)) BETWEEN 1 AND 2048),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_commerce_documents_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_commerce_document_content_unique UNIQUE (organization_id, subject_type, subject_id, document_kind, object_ref, content_hash)
);

-- Keep re-applying this untagged migration safe while extending the controlled
-- document vocabulary used by return Quality disposition.
ALTER TABLE v2_commerce_documents DROP CONSTRAINT IF EXISTS v2_commerce_documents_document_kind_check;
ALTER TABLE v2_commerce_documents ADD CONSTRAINT v2_commerce_documents_document_kind_check
  CHECK (document_kind IN ('QUOTE','ORDER_CONFIRMATION','PACKING_LIST','SHIPMENT_STATUS','RETURN_AUTHORIZATION','RETURN_QC'));

CREATE TABLE IF NOT EXISTS v2_commerce_traceability_edges (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  sales_order_id TEXT NOT NULL,
  from_entity_type TEXT NOT NULL CHECK (from_entity_type IN ('FINISHED_GOOD_LOT','SALES_ORDER','SALES_ORDER_LINE','RESERVATION','FULFILLMENT','SHIPMENT','RETURN')),
  from_entity_id TEXT NOT NULL CHECK (length(trim(from_entity_id)) BETWEEN 1 AND 160),
  to_entity_type TEXT NOT NULL CHECK (to_entity_type IN ('FINISHED_GOOD_LOT','SALES_ORDER','SALES_ORDER_LINE','RESERVATION','FULFILLMENT','SHIPMENT','RETURN')),
  to_entity_id TEXT NOT NULL CHECK (length(trim(to_entity_id)) BETWEEN 1 AND 160),
  edge_type TEXT NOT NULL CHECK (edge_type IN ('ORDERED_AS','ALLOCATED_TO','PICKED_FOR','FULFILLED_BY','SHIPPED_AS','RETURNED_FROM','RETURN_RELEASED_TO_AVAILABLE','RETURN_REJECTED_TO_WASTE')),
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence_snapshot) = 'object'),
  created_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_commerce_traceability_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_commerce_traceability_order_tenant_fk FOREIGN KEY (organization_id, sales_order_id)
    REFERENCES v2_sales_orders(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_commerce_traceability_unique UNIQUE (organization_id, sales_order_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, edge_type)
);

ALTER TABLE v2_commerce_traceability_edges DROP CONSTRAINT IF EXISTS v2_commerce_traceability_edges_edge_type_check;
ALTER TABLE v2_commerce_traceability_edges ADD CONSTRAINT v2_commerce_traceability_edges_edge_type_check
  CHECK (edge_type IN ('ORDERED_AS','ALLOCATED_TO','PICKED_FOR','FULFILLED_BY','SHIPPED_AS','RETURNED_FROM','RETURN_RELEASED_TO_AVAILABLE','RETURN_REJECTED_TO_WASTE'));

CREATE INDEX IF NOT EXISTS v2_customers_org_status_idx ON v2_customers(organization_id, status, name);
CREATE INDEX IF NOT EXISTS v2_products_org_status_idx ON v2_commerce_products(organization_id, status, sku);
CREATE INDEX IF NOT EXISTS v2_prices_org_product_idx ON v2_commerce_product_prices(organization_id, product_id, status, effective_from DESC);
CREATE INDEX IF NOT EXISTS v2_quotes_org_customer_status_idx ON v2_quotes(organization_id, customer_id, status, valid_until);
CREATE INDEX IF NOT EXISTS v2_orders_org_customer_status_idx ON v2_sales_orders(organization_id, customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_order_lines_org_order_idx ON v2_sales_order_lines(organization_id, sales_order_id, line_number);
CREATE INDEX IF NOT EXISTS v2_sales_reservations_org_lot_status_idx ON v2_sales_finished_good_reservations(organization_id, finished_good_lot_id, status, expires_at);
CREATE INDEX IF NOT EXISTS v2_sales_fulfillments_org_order_status_idx ON v2_sales_fulfillments(organization_id, sales_order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_sales_shipments_org_tracking_idx ON v2_sales_shipments(organization_id, tracking_number, status);
CREATE INDEX IF NOT EXISTS v2_sales_returns_org_order_status_idx ON v2_sales_return_requests(organization_id, sales_order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_sales_return_receipts_org_line_lot_idx ON v2_sales_return_receipts(organization_id, return_line_id, finished_good_lot_id, received_at DESC);
CREATE INDEX IF NOT EXISTS v2_sales_return_dispositions_org_request_idx ON v2_sales_return_dispositions(organization_id, return_request_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS v2_commerce_traceability_org_order_idx ON v2_commerce_traceability_edges(organization_id, sales_order_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.v2_reject_commerce_append_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'commerce append-only evidence cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS v2_sales_order_events_append_only ON v2_sales_order_events;
CREATE TRIGGER v2_sales_order_events_append_only BEFORE UPDATE OR DELETE ON v2_sales_order_events
  FOR EACH ROW EXECUTE FUNCTION public.v2_reject_commerce_append_mutation();
DROP TRIGGER IF EXISTS v2_commerce_traceability_append_only ON v2_commerce_traceability_edges;
CREATE TRIGGER v2_commerce_traceability_append_only BEFORE UPDATE OR DELETE ON v2_commerce_traceability_edges
  FOR EACH ROW EXECUTE FUNCTION public.v2_reject_commerce_append_mutation();
DROP TRIGGER IF EXISTS v2_sales_return_receipts_append_only ON v2_sales_return_receipts;
CREATE TRIGGER v2_sales_return_receipts_append_only BEFORE UPDATE OR DELETE ON v2_sales_return_receipts
  FOR EACH ROW EXECUTE FUNCTION public.v2_reject_commerce_append_mutation();
DROP TRIGGER IF EXISTS v2_sales_return_dispositions_append_only ON v2_sales_return_dispositions;
CREATE TRIGGER v2_sales_return_dispositions_append_only BEFORE UPDATE OR DELETE ON v2_sales_return_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.v2_reject_commerce_append_mutation();
REVOKE UPDATE, DELETE ON v2_sales_order_events, v2_commerce_traceability_edges, v2_sales_return_receipts, v2_sales_return_dispositions FROM PUBLIC;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_customers','v2_customer_contacts','v2_customer_addresses','v2_commerce_products','v2_commerce_product_prices',
    'v2_quotes','v2_quote_versions','v2_quote_lines','v2_sales_orders','v2_sales_order_lines','v2_sales_order_events',
    'v2_sales_finished_good_reservations','v2_sales_fulfillments','v2_sales_fulfillment_lines','v2_sales_shipments',
    'v2_sales_return_requests','v2_sales_return_lines','v2_sales_return_receipts','v2_sales_return_dispositions','v2_commerce_documents','v2_commerce_traceability_edges'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON v2_customers, v2_customer_contacts, v2_customer_addresses, v2_commerce_products, v2_commerce_product_prices, v2_quotes, v2_quote_versions, v2_quote_lines, v2_sales_orders, v2_sales_order_lines, v2_sales_order_events, v2_sales_finished_good_reservations, v2_sales_fulfillments, v2_sales_fulfillment_lines, v2_sales_shipments, v2_sales_return_requests, v2_sales_return_lines, v2_sales_return_receipts, v2_sales_return_dispositions, v2_commerce_documents, v2_commerce_traceability_edges TO v2_app';
  END IF;
END $$;

-- Existing tenants retain the stable broad commerce/order/costing policy keys.
-- New registrations get them from the platform defaults; this idempotent
-- backfill only extends persisted role-policy JSON without replacing custom
-- grants or removing tenant-specific policy choices.
UPDATE v2_role_policies AS policy
SET
  permissions = (
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM (
      SELECT existing.permission
      FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
      UNION
      SELECT required.permission
      FROM jsonb_array_elements_text(CASE policy.role_key
        WHEN 'Owner' THEN '["commerce.view","commerce.manage","orders.view","orders.create","orders.reserve","orders.fulfill","costing.view","costing.viewMargin","documents.view","documents.manage"]'::jsonb
        WHEN 'Admin' THEN '["commerce.view","commerce.manage","orders.view","orders.create","orders.reserve","orders.fulfill","costing.view","costing.viewMargin","documents.view","documents.manage"]'::jsonb
        WHEN 'Finance' THEN '["commerce.view","orders.view","costing.view","costing.viewMargin","documents.view"]'::jsonb
        WHEN 'Lab Manager' THEN '["commerce.view","orders.view","orders.reserve","orders.fulfill","documents.view"]'::jsonb
        WHEN 'Brand' THEN '["commerce.view","orders.view","documents.view"]'::jsonb
        ELSE '[]'::jsonb
      END) AS required(permission)
    ) AS merged
  ),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key IN ('Owner','Admin','Finance','Lab Manager','Brand')
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(CASE policy.role_key
      WHEN 'Owner' THEN '["commerce.view","commerce.manage","orders.view","orders.create","orders.reserve","orders.fulfill","costing.view","costing.viewMargin","documents.view","documents.manage"]'::jsonb
      WHEN 'Admin' THEN '["commerce.view","commerce.manage","orders.view","orders.create","orders.reserve","orders.fulfill","costing.view","costing.viewMargin","documents.view","documents.manage"]'::jsonb
      WHEN 'Finance' THEN '["commerce.view","orders.view","costing.view","costing.viewMargin","documents.view"]'::jsonb
      WHEN 'Lab Manager' THEN '["commerce.view","orders.view","orders.reserve","orders.fulfill","documents.view"]'::jsonb
      WHEN 'Brand' THEN '["commerce.view","orders.view","documents.view"]'::jsonb
      ELSE '[]'::jsonb
    END) AS required(permission)
    WHERE NOT policy.permissions ? required.permission
  );
