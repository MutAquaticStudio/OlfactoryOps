# V2 Phase 1 Domain Routing

The tenant router accepts configured V2 workspace base domains in addition to the legacy router domain. The V2 platform service resolves the exact hostname registry in PostgreSQL; the edge router change is a compatibility boundary only in this phase.

States:

`PENDING → PENDING_VALIDATION → PENDING_SSL → ACTIVE`

Failure and archival states cannot serve an authenticated workspace. Unknown, reserved, malformed, or mismatched hosts return a non-cacheable safe error. `X-Organization-ID` and similar public headers never participate in resolution.

Cloudflare for SaaS is an adapter boundary only in this phase. No production DNS, custom hostname, or provider resource is created.
