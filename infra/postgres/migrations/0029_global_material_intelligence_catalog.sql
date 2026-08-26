-- Global Material Intelligence catalog and tenant preparation bridge.
--
-- This migration is additive. Existing tenant-owned v2_materials and every
-- operational foreign key remain unchanged. Runtime roles can only read the
-- global catalog; governed import/curation uses a separate NOLOGIN role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_global_material_intelligence_reader') THEN
    CREATE ROLE v2_global_material_intelligence_reader
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'v2_global_material_intelligence_reader'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)
  ) THEN
    RAISE EXCEPTION 'v2_global_material_intelligence_reader exists with unsafe attributes';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_global_material_intelligence_curator') THEN
    CREATE ROLE v2_global_material_intelligence_curator
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'v2_global_material_intelligence_curator'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)
  ) THEN
    RAISE EXCEPTION 'v2_global_material_intelligence_curator exists with unsafe attributes';
  END IF;
END $$;

-- The complete Osmo taxonomy is reference data, not a prediction model. Extend
-- the existing scientific component registry without changing any model or
-- checkpoint artifact, then pin the exact public upstream payload used below.
ALTER TABLE public.v2_scientific_component_pins
  DROP CONSTRAINT IF EXISTS v2_scientific_component_pins_component_key_check;
ALTER TABLE public.v2_scientific_component_pins
  ADD CONSTRAINT v2_scientific_component_pins_component_key_check
  CHECK (component_key IN (
    'RDKIT',
    'BCFP',
    'MOLFTP',
    'OSMORDRED',
    'RDKIT_PYPI',
    'OSMO_SCENT_TAXONOMY'
  ));

INSERT INTO public.v2_scientific_component_pins (
  component_key,
  repository,
  license,
  upstream_ref,
  upstream_commit,
  adapter_version,
  runtime_version,
  patch_status,
  compatibility_test,
  manifest_hash
)
VALUES (
  'OSMO_SCENT_TAXONOMY',
  'https://github.com/osmoai/taxonomy',
  'ODbL-1.0',
  'v1.2',
  'fcd538b578e0a3c6261503380de03d0691b47344',
  'osmo-scent-taxonomy-adapter/1.0.0',
  'reference-data/v1.2',
  'NONE',
  'scripts/osmo-scent-taxonomy.test.ts',
  '934db8fb97c5f2893e5a810ba75941ae6e1633a0fe297d4880f1aab4782ba7f9'
)
ON CONFLICT (component_key) DO UPDATE SET
  repository = EXCLUDED.repository,
  license = EXCLUDED.license,
  upstream_ref = EXCLUDED.upstream_ref,
  upstream_commit = EXCLUDED.upstream_commit,
  adapter_version = EXCLUDED.adapter_version,
  runtime_version = EXCLUDED.runtime_version,
  patch_status = EXCLUDED.patch_status,
  compatibility_test = EXCLUDED.compatibility_test,
  manifest_hash = EXCLUDED.manifest_hash;

