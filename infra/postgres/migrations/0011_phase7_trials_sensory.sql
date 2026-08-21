-- Phase 7: Trials, Sensory Sessions, and Private Sensory Memory.
-- This migration is additive. Formula versions and inventory movements remain
-- the authoritative immutable records owned by their earlier V2 phases.

CREATE TABLE IF NOT EXISTS v2_trials (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('FORMULA_VERSION','MANUAL_EXPERIMENT')),
  formula_version_id TEXT REFERENCES v2_formula_versions(id) ON DELETE RESTRICT,
  formula_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(formula_snapshot) = 'object'),
  formula_content_hash TEXT CHECK (formula_content_hash IS NULL OR formula_content_hash ~ '^[a-f0-9]{64}$'),
  manual_source JSONB CHECK (manual_source IS NULL OR jsonb_typeof(manual_source) = 'object'),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR length(description) <= 4000),
  planned_mass_g NUMERIC(18,6) NOT NULL CHECK (planned_mass_g > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PLANNED','READY','IN_PROGRESS','PREPARED','EVALUATION_READY','EVALUATED','CLOSED','CANCELLED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  planned_at TIMESTAMPTZ,
  released_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  prepared_at TIMESTAMPTZ,
  evaluation_ready_at TIMESTAMPTZ,
  evaluated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 2000),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  updated_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (source_kind = 'FORMULA_VERSION' AND formula_version_id IS NOT NULL AND formula_content_hash IS NOT NULL)
    OR (source_kind = 'MANUAL_EXPERIMENT' AND formula_version_id IS NULL AND manual_source IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS v2_trial_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  trial_id TEXT NOT NULL REFERENCES v2_trials(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT','SUPERSEDED','ARCHIVED')),
  formula_version_id TEXT REFERENCES v2_formula_versions(id) ON DELETE RESTRICT,
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  change_reason TEXT CHECK (change_reason IS NULL OR length(change_reason) <= 2000),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, trial_id, version_number),
  UNIQUE (organization_id, trial_id, content_hash)
);

CREATE TABLE IF NOT EXISTS v2_trial_releases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  trial_id TEXT NOT NULL REFERENCES v2_trials(id) ON DELETE CASCADE,
  trial_version_id TEXT NOT NULL REFERENCES v2_trial_versions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('PENDING','RELEASED','REJECTED','EXPIRED','CANCELLED')),
  gate_snapshot JSONB NOT NULL CHECK (jsonb_typeof(gate_snapshot) = 'object'),
  gate_checksum TEXT NOT NULL CHECK (gate_checksum ~ '^[a-f0-9]{64}$'),
  released_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  rationale TEXT CHECK (rationale IS NULL OR length(rationale) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'RELEASED' AND released_by IS NOT NULL AND released_at IS NOT NULL) OR status <> 'RELEASED'),
  UNIQUE (organization_id, trial_id, trial_version_id, gate_checksum)
);

CREATE TABLE IF NOT EXISTS v2_trial_preparations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  trial_id TEXT NOT NULL REFERENCES v2_trials(id) ON DELETE CASCADE,
  trial_version_id TEXT NOT NULL REFERENCES v2_trial_versions(id) ON DELETE RESTRICT,
  trial_release_id TEXT REFERENCES v2_trial_releases(id) ON DELETE RESTRICT,
  sequence_number INTEGER NOT NULL DEFAULT 1 CHECK (sequence_number > 0),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','WEIGHING','CONFIRMED','ABORTED','REVERSED')),
  planned_scale_g NUMERIC(18,6) CHECK (planned_scale_g IS NULL OR planned_scale_g > 0),
  actual_total_g NUMERIC(18,6) CHECK (actual_total_g IS NULL OR actual_total_g > 0),
  lab_weighing_session_id TEXT UNIQUE REFERENCES v2_lab_weighing_sessions(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  confirmed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, trial_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS v2_trial_usage_links (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  trial_id TEXT NOT NULL REFERENCES v2_trials(id) ON DELETE CASCADE,
  preparation_id TEXT NOT NULL REFERENCES v2_trial_preparations(id) ON DELETE CASCADE,
  lab_weighing_session_id TEXT NOT NULL REFERENCES v2_lab_weighing_sessions(id) ON DELETE RESTRICT,
  formula_checksum TEXT NOT NULL CHECK (formula_checksum ~ '^[a-f0-9]{64}$'),
  actual_weight_snapshot JSONB NOT NULL CHECK (jsonb_typeof(actual_weight_snapshot) = 'object'),
  cost_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cost_snapshot) = 'object'),
  status TEXT NOT NULL DEFAULT 'COMMITTED' CHECK (status IN ('COMMITTED','REVERSED')),
  linked_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ,
  reversal_movement_id TEXT REFERENCES v2_inventory_movements(id) ON DELETE RESTRICT,
  reversal_reason TEXT CHECK (reversal_reason IS NULL OR length(reversal_reason) <= 2000),
  UNIQUE (organization_id, lab_weighing_session_id),
  UNIQUE (organization_id, preparation_id)
);

