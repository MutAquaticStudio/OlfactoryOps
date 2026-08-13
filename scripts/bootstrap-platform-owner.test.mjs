import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  assignPlatformOwner,
  bootstrapConfig,
  platformOwnerAdvisoryLockSql,
  platformOwnerInsertSql,
  safeBootstrapFailure,
} from './bootstrap-platform-owner.mjs'

const validEnvironment = {
  PLATFORM_OWNER_BOOTSTRAP_EMAIL: 'Owner@example.test',
  CONFIRM_PLATFORM_OWNER_BOOTSTRAP: 'ASSIGN_PLATFORM_OWNER',
  PLATFORM_BOOTSTRAP_DATABASE_URL: 'postgresql://admin:fixture@db.example.invalid:6543/olfactoryops',
  PLATFORM_OWNER_BOOTSTRAP_ENVIRONMENT: 'production',
  V2_PRODUCTION_PLATFORM_OWNER_BOOTSTRAP_APPROVED: 'ASSIGN_PLATFORM_OWNER',
}

test('Platform Owner bootstrap accepts only complete production inputs', () => {
  const config = bootstrapConfig(validEnvironment)

  expect(config.email).toBe('owner@example.test')
  expect(config.databaseUrl).toBe(validEnvironment.PLATFORM_BOOTSTRAP_DATABASE_URL)
  for (const [name, value] of [
    ['PLATFORM_OWNER_BOOTSTRAP_EMAIL', ''],
    ['CONFIRM_PLATFORM_OWNER_BOOTSTRAP', 'wrong'],
    ['PLATFORM_BOOTSTRAP_DATABASE_URL', ''],
    ['PLATFORM_OWNER_BOOTSTRAP_ENVIRONMENT', 'staging'],
    ['V2_PRODUCTION_PLATFORM_OWNER_BOOTSTRAP_APPROVED', 'wrong'],
  ]) {
    expect(() => bootstrapConfig({ ...validEnvironment, [name]: value })).toThrow('BOOTSTRAP_REQUIRED_PROTECTED_INPUTS')
  }
  expect(() => bootstrapConfig({ ...validEnvironment, PLATFORM_BOOTSTRAP_DATABASE_URL: 'https://db.example.invalid' })).toThrow('BOOTSTRAP_DATABASE_ORIGIN_INVALID')
  expect(() => bootstrapConfig({ ...validEnvironment, PLATFORM_BOOTSTRAP_DATABASE_URL: 'postgresql://admin:fixture@127.0.0.1/olfactoryops' })).toThrow('BOOTSTRAP_DATABASE_ORIGIN_INVALID')
})

test('Platform Owner bootstrap serializes the ceremony and handles the database invariant conflict', async () => {
  const calls = []
  const client = {
    async $transaction(callback) {
      return callback({
        async $executeRawUnsafe(query) {
          calls.push(query)
        },
        async $queryRawUnsafe(query) {
          calls.push(query)
          if (query === platformOwnerAdvisoryLockSql) return []
          if (query.includes('FROM v2_users')) return [{ id: 'usr_owner' }]
          if (query.includes('FROM v2_platform_operators')) return []
          if (query.includes('RETURNING id')) return []
          return []
        },
      })
    },
  }

  await expect(assignPlatformOwner(client, 'owner@example.test')).rejects.toThrow('BOOTSTRAP_OWNER_ALREADY_ASSIGNED')
  expect(calls[0]).toBe(platformOwnerAdvisoryLockSql)
  expect(platformOwnerInsertSql).toContain("ON CONFLICT (role_key) WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE' DO NOTHING")
})

test('Platform Owner bootstrap redacts unexpected database failures', () => {
  expect(safeBootstrapFailure(new Error('password authentication failed for owner@example.test'))).toBe('BOOTSTRAP_TRANSACTION_FAILED')
  expect(safeBootstrapFailure(new Error('BOOTSTRAP_OWNER_ALREADY_ASSIGNED'))).toBe('BOOTSTRAP_OWNER_ALREADY_ASSIGNED')
})

test('Platform Owner uniqueness migration is immutable and registered in each V2 chain', () => {
  const migration = readFileSync('infra/postgres/migrations/0025_platform_owner_bootstrap_guard.sql', 'utf8')

  expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS v2_platform_operators_single_active_owner')
  expect(migration).toContain("WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE'")
  for (const file of [
    'scripts/apply-v2-production-migrations.mjs',
    'scripts/apply-v2-staging-migrations.mjs',
    'scripts/verify-v2-postgres.mjs',
    'scripts/verify-v2-rls.ts',
  ]) {
    expect(readFileSync(file, 'utf8')).toContain('infra/postgres/migrations/0025_platform_owner_bootstrap_guard.sql')
  }
})
