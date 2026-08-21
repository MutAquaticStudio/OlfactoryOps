-- Cloudflare runtime dispatch records. PostgreSQL remains the authoritative
-- state machine; Queues, Workflows, R2, and Vectorize are delivery/runtime
-- facilities and never replace tenant-scoped transactional truth.

CREATE TABLE IF NOT EXISTS v2_cloud_job_dispatches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('SCIENTIFIC_FEATURE','SCIENTIFIC_MODEL','RAG_INGESTION','NOTIFICATION_DELIVERY')),
  protocol_version TEXT NOT NULL CHECK (protocol_version = 'cloud-runtime/v1'),
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 16 AND 200),
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 160),
  actor_user_id TEXT REFERENCES v2_users(id) ON DELETE SET NULL,
  artifact_ref TEXT NOT NULL CHECK (length(trim(artifact_ref)) BETWEEN 1 AND 512),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','RETRY','SUCCEEDED','FAILED','DLQ','CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 3),
  workflow_instance_id TEXT,
  result_artifact_ref TEXT CHECK (result_artifact_ref IS NULL OR length(trim(result_artifact_ref)) BETWEEN 1 AND 512),
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{2,119}$'),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_cloud_job_dispatches_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_cloud_job_dispatches_idempotency_unique UNIQUE (organization_id, job_type, protocol_version, idempotency_key),
  CONSTRAINT v2_cloud_job_dispatches_completion_check CHECK ((status = 'SUCCEEDED' AND completed_at IS NOT NULL AND result_artifact_ref IS NOT NULL) OR status <> 'SUCCEEDED')
);

CREATE TABLE IF NOT EXISTS v2_cloud_job_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES v2_organizations(id) ON DELETE CASCADE,
  dispatch_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type ~ '^[A-Z][A-Z0-9_]{2,119}$'),
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 160),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_cloud_job_events_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT v2_cloud_job_events_dispatch_tenant_fk FOREIGN KEY (organization_id, dispatch_id)
    REFERENCES v2_cloud_job_dispatches(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS v2_cloud_job_dispatches_status_idx ON v2_cloud_job_dispatches (organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS v2_cloud_job_dispatches_correlation_idx ON v2_cloud_job_dispatches (organization_id, correlation_id);
CREATE INDEX IF NOT EXISTS v2_cloud_job_events_dispatch_idx ON v2_cloud_job_events (organization_id, dispatch_id, created_at);

CREATE OR REPLACE FUNCTION v2_cloud_job_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'v2_cloud_job_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS v2_cloud_job_events_append_only_trigger ON v2_cloud_job_events;
CREATE TRIGGER v2_cloud_job_events_append_only_trigger
  BEFORE UPDATE OR DELETE ON v2_cloud_job_events
  FOR EACH ROW EXECUTE FUNCTION v2_cloud_job_events_append_only();

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['v2_cloud_job_dispatches','v2_cloud_job_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS v2_tenant_scope ON %I', t);
    EXECUTE format('CREATE POLICY v2_tenant_scope ON %I USING (organization_id::text = current_setting(''app.organization_id'', true)) WITH CHECK (organization_id::text = current_setting(''app.organization_id'', true))', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON v2_cloud_job_dispatches, v2_cloud_job_events TO v2_app;
  END IF;
END $$;