CREATE TABLE IF NOT EXISTS v2_trial_material_usages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  trial_id TEXT REFERENCES v2_trials(id) ON DELETE CASCADE,
  trial_preparation_id TEXT NOT NULL REFERENCES v2_trial_preparations(id) ON DELETE CASCADE,
  usage_link_id TEXT REFERENCES v2_trial_usage_links(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES v2_materials(id) ON DELETE RESTRICT,
  lot_id TEXT NOT NULL REFERENCES v2_inventory_lots(id) ON DELETE RESTRICT,
  lab_weighing_line_id TEXT REFERENCES v2_lab_weighing_lines(id) ON DELETE RESTRICT,
  inventory_movement_id TEXT NOT NULL REFERENCES v2_inventory_movements(id) ON DELETE RESTRICT,
  planned_quantity_g NUMERIC(18,6) CHECK (planned_quantity_g IS NULL OR planned_quantity_g > 0),
  actual_g NUMERIC(18,6) NOT NULL CHECK (actual_g > 0),
  landed_unit_cost NUMERIC(18,8),
  currency CHAR(3),
  cost_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cost_snapshot) = 'object'),
  cost_snapshot_hash TEXT NOT NULL CHECK (cost_snapshot_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, inventory_movement_id),
  UNIQUE (organization_id, lab_weighing_line_id)
);

CREATE TABLE IF NOT EXISTS v2_trial_samples (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  trial_id TEXT NOT NULL REFERENCES v2_trials(id) ON DELETE CASCADE,
  trial_preparation_id TEXT NOT NULL REFERENCES v2_trial_preparations(id) ON DELETE RESTRICT,
  sample_code TEXT NOT NULL CHECK (length(trim(sample_code)) BETWEEN 2 AND 80),
  blind_code TEXT NOT NULL CHECK (length(trim(blind_code)) BETWEEN 2 AND 80),
  blind_code_hash TEXT NOT NULL CHECK (blind_code_hash ~ '^[a-f0-9]{64}$'),
  concentration_percent NUMERIC(8,4) CHECK (concentration_percent IS NULL OR (concentration_percent > 0 AND concentration_percent <= 100)),
  carrier TEXT CHECK (carrier IS NULL OR length(carrier) <= 160),
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prepared_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  storage_location TEXT CHECK (storage_location IS NULL OR length(storage_location) <= 200),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','ASSIGNED','EXPIRED','DISPOSED')),
  expires_at TIMESTAMPTZ,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at >= prepared_at),
  UNIQUE (organization_id, sample_code),
  UNIQUE (organization_id, blind_code_hash)
);

CREATE TABLE IF NOT EXISTS v2_trial_evidence (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  trial_id TEXT NOT NULL REFERENCES v2_trials(id) ON DELETE CASCADE,
  preparation_id TEXT REFERENCES v2_trial_preparations(id) ON DELETE SET NULL,
  sample_id TEXT REFERENCES v2_trial_samples(id) ON DELETE SET NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('PREPARATION','STABILITY','QC','EXTERNAL_LAB','PHOTO','DOCUMENT','OTHER')),
  object_ref TEXT NOT NULL CHECK (length(trim(object_ref)) BETWEEN 1 AND 1000),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, trial_id, evidence_kind, object_ref, content_hash)
);

CREATE TABLE IF NOT EXISTS v2_sensory_form_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  version_label TEXT NOT NULL CHECK (length(trim(version_label)) BETWEEN 1 AND 120),
  schema JSONB NOT NULL CHECK (jsonb_typeof(schema) = 'object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  minimum_evidence_count INTEGER NOT NULL DEFAULT 3 CHECK (minimum_evidence_count >= 1 AND minimum_evidence_count <= 1000),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name, version_label),
  UNIQUE (organization_id, name, content_hash)
);

CREATE TABLE IF NOT EXISTS v2_sensory_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  trial_id TEXT NOT NULL REFERENCES v2_trials(id) ON DELETE CASCADE,
  form_version_id TEXT NOT NULL REFERENCES v2_sensory_form_versions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  mode TEXT NOT NULL DEFAULT 'INTERNAL_PANEL' CHECK (mode IN ('SINGLE_PERFUMER','INTERNAL_PANEL','BLIND_PANEL','BRAND_REVIEW')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SCHEDULED','OPEN','IN_PROGRESS','CLOSED','VOIDED')),
  blind_mode BOOLEAN NOT NULL DEFAULT TRUE,
  allow_peer_results_after_close BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  instructions TEXT CHECK (instructions IS NULL OR length(instructions) <= 4000),
  created_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  closed_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (closed_at IS NULL OR opened_at IS NULL OR closed_at >= opened_at)
);

