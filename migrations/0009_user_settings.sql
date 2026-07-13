CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  preferred_landing TEXT NOT NULL,
  ui_density TEXT NOT NULL,
  reduce_motion INTEGER NOT NULL DEFAULT 0,
  email_digest TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_settings_org_email ON user_settings(organization_id, email);
