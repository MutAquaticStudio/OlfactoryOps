ALTER TABLE inventory_lots
  ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-nxl';

CREATE INDEX IF NOT EXISTS idx_inventory_lots_organization_quality_expiry
  ON inventory_lots(organization_id, quality_status, expiry_date);
