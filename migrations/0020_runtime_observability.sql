CREATE TABLE IF NOT EXISTS runtime_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  route TEXT NOT NULL,
  status INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('error', 'latency'))
);

CREATE INDEX IF NOT EXISTS idx_runtime_events_occurred_at
  ON runtime_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_events_category_occurred_at
  ON runtime_events(category, occurred_at DESC);