CREATE TABLE IF NOT EXISTS v2_sensory_panel_assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  sensory_session_id TEXT NOT NULL REFERENCES v2_sensory_sessions(id) ON DELETE CASCADE,
  panelist_user_id TEXT NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','REVOKED','COMPLETED')),
  invited_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (organization_id, sensory_session_id, panelist_user_id)
);

CREATE TABLE IF NOT EXISTS v2_sensory_sample_assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  sensory_session_id TEXT NOT NULL REFERENCES v2_sensory_sessions(id) ON DELETE CASCADE,
  sample_id TEXT NOT NULL REFERENCES v2_trial_samples(id) ON DELETE RESTRICT,
  panel_assignment_id TEXT REFERENCES v2_sensory_panel_assignments(id) ON DELETE CASCADE,
  presentation JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(presentation) = 'object'),
  blinding_status TEXT NOT NULL DEFAULT 'BLINDED' CHECK (blinding_status IN ('BLINDED','UNBLINDED')),
  unblinded_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  unblinded_at TIMESTAMPTZ,
  unblinding_reason TEXT CHECK (unblinding_reason IS NULL OR length(unblinding_reason) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((blinding_status = 'BLINDED' AND unblinded_by IS NULL AND unblinded_at IS NULL) OR (blinding_status = 'UNBLINDED' AND unblinded_by IS NOT NULL AND unblinded_at IS NOT NULL)),
  UNIQUE (organization_id, sensory_session_id, sample_id, panel_assignment_id)
);

CREATE TABLE IF NOT EXISTS v2_sensory_public_links (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  sensory_session_id TEXT NOT NULL REFERENCES v2_sensory_sessions(id) ON DELETE CASCADE,
  sample_assignment_id TEXT NOT NULL REFERENCES v2_sensory_sample_assignments(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  presentation_mode TEXT NOT NULL CHECK (presentation_mode IN ('BLIND','BRAND_REVIEW')),
  allowed_timepoints JSONB NOT NULL CHECK (jsonb_typeof(allowed_timepoints) = 'array'),
  max_submissions INTEGER NOT NULL DEFAULT 32 CHECK (max_submissions > 0 AND max_submissions <= 128),
  submission_count INTEGER NOT NULL DEFAULT 0 CHECK (submission_count >= 0 AND submission_count <= max_submissions),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  issued_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (token_hash)
);

CREATE TABLE IF NOT EXISTS v2_sensory_evaluations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  sensory_session_id TEXT NOT NULL REFERENCES v2_sensory_sessions(id) ON DELETE CASCADE,
  form_version_id TEXT NOT NULL REFERENCES v2_sensory_form_versions(id) ON DELETE RESTRICT,
  sample_assignment_id TEXT NOT NULL REFERENCES v2_sensory_sample_assignments(id) ON DELETE RESTRICT,
  panel_assignment_id TEXT REFERENCES v2_sensory_panel_assignments(id) ON DELETE SET NULL,
  public_link_id TEXT REFERENCES v2_sensory_public_links(id) ON DELETE SET NULL,
  evaluator_user_id TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  timepoint_key TEXT NOT NULL CHECK (length(trim(timepoint_key)) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','VOIDED')),
  ratings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(ratings) = 'object'),
  descriptors JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(descriptors) = 'array'),
  observations TEXT CHECK (observations IS NULL OR length(observations) <= 4000),
  comparisons JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(comparisons) = 'object'),
  preference_rank INTEGER CHECK (preference_rank IS NULL OR preference_rank > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((panel_assignment_id IS NOT NULL AND public_link_id IS NULL AND evaluator_user_id IS NOT NULL) OR (panel_assignment_id IS NULL AND public_link_id IS NOT NULL AND evaluator_user_id IS NULL)),
  UNIQUE (organization_id, panel_assignment_id, sample_assignment_id, timepoint_key),
  UNIQUE (organization_id, public_link_id, timepoint_key)
);

-- Public scorecards use a separate, link-scoped idempotency record because
-- they deliberately have no ambient tenant session or user account.
CREATE TABLE IF NOT EXISTS v2_sensory_public_submission_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  public_link_id TEXT NOT NULL REFERENCES v2_sensory_public_links(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 12 AND 200),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, public_link_id, idempotency_key)
);

-- Keep the migration safely re-runnable while Phase 7 evolves before any
-- environment promotion. These are additive only and preserve all evidence.
ALTER TABLE v2_trial_usage_links ADD COLUMN IF NOT EXISTS reversal_movement_id TEXT REFERENCES v2_inventory_movements(id) ON DELETE RESTRICT;
ALTER TABLE v2_sensory_evaluations ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE TABLE IF NOT EXISTS v2_trial_decisions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  trial_id TEXT NOT NULL REFERENCES v2_trials(id) ON DELETE CASCADE,
  trial_version_id TEXT NOT NULL REFERENCES v2_trial_versions(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('ACCEPT_DIRECTION','REVISE_FORMULA','RETEST','REJECT_DIRECTION','PROMOTE_FOR_PRODUCTION_REVIEW')),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 4000),
  evidence_snapshot JSONB NOT NULL CHECK (jsonb_typeof(evidence_snapshot) = 'object'),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  decided_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, trial_id, evidence_hash)
);

