CREATE TABLE IF NOT EXISTS billing_provider_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_provider_events_received_at
  ON billing_provider_events (received_at);
