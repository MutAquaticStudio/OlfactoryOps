# Queue Infrastructure Boundary

Durable jobs use an outbox and lease-fenced worker model. Retries are bounded and idempotent. Cloudflare queues or PostgreSQL-backed workers may implement this later; no queue is activated in Phase 0.
