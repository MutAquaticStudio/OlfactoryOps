import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import pg from 'pg'

const { Client } = pg

export const RC13_SHA = '09e96feacb9db03325683ee329fb269206a21880'
export const PASSWORD_RESET_MIGRATION_PATH = 'infra/postgres/migrations/0026_platform_password_resets.sql'
export const PASSWORD_RESET_MIGRATION_SHA256 = '851124f6275af657f121d03fd0a5c845fefd36fdf1eaea1451b2a63e5b3ed5ff'

class MigrationValidationError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

export function validateImmutableMigration(releaseSha, migrationSql) {
  if (releaseSha !== RC13_SHA) throw new MigrationValidationError('RELEASE_IDENTITY_INVALID')
  if (createHash('sha256').update(migrationSql).digest('hex') !== PASSWORD_RESET_MIGRATION_SHA256) {
    throw new MigrationValidationError('MIGRATION_SOURCE_INVALID')
  }
}

function readImmutableMigration(releaseSha) {
  try {
    return execFileSync('git', ['show', `${releaseSha}:${PASSWORD_RESET_MIGRATION_PATH}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    throw new MigrationValidationError('MIGRATION_SOURCE_UNAVAILABLE')
  }
}

function validateProductionDatabaseUrl(databaseUrl) {
  if (!databaseUrl) throw new MigrationValidationError('DATABASE_CONFIGURATION_MISSING')
  let database
  try {
    database = new URL(databaseUrl)
  } catch {
    throw new MigrationValidationError('DATABASE_CONFIGURATION_INVALID')
  }
  if (!['postgresql:', 'postgres:'].includes(database.protocol) || ['localhost', '127.0.0.1', '::1'].includes(database.hostname)) {
    throw new MigrationValidationError('DATABASE_CONFIGURATION_INVALID')
  }
}

export async function applyImmutablePasswordResetMigration({ releaseSha, databaseUrl }) {
  validateProductionDatabaseUrl(databaseUrl)
  const migrationSql = readImmutableMigration(releaseSha)
  validateImmutableMigration(releaseSha, migrationSql)

  const client = new Client({ connectionString: databaseUrl })
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query(migrationSql)
    const rlsResult = await client.query(`
      SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'v2_password_resets'
    `)
    const policyResult = await client.query(`
      SELECT count(*)::int AS count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'v2_password_resets'
        AND policyname = 'v2_tenant_scope'
    `)
    if (rlsResult.rows.length !== 1 || !rlsResult.rows[0].enabled || !rlsResult.rows[0].forced || policyResult.rows[0]?.count !== 1) {
      throw new MigrationValidationError('PASSWORD_RESET_RLS_INVALID')
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (error instanceof MigrationValidationError) throw error
    throw new MigrationValidationError('MIGRATION_EXECUTION_FAILED')
  } finally {
    await client.end().catch(() => undefined)
  }
}

function failureCode(error) {
  return error instanceof MigrationValidationError ? error.code : 'MIGRATION_EXECUTION_FAILED'
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1].replaceAll('\\', '/')) {
  const releaseSha = process.env.RELEASE_SHA
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL
  if (process.env.V2_RC13_PASSWORD_RESET_MIGRATION_APPROVED !== 'APPLY_RC13_PASSWORD_RESET_MIGRATION') {
    console.log('RC13_PASSWORD_RESET_MIGRATION=FAIL')
    console.log('RC13_PASSWORD_RESET_MIGRATION_FAILURE=APPROVAL_REQUIRED')
    process.exitCode = 1
  } else {
    applyImmutablePasswordResetMigration({ releaseSha, databaseUrl })
      .then(() => {
        console.log('RC13_PASSWORD_RESET_MIGRATION=PASS')
        console.log('RC13_PASSWORD_RESET_RLS=PASS')
      })
      .catch((error) => {
        console.log('RC13_PASSWORD_RESET_MIGRATION=FAIL')
        console.log(`RC13_PASSWORD_RESET_MIGRATION_FAILURE=${failureCode(error)}`)
        process.exitCode = 1
      })
  }
}
