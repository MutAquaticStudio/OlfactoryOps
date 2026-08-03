-- Lluch 2026 is a platform-curated, read-only research library. The Worker
-- writes the deterministic 1,986 material records and keeps this publication
-- record as the source/version/checksum authority.
CREATE TABLE IF NOT EXISTS global_material_publications (
  publication_key TEXT PRIMARY KEY,
  supplier TEXT NOT NULL,
  catalogue TEXT NOT NULL,
  catalogue_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  material_count INTEGER NOT NULL CHECK (material_count >= 0),
  status TEXT NOT NULL CHECK (status IN ('PUBLISHED', 'REFERENCE_ONLY', 'ARCHIVED')),
  published_at TEXT NOT NULL,
  published_by TEXT NOT NULL,
  audit_reference TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_global_material_publications_status
  ON global_material_publications(status, catalogue_version DESC);

CREATE INDEX IF NOT EXISTS idx_material_records_global_catalogue
  ON material_records(library_scope, updated_at DESC)
  WHERE library_scope = 'GLOBAL';