CREATE TABLE IF NOT EXISTS v2_private_sensory_memories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  memory_kind TEXT NOT NULL CHECK (memory_kind IN ('TRIAL_OUTCOME','FORMULA_PROFILE','MATERIAL_ASSOCIATION','DESCRIPTOR_PROFILE','PERFORMANCE_PROFILE')),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('TRIAL','FORMULA_VERSION','MATERIAL','DESCRIPTOR_SET')),
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  current_version_number INTEGER NOT NULL DEFAULT 0 CHECK (current_version_number >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, memory_kind, subject_type, subject_id)
);

CREATE TABLE IF NOT EXISTS v2_private_sensory_memory_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  memory_id TEXT NOT NULL REFERENCES v2_private_sensory_memories(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  aggregation_algorithm_version TEXT NOT NULL CHECK (length(trim(aggregation_algorithm_version)) BETWEEN 1 AND 120),
  input_evidence_hash TEXT NOT NULL CHECK (input_evidence_hash ~ '^[a-f0-9]{64}$'),
  source_set_hash TEXT NOT NULL CHECK (source_set_hash ~ '^[a-f0-9]{64}$'),
  profile JSONB NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
  confidence NUMERIC(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('NOT_ENOUGH_EVIDENCE','LOW_CONFIDENCE','SUFFICIENT')),
  generated_by TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, memory_id, version_number),
  UNIQUE (organization_id, memory_id, aggregation_algorithm_version, input_evidence_hash)
);

CREATE TABLE IF NOT EXISTS v2_private_sensory_memory_sources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  memory_version_id TEXT NOT NULL REFERENCES v2_private_sensory_memory_versions(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('TRIAL','TRIAL_VERSION','SAMPLE','SENSORY_SESSION','SENSORY_EVALUATION','TRIAL_DECISION')),
  source_id TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, memory_version_id, source_kind, source_id, source_hash)
);

CREATE TABLE IF NOT EXISTS v2_sensory_memory_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  trial_id TEXT REFERENCES v2_trials(id) ON DELETE CASCADE,
  memory_id TEXT REFERENCES v2_private_sensory_memories(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','LEASED','SUCCEEDED','FAILED','CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 3),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token_hash TEXT CHECK (lease_token_hash IS NULL OR lease_token_hash ~ '^[a-f0-9]{64}$'),
  lease_expires_at TIMESTAMPTZ,
  input_evidence_hash TEXT NOT NULL CHECK (input_evidence_hash ~ '^[a-f0-9]{64}$'),
  result_memory_version_id TEXT REFERENCES v2_private_sensory_memory_versions(id) ON DELETE SET NULL,
  last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (trial_id IS NOT NULL OR memory_id IS NOT NULL),
  UNIQUE (organization_id, input_evidence_hash)
);

