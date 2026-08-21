ALTER TABLE commercial_skus ADD COLUMN formula_id TEXT;
ALTER TABLE commercial_skus ADD COLUMN product_kind TEXT NOT NULL DEFAULT 'MATERIAL';
ALTER TABLE commercial_skus ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-nxl';
ALTER TABLE price_lists ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-nxl';
ALTER TABLE quotes ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-nxl';
ALTER TABLE sample_requests ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-nxl';
ALTER TABLE customers ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-nxl';
ALTER TABLE sales_orders ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-nxl';
ALTER TABLE order_shipments ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-nxl';
ALTER TABLE order_documents ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-nxl';
ALTER TABLE scheduled_reports ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-nxl';

CREATE INDEX IF NOT EXISTS idx_commercial_skus_formula_status
  ON commercial_skus(formula_id, status);

CREATE INDEX IF NOT EXISTS idx_commercial_skus_organization_status
  ON commercial_skus(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_price_lists_organization_status
  ON price_lists(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_quotes_organization_status
  ON quotes(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_organization_status
  ON customers(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_organization_status
  ON sales_orders(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_organization_status
  ON scheduled_reports(organization_id, status);

CREATE TABLE IF NOT EXISTS finished_good_lots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  formula_id TEXT NOT NULL,
  formula_code TEXT NOT NULL,
  lot_number TEXT NOT NULL,
  quantity_grams REAL NOT NULL CHECK (quantity_grams >= 0),
  reserved_grams REAL NOT NULL DEFAULT 0 CHECK (reserved_grams >= 0),
  quality_status TEXT NOT NULL CHECK (quality_status IN ('RELEASED', 'HOLD')),
  released_at TEXT NOT NULL,
  cost_per_gram REAL NOT NULL CHECK (cost_per_gram >= 0),
  currency TEXT NOT NULL,
  location TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, batch_id),
  UNIQUE (organization_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_finished_good_lots_organization_formula_quality
  ON finished_good_lots(organization_id, formula_id, quality_status, released_at);

CREATE TABLE IF NOT EXISTS finished_good_movements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  finished_good_lot_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  formula_id TEXT NOT NULL,
  order_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('PRODUCTION_OUTPUT', 'RESERVATION', 'RESERVATION_RELEASE', 'FULFILLMENT')),
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'HOLD', 'RELEASE', 'OUT')),
  quantity_grams REAL NOT NULL CHECK (quantity_grams > 0),
  balance_after REAL NOT NULL CHECK (balance_after >= 0),
  cost_per_gram REAL NOT NULL CHECK (cost_per_gram >= 0),
  cogs_amount REAL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finished_good_movements_organization_lot_at
  ON finished_good_movements(organization_id, finished_good_lot_id, at);

CREATE INDEX IF NOT EXISTS idx_finished_good_movements_order
  ON finished_good_movements(organization_id, order_id, at);
