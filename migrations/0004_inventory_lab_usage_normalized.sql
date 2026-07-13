CREATE TABLE IF NOT EXISTS inventory_lots (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  lot_number TEXT NOT NULL,
  quantity_grams REAL NOT NULL,
  reserved_grams REAL NOT NULL,
  received_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  quality_status TEXT NOT NULL,
  location TEXT NOT NULL,
  unit_cost REAL NOT NULL,
  supplier_lot_ref TEXT,
  currency TEXT,
  retest_date TEXT,
  opened_date TEXT,
  shelf_life_after_opening_days INTEGER,
  container TEXT,
  packaging TEXT,
  coa_document_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_material_quality
  ON inventory_lots(material_id, quality_status);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiry
  ON inventory_lots(expiry_date);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  direction TEXT NOT NULL,
  material_id TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  quantity_grams REAL NOT NULL,
  balance_after REAL NOT NULL,
  ref TEXT NOT NULL,
  actor TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_lot_at
  ON inventory_movements(lot_id, at);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref
  ON inventory_movements(ref);

CREATE TABLE IF NOT EXISTS lab_usage_records (
  id TEXT PRIMARY KEY,
  formula_id TEXT NOT NULL,
  formula_code TEXT NOT NULL,
  grams REAL NOT NULL,
  batch_grams REAL NOT NULL,
  status TEXT NOT NULL,
  purpose TEXT NOT NULL,
  project_code TEXT,
  sample_code TEXT,
  qc_link TEXT,
  allocations_json TEXT NOT NULL,
  weighing_session_json TEXT,
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  reversal_movements_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lab_usage_records_formula_created
  ON lab_usage_records(formula_id, created_at);

CREATE INDEX IF NOT EXISTS idx_lab_usage_records_status
  ON lab_usage_records(status);
