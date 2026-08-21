# V2 Phase 1 Tenant Model

`User` is global and may have many active `Membership` records. `Organization` is the workspace security boundary.

Every workspace receives a `DEFAULT` hostname `<slug>.olfactoryops.com`. Custom hostnames are separate registry records and are not `ACTIVE` until provider validation and SSL are confirmed.

The API derives organization from the authenticated membership and validated Host. `organization_id` from JSON, query strings, or public headers is ignored. Direct-ID reads fail closed when the record belongs to another organization.

V2 PostgreSQL is the only authoritative writer. Legacy D1 remains outside this Phase 1 boundary.
