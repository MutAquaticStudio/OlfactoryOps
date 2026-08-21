# Security & Privacy Architecture — OlfactoryOps V2

> Product/security specification only. Jurisdiction-specific privacy and legal obligations require counsel review before commercial launch.

## 1. Security objectives

- strong tenant isolation
- least privilege
- secure session lifecycle
- immutable operational/audit evidence
- controlled AI tools
- provenance and dependency integrity
- minimized data leakage
- explicit failure states

## 2. Authentication

### Opaque session model

Client receives a high-entropy opaque token.

Server stores only a verifier/hash.

Never store:
- raw session token
- password
- provider API key
- raw password-reset token
- raw email-verification token

Session functions:
- rotation
- revoke current
- revoke others
- revoke all
- idle timeout
- absolute timeout
- re-auth for sensitive operations
- new-device signal
- credential-change invalidation

## 3. CSRF

Cookie-authenticated mutation requires:
- SameSite strategy
- CSRF token
- origin/host validation
- unsafe-method protection

Service/bearer authentication has a separate contract.

## 4. Authorization

Example permission vocabulary:
- `materials.view`
- `materials.edit`
- `materials.approve`
- `inventory.view`
- `inventory.receive`
- `inventory.consume`
- `formula.view`
- `formula.viewSensitive`
- `formula.edit`
- `formula.approve`
- `trials.view`
- `trials.evaluate`
- `production.release`
- `costing.view`
- `ai.scientific.use`
- `ai.agent.execute`
- `tenant.manage`
- `security.audit`
- `billing.manage`

Tool calls repeat authorization.

## 5. Tenant isolation

Never trust tenant IDs from public input.

Tenant context comes from:
- authenticated membership
- validated workspace Host
- explicit workspace switch validated against membership

Test each tenant-owned area against:
- cross-tenant direct ID
- list/search
- pagination
- cache key
- background job
- object storage
- vector retrieval
- agent tool
- lineage traversal

## 6. Custom domain security

- hostname uniqueness
- reserved names
- Cloudflare ownership/provider state
- SSL state
- DNS/DCV state
- authoritative registry
- archive/revoke
- default domain recovery

Never activate on user assertion.

## 7. Audit

Audit privileged:
- auth/security
- role policy
- tenant settings/domain
- material approval/compliance
- inventory adjustment
- procurement disposition
- Formula approval
- Trial decision
- production QC/release
- privacy/workspace export
- confirmed agent writes

Avoid in audit payload:
- secret
- raw session token
- full private document
- embedding
- hidden provider reasoning
- unnecessary personal/free text

## 8. Personal data categories

Potential personal/account data:
- name
- email
- avatar
- membership
- credential metadata
- sessions/devices
- preferences
- consent
- security events
- delivery metadata
- actor audit references

Potential sensory personal data:
- evaluator identity/pseudonymous reference
- scorecard/comment

Sensory identity receives strict projection control.

## 9. Tenant business IP

Examples:
- Formula composition
- briefs
- materials
- supplier pricing
- inventory
- trials
- production
- orders
- documents
- private model output
- private sensory memory

Personal Data Export is not a blanket export of tenant IP.

## 10. Export model

### Privacy Export
Subject-centric:
- profile
- preferences
- membership
- consent
- session/security metadata
- notification records
- attributable activity where policy requires

### Workspace Export
Organization-centric:
- Owner/Admin permission
- audited
- potentially asynchronous/encrypted
- documents handled separately

## 11. AI security

Prompt/document text is untrusted.

It cannot:
- name arbitrary tool
- switch tenant
- bypass permission
- execute SQL/shell
- make arbitrary network URL request

Each tool has:
- stable name/version
- input/output schema
- permission
- timeout
- max result
- retry
- read/write classification
- audit rule
- confirmation policy

## 12. RAG security

- approved sources only
- explicit tenant/global scope
- vector results re-authorized in source database
- bounded excerpts
- signed download URL is not indexing authority
- stale/invalidated source rejected
- document prompt injection is treated as content, not instruction

## 13. Scientific software supply chain

For Osmo/open-source components:
- pin tag/commit
- lock transitive dependencies
- preserve licenses/notices
- vulnerability scan
- build environment digest
- adapter compatibility tests
- no silent upstream update in production build

## 14. Secrets

Server-only:
- LLM API keys
- Cloudflare tokens
- email keys
- push private key
- DB/object credentials
- encryption/signing keys

No frontend environment variable may contain them.

## 15. Encryption

- TLS in transit
- managed encryption at rest
- application-level encryption where justified
- key version/rotation

## 16. Observability privacy

Do not log by default:
- passwords/tokens
- full Formula
- full SDS/CoA
- raw provider payload
- sensory comments
- embeddings

Prefer metadata/correlation IDs.

## 17. Release gates

- dependency/license audit
- secret scan
- authorization tests
- tenant isolation
- CSRF
- session lifecycle
- object/vector authorization
- agent tool security
- custom-domain ownership
- rate limits
- audit integrity
- backup/recovery test
