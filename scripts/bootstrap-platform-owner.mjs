import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

export const platformOwnerAdvisoryLockSql = "SELECT pg_advisory_xact_lock(hashtext('olfactoryops:v2:platform-owner-bootstrap'))"
export const platformOwnerInsertSql = `
  INSERT INTO v2_platform_operators (id, user_id, role_key, status, mfa_required, created_by)
  VALUES ($1, $2, 'PLATFORM_OWNER', 'ACTIVE', true, $2)
  ON CONFLICT (role_key) WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE' DO NOTHING
  RETURNING id
`

class BootstrapFailure extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.exitCode = exitCode
  }
}

export function bootstrapConfig(environment = process.env) {
  const email = environment.PLATFORM_OWNER_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  const confirmation = environment.CONFIRM_PLATFORM_OWNER_BOOTSTRAP
  const databaseUrl = environment.PLATFORM_BOOTSTRAP_DATABASE_URL
  const deploymentEnvironment = environment.PLATFORM_OWNER_BOOTSTRAP_ENVIRONMENT
  const approval = environment.V2_PRODUCTION_PLATFORM_OWNER_BOOTSTRAP_APPROVED

  if (!email || confirmation !== 'ASSIGN_PLATFORM_OWNER' || !databaseUrl || deploymentEnvironment !== 'production' || approval !== 'ASSIGN_PLATFORM_OWNER') {
    throw new BootstrapFailure('BOOTSTRAP_REQUIRED_PROTECTED_INPUTS', 2)
  }

  let parsedDatabase
  try { parsedDatabase = new URL(databaseUrl) } catch { throw new BootstrapFailure('BOOTSTRAP_DATABASE_URL_INVALID', 2) }
  if (!['postgres:', 'postgresql:'].includes(parsedDatabase.protocol) || ['localhost', '127.0.0.1', '::1'].includes(parsedDatabase.hostname)) {
    throw new BootstrapFailure('BOOTSTRAP_DATABASE_ORIGIN_INVALID', 2)
  }

  return { email, databaseUrl }
}

export function safeBootstrapFailure(error) {
  const message = error instanceof Error ? error.message : ''
  return [
    'BOOTSTRAP_REQUIRED_PROTECTED_INPUTS',
    'BOOTSTRAP_DATABASE_URL_INVALID',
    'BOOTSTRAP_DATABASE_ORIGIN_INVALID',
    'BOOTSTRAP_USER_NOT_UNIQUE_OR_UNVERIFIED',
    'BOOTSTRAP_OWNER_ALREADY_ASSIGNED',
  ].includes(message) ? message : 'BOOTSTRAP_TRANSACTION_FAILED'
}

export async function assignPlatformOwner(client, email) {
  await client.$transaction(async (tx) => {
    // This command is deliberately for a dedicated migration/admin connection,
    // never the Hyperdrive application role. No email is printed.
    await tx.$queryRawUnsafe(platformOwnerAdvisoryLockSql)
    const users = await tx.$queryRawUnsafe('SELECT id FROM v2_users WHERE email = $1 AND verified_at IS NOT NULL LIMIT 2', email)
    if (users.length !== 1) throw new BootstrapFailure('BOOTSTRAP_USER_NOT_UNIQUE_OR_UNVERIFIED')
    const existing = await tx.$queryRawUnsafe("SELECT id FROM v2_platform_operators WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE' LIMIT 1")
    if (existing.length) throw new BootstrapFailure('BOOTSTRAP_OWNER_ALREADY_ASSIGNED')
    const userId = users[0].id
    const inserted = await tx.$queryRawUnsafe(
      platformOwnerInsertSql,
      `pop_${randomUUID().replace(/-/g, '').slice(0, 24)}`, userId,
    )
    if (inserted.length !== 1) throw new BootstrapFailure('BOOTSTRAP_OWNER_ALREADY_ASSIGNED')
    await tx.$executeRawUnsafe(
      `INSERT INTO v2_platform_audit_events (id, actor_user_id, actor_role, action, outcome, subject_type, subject_id, reason, correlation_id)
       VALUES ($1, $2, 'PLATFORM_OWNER', 'platform.owner.bootstrap', 'ALLOWED', 'platform_operator', $3, 'protected one-time bootstrap', $4)`,
      `pae_${randomUUID().replace(/-/g, '').slice(0, 24)}`, userId, userId, randomUUID(),
    )
  })
}

export async function main(environment = process.env) {
  let client
  try {
    const { email, databaseUrl } = bootstrapConfig(environment)
    client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    await assignPlatformOwner(client, email)
    console.log('PLATFORM_OWNER_BOOTSTRAP=PASS')
  } catch (error) {
    const failure = safeBootstrapFailure(error)
    const outcome = error instanceof BootstrapFailure ? 'BLOCKED' : 'FAIL'
    console.error(`PLATFORM_OWNER_BOOTSTRAP=${outcome} ${failure}`)
    process.exitCode = error instanceof BootstrapFailure ? error.exitCode : 1
  } finally {
    await client?.$disconnect().catch(() => undefined)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
