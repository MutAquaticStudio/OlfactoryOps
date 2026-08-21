# Phase 5B Consumer Intelligence

## Scope

Phase 5B turns authorized consumer or brand feedback into tenant-private,
bounded advisory evidence. It is a distinct domain from Trial/Sensory,
Material Evidence RAG, and Olfactory Intelligence. It cannot create, edit,
approve, or consume a Formula, Material, Lot, or Production record.

## Data boundary

`v2_feedback_items` stores only an external-reference hash, content hash,
private storage reference, consent-proof hash, retention expiry, and language
hint. It stores no feedback text. All API contracts are strict and reject an
unexpected raw-text field.

Structured analyses retain a provider/model/extraction version, language,
overall sentiment, aspect, perception, descriptor signals and an explicit
evidence status. A preference vector aggregates only signal values from active
tenant sources; it records source-set hash, vocabulary, aggregation version,
time window and count. Fewer than three eligible analyses yields
`NOT_ENOUGH_EVIDENCE` rather than a consumer preference claim.

## Authorization and invalidation

- `sentiment.manageSources`: create and invalidate sources.
- `sentiment.analyze`: ingest hash/reference records, record structured
  analysis, and aggregate a vector.
- `sentiment.view`: retrieve safe aggregate evidence.
- `sentiment.viewRaw`: reserved for an explicitly authorized future raw-content
  adapter; Phase 5B exposes no raw-content endpoint.

Every mutation requires session-derived tenant context, CSRF/origin validation,
an idempotency key and audit evidence. Source invalidation marks dependent
analyses and every vector containing that source `INVALIDATED`. RLS and
composite foreign keys prevent cross-tenant attachment.

## Provider boundary

No NLP or external LLM is enabled. `provider` and `modelVersion` document a
reviewed/manual structured analysis only; they do not prove model execution.
Future provider work must respect consent, retention, provenance, source
invalidation and the same safe aggregate projection.
