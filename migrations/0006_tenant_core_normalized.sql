CREATE TABLE IF NOT EXISTS tenant_organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  primary_contact TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_organizations_status
  ON tenant_organizations(status);

CREATE TABLE IF NOT EXISTS tenant_brands (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  default_currency TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_brands_org_status
  ON tenant_brands(organization_id, status);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  brand_ids_json TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  last_active_at TEXT NOT NULL,
  invited_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_org_status
  ON tenant_memberships(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_email
  ON tenant_memberships(email);

CREATE TABLE IF NOT EXISTS role_policies (
  role TEXT NOT NULL,
  scope TEXT NOT NULL,
  mfa_required INTEGER NOT NULL DEFAULT 0,
  permissions_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (role, scope)
);

CREATE INDEX IF NOT EXISTS idx_role_policies_scope
  ON role_policies(scope);
