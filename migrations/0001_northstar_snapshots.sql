CREATE TABLE IF NOT EXISTS northstar_snapshots (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_northstar_snapshots_updated_at
  ON northstar_snapshots(updated_at);