CREATE INDEX IF NOT EXISTS v2_trials_org_status_idx ON v2_trials(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS v2_trial_versions_org_trial_idx ON v2_trial_versions(organization_id, trial_id, version_number DESC);
CREATE INDEX IF NOT EXISTS v2_trial_releases_org_trial_idx ON v2_trial_releases(organization_id, trial_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_trial_preparations_org_trial_idx ON v2_trial_preparations(organization_id, trial_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_trial_material_usages_org_lot_idx ON v2_trial_material_usages(organization_id, lot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_trial_samples_org_trial_idx ON v2_trial_samples(organization_id, trial_id, status, prepared_at DESC);
CREATE INDEX IF NOT EXISTS v2_trial_evidence_org_trial_idx ON v2_trial_evidence(organization_id, trial_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_sensory_forms_org_status_idx ON v2_sensory_form_versions(organization_id, name, status, version_label);
CREATE INDEX IF NOT EXISTS v2_sensory_sessions_org_trial_idx ON v2_sensory_sessions(organization_id, trial_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_sensory_panel_org_session_idx ON v2_sensory_panel_assignments(organization_id, sensory_session_id, panelist_user_id, status);
CREATE INDEX IF NOT EXISTS v2_sensory_assignments_org_session_idx ON v2_sensory_sample_assignments(organization_id, sensory_session_id, panel_assignment_id);
CREATE INDEX IF NOT EXISTS v2_sensory_public_links_expiry_idx ON v2_sensory_public_links(organization_id, expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS v2_sensory_public_submission_requests_link_idx ON v2_sensory_public_submission_requests(organization_id, public_link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_sensory_evaluations_org_session_idx ON v2_sensory_evaluations(organization_id, sensory_session_id, status, timepoint_key);
CREATE INDEX IF NOT EXISTS v2_trial_decisions_org_trial_idx ON v2_trial_decisions(organization_id, trial_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS v2_sensory_memories_org_subject_idx ON v2_private_sensory_memories(organization_id, subject_type, subject_id, status);
CREATE INDEX IF NOT EXISTS v2_sensory_memory_versions_org_memory_idx ON v2_private_sensory_memory_versions(organization_id, memory_id, version_number DESC);
CREATE INDEX IF NOT EXISTS v2_sensory_memory_jobs_reclaim_idx ON v2_sensory_memory_jobs(organization_id, status, lease_expires_at, available_at);

-- Add tenant-composite foreign keys after parent and child (organization_id, id)
-- uniqueness is present. These constraints make a cross-tenant attachment fail
-- even if a repository query is accidentally under-scoped in the future.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_inventory_lots','v2_inventory_movements','v2_lab_weighing_sessions','v2_lab_weighing_lines',
    'v2_trials','v2_trial_versions','v2_trial_releases','v2_trial_preparations','v2_trial_usage_links','v2_trial_material_usages','v2_trial_samples','v2_trial_evidence',
    'v2_sensory_form_versions','v2_sensory_sessions','v2_sensory_panel_assignments','v2_sensory_sample_assignments','v2_sensory_public_links','v2_sensory_evaluations','v2_sensory_public_submission_requests','v2_trial_decisions',
    'v2_private_sensory_memories','v2_private_sensory_memory_versions','v2_private_sensory_memory_sources','v2_sensory_memory_jobs'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = format('%s_org_id_unique', t)) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (organization_id, id)', t, format('%s_org_id_unique', t));
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_formula_version_tenant_fk') THEN ALTER TABLE v2_trials ADD CONSTRAINT v2_trial_formula_version_tenant_fk FOREIGN KEY (organization_id, formula_version_id) REFERENCES v2_formula_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_version_trial_tenant_fk') THEN ALTER TABLE v2_trial_versions ADD CONSTRAINT v2_trial_version_trial_tenant_fk FOREIGN KEY (organization_id, trial_id) REFERENCES v2_trials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_version_formula_tenant_fk') THEN ALTER TABLE v2_trial_versions ADD CONSTRAINT v2_trial_version_formula_tenant_fk FOREIGN KEY (organization_id, formula_version_id) REFERENCES v2_formula_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_release_trial_tenant_fk') THEN ALTER TABLE v2_trial_releases ADD CONSTRAINT v2_trial_release_trial_tenant_fk FOREIGN KEY (organization_id, trial_id) REFERENCES v2_trials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_release_version_tenant_fk') THEN ALTER TABLE v2_trial_releases ADD CONSTRAINT v2_trial_release_version_tenant_fk FOREIGN KEY (organization_id, trial_version_id) REFERENCES v2_trial_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_preparation_trial_tenant_fk') THEN ALTER TABLE v2_trial_preparations ADD CONSTRAINT v2_trial_preparation_trial_tenant_fk FOREIGN KEY (organization_id, trial_id) REFERENCES v2_trials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_preparation_version_tenant_fk') THEN ALTER TABLE v2_trial_preparations ADD CONSTRAINT v2_trial_preparation_version_tenant_fk FOREIGN KEY (organization_id, trial_version_id) REFERENCES v2_trial_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_preparation_release_tenant_fk') THEN ALTER TABLE v2_trial_preparations ADD CONSTRAINT v2_trial_preparation_release_tenant_fk FOREIGN KEY (organization_id, trial_release_id) REFERENCES v2_trial_releases(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_preparation_session_tenant_fk') THEN ALTER TABLE v2_trial_preparations ADD CONSTRAINT v2_trial_preparation_session_tenant_fk FOREIGN KEY (organization_id, lab_weighing_session_id) REFERENCES v2_lab_weighing_sessions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_usage_trial_tenant_fk') THEN ALTER TABLE v2_trial_usage_links ADD CONSTRAINT v2_trial_usage_trial_tenant_fk FOREIGN KEY (organization_id, trial_id) REFERENCES v2_trials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_usage_preparation_tenant_fk') THEN ALTER TABLE v2_trial_usage_links ADD CONSTRAINT v2_trial_usage_preparation_tenant_fk FOREIGN KEY (organization_id, preparation_id) REFERENCES v2_trial_preparations(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_usage_session_tenant_fk') THEN ALTER TABLE v2_trial_usage_links ADD CONSTRAINT v2_trial_usage_session_tenant_fk FOREIGN KEY (organization_id, lab_weighing_session_id) REFERENCES v2_lab_weighing_sessions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_usage_reversal_tenant_fk') THEN ALTER TABLE v2_trial_usage_links ADD CONSTRAINT v2_trial_usage_reversal_tenant_fk FOREIGN KEY (organization_id, reversal_movement_id) REFERENCES v2_inventory_movements(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_material_usage_trial_tenant_fk') THEN ALTER TABLE v2_trial_material_usages ADD CONSTRAINT v2_trial_material_usage_trial_tenant_fk FOREIGN KEY (organization_id, trial_id) REFERENCES v2_trials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_material_usage_preparation_tenant_fk') THEN ALTER TABLE v2_trial_material_usages ADD CONSTRAINT v2_trial_material_usage_preparation_tenant_fk FOREIGN KEY (organization_id, trial_preparation_id) REFERENCES v2_trial_preparations(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_material_usage_link_tenant_fk') THEN ALTER TABLE v2_trial_material_usages ADD CONSTRAINT v2_trial_material_usage_link_tenant_fk FOREIGN KEY (organization_id, usage_link_id) REFERENCES v2_trial_usage_links(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_material_usage_material_tenant_fk') THEN ALTER TABLE v2_trial_material_usages ADD CONSTRAINT v2_trial_material_usage_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_material_usage_lot_tenant_fk') THEN ALTER TABLE v2_trial_material_usages ADD CONSTRAINT v2_trial_material_usage_lot_tenant_fk FOREIGN KEY (organization_id, lot_id) REFERENCES v2_inventory_lots(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_material_usage_line_tenant_fk') THEN ALTER TABLE v2_trial_material_usages ADD CONSTRAINT v2_trial_material_usage_line_tenant_fk FOREIGN KEY (organization_id, lab_weighing_line_id) REFERENCES v2_lab_weighing_lines(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_material_usage_movement_tenant_fk') THEN ALTER TABLE v2_trial_material_usages ADD CONSTRAINT v2_trial_material_usage_movement_tenant_fk FOREIGN KEY (organization_id, inventory_movement_id) REFERENCES v2_inventory_movements(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_sample_trial_tenant_fk') THEN ALTER TABLE v2_trial_samples ADD CONSTRAINT v2_trial_sample_trial_tenant_fk FOREIGN KEY (organization_id, trial_id) REFERENCES v2_trials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_sample_preparation_tenant_fk') THEN ALTER TABLE v2_trial_samples ADD CONSTRAINT v2_trial_sample_preparation_tenant_fk FOREIGN KEY (organization_id, trial_preparation_id) REFERENCES v2_trial_preparations(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_evidence_trial_tenant_fk') THEN ALTER TABLE v2_trial_evidence ADD CONSTRAINT v2_trial_evidence_trial_tenant_fk FOREIGN KEY (organization_id, trial_id) REFERENCES v2_trials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_evidence_preparation_tenant_fk') THEN ALTER TABLE v2_trial_evidence ADD CONSTRAINT v2_trial_evidence_preparation_tenant_fk FOREIGN KEY (organization_id, preparation_id) REFERENCES v2_trial_preparations(organization_id, id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_evidence_sample_tenant_fk') THEN ALTER TABLE v2_trial_evidence ADD CONSTRAINT v2_trial_evidence_sample_tenant_fk FOREIGN KEY (organization_id, sample_id) REFERENCES v2_trial_samples(organization_id, id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_session_trial_tenant_fk') THEN ALTER TABLE v2_sensory_sessions ADD CONSTRAINT v2_sensory_session_trial_tenant_fk FOREIGN KEY (organization_id, trial_id) REFERENCES v2_trials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_session_form_tenant_fk') THEN ALTER TABLE v2_sensory_sessions ADD CONSTRAINT v2_sensory_session_form_tenant_fk FOREIGN KEY (organization_id, form_version_id) REFERENCES v2_sensory_form_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_panel_session_tenant_fk') THEN ALTER TABLE v2_sensory_panel_assignments ADD CONSTRAINT v2_sensory_panel_session_tenant_fk FOREIGN KEY (organization_id, sensory_session_id) REFERENCES v2_sensory_sessions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_sample_assignment_session_tenant_fk') THEN ALTER TABLE v2_sensory_sample_assignments ADD CONSTRAINT v2_sensory_sample_assignment_session_tenant_fk FOREIGN KEY (organization_id, sensory_session_id) REFERENCES v2_sensory_sessions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_sample_assignment_sample_tenant_fk') THEN ALTER TABLE v2_sensory_sample_assignments ADD CONSTRAINT v2_sensory_sample_assignment_sample_tenant_fk FOREIGN KEY (organization_id, sample_id) REFERENCES v2_trial_samples(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_sample_assignment_panel_tenant_fk') THEN ALTER TABLE v2_sensory_sample_assignments ADD CONSTRAINT v2_sensory_sample_assignment_panel_tenant_fk FOREIGN KEY (organization_id, panel_assignment_id) REFERENCES v2_sensory_panel_assignments(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_public_link_session_tenant_fk') THEN ALTER TABLE v2_sensory_public_links ADD CONSTRAINT v2_sensory_public_link_session_tenant_fk FOREIGN KEY (organization_id, sensory_session_id) REFERENCES v2_sensory_sessions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_public_link_assignment_tenant_fk') THEN ALTER TABLE v2_sensory_public_links ADD CONSTRAINT v2_sensory_public_link_assignment_tenant_fk FOREIGN KEY (organization_id, sample_assignment_id) REFERENCES v2_sensory_sample_assignments(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_evaluation_session_tenant_fk') THEN ALTER TABLE v2_sensory_evaluations ADD CONSTRAINT v2_sensory_evaluation_session_tenant_fk FOREIGN KEY (organization_id, sensory_session_id) REFERENCES v2_sensory_sessions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_evaluation_form_tenant_fk') THEN ALTER TABLE v2_sensory_evaluations ADD CONSTRAINT v2_sensory_evaluation_form_tenant_fk FOREIGN KEY (organization_id, form_version_id) REFERENCES v2_sensory_form_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_evaluation_assignment_tenant_fk') THEN ALTER TABLE v2_sensory_evaluations ADD CONSTRAINT v2_sensory_evaluation_assignment_tenant_fk FOREIGN KEY (organization_id, sample_assignment_id) REFERENCES v2_sensory_sample_assignments(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_evaluation_panel_tenant_fk') THEN ALTER TABLE v2_sensory_evaluations ADD CONSTRAINT v2_sensory_evaluation_panel_tenant_fk FOREIGN KEY (organization_id, panel_assignment_id) REFERENCES v2_sensory_panel_assignments(organization_id, id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_evaluation_public_link_tenant_fk') THEN ALTER TABLE v2_sensory_evaluations ADD CONSTRAINT v2_sensory_evaluation_public_link_tenant_fk FOREIGN KEY (organization_id, public_link_id) REFERENCES v2_sensory_public_links(organization_id, id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_public_submission_link_tenant_fk') THEN ALTER TABLE v2_sensory_public_submission_requests ADD CONSTRAINT v2_sensory_public_submission_link_tenant_fk FOREIGN KEY (organization_id, public_link_id) REFERENCES v2_sensory_public_links(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_decision_trial_tenant_fk') THEN ALTER TABLE v2_trial_decisions ADD CONSTRAINT v2_trial_decision_trial_tenant_fk FOREIGN KEY (organization_id, trial_id) REFERENCES v2_trials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_trial_decision_version_tenant_fk') THEN ALTER TABLE v2_trial_decisions ADD CONSTRAINT v2_trial_decision_version_tenant_fk FOREIGN KEY (organization_id, trial_version_id) REFERENCES v2_trial_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_memory_version_memory_tenant_fk') THEN ALTER TABLE v2_private_sensory_memory_versions ADD CONSTRAINT v2_sensory_memory_version_memory_tenant_fk FOREIGN KEY (organization_id, memory_id) REFERENCES v2_private_sensory_memories(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_memory_source_version_tenant_fk') THEN ALTER TABLE v2_private_sensory_memory_sources ADD CONSTRAINT v2_sensory_memory_source_version_tenant_fk FOREIGN KEY (organization_id, memory_version_id) REFERENCES v2_private_sensory_memory_versions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_memory_job_trial_tenant_fk') THEN ALTER TABLE v2_sensory_memory_jobs ADD CONSTRAINT v2_sensory_memory_job_trial_tenant_fk FOREIGN KEY (organization_id, trial_id) REFERENCES v2_trials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_memory_job_memory_tenant_fk') THEN ALTER TABLE v2_sensory_memory_jobs ADD CONSTRAINT v2_sensory_memory_job_memory_tenant_fk FOREIGN KEY (organization_id, memory_id) REFERENCES v2_private_sensory_memories(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_sensory_memory_job_result_tenant_fk') THEN ALTER TABLE v2_sensory_memory_jobs ADD CONSTRAINT v2_sensory_memory_job_result_tenant_fk FOREIGN KEY (organization_id, result_memory_version_id) REFERENCES v2_private_sensory_memory_versions(organization_id, id) ON DELETE SET NULL; END IF;
END $$;

