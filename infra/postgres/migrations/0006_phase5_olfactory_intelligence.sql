-- Phase 5: derived molecular intelligence evidence. No row in this migration
-- represents a legal, safety, IFRA, inventory, or formula decision.

CREATE TABLE IF NOT EXISTS v2_molecular_embeddings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  model_version_id TEXT REFERENCES v2_model_versions(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method IN ('FINGERPRINT_BINARY_VECTOR','FUSION_CONCAT')),
  embedding_version TEXT NOT NULL CHECK (length(trim(embedding_version)) BETWEEN 1 AND 120),
  index_version TEXT NOT NULL CHECK (length(trim(index_version)) BETWEEN 1 AND 120),
  normalization TEXT NOT NULL CHECK (normalization IN ('L2')),
  dimension INTEGER NOT NULL CHECK (dimension > 0 AND dimension <= 4096),
  feature_manifest_hash TEXT NOT NULL CHECK (feature_manifest_hash ~ '^[a-f0-9]{64}$'),
  embedding_hash TEXT NOT NULL CHECK (embedding_hash ~ '^[a-f0-9]{64}$'),
  vector JSONB NOT NULL CHECK (jsonb_typeof(vector) = 'array'),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','NOT_EVALUATED','LOW_CONFIDENCE','OUT_OF_DOMAIN','BLOCKED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, material_id, model_version_id, method, embedding_version, index_version, feature_manifest_hash)
);

CREATE TABLE IF NOT EXISTS v2_odor_embeddings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  model_version_id TEXT NOT NULL REFERENCES v2_model_versions(id) ON DELETE RESTRICT,
  embedding_version TEXT NOT NULL CHECK (length(trim(embedding_version)) BETWEEN 1 AND 120),
  index_version TEXT NOT NULL CHECK (length(trim(index_version)) BETWEEN 1 AND 120),
  dimension INTEGER,
  embedding_hash TEXT,
  vector JSONB,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','NOT_EVALUATED','LOW_CONFIDENCE','OUT_OF_DOMAIN','BLOCKED')),
  reason_code TEXT,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((evidence_status = 'VERIFIED' AND dimension IS NOT NULL AND embedding_hash ~ '^[a-f0-9]{64}$' AND vector IS NOT NULL) OR evidence_status <> 'VERIFIED')
);

CREATE TABLE IF NOT EXISTS v2_olfactory_predictions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  model_version_id TEXT NOT NULL REFERENCES v2_model_versions(id) ON DELETE RESTRICT,
  requested_task TEXT NOT NULL CHECK (length(trim(requested_task)) BETWEEN 1 AND 160),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  output JSONB,
  uncertainty JSONB,
  calibration_version TEXT,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','NOT_EVALUATED','LOW_CONFIDENCE','OUT_OF_DOMAIN','BLOCKED')),
  reason_code TEXT,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, material_id, model_version_id, requested_task, input_hash)
);

CREATE TABLE IF NOT EXISTS v2_similarity_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  source_material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  candidate_material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('ECFP_TANIMOTO','BCFP_TANIMOTO','MOLECULAR_EMBEDDING_COSINE','ODOR_EMBEDDING_COSINE')),
  metric_version TEXT NOT NULL CHECK (length(trim(metric_version)) BETWEEN 1 AND 120),
  index_version TEXT NOT NULL CHECK (length(trim(index_version)) BETWEEN 1 AND 120),
  score DOUBLE PRECISION,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','NOT_EVALUATED','LOW_CONFIDENCE','OUT_OF_DOMAIN','BLOCKED')),
  reason_code TEXT,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_material_id <> candidate_material_id),
  CHECK ((evidence_status = 'VERIFIED' AND score IS NOT NULL AND score >= 0 AND score <= 1) OR evidence_status <> 'VERIFIED')
);

CREATE TABLE IF NOT EXISTS v2_explainability_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE CASCADE,
  model_version_id TEXT REFERENCES v2_model_versions(id) ON DELETE RESTRICT,
  feature_kind TEXT NOT NULL CHECK (feature_kind IN ('MOLFTP','OSMORDRED','BCFP')),
  requested_task TEXT NOT NULL CHECK (length(trim(requested_task)) BETWEEN 1 AND 160),
  association JSONB,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','NOT_EVALUATED','LOW_CONFIDENCE','OUT_OF_DOMAIN','BLOCKED')),
  reason_code TEXT,
  disclaimer TEXT NOT NULL DEFAULT 'Association is not causal proof.',
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_materials_org_id_unique_phase5') THEN
    ALTER TABLE v2_materials ADD CONSTRAINT v2_materials_org_id_unique_phase5 UNIQUE (organization_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_molecular_embeddings_material_tenant_fk') THEN
    ALTER TABLE v2_molecular_embeddings ADD CONSTRAINT v2_molecular_embeddings_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_molecular_embeddings_model_tenant_fk') THEN
    ALTER TABLE v2_molecular_embeddings ADD CONSTRAINT v2_molecular_embeddings_model_tenant_fk FOREIGN KEY (organization_id, model_version_id) REFERENCES v2_model_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_odor_embeddings_material_tenant_fk') THEN
    ALTER TABLE v2_odor_embeddings ADD CONSTRAINT v2_odor_embeddings_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_odor_embeddings_model_tenant_fk') THEN
    ALTER TABLE v2_odor_embeddings ADD CONSTRAINT v2_odor_embeddings_model_tenant_fk FOREIGN KEY (organization_id, model_version_id) REFERENCES v2_model_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_predictions_material_tenant_fk') THEN
    ALTER TABLE v2_olfactory_predictions ADD CONSTRAINT v2_predictions_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_predictions_model_tenant_fk') THEN
    ALTER TABLE v2_olfactory_predictions ADD CONSTRAINT v2_predictions_model_tenant_fk FOREIGN KEY (organization_id, model_version_id) REFERENCES v2_model_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_similarity_source_tenant_fk') THEN
    ALTER TABLE v2_similarity_records ADD CONSTRAINT v2_similarity_source_tenant_fk FOREIGN KEY (organization_id, source_material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_similarity_candidate_tenant_fk') THEN
    ALTER TABLE v2_similarity_records ADD CONSTRAINT v2_similarity_candidate_tenant_fk FOREIGN KEY (organization_id, candidate_material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_explainability_material_tenant_fk') THEN
    ALTER TABLE v2_explainability_records ADD CONSTRAINT v2_explainability_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_explainability_model_tenant_fk') THEN
    ALTER TABLE v2_explainability_records ADD CONSTRAINT v2_explainability_model_tenant_fk FOREIGN KEY (organization_id, model_version_id) REFERENCES v2_model_versions(organization_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS v2_molecular_embeddings_lookup_idx ON v2_molecular_embeddings(organization_id, material_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS v2_molecular_embeddings_feature_projection_unique_idx ON v2_molecular_embeddings(organization_id, material_id, method, embedding_version, index_version, feature_manifest_hash) WHERE model_version_id IS NULL;
CREATE INDEX IF NOT EXISTS v2_similarity_records_lookup_idx ON v2_similarity_records(organization_id, source_material_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_predictions_lookup_idx ON v2_olfactory_predictions(organization_id, material_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['v2_molecular_embeddings','v2_odor_embeddings','v2_olfactory_predictions','v2_similarity_records','v2_explainability_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app';
  END IF;
END $$;
