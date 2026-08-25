# Private Research Odor Runtime Bridge

MODEL_RUNTIME_DEPLOYMENT_REQUIRED=YES

## Request Path

```text
Browser
  -> authenticated V2 API Worker
  -> OlfactoryIntelligenceService
  -> CloudflareOdorPredictionRuntime
  -> CLOUD_RUNTIME service binding
  -> POST /internal/odor-prediction
  -> SCIENTIFIC_MODEL_CONTAINER
  -> POST /v1/predictions
  -> validated OdorResearchPrediction
  -> tenant-scoped evidence verification and persistence
```

The browser can call only the existing authenticated V2 Olfactory Intelligence route. Cloud Runtime has no public route, `workers.dev` endpoint, or custom domain, and the model container is reachable only through its Durable Object binding.

## Bindings And Secret Ownership

- API Worker binding: `CLOUD_RUNTIME`, targeting the environment's private Cloud Runtime Worker.
- Cloud Runtime container binding: `SCIENTIFIC_MODEL_CONTAINER`.
- Cloud Runtime secret binding: `SCIENTIFIC_CONTAINER_SHARED_SECRET`.
- Model container environment name: `SCIENTIFIC_SERVICE_SHARED_SECRET`.

The API Worker does not receive the model-container secret. Cloud Runtime injects it only into the private `x-olfactoryops-scientific-key` header. No secret, container URL, or internal binding name is exposed through browser configuration.

## Protocol Bounds

The internal `ODOR_PREDICTION` envelope uses `cloud-runtime/v1` and accepts exactly one molecule:

- `modelVersionId`: 1-160 characters.
- `canonicalSmiles`: 1-4096 characters with no control characters.
- `requestedTargets`: optional, 1-20 unique allow-shaped descriptor keys.
- request body: at most 16,384 bytes.
- response body: at most 65,536 bytes and at most 20 predictions.

Unknown fields, arbitrary model paths, URLs, module names, commands, and dataset payloads are rejected before container execution. The response is validated by `odorResearchPredictionSchema` both at Cloud Runtime and at the API Worker adapter.

## Timeout Policy

The model container startup remains bounded at 300 seconds. Once healthy, a prediction response is bounded at 30 seconds. The API Worker allows 330 seconds for the complete internal service-binding call, covering the existing cold-start ceiling plus the prediction window without changing the Node/Nest HTTP runtime's 12-second policy.

## Safe Error Mapping

- container `409` -> `MODEL_NOT_EVALUATED`
- container `413` or `422` -> `MODEL_RUNTIME_INVALID_INPUT`
- missing runtime secret or container `503` -> `MODEL_RUNTIME_NOT_CONFIGURED`
- bounded timeout -> `MODEL_RUNTIME_TIMEOUT`
- malformed, oversized, or opaque failures -> `MODEL_RUNTIME_UNAVAILABLE`

Raw Python exceptions, TensorFlow errors, filesystem paths, internal addresses, and secret values are never returned.

## Fail-Closed Application Boundary

Tenant authorization stays above the transport. Before model execution, `OlfactoryIntelligenceService` still requires both `materials.viewSensitive` and `scientific_ai.predict`, a tenant-owned resolved molecular identity, an eligible tenant-owned RESEARCH model, verified checkpoint, successful training, and PASS leakage evidence. BLOCKED evaluation and BLOCKED or REVOKED checkpoints remain ineligible.

If `CLOUD_RUNTIME` is absent, the Worker injects `OdorPredictionRuntimeUnavailable`; it never fabricates prediction output. Existing Node/Nest `OdorPredictionHttpRuntime` and queued `MODEL_SMOKE` behavior remain separate and unchanged.

## Later Staging Deployment Prerequisites

1. Deploy the existing private scientific model image containing the frozen research checkpoint.
2. Bind `SCIENTIFIC_MODEL_CONTAINER` in Cloud Runtime.
3. Configure `SCIENTIFIC_CONTAINER_SHARED_SECRET` on Cloud Runtime only.
4. Bind API Worker `CLOUD_RUNTIME` to the matching private Cloud Runtime service.
5. Verify private prediction transport independently of `/health` and `MODEL_SMOKE`.

This code-fix goal performs none of those remote operations.
