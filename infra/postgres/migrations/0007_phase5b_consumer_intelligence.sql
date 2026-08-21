-- Phase 5B: consented consumer intelligence. Raw feedback remains outside this
-- database; only a private reference, hashes and bounded derived evidence exist here.

CREATE TABLE IF NOT EXISTS v2_feedback_sources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL CHECK (source_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  source_type TEXT NOT NULL CHECK (source_type IN ('REVIEW','SURVEY','WORKSHOP','BRAND_PROJECT','INTERNAL_EVALUATION')),
  source_scope TEXT NOT NULL CHECK (length(trim(source_scope)) BETWEEN 1 AND 160),
  storage_ref TEXT NOT NULL CHECK (length(trim(storage_ref)) BETWEEN 1 AND 2048),
  purpose TEXT NOT NULL CHECK (length(trim(purpose)) BETWEEN 1 AND 500),
  consent_required BOOLEAN NOT NULL,
  retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 1 AND 36500),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','INVALIDATED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidated_at TIMESTAMPTZ,
  UNIQUE (organization_id, source_key)
);

CREATE TABLE IF NOT EXISTS v2_feedback_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES v2_feedback_sources(id) ON DELETE CASCADE,
  external_ref_hash TEXT NOT NULL CHECK (external_ref_hash ~ '^[a-f0-9]{64}$'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  private_content_ref TEXT NOT NULL CHECK (length(trim(private_content_ref)) BETWEEN 1 AND 2048),
  consent_proof_hash TEXT CHECK (consent_proof_hash ~ '^[a-f0-9]{64}$'),
  language_hint TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (language_hint IN ('EN','VI','UNKNOWN')),
  redacted BOOLEAN NOT NULL DEFAULT TRUE,
  collected_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_id, external_ref_hash)
);

CREATE TABLE IF NOT EXISTS v2_sentiment_analyses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  feedback_item_id TEXT NOT NULL REFERENCES v2_feedback_items(id) ON DELETE CASCADE,
  extraction_version TEXT NOT NULL CHECK (length(trim(extraction_version)) BETWEEN 1 AND 120),
  provider TEXT NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 120),
  model_version TEXT NOT NULL CHECK (length(trim(model_version)) BETWEEN 1 AND 120),
  language TEXT NOT NULL CHECK (language IN ('EN','VI','OTHER','UNKNOWN')),
  language_confidence DOUBLE PRECISION NOT NULL CHECK (language_confidence BETWEEN 0 AND 1),
  overall JSONB NOT NULL CHECK (jsonb_typeof(overall) = 'object'),
  aspect_signals JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(aspect_signals) = 'array'),
  perception_signals JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(perception_signals) = 'array'),
  descriptor_signals JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(descriptor_signals) = 'array'),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','LOW_CONFIDENCE','NOT_ENOUGH_EVIDENCE','NOT_CONFIGURED','BLOCKED','INVALIDATED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, feedback_item_id, extraction_version)
);

CREATE TABLE IF NOT EXISTS v2_consumer_preference_vectors (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  source_scope TEXT NOT NULL CHECK (length(trim(source_scope)) BETWEEN 1 AND 160),
  source_ids JSONB NOT NULL CHECK (jsonb_typeof(source_ids) = 'array'),
  source_set_hash TEXT NOT NULL CHECK (source_set_hash ~ '^[a-f0-9]{64}$'),
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  vocabulary_version TEXT NOT NULL CHECK (length(trim(vocabulary_version)) BETWEEN 1 AND 120),
  dimensions JSONB NOT NULL CHECK (jsonb_typeof(dimensions) = 'object'),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','LOW_CONFIDENCE','NOT_ENOUGH_EVIDENCE','NOT_CONFIGURED','BLOCKED','INVALIDATED')),
  aggregation_version TEXT NOT NULL CHECK (length(trim(aggregation_version)) BETWEEN 1 AND 120),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (window_end IS NULL OR window_start IS NULL OR window_end >= window_start),
  UNIQUE (organization_id, source_scope, source_set_hash, vocabulary_version, aggregation_version)
);

CREATE TABLE IF NOT EXISTS v2_sentiment_invalidations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES v2_feedback_sources(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL CHECK (length(trim(reason_code)) BETWEEN 1 AND 120),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_id, reason_code)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_feedback_sources_org_id_unique') THEN ALTER TABLE v2_feedback_sources ADD CONSTRAINT v2_feedback_sources_org_id_unique UNIQUE (organization_id, id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_feedback_items_org_id_unique') THEN ALTER TABLE v2_feedback_items ADD CONSTRAINT v2_feedback_items_org_id_unique UNIQUE (organization_id, id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_feedback_source_tenant_fk') THEN ALTER TABLE v2_feedback_items ADD CONSTRAINT v2_feedback_source_tenant_fk FOREIGN KEY (organization_id, source_id) REFERENCES v2_feedback_sources(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sentiment_item_tenant_fk') THEN ALTER TABLE v2_sentiment_analyses ADD CONSTRAINT v2_sentiment_item_tenant_fk FOREIGN KEY (organization_id, feedback_item_id) REFERENCES v2_feedback_items(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sentiment_invalidation_source_tenant_fk') THEN ALTER TABLE v2_sentiment_invalidations ADD CONSTRAINT v2_sentiment_invalidation_source_tenant_fk FOREIGN KEY (organization_id, source_id) REFERENCES v2_feedback_sources(organization_id, id) ON DELETE CASCADE; END IF;
END $$;

CREATE INDEX IF NOT EXISTS v2_feedback_items_source_lookup_idx ON v2_feedback_items(organization_id, source_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS v2_sentiment_analyses_item_lookup_idx ON v2_sentiment_analyses(organization_id, feedback_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_preference_vectors_lookup_idx ON v2_consumer_preference_vectors(organization_id, source_scope, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['v2_feedback_sources','v2_feedback_items','v2_sentiment_analyses','v2_consumer_preference_vectors','v2_sentiment_invalidations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app'; END IF;
END $$;
