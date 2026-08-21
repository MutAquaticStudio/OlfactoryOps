-- Phase 6: Formula V2 and Design Studio are separate from legacy Formula R&D.
-- Formula versions are immutable snapshots; Design candidates remain advisory.

CREATE TABLE IF NOT EXISTS v2_formula_projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  formula_type TEXT NOT NULL CHECK (formula_type IN ('ACCORD','FINE_FRAGRANCE')),
  final_product_context JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(final_product_context) = 'object'),
  concentrate_percent DOUBLE PRECISION CHECK (concentrate_percent IS NULL OR (concentrate_percent > 0 AND concentrate_percent <= 100)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_formula_drafts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  formula_project_id TEXT NOT NULL REFERENCES v2_formula_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  target_grams DOUBLE PRECISION NOT NULL CHECK (target_grams > 0 AND target_grams <= 1000000),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','REJECTED','ARCHIVED')),
  origin_type TEXT NOT NULL CHECK (origin_type IN ('MANUAL','DESIGN_CANDIDATE','AGENT_ADVISORY')),
  origin_reference_id TEXT,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_formula_draft_components (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL REFERENCES v2_formula_drafts(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  percentage DOUBLE PRECISION NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 10000),
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, draft_id, material_id),
  UNIQUE (organization_id, draft_id, position)
);

CREATE TABLE IF NOT EXISTS v2_formula_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  formula_project_id TEXT NOT NULL REFERENCES v2_formula_projects(id) ON DELETE CASCADE,
  source_draft_id TEXT NOT NULL REFERENCES v2_formula_drafts(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  formula_type TEXT NOT NULL CHECK (formula_type IN ('ACCORD','FINE_FRAGRANCE')),
  total_percentage DOUBLE PRECISION NOT NULL CHECK (total_percentage >= 99.999999 AND total_percentage <= 100.000001),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  origin_provenance JSONB NOT NULL CHECK (jsonb_typeof(origin_provenance) = 'object'),
  approval_status TEXT NOT NULL CHECK (approval_status IN ('APPROVED','REJECTED')),
  approved_by TEXT REFERENCES v2_users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, formula_project_id, version_number),
  UNIQUE (organization_id, formula_project_id, content_hash),
  CHECK ((approval_status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR approval_status = 'REJECTED')
);

CREATE TABLE IF NOT EXISTS v2_formula_version_components (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  formula_version_id TEXT NOT NULL REFERENCES v2_formula_versions(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  percentage DOUBLE PRECISION NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 10000),
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  UNIQUE (organization_id, formula_version_id, material_id),
  UNIQUE (organization_id, formula_version_id, position)
);

CREATE TABLE IF NOT EXISTS v2_formula_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL REFERENCES v2_formula_drafts(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('SUBMITTED','APPROVED','REJECTED')),
  rationale TEXT CHECK (rationale IS NULL OR length(rationale) <= 2000),
  decided_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_design_projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  formula_project_id TEXT REFERENCES v2_formula_projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_design_brief_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  design_project_id TEXT NOT NULL REFERENCES v2_design_projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  raw_brief TEXT NOT NULL CHECK (length(trim(raw_brief)) BETWEEN 1 AND 5000),
  structured_brief JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(structured_brief) = 'object'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEWED','ARCHIVED')),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  reviewed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, design_project_id, version_number),
  UNIQUE (organization_id, design_project_id, content_hash)
);

CREATE TABLE IF NOT EXISTS v2_design_material_universe_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  design_project_id TEXT NOT NULL REFERENCES v2_design_projects(id) ON DELETE CASCADE,
  brief_version_id TEXT NOT NULL REFERENCES v2_design_brief_versions(id) ON DELETE CASCADE,
  material_ids JSONB NOT NULL CHECK (jsonb_typeof(material_ids) = 'array'),
  universe_hash TEXT NOT NULL CHECK (universe_hash ~ '^[a-f0-9]{64}$'),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, design_project_id, brief_version_id, universe_hash)
);

