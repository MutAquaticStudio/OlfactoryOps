-- Staging acceptance-only job classification. The type has no public API
-- producer and the Cloud Runtime acknowledges it outside RELEASE_ENVIRONMENT
-- = staging before it touches PostgreSQL or a business subsystem.

ALTER TABLE v2_cloud_job_dispatches
  DROP CONSTRAINT IF EXISTS v2_cloud_job_dispatches_job_type_check;

ALTER TABLE v2_cloud_job_dispatches
  ADD CONSTRAINT v2_cloud_job_dispatches_job_type_check
  CHECK (job_type IN (
    'SCIENTIFIC_FEATURE',
    'SCIENTIFIC_MODEL',
    'RAG_INGESTION',
    'NOTIFICATION_DELIVERY',
    'STAGING_DLQ_TERMINAL_FAILURE_PROBE'
  ));

CREATE INDEX IF NOT EXISTS v2_cloud_job_dispatches_staging_dlq_probe_idx
  ON v2_cloud_job_dispatches (organization_id, status, attempts, created_at)
  WHERE job_type = 'STAGING_DLQ_TERMINAL_FAILURE_PROBE';
