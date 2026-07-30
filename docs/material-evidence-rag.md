# Controlled Material Evidence RAG

## Purpose

Material Evidence is a retrieval layer for approved material profiles, reviewed
SDS/CoA/IFRA/allergen documents, and explicitly tagged supplier catalogues. It
returns bounded citations; it does not make regulatory, formula, stock, or cost
decisions. Those decisions remain in the deterministic domain services.

## Trust Boundary

- D1 stores tenant-scoped source metadata, review state, chunk excerpts, jobs,
  and audit evidence.
- Private document content is read only inside the Worker from `DOCUMENTS`.
  Signed download URLs are never used for indexing.
- Workers AI creates embeddings and converts text-bearing PDFs to Markdown.
  Scanned PDFs are not OCR'd in this version.
- Vectorize stores only bounded vectors and filter metadata. Every vector match
  is rechecked in D1 for organization, approval, and current source state.
- The browser receives only safe citations: source title, version, optional
  page/section, and a bounded excerpt. It never receives embeddings, source
  files, provider errors, storage keys, or bindings.

## Source Lifecycle

1. An eligible material profile can be queued for indexing by a user with
   `documents.manage`.
2. An eligible document must be `APPROVED` or `SHARED`, have a clean scan, and
   be SDS, CoA, IFRA, Allergen Declaration, or tagged `catalogue`/
   `supplier-catalogue`.
3. A text-bearing PDF is extracted into a private review record. A manager must
   submit reviewed text before embeddings are made.
4. Sources move through `QUEUED`, `REVIEW_REQUIRED`, `READY`, `NOT_INDEXED`,
   `NOT_CONFIGURED`, `FAILED`, or `INVALIDATED`.
5. Archive, infected scan, or explicit invalidation removes vectors through a
   durable job. D1 also rejects stale matches before citations are returned.

## Access Control

- Queries require both `materials.view` and `documents.view`.
- Queue, extraction review, retry, and invalidation require `documents.manage`.
- Formula Agent, Design Studio, and Optimizer call retrieval only with those
  permissions and render `Not evaluated` when evidence is unavailable.
- Brand projections do not receive sensitive composition, cost, lot, CAS, raw
  compliance warnings, or document evidence.

## Cloudflare Setup

Create two Vectorize indexes before binding a Worker. The current embedding
model is `@cf/baai/bge-base-en-v1.5`, which uses 768 dimensions and cosine
metric.

```powershell
npx.cmd wrangler vectorize create olfactoryops-material-evidence-test --dimensions=768 --metric=cosine
npx.cmd wrangler vectorize create olfactoryops-material-evidence --dimensions=768 --metric=cosine
npx.cmd wrangler vectorize create-metadata-index olfactoryops-material-evidence-test --propertyName=organizationId --type=string
npx.cmd wrangler vectorize create-metadata-index olfactoryops-material-evidence-test --propertyName=status --type=string
npx.cmd wrangler vectorize create-metadata-index olfactoryops-material-evidence-test --propertyName=materialId --type=string
npx.cmd wrangler vectorize create-metadata-index olfactoryops-material-evidence-test --propertyName=documentId --type=string
npx.cmd wrangler vectorize create-metadata-index olfactoryops-material-evidence-test --propertyName=sourceKind --type=string
npx.cmd wrangler vectorize create-metadata-index olfactoryops-material-evidence-test --propertyName=indexVersion --type=number
```

Repeat metadata indexes for production. Add the `AI` and `RAG_INDEX` bindings
in the matching Wrangler configuration, apply migration `0033` to the target
D1 database, then deploy the Worker. Until both bindings exist, the API returns
`Not configured` and does not produce synthetic citations.

## Operational Limits

- Queries: 320 characters, up to 12 material filters, and top-K of 8.
- Chunks: 1,200 characters with a small overlap, maximum 48 chunks/source.
- Returned excerpts: 700 characters maximum.
- Jobs: lease-fenced, at most 3 attempts, and bounded retry backoff.
- Audit: query hashes, count/status, and correlation identifiers only; no raw
  document text or provider error payload is recorded.
