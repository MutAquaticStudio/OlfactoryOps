-- Tenant-scoped Lluch supplier catalogue import. These rows are supplier source
-- references only; they do not create materials, approved suppliers, or inventory.

CREATE TABLE IF NOT EXISTS supplier_catalogue_imports (
  organization_id TEXT NOT NULL,
  supplier TEXT NOT NULL,
  catalogue TEXT NOT NULL,
  catalogue_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  product_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('IMPORTING', 'READY', 'FAILED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, supplier, catalogue, catalogue_version),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_supplier_catalogue_imports_status
  ON supplier_catalogue_imports(organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS supplier_catalogue_products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  supplier TEXT NOT NULL,
  catalogue TEXT NOT NULL,
  catalogue_version TEXT NOT NULL,
  source_product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  cas TEXT,
  einecs TEXT,
  fema TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'SYNTHETIC_AROMA_CHEMICAL', 'NATURAL_AROMA_CHEMICAL', 'NATURAL_PRODUCT', 'ORGANIC_PRODUCT'
  )),
  source_page INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, supplier, catalogue, catalogue_version, source_product_id),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_supplier_catalogue_products_search
  ON supplier_catalogue_products(organization_id, catalogue_version, product_name);
CREATE INDEX IF NOT EXISTS idx_supplier_catalogue_products_cas
  ON supplier_catalogue_products(organization_id, catalogue_version, cas);