CREATE TABLE IF NOT EXISTS v2_design_candidates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  design_project_id TEXT NOT NULL REFERENCES v2_design_projects(id) ON DELETE CASCADE,
  brief_version_id TEXT NOT NULL REFERENCES v2_design_brief_versions(id) ON DELETE RESTRICT,
  universe_snapshot_id TEXT NOT NULL REFERENCES v2_design_material_universe_snapshots(id) ON DELETE RESTRICT,
  narrative TEXT NOT NULL CHECK (length(trim(narrative)) BETWEEN 1 AND 4000),
  component_proposal JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(component_proposal) = 'array'),
  deterministic_evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(deterministic_evidence) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('ADVISORY','NOT_CONFIGURED','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_projects_org_id_unique') THEN ALTER TABLE v2_formula_projects ADD CONSTRAINT v2_formula_projects_org_id_unique UNIQUE (organization_id, id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_drafts_org_id_unique') THEN ALTER TABLE v2_formula_drafts ADD CONSTRAINT v2_formula_drafts_org_id_unique UNIQUE (organization_id, id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_versions_org_id_unique') THEN ALTER TABLE v2_formula_versions ADD CONSTRAINT v2_formula_versions_org_id_unique UNIQUE (organization_id, id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_design_projects_org_id_unique') THEN ALTER TABLE v2_design_projects ADD CONSTRAINT v2_design_projects_org_id_unique UNIQUE (organization_id, id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_design_briefs_org_id_unique') THEN ALTER TABLE v2_design_brief_versions ADD CONSTRAINT v2_design_briefs_org_id_unique UNIQUE (organization_id, id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_design_universe_org_id_unique') THEN ALTER TABLE v2_design_material_universe_snapshots ADD CONSTRAINT v2_design_universe_org_id_unique UNIQUE (organization_id, id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_draft_project_tenant_fk') THEN ALTER TABLE v2_formula_drafts ADD CONSTRAINT v2_formula_draft_project_tenant_fk FOREIGN KEY (organization_id, formula_project_id) REFERENCES v2_formula_projects(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_component_draft_tenant_fk') THEN ALTER TABLE v2_formula_draft_components ADD CONSTRAINT v2_formula_component_draft_tenant_fk FOREIGN KEY (organization_id, draft_id) REFERENCES v2_formula_drafts(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_component_material_tenant_fk') THEN ALTER TABLE v2_formula_draft_components ADD CONSTRAINT v2_formula_component_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_version_project_tenant_fk') THEN ALTER TABLE v2_formula_versions ADD CONSTRAINT v2_formula_version_project_tenant_fk FOREIGN KEY (organization_id, formula_project_id) REFERENCES v2_formula_projects(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_version_draft_tenant_fk') THEN ALTER TABLE v2_formula_versions ADD CONSTRAINT v2_formula_version_draft_tenant_fk FOREIGN KEY (organization_id, source_draft_id) REFERENCES v2_formula_drafts(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_version_component_version_tenant_fk') THEN ALTER TABLE v2_formula_version_components ADD CONSTRAINT v2_formula_version_component_version_tenant_fk FOREIGN KEY (organization_id, formula_version_id) REFERENCES v2_formula_versions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_version_component_material_tenant_fk') THEN ALTER TABLE v2_formula_version_components ADD CONSTRAINT v2_formula_version_component_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_review_draft_tenant_fk') THEN ALTER TABLE v2_formula_reviews ADD CONSTRAINT v2_formula_review_draft_tenant_fk FOREIGN KEY (organization_id, draft_id) REFERENCES v2_formula_drafts(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_design_project_formula_tenant_fk') THEN ALTER TABLE v2_design_projects ADD CONSTRAINT v2_design_project_formula_tenant_fk FOREIGN KEY (organization_id, formula_project_id) REFERENCES v2_formula_projects(organization_id, id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_design_brief_project_tenant_fk') THEN ALTER TABLE v2_design_brief_versions ADD CONSTRAINT v2_design_brief_project_tenant_fk FOREIGN KEY (organization_id, design_project_id) REFERENCES v2_design_projects(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_design_universe_project_tenant_fk') THEN ALTER TABLE v2_design_material_universe_snapshots ADD CONSTRAINT v2_design_universe_project_tenant_fk FOREIGN KEY (organization_id, design_project_id) REFERENCES v2_design_projects(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_design_universe_brief_tenant_fk') THEN ALTER TABLE v2_design_material_universe_snapshots ADD CONSTRAINT v2_design_universe_brief_tenant_fk FOREIGN KEY (organization_id, brief_version_id) REFERENCES v2_design_brief_versions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_design_candidate_project_tenant_fk') THEN ALTER TABLE v2_design_candidates ADD CONSTRAINT v2_design_candidate_project_tenant_fk FOREIGN KEY (organization_id, design_project_id) REFERENCES v2_design_projects(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_design_candidate_brief_tenant_fk') THEN ALTER TABLE v2_design_candidates ADD CONSTRAINT v2_design_candidate_brief_tenant_fk FOREIGN KEY (organization_id, brief_version_id) REFERENCES v2_design_brief_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_design_candidate_universe_tenant_fk') THEN ALTER TABLE v2_design_candidates ADD CONSTRAINT v2_design_candidate_universe_tenant_fk FOREIGN KEY (organization_id, universe_snapshot_id) REFERENCES v2_design_material_universe_snapshots(organization_id, id) ON DELETE RESTRICT; END IF;
  FOREACH t IN ARRAY ARRAY['v2_formula_projects','v2_formula_drafts','v2_formula_draft_components','v2_formula_versions','v2_formula_version_components','v2_formula_reviews','v2_design_projects','v2_design_brief_versions','v2_design_material_universe_snapshots','v2_design_candidates'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t); EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app'; END IF;
END $$;
