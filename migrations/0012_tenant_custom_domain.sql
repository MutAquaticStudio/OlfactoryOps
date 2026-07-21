ALTER TABLE tenant_organizations ADD COLUMN custom_domain TEXT;

CREATE INDEX IF NOT EXISTS idx_tenant_organizations_custom_domain
  ON tenant_organizations(custom_domain);