-- Public handlers never query a link by a caller-supplied identifier. This
-- tightly scoped function is the only unauthenticated lookup: it returns a
-- non-revoked, non-expired, non-exhausted link by its SHA-256 verifier hash.
-- The API then establishes the returned organization context before any other
-- sensory record is read or written.
CREATE OR REPLACE FUNCTION public.v2_resolve_sensory_public_link(p_token_hash TEXT)
RETURNS TABLE (
  organization_id TEXT,
  id TEXT,
  sensory_session_id TEXT,
  sample_assignment_id TEXT,
  expires_at TIMESTAMPTZ,
  max_submissions INTEGER,
  submission_count INTEGER,
  presentation_mode TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM set_config('app.sensory_link_hash', p_token_hash, true);
  RETURN QUERY
    SELECT
      link.organization_id,
      link.id,
      link.sensory_session_id,
      link.sample_assignment_id,
      link.expires_at,
      link.max_submissions,
      link.submission_count,
      link.presentation_mode
    FROM public.v2_sensory_public_links AS link
    WHERE link.token_hash = p_token_hash
      AND link.revoked_at IS NULL
      AND link.expires_at > now()
      AND link.submission_count < link.max_submissions
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.v2_resolve_sensory_public_link(TEXT) FROM PUBLIC;

-- Existing workspaces retain every explicit grant. This only adds the Phase 7
-- operational permissions to the established Lab Manager policy, and updates
-- its version only when a new grant was actually required.
UPDATE v2_role_policies AS policy
SET
  permissions = (
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM (
      SELECT existing.permission
      FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
      UNION
      SELECT required_permission
      FROM unnest(ARRAY[
        'trials.view', 'trials.viewAll', 'trials.create', 'trials.release', 'trials.decide',
        'sensory.view', 'sensory.evaluate', 'sensory.manage'
      ]::TEXT[]) AS required(required_permission)
    ) AS merged
  ),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key = 'Lab Manager'
  AND EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'trials.view', 'trials.viewAll', 'trials.create', 'trials.release', 'trials.decide',
      'sensory.view', 'sensory.evaluate', 'sensory.manage'
    ]::TEXT[]) AS required(required_permission)
    WHERE NOT policy.permissions ? required.required_permission
  );

