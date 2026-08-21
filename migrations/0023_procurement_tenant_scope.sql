ALTER TABLE suppliers ADD COLUMN organization_id TEXT;
ALTER TABLE purchase_orders ADD COLUMN organization_id TEXT;
ALTER TABLE price_history ADD COLUMN organization_id TEXT;

UPDATE suppliers SET organization_id = 'org-nxl' WHERE organization_id IS NULL;
UPDATE purchase_orders SET organization_id = 'org-nxl' WHERE organization_id IS NULL;
UPDATE price_history SET organization_id = 'org-nxl' WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_organization_name
  ON suppliers(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_organization_created
  ON purchase_orders(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_organization_material_captured
  ON price_history(organization_id, material_id, captured_at DESC);