CREATE TABLE IF NOT EXISTS public.v2_global_material_intelligence_releases (
  id TEXT PRIMARY KEY,
  release_key TEXT NOT NULL UNIQUE CHECK (length(trim(release_key)) BETWEEN 1 AND 160),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('PRIVATE_R2_WORKBOOK','VERSIONED_DATASET','CURATED_IMPORT')),
  source_ref TEXT NOT NULL CHECK (length(trim(source_ref)) BETWEEN 1 AND 2048),
  source_version TEXT NOT NULL CHECK (length(trim(source_version)) BETWEEN 1 AND 256),
  source_sha256 TEXT NOT NULL UNIQUE CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  schema_version TEXT NOT NULL CHECK (length(trim(schema_version)) BETWEEN 1 AND 160),
  importer_version TEXT NOT NULL CHECK (length(trim(importer_version)) BETWEEN 1 AND 160),
  source_row_count BIGINT NOT NULL CHECK (source_row_count >= 0),
  accounted_row_count BIGINT NOT NULL DEFAULT 0 CHECK (accounted_row_count >= 0),
  global_canonical_neat_count BIGINT NOT NULL DEFAULT 0 CHECK (global_canonical_neat_count >= 0),
  global_canonical_neat_row_count BIGINT NOT NULL DEFAULT 0 CHECK (global_canonical_neat_row_count >= 0),
  dilution_merged_to_neat_count BIGINT NOT NULL DEFAULT 0 CHECK (dilution_merged_to_neat_count >= 0),
  excluded_natural_count BIGINT NOT NULL DEFAULT 0 CHECK (excluded_natural_count >= 0),
  deferred_mixture_count BIGINT NOT NULL DEFAULT 0 CHECK (deferred_mixture_count >= 0),
  deferred_base_count BIGINT NOT NULL DEFAULT 0 CHECK (deferred_base_count >= 0),
  review_required_count BIGINT NOT NULL DEFAULT 0 CHECK (review_required_count >= 0),
  status TEXT NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED','ACTIVE','SUPERSEDED','REJECTED')),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_global_mi_release_accounting CHECK (
    accounted_row_count = global_canonical_neat_row_count
      + dilution_merged_to_neat_count
      + excluded_natural_count
      + deferred_mixture_count
      + deferred_base_count
      + review_required_count
  ),
  CONSTRAINT v2_global_mi_release_activation_shape CHECK (
    (status = 'ACTIVE' AND activated_at IS NOT NULL AND accounted_row_count = source_row_count)
    OR (status <> 'ACTIVE')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS v2_global_mi_single_active_release
  ON public.v2_global_material_intelligence_releases ((status))
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.v2_global_molecular_identities (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES public.v2_global_material_intelligence_releases(id) ON DELETE RESTRICT,
  resolution_status TEXT NOT NULL DEFAULT 'UNRESOLVED'
    CHECK (resolution_status IN ('UNRESOLVED','RESOLVED','CONFLICTED','REJECTED')),
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  canonical_smiles TEXT,
  isomeric_smiles TEXT,
  inchi TEXT,
  inchikey TEXT CHECK (inchikey IS NULL OR inchikey ~ '^[A-Z]{14}-[A-Z]{10}-[A-Z]$'),
  molecular_formula TEXT,
  molecular_weight NUMERIC(18,8) CHECK (molecular_weight IS NULL OR molecular_weight > 0),
  exact_mass NUMERIC(18,8) CHECK (exact_mass IS NULL OR exact_mass > 0),
  structure_hash TEXT CHECK (structure_hash IS NULL OR structure_hash ~ '^[a-f0-9]{64}$'),
  standardization_version TEXT,
  rdkit_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_global_molecular_identity_verified_shape CHECK (
    (
      resolution_status = 'RESOLVED'
      AND evidence_status = 'VERIFIED'
      AND canonical_smiles IS NOT NULL
      AND isomeric_smiles IS NOT NULL
      AND inchi IS NOT NULL
      AND inchikey IS NOT NULL
      AND molecular_formula IS NOT NULL
      AND molecular_weight IS NOT NULL
      AND exact_mass IS NOT NULL
      AND structure_hash IS NOT NULL
      AND standardization_version IS NOT NULL
      AND rdkit_version IS NOT NULL
    )
    OR NOT (resolution_status = 'RESOLVED' AND evidence_status = 'VERIFIED')
  ),
  CONSTRAINT v2_global_molecular_identity_release_id_unique UNIQUE (release_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS v2_global_molecular_identity_verified_structure_unique
  ON public.v2_global_molecular_identities(release_id, structure_hash)
  WHERE resolution_status = 'RESOLVED' AND evidence_status = 'VERIFIED';
CREATE UNIQUE INDEX IF NOT EXISTS v2_global_molecular_identity_verified_inchikey_unique
  ON public.v2_global_molecular_identities(release_id, inchikey)
  WHERE resolution_status = 'RESOLVED' AND evidence_status = 'VERIFIED';

CREATE TABLE IF NOT EXISTS public.v2_global_chemical_entities (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES public.v2_global_material_intelligence_releases(id) ON DELETE RESTRICT,
  preferred_name TEXT NOT NULL CHECK (length(trim(preferred_name)) BETWEEN 1 AND 500),
  normalized_name TEXT NOT NULL CHECK (length(trim(normalized_name)) BETWEEN 1 AND 500),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('SINGLE_SUBSTANCE','DEFINED_MIXTURE','UNDEFINED_OR_VARIABLE_COMPOSITION','NATURAL_COMPLEX','UNKNOWN')),
  resolution_status TEXT NOT NULL DEFAULT 'UNRESOLVED'
    CHECK (resolution_status IN ('UNRESOLVED','RESOLVED','CONFLICTED','NOT_APPLICABLE')),
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  molecular_identity_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_global_chemical_entity_release_id_unique UNIQUE (release_id, id),
  CONSTRAINT v2_global_chemical_entity_identity_release_fk
    FOREIGN KEY (release_id, molecular_identity_id)
    REFERENCES public.v2_global_molecular_identities(release_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_global_chemical_entity_verified_identity CHECK (
    (
      entity_type = 'SINGLE_SUBSTANCE'
      AND resolution_status = 'RESOLVED'
      AND evidence_status = 'VERIFIED'
      AND molecular_identity_id IS NOT NULL
    )
    OR NOT (resolution_status = 'RESOLVED' AND evidence_status = 'VERIFIED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS v2_global_chemical_entity_verified_identity_unique
  ON public.v2_global_chemical_entities(release_id, molecular_identity_id)
  WHERE entity_type = 'SINGLE_SUBSTANCE'
    AND resolution_status = 'RESOLVED'
    AND evidence_status = 'VERIFIED';
CREATE INDEX IF NOT EXISTS v2_global_chemical_entity_name_idx
  ON public.v2_global_chemical_entities(release_id, normalized_name);

CREATE TABLE IF NOT EXISTS public.v2_global_chemical_identifiers (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES public.v2_global_material_intelligence_releases(id) ON DELETE RESTRICT,
  chemical_entity_id TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('CAS','INCHIKEY','INCHI','CANONICAL_SMILES','ISOMERIC_SMILES','FEMA','EINECS','PUBCHEM_CID','EC','OTHER')),
  identifier_value TEXT NOT NULL CHECK (length(trim(identifier_value)) BETWEEN 1 AND 4096),
  normalized_value TEXT NOT NULL CHECK (length(trim(normalized_value)) BETWEEN 1 AND 4096),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('AUTHORITATIVE_PUBLIC_DATABASE','SUPPLIER_WORKBOOK','SUPPLIER_DOCUMENT','CURATOR_ASSERTION')),
  source_ref TEXT NOT NULL CHECK (length(trim(source_ref)) BETWEEN 1 AND 2048),
  source_version TEXT NOT NULL CHECK (length(trim(source_version)) BETWEEN 1 AND 256),
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_global_chemical_identifier_entity_release_fk
    FOREIGN KEY (release_id, chemical_entity_id)
    REFERENCES public.v2_global_chemical_entities(release_id, id) ON DELETE CASCADE,
  UNIQUE (release_id, chemical_entity_id, identifier_type, normalized_value, source_version)
);

CREATE INDEX IF NOT EXISTS v2_global_chemical_identifier_lookup_idx
  ON public.v2_global_chemical_identifiers(release_id, identifier_type, normalized_value);

CREATE TABLE IF NOT EXISTS public.v2_global_identity_evidence (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES public.v2_global_material_intelligence_releases(id) ON DELETE RESTRICT,
  chemical_entity_id TEXT NOT NULL,
  molecular_identity_id TEXT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('AUTHORITATIVE_PUBLIC_DATABASE','SUPPLIER_DOCUMENT','SOURCE_WORKBOOK','CURATOR_ASSERTION')),
  source_ref TEXT NOT NULL CHECK (length(trim(source_ref)) BETWEEN 1 AND 2048),
  source_version TEXT NOT NULL CHECK (length(trim(source_version)) BETWEEN 1 AND 256),
  source_document_ref TEXT CHECK (source_document_ref IS NULL OR length(trim(source_document_ref)) BETWEEN 1 AND 2048),
  retrieved_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  assertions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(assertions) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_global_identity_evidence_entity_release_fk
    FOREIGN KEY (release_id, chemical_entity_id)
    REFERENCES public.v2_global_chemical_entities(release_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_global_identity_evidence_molecular_release_fk
    FOREIGN KEY (release_id, molecular_identity_id)
    REFERENCES public.v2_global_molecular_identities(release_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_global_identity_evidence_supplier_document CHECK (
    source_kind <> 'SUPPLIER_DOCUMENT' OR source_document_ref IS NOT NULL
  ),
  UNIQUE (release_id, chemical_entity_id, source_kind, source_ref, source_version, content_hash)
);

CREATE INDEX IF NOT EXISTS v2_global_identity_evidence_verified_idx
  ON public.v2_global_identity_evidence(release_id, chemical_entity_id, source_kind)
  WHERE evidence_status = 'VERIFIED';

CREATE TABLE IF NOT EXISTS public.v2_global_canonical_materials (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES public.v2_global_material_intelligence_releases(id) ON DELETE RESTRICT,
  chemical_entity_id TEXT NOT NULL,
  canonical_name TEXT NOT NULL CHECK (length(trim(canonical_name)) BETWEEN 1 AND 500),
  normalized_name TEXT NOT NULL CHECK (length(trim(normalized_name)) BETWEEN 1 AND 500),
  product_classification TEXT NOT NULL DEFAULT 'NEAT_SUBSTANCE' CHECK (product_classification = 'NEAT_SUBSTANCE'),
  lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_status IN ('DRAFT','ACTIVE','SUPERSEDED','ARCHIVED')),
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  sensory_summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sensory_summary) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_global_canonical_material_release_id_unique UNIQUE (release_id, id),
  CONSTRAINT v2_global_canonical_material_entity_release_fk
    FOREIGN KEY (release_id, chemical_entity_id)
    REFERENCES public.v2_global_chemical_entities(release_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_global_canonical_material_active_verified CHECK (
    lifecycle_status <> 'ACTIVE' OR evidence_status = 'VERIFIED'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS v2_global_canonical_material_active_entity_unique
  ON public.v2_global_canonical_materials(release_id, chemical_entity_id)
  WHERE lifecycle_status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS v2_global_canonical_material_name_idx
  ON public.v2_global_canonical_materials(release_id, normalized_name, lifecycle_status);

CREATE TABLE IF NOT EXISTS public.v2_global_material_source_observations (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES public.v2_global_material_intelligence_releases(id) ON DELETE RESTRICT,
  source_row_number BIGINT NOT NULL CHECK (source_row_number > 0),
  source_record_key TEXT NOT NULL CHECK (length(trim(source_record_key)) BETWEEN 1 AND 512),
  source_name TEXT NOT NULL CHECK (length(trim(source_name)) BETWEEN 1 AND 500),
  normalized_source_name TEXT NOT NULL CHECK (length(trim(normalized_source_name)) BETWEEN 1 AND 500),
  disposition TEXT NOT NULL CHECK (disposition IN (
    'GLOBAL_CANONICAL_NEAT',
    'DILUTION_MERGED_TO_NEAT',
    'EXCLUDED_NATURAL',
    'DEFERRED_MIXTURE',
    'DEFERRED_BASE',
    'REVIEW_REQUIRED'
  )),
  canonical_material_id TEXT,
  disposition_reason TEXT NOT NULL CHECK (length(trim(disposition_reason)) BETWEEN 1 AND 1000),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  observed_data JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(observed_data) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_global_material_source_observation_material_release_fk
    FOREIGN KEY (release_id, canonical_material_id)
    REFERENCES public.v2_global_canonical_materials(release_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_global_material_source_observation_exact_disposition CHECK (
    (
      disposition IN ('GLOBAL_CANONICAL_NEAT','DILUTION_MERGED_TO_NEAT')
      AND canonical_material_id IS NOT NULL
    )
    OR
    (
      disposition IN ('EXCLUDED_NATURAL','DEFERRED_MIXTURE','DEFERRED_BASE','REVIEW_REQUIRED')
      AND canonical_material_id IS NULL
    )
  ),
  CONSTRAINT v2_global_material_source_observation_release_id_unique UNIQUE (release_id, id),
  UNIQUE (release_id, source_row_number),
  UNIQUE (release_id, source_record_key)
);

CREATE INDEX IF NOT EXISTS v2_global_material_source_canonical_idx
  ON public.v2_global_material_source_observations(release_id, canonical_material_id)
  WHERE disposition = 'GLOBAL_CANONICAL_NEAT';
CREATE INDEX IF NOT EXISTS v2_global_material_source_disposition_idx
  ON public.v2_global_material_source_observations(release_id, disposition, source_row_number);

CREATE TABLE IF NOT EXISTS public.v2_global_physical_property_assertions (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES public.v2_global_material_intelligence_releases(id) ON DELETE RESTRICT,
  chemical_entity_id TEXT,
  canonical_material_id TEXT,
  property_key TEXT NOT NULL CHECK (length(trim(property_key)) BETWEEN 1 AND 160),
  value_kind TEXT NOT NULL CHECK (value_kind IN ('EXACT_NUMERIC','RANGE_NUMERIC','TEXT')),
  numeric_value NUMERIC(24,10),
  numeric_min NUMERIC(24,10),
  numeric_max NUMERIC(24,10),
  text_value TEXT,
  unit TEXT,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(conditions) = 'object'),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('AUTHORITATIVE_PUBLIC_DATABASE','SUPPLIER_WORKBOOK','SUPPLIER_DOCUMENT','CURATOR_ASSERTION')),
  source_ref TEXT NOT NULL CHECK (length(trim(source_ref)) BETWEEN 1 AND 2048),
  source_version TEXT NOT NULL CHECK (length(trim(source_version)) BETWEEN 1 AND 256),
  source_observation_id TEXT,
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  retrieved_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_global_physical_property_subject CHECK (num_nonnulls(chemical_entity_id, canonical_material_id) = 1),
  CONSTRAINT v2_global_physical_property_value CHECK (
    (
      value_kind = 'EXACT_NUMERIC'
      AND numeric_value IS NOT NULL
      AND numeric_min IS NULL
      AND numeric_max IS NULL
      AND text_value IS NULL
    )
    OR
    (
      value_kind = 'RANGE_NUMERIC'
      AND numeric_value IS NULL
      AND numeric_min IS NOT NULL
      AND numeric_max IS NOT NULL
      AND numeric_max >= numeric_min
      AND text_value IS NULL
    )
    OR
    (
      value_kind = 'TEXT'
      AND numeric_value IS NULL
      AND numeric_min IS NULL
      AND numeric_max IS NULL
      AND text_value IS NOT NULL
      AND length(trim(text_value)) > 0
    )
  ),
  CONSTRAINT v2_global_physical_property_entity_release_fk
    FOREIGN KEY (release_id, chemical_entity_id)
    REFERENCES public.v2_global_chemical_entities(release_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_global_physical_property_material_release_fk
    FOREIGN KEY (release_id, canonical_material_id)
    REFERENCES public.v2_global_canonical_materials(release_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_global_physical_property_observation_release_fk
    FOREIGN KEY (release_id, source_observation_id)
    REFERENCES public.v2_global_material_source_observations(release_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS v2_global_physical_property_entity_idx
  ON public.v2_global_physical_property_assertions(release_id, chemical_entity_id, property_key);
CREATE INDEX IF NOT EXISTS v2_global_physical_property_material_idx
  ON public.v2_global_physical_property_assertions(release_id, canonical_material_id, property_key);

CREATE TABLE IF NOT EXISTS public.v2_osmo_taxonomy_releases (
  id TEXT PRIMARY KEY,
  upstream_repository TEXT NOT NULL CHECK (length(trim(upstream_repository)) BETWEEN 1 AND 2048),
  upstream_commit TEXT NOT NULL UNIQUE CHECK (upstream_commit ~ '^[a-f0-9]{40}$'),
  license_spdx TEXT NOT NULL CHECK (length(trim(license_spdx)) BETWEEN 1 AND 80),
  license_url TEXT NOT NULL CHECK (length(trim(license_url)) BETWEEN 1 AND 2048),
  source_url TEXT NOT NULL CHECK (length(trim(source_url)) BETWEEN 1 AND 2048),
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  node_count BIGINT NOT NULL CHECK (node_count > 0),
  assignment_count BIGINT NOT NULL CHECK (assignment_count >= 0),
  status TEXT NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED','ACTIVE','SUPERSEDED','REJECTED')),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_osmo_taxonomy_release_activation_shape CHECK (
    (status = 'ACTIVE' AND activated_at IS NOT NULL) OR status <> 'ACTIVE'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS v2_osmo_taxonomy_single_active_release
  ON public.v2_osmo_taxonomy_releases ((status))
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.v2_osmo_taxonomy_nodes (
  id TEXT PRIMARY KEY,
  taxonomy_release_id TEXT NOT NULL REFERENCES public.v2_osmo_taxonomy_releases(id) ON DELETE RESTRICT,
  upstream_node_key TEXT NOT NULL CHECK (length(trim(upstream_node_key)) BETWEEN 1 AND 256),
  node_kind TEXT NOT NULL CHECK (node_kind IN ('GRAND_FAMILY','SUBFAMILY','DESCRIPTOR','TEXTURE','SENSATION')),
  parent_node_id TEXT,
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 256),
  normalized_label TEXT NOT NULL CHECK (length(trim(normalized_label)) BETWEEN 1 AND 256),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_osmo_taxonomy_node_release_id_unique UNIQUE (taxonomy_release_id, id),
  CONSTRAINT v2_osmo_taxonomy_node_upstream_unique UNIQUE (taxonomy_release_id, upstream_node_key),
  CONSTRAINT v2_osmo_taxonomy_node_parent_release_fk
    FOREIGN KEY (taxonomy_release_id, parent_node_id)
    REFERENCES public.v2_osmo_taxonomy_nodes(taxonomy_release_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT v2_osmo_taxonomy_node_not_self_parent CHECK (parent_node_id IS NULL OR parent_node_id <> id),
  CONSTRAINT v2_osmo_taxonomy_node_hierarchy_shape CHECK (
    (node_kind = 'SUBFAMILY' AND parent_node_id IS NOT NULL)
    OR (node_kind IN ('GRAND_FAMILY','DESCRIPTOR','TEXTURE','SENSATION') AND parent_node_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS v2_osmo_taxonomy_node_label_idx
  ON public.v2_osmo_taxonomy_nodes(taxonomy_release_id, normalized_label);

CREATE TABLE IF NOT EXISTS public.v2_osmo_taxonomy_assignments (
  id TEXT PRIMARY KEY,
  taxonomy_release_id TEXT NOT NULL REFERENCES public.v2_osmo_taxonomy_releases(id) ON DELETE RESTRICT,
  taxonomy_node_id TEXT NOT NULL,
  material_intelligence_release_id TEXT NOT NULL REFERENCES public.v2_global_material_intelligence_releases(id) ON DELETE RESTRICT,
  chemical_entity_id TEXT,
  canonical_material_id TEXT,
  assignment_kind TEXT NOT NULL CHECK (assignment_kind IN ('SOURCE_VERIFIED','NORMALIZED','MODEL_PREDICTED','SENSORY_PANEL')),
  confidence NUMERIC(7,6) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (evidence_status IN ('UNVERIFIED','VERIFIED','CONFLICTED','REJECTED')),
  source_ref TEXT NOT NULL CHECK (length(trim(source_ref)) BETWEEN 1 AND 2048),
  source_version TEXT NOT NULL CHECK (length(trim(source_version)) BETWEEN 1 AND 256),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_osmo_taxonomy_assignment_subject CHECK (num_nonnulls(chemical_entity_id, canonical_material_id) = 1),
  CONSTRAINT v2_osmo_taxonomy_assignment_evidence_shape CHECK (
    (assignment_kind <> 'SOURCE_VERIFIED' OR evidence_status = 'VERIFIED')
    AND (assignment_kind <> 'MODEL_PREDICTED' OR (evidence_status <> 'VERIFIED' AND confidence IS NOT NULL))
  ),
  CONSTRAINT v2_osmo_taxonomy_assignment_node_release_fk
    FOREIGN KEY (taxonomy_release_id, taxonomy_node_id)
    REFERENCES public.v2_osmo_taxonomy_nodes(taxonomy_release_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_osmo_taxonomy_assignment_entity_release_fk
    FOREIGN KEY (material_intelligence_release_id, chemical_entity_id)
    REFERENCES public.v2_global_chemical_entities(release_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_osmo_taxonomy_assignment_material_release_fk
    FOREIGN KEY (material_intelligence_release_id, canonical_material_id)
    REFERENCES public.v2_global_canonical_materials(release_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS v2_osmo_taxonomy_assignment_entity_unique
  ON public.v2_osmo_taxonomy_assignments(taxonomy_release_id, taxonomy_node_id, material_intelligence_release_id, chemical_entity_id)
  WHERE chemical_entity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS v2_osmo_taxonomy_assignment_material_unique
  ON public.v2_osmo_taxonomy_assignments(taxonomy_release_id, taxonomy_node_id, material_intelligence_release_id, canonical_material_id)
  WHERE canonical_material_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.v2_tenant_material_preparations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL,
  global_material_release_id TEXT NOT NULL,
  global_material_id TEXT NOT NULL,
  preparation_kind TEXT NOT NULL CHECK (preparation_kind IN ('NEAT_REFERENCE','DILUTION','WORKING_STOCK')),
  concentration_kind TEXT NOT NULL CHECK (concentration_kind IN ('NOT_APPLICABLE','EXACT','RANGE')),
  concentration_min NUMERIC(18,8),
  concentration_max NUMERIC(18,8),
  concentration_unit TEXT NOT NULL CHECK (concentration_unit IN ('PERCENT','FRACTION','PPM','NOT_APPLICABLE')),
  concentration_basis TEXT NOT NULL CHECK (concentration_basis IN ('MASS','VOLUME','MASS_PER_VOLUME','NOT_APPLICABLE')),
  carrier_material_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES public.v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_tenant_material_preparation_material_fk
    FOREIGN KEY (organization_id, material_id)
    REFERENCES public.v2_materials(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT v2_tenant_material_preparation_global_material_fk
    FOREIGN KEY (global_material_release_id, global_material_id)
    REFERENCES public.v2_global_canonical_materials(release_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_tenant_material_preparation_carrier_fk
    FOREIGN KEY (organization_id, carrier_material_id)
    REFERENCES public.v2_materials(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT v2_tenant_material_preparation_not_self_carrier CHECK (
    carrier_material_id IS NULL OR carrier_material_id <> material_id
  ),
  CONSTRAINT v2_tenant_material_preparation_concentration CHECK (
    (
      preparation_kind = 'NEAT_REFERENCE'
      AND concentration_kind = 'NOT_APPLICABLE'
      AND concentration_min IS NULL
      AND concentration_max IS NULL
      AND concentration_unit = 'NOT_APPLICABLE'
      AND concentration_basis = 'NOT_APPLICABLE'
      AND carrier_material_id IS NULL
    )
    OR
    (
      preparation_kind IN ('DILUTION','WORKING_STOCK')
      AND concentration_kind IN ('EXACT','RANGE')
      AND concentration_min IS NOT NULL
      AND concentration_min > 0
      AND concentration_max IS NOT NULL
      AND concentration_max >= concentration_min
      AND concentration_unit <> 'NOT_APPLICABLE'
      AND concentration_basis <> 'NOT_APPLICABLE'
      AND (concentration_kind = 'RANGE' OR concentration_max = concentration_min)
      AND (
        concentration_unit = 'PPM'
        OR (concentration_unit = 'PERCENT' AND concentration_max <= 100)
        OR (concentration_unit = 'FRACTION' AND concentration_max <= 1)
      )
    )
  ),
  UNIQUE (organization_id, material_id)
);

CREATE INDEX IF NOT EXISTS v2_tenant_material_preparation_global_idx
  ON public.v2_tenant_material_preparations(global_material_release_id, global_material_id, status);

CREATE OR REPLACE FUNCTION public.v2_validate_global_canonical_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.lifecycle_status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1
    FROM public.v2_global_chemical_entities entity
    JOIN public.v2_global_molecular_identities identity
      ON identity.release_id = entity.release_id
     AND identity.id = entity.molecular_identity_id
    WHERE entity.release_id = NEW.release_id
      AND entity.id = NEW.chemical_entity_id
      AND entity.entity_type = 'SINGLE_SUBSTANCE'
      AND entity.resolution_status = 'RESOLVED'
      AND entity.evidence_status = 'VERIFIED'
      AND identity.resolution_status = 'RESOLVED'
      AND identity.evidence_status = 'VERIFIED'
  ) THEN
    RAISE EXCEPTION 'V2_GLOBAL_CANONICAL_MATERIAL_REQUIRES_VERIFIED_SINGLE_SUBSTANCE';
  END IF;

  IF NEW.lifecycle_status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1
    FROM public.v2_global_chemical_entities entity
    JOIN public.v2_global_identity_evidence evidence
      ON evidence.release_id = entity.release_id
     AND evidence.chemical_entity_id = entity.id
    WHERE entity.release_id = NEW.release_id
      AND entity.id = NEW.chemical_entity_id
      AND (evidence.molecular_identity_id IS NULL OR evidence.molecular_identity_id = entity.molecular_identity_id)
      AND evidence.source_kind IN ('AUTHORITATIVE_PUBLIC_DATABASE','SUPPLIER_DOCUMENT')
      AND evidence.evidence_status = 'VERIFIED'
  ) THEN
    RAISE EXCEPTION 'V2_GLOBAL_CANONICAL_MATERIAL_REQUIRES_AUTHORITATIVE_IDENTITY_EVIDENCE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v2_global_canonical_material_verified_guard ON public.v2_global_canonical_materials;
CREATE TRIGGER v2_global_canonical_material_verified_guard
  BEFORE INSERT OR UPDATE ON public.v2_global_canonical_materials
  FOR EACH ROW EXECUTE FUNCTION public.v2_validate_global_canonical_material();

CREATE OR REPLACE FUNCTION public.v2_validate_osmo_taxonomy_node_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.node_kind = 'SUBFAMILY' AND NOT EXISTS (
    SELECT 1
    FROM public.v2_osmo_taxonomy_nodes parent
    WHERE parent.taxonomy_release_id = NEW.taxonomy_release_id
      AND parent.id = NEW.parent_node_id
      AND parent.node_kind = 'GRAND_FAMILY'
  ) THEN
    RAISE EXCEPTION 'V2_OSMO_TAXONOMY_SUBFAMILY_REQUIRES_GRAND_FAMILY_PARENT';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v2_osmo_taxonomy_node_hierarchy_guard ON public.v2_osmo_taxonomy_nodes;
CREATE TRIGGER v2_osmo_taxonomy_node_hierarchy_guard
  BEFORE INSERT OR UPDATE ON public.v2_osmo_taxonomy_nodes
  FOR EACH ROW EXECUTE FUNCTION public.v2_validate_osmo_taxonomy_node_hierarchy();

CREATE OR REPLACE FUNCTION public.v2_validate_global_material_intelligence_release_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  observed_count BIGINT;
  canonical_count BIGINT;
  merged_count BIGINT;
  natural_count BIGINT;
  mixture_count BIGINT;
  base_count BIGINT;
  insufficient_count BIGINT;
  active_material_count BIGINT;
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    SELECT
      count(*),
      count(*) FILTER (WHERE disposition = 'GLOBAL_CANONICAL_NEAT'),
      count(*) FILTER (WHERE disposition = 'DILUTION_MERGED_TO_NEAT'),
      count(*) FILTER (WHERE disposition = 'EXCLUDED_NATURAL'),
      count(*) FILTER (WHERE disposition = 'DEFERRED_MIXTURE'),
      count(*) FILTER (WHERE disposition = 'DEFERRED_BASE'),
      count(*) FILTER (WHERE disposition = 'REVIEW_REQUIRED')
    INTO
      observed_count,
      canonical_count,
      merged_count,
      natural_count,
      mixture_count,
      base_count,
      insufficient_count
    FROM public.v2_global_material_source_observations
    WHERE release_id = NEW.id;

    SELECT count(*)
    INTO active_material_count
    FROM public.v2_global_canonical_materials
    WHERE release_id = NEW.id
      AND lifecycle_status = 'ACTIVE';

    IF observed_count <> NEW.source_row_count
      OR observed_count <> NEW.accounted_row_count
      OR canonical_count <> NEW.global_canonical_neat_row_count
      OR active_material_count <> NEW.global_canonical_neat_count
      OR merged_count <> NEW.dilution_merged_to_neat_count
      OR natural_count <> NEW.excluded_natural_count
      OR mixture_count <> NEW.deferred_mixture_count
      OR base_count <> NEW.deferred_base_count
      OR insufficient_count <> NEW.review_required_count
    THEN
      RAISE EXCEPTION 'V2_GLOBAL_MATERIAL_INTELLIGENCE_RELEASE_ACCOUNTING_MISMATCH';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.v2_global_canonical_materials material
      WHERE material.release_id = NEW.id
        AND material.lifecycle_status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1
          FROM public.v2_global_material_source_observations observation
          WHERE observation.release_id = material.release_id
            AND observation.canonical_material_id = material.id
            AND observation.disposition IN ('GLOBAL_CANONICAL_NEAT','DILUTION_MERGED_TO_NEAT')
        )
    ) THEN
      RAISE EXCEPTION 'V2_GLOBAL_MATERIAL_INTELLIGENCE_CANONICAL_SOURCE_MISSING';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.v2_global_material_source_observations observation
      JOIN public.v2_global_canonical_materials material
        ON material.release_id = observation.release_id
       AND material.id = observation.canonical_material_id
      WHERE observation.release_id = NEW.id
        AND observation.disposition IN ('GLOBAL_CANONICAL_NEAT','DILUTION_MERGED_TO_NEAT')
        AND material.lifecycle_status <> 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'V2_GLOBAL_MATERIAL_INTELLIGENCE_SOURCE_TARGET_NOT_ACTIVE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v2_global_material_intelligence_release_activation_guard
  ON public.v2_global_material_intelligence_releases;
CREATE TRIGGER v2_global_material_intelligence_release_activation_guard
  BEFORE INSERT OR UPDATE ON public.v2_global_material_intelligence_releases
  FOR EACH ROW EXECUTE FUNCTION public.v2_validate_global_material_intelligence_release_activation();

CREATE OR REPLACE FUNCTION public.v2_validate_osmo_taxonomy_release_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  actual_node_count BIGINT;
  actual_assignment_count BIGINT;
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    SELECT count(*)
    INTO actual_node_count
    FROM public.v2_osmo_taxonomy_nodes
    WHERE taxonomy_release_id = NEW.id;

    SELECT count(*)
    INTO actual_assignment_count
    FROM public.v2_osmo_taxonomy_assignments
    WHERE taxonomy_release_id = NEW.id;

    IF actual_node_count <> NEW.node_count
      OR actual_assignment_count <> NEW.assignment_count
    THEN
      RAISE EXCEPTION 'V2_OSMO_TAXONOMY_RELEASE_COUNT_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v2_osmo_taxonomy_release_activation_guard
  ON public.v2_osmo_taxonomy_releases;
CREATE TRIGGER v2_osmo_taxonomy_release_activation_guard
  BEFORE INSERT OR UPDATE ON public.v2_osmo_taxonomy_releases
  FOR EACH ROW EXECUTE FUNCTION public.v2_validate_osmo_taxonomy_release_activation();

CREATE OR REPLACE FUNCTION public.v2_reject_activated_global_mi_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  release_column TEXT := TG_ARGV[0];
  old_release_id TEXT;
  new_release_id TEXT;
BEGIN
  old_release_id := to_jsonb(OLD) ->> release_column;
  new_release_id := to_jsonb(NEW) ->> release_column;

  IF (old_release_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.v2_global_material_intelligence_releases release
    WHERE release.id = old_release_id AND release.status IN ('ACTIVE','SUPERSEDED')
  )) OR (new_release_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.v2_global_material_intelligence_releases release
    WHERE release.id = new_release_id AND release.status IN ('ACTIVE','SUPERSEDED')
  )) THEN
    RAISE EXCEPTION 'V2_GLOBAL_MATERIAL_INTELLIGENCE_ACTIVATED_RELEASE_IMMUTABLE';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.v2_reject_activated_osmo_taxonomy_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  release_column TEXT := TG_ARGV[0];
  old_release_id TEXT;
  new_release_id TEXT;
BEGIN
  old_release_id := to_jsonb(OLD) ->> release_column;
  new_release_id := to_jsonb(NEW) ->> release_column;

  IF (old_release_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.v2_osmo_taxonomy_releases release
    WHERE release.id = old_release_id AND release.status IN ('ACTIVE','SUPERSEDED')
  )) OR (new_release_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.v2_osmo_taxonomy_releases release
    WHERE release.id = new_release_id AND release.status IN ('ACTIVE','SUPERSEDED')
  )) THEN
    RAISE EXCEPTION 'V2_OSMO_TAXONOMY_ACTIVATED_RELEASE_IMMUTABLE';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.v2_guard_global_mi_release_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('ACTIVE','SUPERSEDED') THEN
    RAISE EXCEPTION 'V2_GLOBAL_MATERIAL_INTELLIGENCE_ACTIVATED_RELEASE_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'V2_GLOBAL_MATERIAL_INTELLIGENCE_SUPERSEDED_RELEASE_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' AND (
    NEW.status <> 'SUPERSEDED'
    OR (to_jsonb(NEW) - 'status') <> (to_jsonb(OLD) - 'status')
  ) THEN
    RAISE EXCEPTION 'V2_GLOBAL_MATERIAL_INTELLIGENCE_ACTIVE_RELEASE_ONLY_SUPERSEDABLE';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.v2_guard_osmo_taxonomy_release_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('ACTIVE','SUPERSEDED') THEN
    RAISE EXCEPTION 'V2_OSMO_TAXONOMY_ACTIVATED_RELEASE_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'V2_OSMO_TAXONOMY_SUPERSEDED_RELEASE_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' AND (
    NEW.status <> 'SUPERSEDED'
    OR (to_jsonb(NEW) - 'status') <> (to_jsonb(OLD) - 'status')
  ) THEN
    RAISE EXCEPTION 'V2_OSMO_TAXONOMY_ACTIVE_RELEASE_ONLY_SUPERSEDABLE';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'v2_global_molecular_identities',
    'v2_global_chemical_entities',
    'v2_global_chemical_identifiers',
    'v2_global_identity_evidence',
    'v2_global_canonical_materials',
    'v2_global_material_source_observations',
    'v2_global_physical_property_assertions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS v2_global_mi_activated_release_immutable ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER v2_global_mi_activated_release_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.v2_reject_activated_global_mi_record_mutation(%L)',
      table_name,
      'release_id'
    );
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['v2_osmo_taxonomy_nodes','v2_osmo_taxonomy_assignments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS v2_osmo_taxonomy_activated_release_immutable ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER v2_osmo_taxonomy_activated_release_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.v2_reject_activated_osmo_taxonomy_record_mutation(%L)',
      table_name,
      'taxonomy_release_id'
    );
  END LOOP;

  DROP TRIGGER IF EXISTS v2_osmo_assignment_global_mi_release_immutable ON public.v2_osmo_taxonomy_assignments;
  CREATE TRIGGER v2_osmo_assignment_global_mi_release_immutable
    BEFORE INSERT OR UPDATE OR DELETE ON public.v2_osmo_taxonomy_assignments
    FOR EACH ROW EXECUTE FUNCTION public.v2_reject_activated_global_mi_record_mutation('material_intelligence_release_id');
END $$;

DROP TRIGGER IF EXISTS v2_global_mi_release_immutable_guard ON public.v2_global_material_intelligence_releases;
CREATE TRIGGER v2_global_mi_release_immutable_guard
  BEFORE UPDATE OR DELETE ON public.v2_global_material_intelligence_releases
  FOR EACH ROW EXECUTE FUNCTION public.v2_guard_global_mi_release_mutation();

DROP TRIGGER IF EXISTS v2_osmo_taxonomy_release_immutable_guard ON public.v2_osmo_taxonomy_releases;
CREATE TRIGGER v2_osmo_taxonomy_release_immutable_guard
  BEFORE UPDATE OR DELETE ON public.v2_osmo_taxonomy_releases
  FOR EACH ROW EXECUTE FUNCTION public.v2_guard_osmo_taxonomy_release_mutation();

CREATE OR REPLACE FUNCTION public.v2_validate_tenant_material_preparation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_global_canonical_materials material
    JOIN public.v2_global_material_intelligence_releases release
      ON release.id = material.release_id
    WHERE material.release_id = NEW.global_material_release_id
      AND material.id = NEW.global_material_id
      AND material.lifecycle_status = 'ACTIVE'
      AND material.evidence_status = 'VERIFIED'
      AND release.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'V2_TENANT_MATERIAL_PREPARATION_REQUIRES_ACTIVE_GLOBAL_MATERIAL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v2_tenant_material_preparation_global_guard ON public.v2_tenant_material_preparations;
CREATE TRIGGER v2_tenant_material_preparation_global_guard
  BEFORE INSERT OR UPDATE ON public.v2_tenant_material_preparations
  FOR EACH ROW EXECUTE FUNCTION public.v2_validate_tenant_material_preparation();

DO $$
DECLARE
  table_name TEXT;
  table_owner TEXT;
  read_expression TEXT;
  curate_expression TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'v2_global_material_intelligence_releases',
    'v2_global_molecular_identities',
    'v2_global_chemical_entities',
    'v2_global_chemical_identifiers',
    'v2_global_identity_evidence',
    'v2_global_canonical_materials',
    'v2_global_material_source_observations',
    'v2_global_physical_property_assertions',
    'v2_osmo_taxonomy_releases',
    'v2_osmo_taxonomy_nodes',
    'v2_osmo_taxonomy_assignments'
  ] LOOP
    SELECT pg_get_userbyid(c.relowner)
    INTO table_owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = table_name AND c.relkind IN ('r', 'p');

    IF table_owner IS NULL THEN
      RAISE EXCEPTION 'global material intelligence table owner could not be resolved: %', table_name;
    END IF;

    read_expression := format(
      'pg_has_role(current_user, %L, ''MEMBER'') OR pg_has_role(current_user, %L, ''MEMBER'') OR pg_has_role(current_user, %L, ''MEMBER'')',
      'v2_global_material_intelligence_reader',
      'v2_global_material_intelligence_curator',
      table_owner
    );
    curate_expression := format(
      'pg_has_role(current_user, %L, ''MEMBER'') OR pg_has_role(current_user, %L, ''MEMBER'')',
      'v2_global_material_intelligence_curator',
      table_owner
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS v2_global_material_intelligence_read ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS v2_global_material_intelligence_curator_insert ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS v2_global_material_intelligence_curator_update ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS v2_global_material_intelligence_curator_delete ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY v2_global_material_intelligence_read ON public.%I FOR SELECT TO PUBLIC USING (%s)',
      table_name,
      read_expression
    );
    EXECUTE format(
      'CREATE POLICY v2_global_material_intelligence_curator_insert ON public.%I FOR INSERT TO PUBLIC WITH CHECK (%s)',
      table_name,
      curate_expression
    );
    EXECUTE format(
      'CREATE POLICY v2_global_material_intelligence_curator_update ON public.%I FOR UPDATE TO PUBLIC USING (%s) WITH CHECK (%s)',
      table_name,
      curate_expression,
      curate_expression
    );
    EXECUTE format(
      'CREATE POLICY v2_global_material_intelligence_curator_delete ON public.%I FOR DELETE TO PUBLIC USING (%s)',
      table_name,
      curate_expression
    );
  END LOOP;
END $$;

ALTER TABLE public.v2_tenant_material_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_tenant_material_preparations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v2_tenant_scope ON public.v2_tenant_material_preparations;
CREATE POLICY v2_tenant_scope ON public.v2_tenant_material_preparations
  FOR ALL TO PUBLIC
  USING (organization_id::text = current_setting('app.organization_id', true))
  WITH CHECK (organization_id::text = current_setting('app.organization_id', true));

REVOKE ALL PRIVILEGES ON TABLE
  public.v2_global_material_intelligence_releases,
  public.v2_global_molecular_identities,
  public.v2_global_chemical_entities,
  public.v2_global_chemical_identifiers,
  public.v2_global_identity_evidence,
  public.v2_global_canonical_materials,
  public.v2_global_material_source_observations,
  public.v2_global_physical_property_assertions,
  public.v2_osmo_taxonomy_releases,
  public.v2_osmo_taxonomy_nodes,
  public.v2_osmo_taxonomy_assignments,
  public.v2_tenant_material_preparations
FROM PUBLIC;

GRANT SELECT ON TABLE
  public.v2_global_material_intelligence_releases,
  public.v2_global_molecular_identities,
  public.v2_global_chemical_entities,
  public.v2_global_chemical_identifiers,
  public.v2_global_identity_evidence,
  public.v2_global_canonical_materials,
  public.v2_global_material_source_observations,
  public.v2_global_physical_property_assertions,
  public.v2_osmo_taxonomy_releases,
  public.v2_osmo_taxonomy_nodes,
  public.v2_osmo_taxonomy_assignments
TO v2_global_material_intelligence_reader;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.v2_global_material_intelligence_releases,
  public.v2_global_molecular_identities,
  public.v2_global_chemical_entities,
  public.v2_global_chemical_identifiers,
  public.v2_global_identity_evidence,
  public.v2_global_canonical_materials,
  public.v2_global_material_source_observations,
  public.v2_global_physical_property_assertions,
  public.v2_osmo_taxonomy_releases,
  public.v2_osmo_taxonomy_nodes,
  public.v2_osmo_taxonomy_assignments
TO v2_global_material_intelligence_curator;

DO $$
DECLARE
  role_name TEXT;
  global_tables TEXT :=
    'public.v2_global_material_intelligence_releases, '
    'public.v2_global_molecular_identities, '
    'public.v2_global_chemical_entities, '
    'public.v2_global_chemical_identifiers, '
    'public.v2_global_identity_evidence, '
    'public.v2_global_canonical_materials, '
    'public.v2_global_material_source_observations, '
    'public.v2_global_physical_property_assertions, '
    'public.v2_osmo_taxonomy_releases, '
    'public.v2_osmo_taxonomy_nodes, '
    'public.v2_osmo_taxonomy_assignments';
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s, public.v2_tenant_material_preparations FROM %I', global_tables, role_name);
      EXECUTE format('REVOKE v2_global_material_intelligence_reader FROM %I', role_name);
      EXECUTE format('REVOKE v2_global_material_intelligence_curator FROM %I', role_name);
    END IF;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['v2_app', 'hyperdrive_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %I', global_tables, role_name);
      EXECUTE format('GRANT SELECT ON TABLE %s TO %I', global_tables, role_name);
      EXECUTE format('GRANT v2_global_material_intelligence_reader TO %I', role_name);
      EXECUTE format('REVOKE v2_global_material_intelligence_curator FROM %I', role_name);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_tenant_material_preparations TO v2_app';
  END IF;
END $$;

REVOKE ALL ON FUNCTION
  public.v2_validate_global_canonical_material(),
  public.v2_validate_osmo_taxonomy_node_hierarchy(),
  public.v2_validate_global_material_intelligence_release_activation(),
  public.v2_validate_osmo_taxonomy_release_activation(),
  public.v2_reject_activated_global_mi_record_mutation(),
  public.v2_reject_activated_osmo_taxonomy_record_mutation(),
  public.v2_guard_global_mi_release_mutation(),
  public.v2_guard_osmo_taxonomy_release_mutation(),
  public.v2_validate_tenant_material_preparation()
FROM PUBLIC;

COMMENT ON ROLE v2_global_material_intelligence_reader IS
  'NOLOGIN policy-membership role for read-only global Material Intelligence access.';
COMMENT ON ROLE v2_global_material_intelligence_curator IS
  'NOLOGIN policy-membership role for governed global Material Intelligence imports and curation.';
COMMENT ON TABLE public.v2_global_material_intelligence_releases IS
  'Versioned global Material Intelligence imports with complete source-row disposition accounting.';
COMMENT ON TABLE public.v2_global_canonical_materials IS
  'Global verified neat-material catalog. Tenant operational materials remain in v2_materials.';
COMMENT ON TABLE public.v2_global_identity_evidence IS
  'Source-pinned identity verification evidence; source workbook assertions alone cannot activate a canonical material.';
COMMENT ON TABLE public.v2_global_material_source_observations IS
  'One source-row observation with exactly one canonical, excluded, or deferred disposition.';
COMMENT ON TABLE public.v2_global_physical_property_assertions IS
  'Source-aware physical property assertions; conflicting sources remain separate assertions.';
COMMENT ON TABLE public.v2_tenant_material_preparations IS
  'Tenant-local working material or dilution linked read-only to an active global canonical material.';
