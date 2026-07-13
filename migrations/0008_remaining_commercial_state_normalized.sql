CREATE TABLE IF NOT EXISTS material_records (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cas TEXT NOT NULL,
  family TEXT NOT NULL,
  tier TEXT NOT NULL,
  record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_material_records_cas
  ON material_records(cas);

CREATE INDEX IF NOT EXISTS idx_material_records_family
  ON material_records(family);

CREATE TABLE IF NOT EXISTS molecule_components (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cas TEXT NOT NULL,
  status TEXT NOT NULL,
  record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_molecule_components_material_status
  ON molecule_components(material_id, status);

CREATE TABLE IF NOT EXISTS storage_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  status TEXT NOT NULL,
  record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_storage_locations_zone_status
  ON storage_locations(zone, status);

CREATE TABLE IF NOT EXISTS stock_take_records (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  status TEXT NOT NULL,
  record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_take_records_lot_at
  ON stock_take_records(lot_id, at);

CREATE TABLE IF NOT EXISTS tenant_settings (
  organization_id TEXT PRIMARY KEY,
  locale TEXT NOT NULL,
  timezone TEXT NOT NULL,
  currency TEXT NOT NULL,
  default_unit TEXT NOT NULL,
  default_dilution_percent REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  phase INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_phase
  ON feature_flags(phase);

CREATE TABLE IF NOT EXISTS numbering_sequences (
  sequence_key TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  next_value INTEGER NOT NULL,
  scope TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_numbering_sequences_scope
  ON numbering_sequences(scope);

CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  options_json TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_entity_status
  ON custom_fields(entity, status);

CREATE TABLE IF NOT EXISTS tenant_branding (
  organization_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  document_footer TEXT NOT NULL,
  label_template TEXT NOT NULL,
  logo_mode TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  country TEXT NOT NULL,
  lead_time_days INTEGER NOT NULL,
  contact_email TEXT NOT NULL,
  payment_terms TEXT NOT NULL,
  preferred_material_ids_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suppliers_status_country
  ON suppliers(status, country);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  quantity_grams REAL NOT NULL,
  received_grams REAL NOT NULL,
  status TEXT NOT NULL,
  expected_date TEXT NOT NULL,
  unit_cost REAL NOT NULL,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_status
  ON purchase_orders(supplier_id, status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_material_status
  ON purchase_orders(material_id, status);

CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  purchase_order_id TEXT NOT NULL,
  unit_cost REAL NOT NULL,
  currency TEXT NOT NULL,
  quantity_grams REAL NOT NULL,
  captured_at TEXT NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_history_material_captured
  ON price_history(material_id, captured_at);

CREATE TABLE IF NOT EXISTS commercial_skus (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  pack_size_grams REAL NOT NULL,
  price REAL NOT NULL,
  currency TEXT NOT NULL,
  tier TEXT NOT NULL,
  status TEXT NOT NULL,
  moq_packs INTEGER NOT NULL,
  label_template TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commercial_skus_material_status
  ON commercial_skus(material_id, status);

CREATE INDEX IF NOT EXISTS idx_commercial_skus_tier_status
  ON commercial_skus(tier, status);

CREATE TABLE IF NOT EXISTS price_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  customer_group TEXT NOT NULL,
  currency TEXT NOT NULL,
  multiplier REAL NOT NULL,
  sample_eligible INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_lists_group_status
  ON price_lists(customer_group, status);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  customer TEXT NOT NULL,
  customer_group TEXT NOT NULL,
  quantity_packs INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quotes_sku_status
  ON quotes(sku_id, status);

CREATE INDEX IF NOT EXISTS idx_quotes_created_at
  ON quotes(created_at);

CREATE TABLE IF NOT EXISTS sample_requests (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  customer TEXT NOT NULL,
  packs INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sample_requests_sku_status
  ON sample_requests(sku_id, status);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  customer_group TEXT NOT NULL,
  credit_limit REAL NOT NULL,
  payment_terms TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  billing_address_json TEXT NOT NULL,
  shipping_address_json TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_group_status
  ON customers(customer_group, status);

CREATE INDEX IF NOT EXISTS idx_customers_contact_email
  ON customers(contact_email);

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cadence TEXT NOT NULL,
  audience TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL,
  last_run_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_status_cadence
  ON scheduled_reports(status, cadence);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  collection_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  trial_ends_at TEXT,
  grace_ends_at TEXT,
  freeze_reason TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  can_write INTEGER NOT NULL DEFAULT 0,
  can_export INTEGER NOT NULL DEFAULT 0,
  next_invoice_at TEXT NOT NULL,
  subscription_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_org_status
  ON billing_subscriptions(organization_id, status);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_due REAL NOT NULL,
  currency TEXT NOT NULL,
  due_at TEXT NOT NULL,
  paid_at TEXT,
  hosted_invoice_url TEXT NOT NULL,
  document_id TEXT,
  provider_invoice_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_subscription_status
  ON billing_invoices(subscription_id, status);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_due_at
  ON billing_invoices(due_at);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  last_attempt_at TEXT NOT NULL,
  next_retry_at TEXT,
  response_code INTEGER,
  idempotency_key TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status_retry
  ON webhook_deliveries(status, next_retry_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_deliveries_idempotency
  ON webhook_deliveries(idempotency_key);
