-- System workspace addresses are allocated from the tenant slug. Customer-owned
-- domains use the same registry only after Cloudflare reports active SSL.
CREATE TABLE IF NOT EXISTS workspace_hostnames (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL COLLATE NOCASE UNIQUE,
  organization_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('SYSTEM', 'CUSTOM')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PENDING_VALIDATION', 'FAILED', 'ARCHIVED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  activated_at TEXT,
  archived_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES tenant_organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_hostnames_org_status
  ON workspace_hostnames(organization_id, status, kind);

CREATE INDEX IF NOT EXISTS idx_workspace_hostnames_active
  ON workspace_hostnames(hostname, status);

-- The historical organization slug has always been the stable, deterministic
-- source for the system hostname. The following is idempotent and never
-- replaces a hostname already owned by a different organization.
INSERT OR IGNORE INTO workspace_hostnames (
  id, hostname, organization_id, kind, status, created_at, updated_at, activated_at
)
SELECT
  'SYS-' || lower(replace(o.id, ' ', '-')),
  lower(o.slug) || '.labofscents.org',
  o.id,
  'SYSTEM',
  CASE WHEN o.status = 'ACTIVE' THEN 'ACTIVE' ELSE 'ARCHIVED' END,
  o.created_at,
  o.created_at,
  CASE WHEN o.status = 'ACTIVE' THEN o.created_at ELSE NULL END
FROM tenant_organizations o
WHERE
  length(o.slug) BETWEEN 1 AND 63
  AND lower(o.slug) NOT GLOB '*[^a-z0-9-]*'
  AND lower(o.slug) NOT LIKE '-%'
  AND lower(o.slug) NOT LIKE '%-'
  AND lower(o.slug) NOT IN (
    'api', 'app', 'auth', 'beta', 'customers', 'login', 'signup',
    'saas-origin', 'saas-origin-beta', 'status', 'test', 'www'
  );

-- Existing active customer domains remain valid. Pending provider records are
-- intentionally not exposed through this registry until activation completes.
INSERT OR IGNORE INTO workspace_hostnames (
  id, hostname, organization_id, kind, status, created_at, updated_at, activated_at
)
SELECT
  'CUS-' || lower(replace(o.id, ' ', '-')),
  lower(o.custom_domain),
  o.id,
  'CUSTOM',
  'ACTIVE',
  o.created_at,
  o.created_at,
  o.created_at
FROM tenant_organizations o
WHERE o.custom_domain IS NOT NULL AND trim(o.custom_domain) <> '';
