-- The first Platform Owner ceremony is intentionally one-time. Keep the
-- invariant in PostgreSQL so it also covers direct admin connections outside
-- of the dispatcher workflow.
CREATE UNIQUE INDEX IF NOT EXISTS v2_platform_operators_single_active_owner
  ON v2_platform_operators (role_key)
  WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE';
