CREATE TABLE IF NOT EXISTS production_batches (
  id TEXT PRIMARY KEY,
  formula_id TEXT NOT NULL,
  formula_code TEXT NOT NULL,
  status TEXT NOT NULL,
  target_grams REAL NOT NULL,
  consumed_grams REAL NOT NULL,
  qc_status TEXT NOT NULL,
  owner TEXT NOT NULL,
  work_order_json TEXT NOT NULL,
  qc_checks_json TEXT NOT NULL,
  yield_grams REAL,
  yield_variance_percent REAL,
  output_lot_json TEXT,
  genealogy_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_production_batches_formula_status
  ON production_batches(formula_id, status);

CREATE INDEX IF NOT EXISTS idx_production_batches_status
  ON production_batches(status);

CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount_percent REAL NOT NULL,
  tax_percent REAL NOT NULL,
  shipping_cost REAL NOT NULL,
  total REAL NOT NULL,
  currency TEXT NOT NULL,
  reserved_grams REAL NOT NULL,
  fulfilled_grams REAL NOT NULL,
  status TEXT NOT NULL,
  carrier TEXT,
  tracking_number TEXT,
  reservation_allocations_json TEXT,
  shipment_id TEXT,
  document_ids_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_status
  ON sales_orders(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_sales_orders_status
  ON sales_orders(status);

CREATE INDEX IF NOT EXISTS idx_sales_orders_created_at
  ON sales_orders(created_at);

CREATE TABLE IF NOT EXISTS order_shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  status TEXT NOT NULL,
  shipped_at TEXT,
  delivered_at TEXT,
  weight_grams REAL NOT NULL,
  allocations_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_shipments_order_status
  ON order_shipments(order_id, status);

CREATE TABLE IF NOT EXISTS order_documents (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_documents_order_type
  ON order_documents(order_id, type);

CREATE INDEX IF NOT EXISTS idx_order_documents_status
  ON order_documents(status);
