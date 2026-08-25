# OSMO Demo Runtime Bridge Audit

GOAL_ID=OSMO-DEMO-RUNTIME-BRIDGE-FIX-20260825
AUDIT_BASE_SHA=42bfcc80d763686499f3654715d49f461a9e3587

API_WORKER_ENTRYPOINT=worker/v2-api/index.ts
API_WORKER_SERVICE_FACTORY=worker/v2-api/service-container.ts:createV2ApiServices
CURRENT_WORKER_ODOR_RUNTIME=OdorPredictionRuntimeUnavailable through the OlfactoryIntelligenceService default constructor argument
CLOUD_RUNTIME_ENTRYPOINT=worker/cloud-runtime/index.ts
MODEL_SMOKE_ENTRYPOINT=worker/cloud-runtime/scientific-workflow.ts:ScientificJobWorkflow using ScientificModelContainer.runScientificJob
PRIVATE_CONTAINER_BINDING=SCIENTIFIC_MODEL_CONTAINER
CURRENT_SECRET_OWNER=Cloud Runtime binding SCIENTIFIC_CONTAINER_SHARED_SECRET, injected into the private container as SCIENTIFIC_SERVICE_SHARED_SECRET
CURRENT_MODEL_CONTAINER_ROUTE=POST /v1/predictions in services/scientific/model-runtime/model_runtime_server.py
CURRENT_FAIL_CLOSED_PATH=worker/v2-api/service-container.ts omits OdorPredictionRuntime, so predictOdor returns MODEL_RUNTIME_NOT_CONFIGURED
RECOMMENDED_MINIMAL_BRIDGE=Inject an OdorPredictionRuntime adapter backed by the existing CLOUD_RUNTIME service binding; add one strict internal Cloud Runtime prediction operation that invokes ScientificModelContainer POST /v1/predictions and validates the bounded response

## Boundary Findings

- The browser-facing route already authenticates the session, requires `materials.viewSensitive` and `scientific_ai.predict`, and resolves tenant-scoped material and research-model evidence before runtime invocation.
- The API Worker already binds `CLOUD_RUNTIME`; no public hostname or client-visible model URL is required.
- Cloud Runtime already owns the scientific-container secret and the private `SCIENTIFIC_MODEL_CONTAINER` Durable Object binding.
- `MODEL_SMOKE` is a queued evidence operation that invokes `/v1/jobs`. It must remain unchanged and must not be reused as synchronous prediction.
- The private model image already implements the allow-listed, bounded `POST /v1/predictions` route and rejects arbitrary fields, model versions, paths, URLs, and targets.
- A synchronous internal transport can reuse the existing container lane and startup lifecycle while keeping tenant authorization above the transport.

## Minimal Contract

The API Worker sends only a strict versioned envelope containing `modelVersionId`, `canonicalSmiles`, and optional unique `requestedTargets` through the existing `CLOUD_RUNTIME` binding. Cloud Runtime validates that envelope, injects its server-side secret at the container boundary, validates the container result with `odorResearchPredictionSchema`, and returns only the normalized prediction or a stable safe error code.

No scientific artifact, model image, database schema, public route, public hostname, or secret value changes are required.
