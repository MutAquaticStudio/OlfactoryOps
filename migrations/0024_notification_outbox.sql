CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  href TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  email_status TEXT NOT NULL,
  email_error TEXT,
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_last_attempt_at TEXT,
  email_next_attempt_at TEXT,
  email_sent_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_recipient
  ON notification_outbox(organization_id, recipient_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_due
  ON notification_outbox(email_status, email_next_attempt_at);