-- Existing Owner/Admin/Perfumer policy documents were created before this
-- narrowly scoped controlled-unblinding capability existed. Preserve every
-- explicit grant while adding the Phase 7 permission only to the intended
-- policy roles.
UPDATE v2_role_policies AS policy
SET
  permissions = (
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM (
      SELECT existing.permission
      FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
      UNION ALL SELECT 'sensory.unblind'
    ) AS merged
  ),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key IN ('Owner', 'Admin', 'Perfumer')
  AND NOT policy.permissions ? 'sensory.unblind';

-- A Brand member is not a general Trial reader. Controlled external review is
-- granted by an opaque, scoped scorecard link instead of a tenant-wide read
-- capability that could reveal unrelated experimental work.
UPDATE v2_role_policies AS policy
SET
  permissions = COALESCE((
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
    WHERE permission NOT IN ('trials.view', 'sensory.view', 'sensory.evaluate')
  ), '[]'::jsonb),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key = 'Brand'
  AND (policy.permissions ? 'trials.view' OR policy.permissions ? 'sensory.view' OR policy.permissions ? 'sensory.evaluate');

-- Split broad Trial reads from the blind panelist presentation scope. Existing
-- non-panel operational policies retain their explicit legacy grant and gain
-- the broad capability; panelists receive only assignment-scoped visibility.
UPDATE v2_role_policies AS policy
SET
  permissions = (
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM (
      SELECT existing.permission
      FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
      UNION ALL SELECT 'trials.viewAll'
    ) AS merged
  ),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key NOT IN ('Sensory Panelist', 'Brand')
  AND policy.permissions ? 'trials.view'
  AND NOT policy.permissions ? 'trials.viewAll';

