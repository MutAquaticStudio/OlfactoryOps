-- Cloud scientific dispatch records a bounded immutable input snapshot on the
-- existing tenant-scoped scientific job. This lets an interrupted API Worker
-- retry a Queue dispatch without re-reading a later material identity.

ALTER TABLE v2_scientific_jobs
  ADD COLUMN IF NOT EXISTS cloud_input JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_scientific_jobs_cloud_input_check'
      AND conrelid = 'v2_scientific_jobs'::regclass
  ) THEN
    ALTER TABLE v2_scientific_jobs
      ADD CONSTRAINT v2_scientific_jobs_cloud_input_check
      CHECK (
        cloud_input IS NULL OR (
          jsonb_typeof(cloud_input) = 'object'
          AND jsonb_typeof(cloud_input->'featureKinds') = 'array'
          AND jsonb_array_length(cloud_input->'featureKinds') BETWEEN 1 AND 4
          AND length(coalesce(cloud_input->>'canonicalSmiles', '')) BETWEEN 1 AND 4096
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS v2_scientific_jobs_cloud_dispatch_idx
  ON v2_scientific_jobs (organization_id, status, created_at DESC)
  WHERE cloud_input IS NOT NULL;
