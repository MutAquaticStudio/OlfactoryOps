-- Material Intelligence foundation: product composition, tenant-owned chemical
-- entities, evidence provenance, and fail-closed scientific eligibility.
-- This migration is additive and does not schedule feature computation.

ALTER TABLE v2_materials
  ADD COLUMN IF NOT EXISTS product_classification TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (product_classification IN ('NEAT_SUBSTANCE','DILUTION','DEFINED_MIXTURE','UNDEFINED_MIXTURE','NATURAL','BASE','FORMULATION','UNKNOWN')),
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS supplier_product_code TEXT,
  ADD COLUMN IF NOT EXISTS trade_name TEXT,
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS physical_form TEXT;

-- Molecular structure fields remain owned by the existing canonical identity.
ALTER TABLE v2_molecular_identities
  ADD COLUMN IF NOT EXISTS molecular_formula TEXT,
  ADD COLUMN IF NOT EXISTS molecular_weight NUMERIC(18,8) CHECK (molecular_weight IS NULL OR molecular_weight > 0);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_molecular_identities_org_id_unique') THEN
    ALTER TABLE v2_molecular_identities ADD CONSTRAINT v2_molecular_identities_org_id_unique UNIQUE (organization_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS v2_chemical_entities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  preferred_name TEXT NOT NULL CHECK (length(trim(preferred_name)) BETWEEN 1 AND 500),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('SINGLE_SUBSTANCE','DEFINED_MIXTURE','UNDEFINED_OR_VARIABLE_COMPOSITION','NATURAL_COMPLEX','UNKNOWN')),
  resolution_status TEXT NOT NULL DEFAULT 'UNRESOLVED' CHECK (resolution_status IN ('UNRESOLVED','RESOLVED','CONFLICTED','NOT_APPLICABLE')),
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  molecular_identity_id TEXT,
  verified_structure_hash TEXT CHECK (verified_structure_hash IS NULL OR verified_structure_hash ~ '^[a-f0-9]{64}$'),
  verified_inchikey TEXT CHECK (verified_inchikey IS NULL OR verified_inchikey ~ '^[A-Z]{14}-[A-Z]{10}-[A-Z]$'),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_chemical_entity_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_chemical_entity_identity_tenant_fk FOREIGN KEY (organization_id, molecular_identity_id) REFERENCES v2_molecular_identities(organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT v2_chemical_entity_verified_identity CHECK (
    (resolution_status = 'RESOLVED' AND evidence_status = 'VERIFIED' AND entity_type = 'SINGLE_SUBSTANCE' AND molecular_identity_id IS NOT NULL AND verified_structure_hash IS NOT NULL AND verified_inchikey IS NOT NULL)
    OR
    (NOT (resolution_status = 'RESOLVED' AND evidence_status = 'VERIFIED' AND entity_type = 'SINGLE_SUBSTANCE') AND verified_structure_hash IS NULL AND verified_inchikey IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS v2_chemical_entity_verified_structure_unique
  ON v2_chemical_entities(organization_id, verified_structure_hash)
  WHERE verified_structure_hash IS NOT NULL AND evidence_status = 'VERIFIED';
CREATE UNIQUE INDEX IF NOT EXISTS v2_chemical_entity_verified_inchikey_unique
  ON v2_chemical_entities(organization_id, verified_inchikey)
  WHERE verified_inchikey IS NOT NULL AND evidence_status = 'VERIFIED';

CREATE OR REPLACE FUNCTION v2_validate_chemical_entity_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.resolution_status = 'RESOLVED' AND NEW.evidence_status = 'VERIFIED' AND NEW.entity_type = 'SINGLE_SUBSTANCE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM v2_molecular_identities identity
      WHERE identity.organization_id = NEW.organization_id
        AND identity.id = NEW.molecular_identity_id
        AND identity.resolution_status = 'RESOLVED'
        AND identity.structure_hash = NEW.verified_structure_hash
        AND identity.inchikey = NEW.verified_inchikey
    ) THEN
      RAISE EXCEPTION 'V2_CHEMICAL_ENTITY_VERIFIED_IDENTITY_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS v2_chemical_entity_verified_identity_guard ON v2_chemical_entities;
CREATE TRIGGER v2_chemical_entity_verified_identity_guard
  BEFORE INSERT OR UPDATE ON v2_chemical_entities
  FOR EACH ROW EXECUTE FUNCTION v2_validate_chemical_entity_identity();

CREATE TABLE IF NOT EXISTS v2_chemical_identifiers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  chemical_entity_id TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('CAS','INCHIKEY','INCHI','SMILES','FEMA','EINECS','TRADE_NAME','CUSTOM')),
  identifier_value TEXT NOT NULL CHECK (length(trim(identifier_value)) BETWEEN 1 AND 4096),
  normalized_value TEXT NOT NULL CHECK (length(trim(normalized_value)) BETWEEN 1 AND 4096),
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  source_ref TEXT NOT NULL,
  source_version TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_chemical_identifier_entity_tenant_fk FOREIGN KEY (organization_id, chemical_entity_id) REFERENCES v2_chemical_entities(organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, chemical_entity_id, identifier_type, normalized_value, source_version)
);

