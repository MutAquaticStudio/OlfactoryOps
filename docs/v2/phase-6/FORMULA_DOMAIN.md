# Formula Domain

`FormulaService` is the only writer for Formula Project, Draft, Component,
immutable Version, Review and Provenance records. Every mutating call requires
an authenticated tenant context, a permission, an idempotency key, a database
transaction and an audit event.

The only approval path is:

`DRAFT -> IN_REVIEW -> APPROVED VERSION`

The service recomputes a 100 percent composition at creation, replacement,
submission and approval. It rejects duplicate material IDs, duplicate positions,
inactive or blocked materials, invalid mass and invalid totals. It records
scaled mass deterministically and never reserves or consumes inventory.

The V2 UI calls the protected API for project creation, component editing,
validation, review, approval and rejection. Browser state is not authoritative.
