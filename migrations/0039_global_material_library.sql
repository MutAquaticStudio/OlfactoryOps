-- Shared Material Intelligence records are globally readable. Materials
-- created by a workspace remain private to that organization.
ALTER TABLE material_records ADD COLUMN library_scope TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE material_records ADD COLUMN organization_id TEXT;

-- Legacy records already carried tenant ownership inside record_json. Preserve
-- that ownership without inventing a tenant for curated seed records.
UPDATE material_records
SET organization_id = NULLIF(TRIM(json_extract(record_json, '$.organizationId')), '')
WHERE json_extract(record_json, '$.organizationId') IS NOT NULL;

UPDATE material_records
SET library_scope = CASE
  WHEN organization_id IS NULL THEN 'GLOBAL'
  ELSE 'TENANT'
END;

CREATE INDEX IF NOT EXISTS idx_material_records_scope_name
  ON material_records(library_scope, name);

CREATE INDEX IF NOT EXISTS idx_material_records_organization_name
  ON material_records(organization_id, name)
  WHERE library_scope = 'TENANT';

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_records_global_cas
  ON material_records(cas)
  WHERE library_scope = 'GLOBAL';

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_records_tenant_cas
  ON material_records(organization_id, cas)
  WHERE library_scope = 'TENANT';
