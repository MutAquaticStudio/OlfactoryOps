# Competitive Moat: Risk Register

| Risk | Control | Status |
| --- | --- | --- |
| Cross-tenant brief access | Session-derived organization scope on every query and mutation | Required |
| Hidden inference of business constraints | Manual-only structured review while provider mode is disabled | Required |
| Legacy project regression | Explicit legacy version state and compatibility generation path | Required |
| Duplicate brief writes | Existing route-scoped idempotency plus database uniqueness | Required |
| Mutable historic input | Immutable append-only brief versions with checksums | Required |
| Sensitive prompt or provider leakage | Persist raw user brief only; never persist provider reasoning, headers, or errors | Required |
| Candidate generation without review | Server-side reviewed-version gate for newly created projects | Required |
| Local/Worker behavior drift | Shared contracts and focused parity tests | In progress |

No security control in this checkpoint grants formula, material, costing,
inventory, or approval permissions beyond the existing permission matrix.
