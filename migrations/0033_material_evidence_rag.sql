-- Controlled Material Evidence RAG. Evidence is tenant-scoped, reviewed before
-- indexing, and always remains subordinate to deterministic domain services.

CREATE TABLE IF NOT EXISTS material_evidence_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('MATERIAL', 'DOCUMENT')),
  material_id TEXT,
  document_id TEXT,
  source_title TEXT NOT NULL,
  source_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  approval_status TEXT NOT NULL,
  extraction_status TEXT NOT NULL CHECK (extraction_status IN (
    'QUEUED', 'EXTRACTED', 'REVIEW_REQUIRED', 'READY', 'NOT_INDEXED',
    'NOT_CONFIGURED', 'FAILED', 'INVALIDATED'
  )),
  extracted_text TEXT,
  reviewed_text TEXT,
  error_code TEXT,
  index_version INTEGER NOT NULL DEFAULT 1,
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  indexed_at TEXT,
  invalidated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, source_kind, material_id, document_id, source_version),
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_material_evidence_documents_material
  ON material_evidence_documents(organization_id, material_id, extraction_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_evidence_documents_document
  ON material_evidence_documents(organization_id, document_id, extraction_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_evidence_documents_status
  ON material_evidence_documents(organization_id, extraction_status, source_kind, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_evidence_documents_material_version
  ON material_evidence_documents(organization_id, material_id, source_version)
  WHERE source_kind = 'MATERIAL';
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_evidence_documents_document_version
  ON material_evidence_documents(organization_id, document_id, source_version)
  WHERE source_kind = 'DOCUMENT';

CREATE TABLE IF NOT EXISTS material_evidence_chunks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  evidence_document_id TEXT NOT NULL,
  vector_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  page_number INTEGER,
  section_label TEXT,
  excerpt TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('READY', 'INVALIDATED')),
  index_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (evidence_document_id, chunk_index, index_version),
  UNIQUE (vector_id),
  FOREIGN KEY (evidence_document_id) REFERENCES material_evidence_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_material_evidence_chunks_lookup
  ON material_evidence_chunks(organization_id, evidence_document_id, status, chunk_index);
CREATE INDEX IF NOT EXISTS idx_material_evidence_chunks_vector
  ON material_evidence_chunks(organization_id, vector_id, status);

CREATE TABLE IF NOT EXISTS material_evidence_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  evidence_document_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('EXTRACT', 'INDEX', 'INVALIDATE')),
  status TEXT NOT NULL CHECK (status IN (
    'QUEUED', 'RUNNING', 'RETRY', 'WAITING_REVIEW', 'WAITING_CONFIGURATION', 'COMPLETED', 'FAILED'
  )),
  input_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  lease_token TEXT,
  lease_expires_at TEXT,
  available_at TEXT NOT NULL,
  error_code TEXT,
  correlation_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (evidence_document_id) REFERENCES material_evidence_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_material_evidence_jobs_due
  ON material_evidence_jobs(status, available_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_material_evidence_jobs_document
  ON material_evidence_jobs(organization_id, evidence_document_id, status, updated_at DESC);