UPDATE v2_role_policies AS policy
SET
  permissions = (
    SELECT jsonb_agg(permission ORDER BY permission)
    FROM (
      SELECT existing.permission
      FROM jsonb_array_elements_text(policy.permissions) AS existing(permission)
      WHERE permission NOT IN ('trials.view', 'trials.viewAll')
      UNION ALL SELECT 'trials.viewAssigned'
    ) AS merged
  ),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key = 'Sensory Panelist'
  AND (policy.permissions ? 'trials.view' OR policy.permissions ? 'trials.viewAll' OR NOT policy.permissions ? 'trials.viewAssigned');

-- Standard tenant fencing is applied to every tenant-owned Phase 7 table.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_trials','v2_trial_versions','v2_trial_releases','v2_trial_preparations','v2_trial_usage_links','v2_trial_material_usages','v2_trial_samples','v2_trial_evidence',
    'v2_sensory_form_versions','v2_sensory_sessions','v2_sensory_panel_assignments','v2_sensory_sample_assignments','v2_sensory_evaluations','v2_sensory_public_submission_requests','v2_trial_decisions',
    'v2_private_sensory_memories','v2_private_sensory_memory_versions','v2_private_sensory_memory_sources','v2_sensory_memory_jobs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;

  ALTER TABLE v2_sensory_public_links ENABLE ROW LEVEL SECURITY;
  ALTER TABLE v2_sensory_public_links FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_tenant_scope ON v2_sensory_public_links;
  CREATE POLICY v2_tenant_scope ON v2_sensory_public_links
    USING (
      organization_id::text = current_setting('app.organization_id', true)
      OR token_hash = current_setting('app.sensory_link_hash', true)
    )
    WITH CHECK (organization_id::text = current_setting('app.organization_id', true));

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO v2_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.v2_resolve_sensory_public_link(TEXT) TO v2_app';
  END IF;
END $$;
