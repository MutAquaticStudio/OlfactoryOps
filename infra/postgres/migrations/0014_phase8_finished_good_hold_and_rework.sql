-- Phase 8 follow-up: a released finished-good lot may only be removed from
-- availability through a controlled quality-hold deviation. The linkage keeps
-- post-release rework, rejection, and release-back-to-available traceable.

-- A controlled finished-good rework creates a new release decision and a new
-- finished-good lot. The original 0012 one-release-per-order constraint makes
-- that legally traceable re-release impossible, so retain every historical
-- decision as a revision instead of replacing the prior release record.
ALTER TABLE v2_production_releases
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_release_id TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_releases_organization_id_production_order_id_key'
      AND conrelid = 'v2_production_releases'::regclass
  ) THEN
    ALTER TABLE v2_production_releases
      DROP CONSTRAINT v2_production_releases_organization_id_production_order_id_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_release_revision_positive'
      AND conrelid = 'v2_production_releases'::regclass
  ) THEN
    ALTER TABLE v2_production_releases
      ADD CONSTRAINT v2_production_release_revision_positive CHECK (revision > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_release_revision_unique'
      AND conrelid = 'v2_production_releases'::regclass
  ) THEN
    ALTER TABLE v2_production_releases
      ADD CONSTRAINT v2_production_release_revision_unique
      UNIQUE (organization_id, production_order_id, revision);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_release_order_id_unique'
      AND conrelid = 'v2_production_releases'::regclass
  ) THEN
    ALTER TABLE v2_production_releases
      ADD CONSTRAINT v2_production_release_order_id_unique
      UNIQUE (organization_id, production_order_id, id);
  END IF;

  -- Replace the original tenant-only supersession FK with one that also pins
  -- the parent release to this exact Production Order.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_release_supersedes_tenant_fk'
      AND conrelid = 'v2_production_releases'::regclass
  ) THEN
    ALTER TABLE v2_production_releases
      DROP CONSTRAINT v2_production_release_supersedes_tenant_fk;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_release_supersedes_order_fk'
      AND conrelid = 'v2_production_releases'::regclass
  ) THEN
    ALTER TABLE v2_production_releases
      ADD CONSTRAINT v2_production_release_supersedes_order_fk
      FOREIGN KEY (organization_id, production_order_id, supersedes_release_id)
      REFERENCES v2_production_releases(organization_id, production_order_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_release_no_self_supersede'
      AND conrelid = 'v2_production_releases'::regclass
  ) THEN
    ALTER TABLE v2_production_releases
      ADD CONSTRAINT v2_production_release_no_self_supersede
      CHECK (supersedes_release_id IS NULL OR supersedes_release_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS v2_production_releases_latest_idx
  ON v2_production_releases(organization_id, production_order_id, revision DESC);

ALTER TABLE v2_production_deviations
  ADD COLUMN IF NOT EXISTS finished_good_lot_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_deviation_finished_good_lot_tenant_fk'
      AND conrelid = 'v2_production_deviations'::regclass
  ) THEN
    ALTER TABLE v2_production_deviations
      ADD CONSTRAINT v2_production_deviation_finished_good_lot_tenant_fk
      FOREIGN KEY (organization_id, finished_good_lot_id)
      REFERENCES v2_finished_good_lots(organization_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS v2_production_deviation_finished_good_lot_idx
  ON v2_production_deviations(organization_id, finished_good_lot_id)
  WHERE finished_good_lot_id IS NOT NULL;

-- A post-release quality hold is only actionable when its evidence is linked
-- to the deviation itself. Keep this junction append-only: later correction
-- work adds new evidence rather than editing the original QC decision.
CREATE TABLE IF NOT EXISTS v2_production_deviation_evidence (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  deviation_id TEXT NOT NULL,
  document_snapshot_id TEXT NOT NULL,
  linked_by TEXT NOT NULL REFERENCES v2_users(id) ON DELETE RESTRICT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, deviation_id, document_snapshot_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_deviation_evidence_org_id_unique'
      AND conrelid = 'v2_production_deviation_evidence'::regclass
  ) THEN
    ALTER TABLE v2_production_deviation_evidence
      ADD CONSTRAINT v2_production_deviation_evidence_org_id_unique
      UNIQUE (organization_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_deviation_evidence_deviation_tenant_fk'
      AND conrelid = 'v2_production_deviation_evidence'::regclass
  ) THEN
    ALTER TABLE v2_production_deviation_evidence
      ADD CONSTRAINT v2_production_deviation_evidence_deviation_tenant_fk
      FOREIGN KEY (organization_id, deviation_id)
      REFERENCES v2_production_deviations(organization_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_deviation_evidence_document_tenant_fk'
      AND conrelid = 'v2_production_deviation_evidence'::regclass
  ) THEN
    ALTER TABLE v2_production_deviation_evidence
      ADD CONSTRAINT v2_production_deviation_evidence_document_tenant_fk
      FOREIGN KEY (organization_id, document_snapshot_id)
      REFERENCES v2_production_document_snapshots(organization_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS v2_production_deviation_evidence_org_deviation_idx
  ON v2_production_deviation_evidence(organization_id, deviation_id, linked_at ASC);

ALTER TABLE v2_production_deviation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_production_deviation_evidence FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v2_tenant_scope ON v2_production_deviation_evidence;
CREATE POLICY v2_tenant_scope ON v2_production_deviation_evidence
  USING (organization_id::text = current_setting('app.organization_id', true))
  WITH CHECK (organization_id::text = current_setting('app.organization_id', true));

DROP TRIGGER IF EXISTS v2_production_deviation_evidence_append_only ON v2_production_deviation_evidence;
CREATE TRIGGER v2_production_deviation_evidence_append_only
  BEFORE UPDATE OR DELETE ON v2_production_deviation_evidence
  FOR EACH ROW EXECUTE FUNCTION public.v2_reject_production_append_mutation();
REVOKE UPDATE, DELETE ON v2_production_deviation_evidence FROM PUBLIC;

-- Existing policy documents are authoritative, so registry expansion alone
-- cannot grant new Production capabilities to old workspaces. Preserve every
-- explicit permission and advance only Owner/Admin policies that genuinely
-- need one of the Phase 8 keys. The historical broad `production.qc` key is
-- retained for policy compatibility; runtime authorization uses the granular
-- record/approve permissions.
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
        'production.view', 'production.create', 'production.plan', 'production.allocate', 'production.weigh', 'production.process',
        'production.qc', 'production.qc.record', 'production.qc.approve', 'production.deviation.manage', 'production.release',
        'production.cancel', 'production.close', 'production.finishedGoods.view', 'production.documents.view', 'production.documents.manage'
      ]::TEXT[]) AS required(required_permission)
    ) AS merged
  ),
  version = policy.version + 1,
  updated_at = now()
WHERE policy.role_key IN ('Owner', 'Admin')
  AND EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'production.view', 'production.create', 'production.plan', 'production.allocate', 'production.weigh', 'production.process',
      'production.qc', 'production.qc.record', 'production.qc.approve', 'production.deviation.manage', 'production.release',
      'production.cancel', 'production.close', 'production.finishedGoods.view', 'production.documents.view', 'production.documents.manage'
    ]::TEXT[]) AS required(required_permission)
    WHERE NOT policy.permissions ? required.required_permission
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON v2_production_deviation_evidence TO v2_app;
  END IF;
END $$;
