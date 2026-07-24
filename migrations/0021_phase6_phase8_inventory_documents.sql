ALTER TABLE inventory_lots ADD COLUMN in_transit_from_location TEXT;
ALTER TABLE inventory_lots ADD COLUMN in_transit_to_location TEXT;
ALTER TABLE inventory_lots ADD COLUMN transfer_started_at TEXT;
ALTER TABLE inventory_lots ADD COLUMN transfer_started_by TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_lots_transit_destination
  ON inventory_lots(in_transit_to_location);

ALTER TABLE document_records ADD COLUMN organization_id TEXT;
ALTER TABLE document_records ADD COLUMN record_json TEXT;

UPDATE document_records
  SET organization_id = 'org-nxl'
  WHERE organization_id IS NULL OR organization_id = '';

CREATE INDEX IF NOT EXISTS idx_document_records_organization_status
  ON document_records(organization_id, status);
