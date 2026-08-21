-- Database-level tenant fencing for records introduced by Phase 4 through 6.
-- RLS is necessary but not sufficient: these composite foreign keys prevent a
-- future query from attaching an identifier that belongs to another tenant.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'v2_materials','v2_dataset_splits','v2_olfactory_benchmarks',
    'v2_design_candidates','v2_agent_runs','v2_material_evidence_sources'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = format('%s_org_id_unique', t)
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (organization_id, id)', t, format('%s_org_id_unique', t));
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_dataset_source_version_tenant_fk') THEN ALTER TABLE v2_dataset_sources ADD CONSTRAINT v2_dataset_source_version_tenant_fk FOREIGN KEY (organization_id, dataset_version_id) REFERENCES v2_dataset_versions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_dataset_split_version_tenant_fk') THEN ALTER TABLE v2_dataset_splits ADD CONSTRAINT v2_dataset_split_version_tenant_fk FOREIGN KEY (organization_id, dataset_version_id) REFERENCES v2_dataset_versions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_training_config_run_tenant_fk') THEN ALTER TABLE v2_training_configs ADD CONSTRAINT v2_training_config_run_tenant_fk FOREIGN KEY (organization_id, training_run_id) REFERENCES v2_training_runs(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_benchmark_version_tenant_fk') THEN ALTER TABLE v2_olfactory_benchmarks ADD CONSTRAINT v2_benchmark_version_tenant_fk FOREIGN KEY (organization_id, dataset_version_id) REFERENCES v2_dataset_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_benchmark_split_tenant_fk') THEN ALTER TABLE v2_olfactory_benchmarks ADD CONSTRAINT v2_benchmark_split_tenant_fk FOREIGN KEY (organization_id, split_id) REFERENCES v2_dataset_splits(organization_id, id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_fusion_benchmark_tenant_fk') THEN ALTER TABLE v2_fusion_experiments ADD CONSTRAINT v2_fusion_benchmark_tenant_fk FOREIGN KEY (organization_id, benchmark_id) REFERENCES v2_olfactory_benchmarks(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_odor_embedding_material_tenant_fk') THEN ALTER TABLE v2_model_odor_embeddings ADD CONSTRAINT v2_model_odor_embedding_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_odor_embedding_model_tenant_fk') THEN ALTER TABLE v2_model_odor_embeddings ADD CONSTRAINT v2_model_odor_embedding_model_tenant_fk FOREIGN KEY (organization_id, model_version_id) REFERENCES v2_model_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_odor_embedding_benchmark_tenant_fk') THEN ALTER TABLE v2_model_odor_embeddings ADD CONSTRAINT v2_model_odor_embedding_benchmark_tenant_fk FOREIGN KEY (organization_id, benchmark_id) REFERENCES v2_olfactory_benchmarks(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_odor_prediction_material_tenant_fk') THEN ALTER TABLE v2_model_odor_predictions ADD CONSTRAINT v2_model_odor_prediction_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_odor_prediction_model_tenant_fk') THEN ALTER TABLE v2_model_odor_predictions ADD CONSTRAINT v2_model_odor_prediction_model_tenant_fk FOREIGN KEY (organization_id, model_version_id) REFERENCES v2_model_versions(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_model_odor_prediction_benchmark_tenant_fk') THEN ALTER TABLE v2_model_odor_predictions ADD CONSTRAINT v2_model_odor_prediction_benchmark_tenant_fk FOREIGN KEY (organization_id, benchmark_id) REFERENCES v2_olfactory_benchmarks(organization_id, id) ON DELETE RESTRICT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_provenance_draft_tenant_fk') THEN ALTER TABLE v2_formula_provenance ADD CONSTRAINT v2_formula_provenance_draft_tenant_fk FOREIGN KEY (organization_id, formula_draft_id) REFERENCES v2_formula_drafts(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_formula_provenance_version_tenant_fk') THEN ALTER TABLE v2_formula_provenance ADD CONSTRAINT v2_formula_provenance_version_tenant_fk FOREIGN KEY (organization_id, formula_version_id) REFERENCES v2_formula_versions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_constraint_project_tenant_fk') THEN ALTER TABLE v2_design_constraint_snapshots ADD CONSTRAINT v2_constraint_project_tenant_fk FOREIGN KEY (organization_id, design_project_id) REFERENCES v2_design_projects(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_constraint_brief_tenant_fk') THEN ALTER TABLE v2_design_constraint_snapshots ADD CONSTRAINT v2_constraint_brief_tenant_fk FOREIGN KEY (organization_id, brief_version_id) REFERENCES v2_design_brief_versions(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_candidate_evaluation_tenant_fk') THEN ALTER TABLE v2_design_candidate_evaluations ADD CONSTRAINT v2_candidate_evaluation_tenant_fk FOREIGN KEY (organization_id, candidate_id) REFERENCES v2_design_candidates(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_candidate_share_tenant_fk') THEN ALTER TABLE v2_design_recipient_shares ADD CONSTRAINT v2_candidate_share_tenant_fk FOREIGN KEY (organization_id, candidate_id) REFERENCES v2_design_candidates(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_candidate_feedback_tenant_fk') THEN ALTER TABLE v2_design_feedback ADD CONSTRAINT v2_candidate_feedback_tenant_fk FOREIGN KEY (organization_id, candidate_id) REFERENCES v2_design_candidates(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_job_run_tenant_fk') THEN ALTER TABLE v2_agent_jobs ADD CONSTRAINT v2_agent_job_run_tenant_fk FOREIGN KEY (organization_id, run_id) REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_event_run_tenant_fk') THEN ALTER TABLE v2_agent_events ADD CONSTRAINT v2_agent_event_run_tenant_fk FOREIGN KEY (organization_id, run_id) REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_tool_run_tenant_fk') THEN ALTER TABLE v2_agent_tool_calls ADD CONSTRAINT v2_agent_tool_run_tenant_fk FOREIGN KEY (organization_id, run_id) REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_artifact_run_tenant_fk') THEN ALTER TABLE v2_agent_artifacts ADD CONSTRAINT v2_agent_artifact_run_tenant_fk FOREIGN KEY (organization_id, run_id) REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_agent_confirmation_run_tenant_fk') THEN ALTER TABLE v2_agent_confirmations ADD CONSTRAINT v2_agent_confirmation_run_tenant_fk FOREIGN KEY (organization_id, run_id) REFERENCES v2_agent_runs(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_evidence_source_material_tenant_fk') THEN ALTER TABLE v2_material_evidence_sources ADD CONSTRAINT v2_evidence_source_material_tenant_fk FOREIGN KEY (organization_id, material_id) REFERENCES v2_materials(organization_id, id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v2_evidence_chunk_source_tenant_fk') THEN ALTER TABLE v2_material_evidence_chunks ADD CONSTRAINT v2_evidence_chunk_source_tenant_fk FOREIGN KEY (organization_id, source_id) REFERENCES v2_material_evidence_sources(organization_id, id) ON DELETE CASCADE; END IF;
END $$;
