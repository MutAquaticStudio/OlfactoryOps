CREATE TABLE IF NOT EXISTS document_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  linked_to TEXT NOT NULL,
  version TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  status TEXT NOT NULL,
  issue_date TEXT,
  expires_at TEXT,
  last_accessed TEXT NOT NULL,
  downloads INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_kb REAL NOT NULL,
  checksum TEXT NOT NULL,
  owner TEXT NOT NULL,
  generated_from TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_records_linked_type
  ON document_records(linked_to, type);

CREATE INDEX IF NOT EXISTS idx_document_records_status
  ON document_records(status);

CREATE INDEX IF NOT EXISTS idx_document_records_expiry
  ON document_records(expires_at);
