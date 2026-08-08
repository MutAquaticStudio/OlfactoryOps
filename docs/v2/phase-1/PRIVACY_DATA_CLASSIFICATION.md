# V2 Phase 1 Privacy And Data Classification

| Class | Examples | Export boundary |
|---|---|---|
| Personal account data | Profile, memberships, preferences, consent, security metadata | Privacy export |
| Tenant configuration | Branding, hostnames, billing capabilities, notifications | Workspace export with Owner/Admin permission |
| Tenant business IP | Formula, material, supplier, inventory, orders, production | Never included in privacy export |
| Security secrets | Password hashes, token hashes, provider credentials | Never exported |

Privacy export is subject-centric. Workspace export is tenant-scoped and separately authorized. Erasure requests enter review and do not automatically delete tenant business records.
