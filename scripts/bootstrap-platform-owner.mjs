import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const email = process.env.PLATFORM_OWNER_BOOTSTRAP_EMAIL?.trim().toLowerCase()
const confirmation = process.env.CONFIRM_PLATFORM_OWNER_BOOTSTRAP
const databaseUrl = process.env.PLATFORM_BOOTSTRAP_DATABASE_URL

if (!email || confirmation !== 'ASSIGN_PLATFORM_OWNER' || !databaseUrl) {
  console.error('PLATFORM_OWNER_BOOTSTRAP=BLOCKED required protected inputs are unavailable')
  process.exit(2)
}

const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
try {
  await client.$transaction(async (tx) => {
    // This command is deliberately for a dedicated migration/admin connection,
    // never the Hyperdrive application role. No email is printed.
    const users = await tx.$queryRawUnsafe('SELECT id FROM v2_users WHERE email = $1 AND verified_at IS NOT NULL LIMIT 2', email)
    if (users.length !== 1) throw new Error('BOOTSTRAP_USER_NOT_UNIQUE_OR_UNVERIFIED')
    const existing = await tx.$queryRawUnsafe("SELECT id FROM v2_platform_operators WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE' LIMIT 1")
    if (existing.length) throw new Error('BOOTSTRAP_OWNER_ALREADY_ASSIGNED')
    const userId = users[0].id
    await tx.$executeRawUnsafe(
      `INSERT INTO v2_platform_operators (id, user_id, role_key, status, mfa_required, created_by)
       VALUES ($1, $2, 'PLATFORM_OWNER', 'ACTIVE', true, $2)`,
      `pop_${randomUUID().replace(/-/g, '').slice(0, 24)}`, userId,
    )
    await tx.$executeRawUnsafe(
      `INSERT INTO v2_platform_audit_events (id, actor_user_id, actor_role, action, outcome, subject_type, subject_id, reason, correlation_id)
       VALUES ($1, $2, 'PLATFORM_OWNER', 'platform.owner.bootstrap', 'ALLOWED', 'platform_operator', $3, 'protected one-time bootstrap', $4)`,
      `pae_${randomUUID().replace(/-/g, '').slice(0, 24)}`, userId, userId, randomUUID(),
    )
  })
  console.log('PLATFORM_OWNER_BOOTSTRAP=PASS')
} catch (error) {
  console.error(`PLATFORM_OWNER_BOOTSTRAP=FAIL ${error instanceof Error ? error.message : 'UNKNOWN'}`)
  process.exitCode = 1
} finally {
  await client.$disconnect()
}