CREATE TABLE IF NOT EXISTS v2_material_components (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL,
  chemical_entity_id TEXT,
  component_name TEXT NOT NULL CHECK (length(trim(component_name)) BETWEEN 1 AND 500),
  component_role TEXT NOT NULL CHECK (component_role IN ('ACTIVE','CARRIER','SOLVENT','STABILIZER','OTHER','UNKNOWN')),
  concentration_kind TEXT NOT NULL CHECK (concentration_kind IN ('EXACT','RANGE','UNKNOWN')),
  concentration_min NUMERIC(18,8),
  concentration_max NUMERIC(18,8),
  concentration_unit TEXT NOT NULL CHECK (concentration_unit IN ('PERCENT','FRACTION','PPM','UNKNOWN')),
  concentration_basis TEXT NOT NULL CHECK (concentration_basis IN ('MASS','VOLUME','MASS_PER_VOLUME','UNKNOWN')),
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  source_ref TEXT,
  source_version TEXT,
  content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_material_component_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_material_component_entity_tenant_fk FOREIGN KEY (organization_id, chemical_entity_id) REFERENCES v2_chemical_entities(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_material_component_concentration CHECK (
    (concentration_kind = 'UNKNOWN' AND concentration_min IS NULL AND concentration_max IS NULL AND concentration_unit = 'UNKNOWN' AND concentration_basis = 'UNKNOWN')
    OR
    (concentration_kind = 'EXACT' AND concentration_min IS NOT NULL AND concentration_min >= 0 AND concentration_max = concentration_min AND concentration_unit <> 'UNKNOWN' AND concentration_basis <> 'UNKNOWN')
    OR
    (concentration_kind = 'RANGE' AND concentration_min IS NOT NULL AND concentration_max IS NOT NULL AND concentration_min >= 0 AND concentration_max >= concentration_min AND concentration_unit <> 'UNKNOWN' AND concentration_basis <> 'UNKNOWN')
  )
);

CREATE TABLE IF NOT EXISTS v2_material_intelligence_evidence (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT,
  chemical_entity_id TEXT,
  component_id TEXT,
  assertion_key TEXT NOT NULL CHECK (length(trim(assertion_key)) BETWEEN 1 AND 160),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('PUBLIC_DATABASE_RECORD','SUPPLIER_DOCUMENT','MATERIAL_DOCUMENT','OPERATOR_ASSERTION','PILOT_FIXTURE')),
  source_ref TEXT NOT NULL,
  source_version TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_material_intelligence_evidence_subject CHECK (num_nonnulls(material_id, chemical_entity_id, component_id) = 1),
  CONSTRAINT v2_material_intelligence_evidence_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_material_intelligence_evidence_entity_tenant_fk FOREIGN KEY (organization_id, chemical_entity_id) REFERENCES v2_chemical_entities(organization_id, id) ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_material_components_org_id_unique') THEN
    ALTER TABLE v2_material_components ADD CONSTRAINT v2_material_components_org_id_unique UNIQUE (organization_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_material_intelligence_evidence_component_tenant_fk') THEN
    ALTER TABLE v2_material_intelligence_evidence ADD CONSTRAINT v2_material_intelligence_evidence_component_tenant_fk FOREIGN KEY (organization_id, component_id) REFERENCES v2_material_components(organization_id, id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS v2_scientific_eligibility_decisions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('MATERIAL_PRODUCT','CHEMICAL_ENTITY')),
  material_id TEXT,
  chemical_entity_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('ELIGIBLE','NOT_ELIGIBLE','REVIEW_REQUIRED')),
  reason_codes JSONB NOT NULL CHECK (jsonb_typeof(reason_codes) = 'array' AND jsonb_array_length(reason_codes) > 0),
  structure_hash TEXT CHECK (structure_hash IS NULL OR structure_hash ~ '^[a-f0-9]{64}$'),
  normalization_version TEXT,
  policy_version TEXT NOT NULL,
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  evaluated_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_scientific_eligibility_subject CHECK (
    (subject_type = 'MATERIAL_PRODUCT' AND material_id IS NOT NULL)
    OR
    (subject_type = 'CHEMICAL_ENTITY' AND material_id IS NULL AND chemical_entity_id IS NOT NULL)
  ),
  CONSTRAINT v2_scientific_eligibility_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_scientific_eligibility_entity_tenant_fk FOREIGN KEY (organization_id, chemical_entity_id) REFERENCES v2_chemical_entities(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_scientific_eligibility_structure CHECK (
    result <> 'ELIGIBLE' OR (chemical_entity_id IS NOT NULL AND structure_hash IS NOT NULL AND normalization_version IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS v2_chemical_entities_lookup_idx ON v2_chemical_entities(organization_id, resolution_status, evidence_status);
CREATE INDEX IF NOT EXISTS v2_material_components_material_idx ON v2_material_components(organization_id, material_id, created_at);
CREATE INDEX IF NOT EXISTS v2_material_intelligence_evidence_lookup_idx ON v2_material_intelligence_evidence(organization_id, material_id, chemical_entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_scientific_eligibility_material_idx ON v2_scientific_eligibility_decisions(organization_id, subject_type, material_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS v2_scientific_eligibility_entity_idx ON v2_scientific_eligibility_decisions(organization_id, subject_type, chemical_entity_id, evaluated_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_chemical_entities','v2_chemical_identifiers','v2_material_components',
    'v2_material_intelligence_evidence','v2_scientific_eligibility_decisions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;

  DROP TRIGGER IF EXISTS v2_material_intelligence_evidence_append_only ON v2_material_intelligence_evidence;
  CREATE TRIGGER v2_material_intelligence_evidence_append_only BEFORE UPDATE OR DELETE ON v2_material_intelligence_evidence FOR EACH ROW EXECUTE FUNCTION v2_reject_audit_mutation();
  DROP TRIGGER IF EXISTS v2_scientific_eligibility_append_only ON v2_scientific_eligibility_decisions;
  CREATE TRIGGER v2_scientific_eligibility_append_only BEFORE UPDATE OR DELETE ON v2_scientific_eligibility_decisions FOR EACH ROW EXECUTE FUNCTION v2_reject_audit_mutation();

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON v2_chemical_entities, v2_chemical_identifiers, v2_material_components TO v2_app';
    EXECUTE 'GRANT SELECT, INSERT ON v2_material_intelligence_evidence, v2_scientific_eligibility_decisions TO v2_app';
  END IF;
END $$;

REVOKE UPDATE, DELETE ON v2_material_intelligence_evidence, v2_scientific_eligibility_decisions FROM PUBLIC;
