-- Phase 8 follow-up: immutable QC corrections and explicit deviation-to-rework
-- provenance. This is intentionally additive so an already-created 0012
-- schema can be upgraded without rewriting batch history.

ALTER TABLE v2_production_qc_results
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_result_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_qc_result_revision_positive'
      AND conrelid = 'v2_production_qc_results'::regclass
  ) THEN
    ALTER TABLE v2_production_qc_results
      ADD CONSTRAINT v2_production_qc_result_revision_positive CHECK (revision > 0);
  END IF;

  -- 0012 originally allowed a single check record. Preserve those rows as
  -- revision 1, then make later invalidations append a revision instead.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_qc_results_organization_id_production_order_i_key'
      AND conrelid = 'v2_production_qc_results'::regclass
  ) THEN
    ALTER TABLE v2_production_qc_results
      DROP CONSTRAINT v2_production_qc_results_organization_id_production_order_i_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_qc_result_revision_unique'
      AND conrelid = 'v2_production_qc_results'::regclass
  ) THEN
    ALTER TABLE v2_production_qc_results
      ADD CONSTRAINT v2_production_qc_result_revision_unique
      UNIQUE (organization_id, production_order_id, qc_specification_id, check_key, revision);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_qc_result_supersedes_tenant_fk'
      AND conrelid = 'v2_production_qc_results'::regclass
  ) THEN
    ALTER TABLE v2_production_qc_results
      ADD CONSTRAINT v2_production_qc_result_supersedes_tenant_fk
      FOREIGN KEY (organization_id, supersedes_result_id)
      REFERENCES v2_production_qc_results(organization_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS v2_production_qc_results_latest_idx
  ON v2_production_qc_results(organization_id, production_order_id, qc_specification_id, check_key, revision DESC);

ALTER TABLE v2_production_deviations
  ADD COLUMN IF NOT EXISTS rework_target_stage TEXT;

ALTER TABLE v2_production_rework_records
  ADD COLUMN IF NOT EXISTS deviation_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_deviation_rework_target_stage_check'
      AND conrelid = 'v2_production_deviations'::regclass
  ) THEN
    ALTER TABLE v2_production_deviations
      ADD CONSTRAINT v2_production_deviation_rework_target_stage_check
      CHECK (rework_target_stage IS NULL OR rework_target_stage IN ('COMPOUNDING','CONDITIONING','FILTRATION','FILLING'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_production_rework_deviation_tenant_fk'
      AND conrelid = 'v2_production_rework_records'::regclass
  ) THEN
    ALTER TABLE v2_production_rework_records
      ADD CONSTRAINT v2_production_rework_deviation_tenant_fk
      FOREIGN KEY (organization_id, deviation_id)
      REFERENCES v2_production_deviations(organization_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS v2_production_rework_deviation_idx
  ON v2_production_rework_records(organization_id, deviation_id)
  WHERE deviation_id IS NOT NULL;
