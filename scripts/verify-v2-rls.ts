import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { PrismaPlatformRepository } from '../services/platform/src/prisma-repository.js'
import { PlatformService } from '../services/platform/src/service.js'

const localTestDatabaseUrl = 'postgresql://olfactoryops:olfactoryops@127.0.0.1:5432/olfactoryops'
const databaseUrl = process.env.V2_QA_DATABASE_URL || process.env.V2_DATABASE_URL || process.env.DATABASE_URL || (process.env.V2_QA_ENVIRONMENT === 'test' ? localTestDatabaseUrl : undefined)

if (!databaseUrl) throw new Error('V2_RLS=BLOCKED configure V2_QA_DATABASE_URL for a disposable PostgreSQL instance.')
if (process.env.V2_QA_ENVIRONMENT !== 'test') throw new Error('V2_RLS=BLOCKED V2_QA_ENVIRONMENT=test is required.')

const parsedDatabaseUrl = new URL(databaseUrl)
if (!['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname)) throw new Error('V2_RLS=FAIL refusing a non-loopback PostgreSQL instance.')

const prismaCli = path.resolve('node_modules/prisma/build/index.js')

function executePrisma(url: string, statement?: string, migration?: string) {
  const args = [prismaCli, 'db', 'execute', '--url', url]
  if (migration) args.push('--file', migration)
  else args.push('--stdin')
  execFileSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    input: statement,
    stdio: 'inherit',
  })
}

function applyMigrations() {
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0001_platform_security_core.sql')
  executePrisma(databaseUrl, undefined, 'infra/postgres/migrations/0002_phase1_members_notifications.sql')
}

const applicationUrl = new URL(databaseUrl)
applicationUrl.username = 'v2_app'
applicationUrl.password = 'v2_app'

let adminClient: PrismaClient | undefined
let appClient: PrismaClient | undefined
let firstOrganizationId: string | undefined
let secondOrganizationId: string | undefined
let firstUserId: string | undefined
let secondUserId: string | undefined

async function configureApplicationRole() {
  if (!adminClient) throw new Error('V2_RLS=FAIL disposable database was not initialized.')
  await adminClient.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v2_app') THEN
        CREATE ROLE v2_app LOGIN PASSWORD 'v2_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      ELSE
        ALTER ROLE v2_app LOGIN PASSWORD 'v2_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
    END
    $$;
  `)
  await adminClient.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO v2_app')
  await adminClient.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO v2_app')
  await adminClient.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO v2_app')
  const roles = await adminClient.$queryRawUnsafe<Array<{ rolbypassrls: boolean; rolsuper: boolean }>>("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'v2_app'")
  if (roles.length !== 1 || roles[0].rolbypassrls || roles[0].rolsuper) throw new Error('V2_RLS=FAIL application role is not constrained by RLS.')
}

async function scopedMembershipCount(organizationId?: string, userId?: string) {
  if (!appClient) throw new Error('V2_RLS=FAIL application client was not initialized.')
  return appClient.$transaction(async (tx) => {
    if (organizationId) await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", organizationId)
    if (userId) await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", userId)
    return tx.membership.count()
  })
}

async function removeTestFixtures() {
  if (!adminClient) return
  await adminClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE v2_audit_events DISABLE TRIGGER v2_audit_append_only')
    try {
      if (secondOrganizationId) await tx.organization.deleteMany({ where: { id: secondOrganizationId } })
      if (firstOrganizationId) await tx.organization.deleteMany({ where: { id: firstOrganizationId } })
      const userIds = [firstUserId, secondUserId].filter((value): value is string => Boolean(value))
      if (userIds.length) await tx.user.deleteMany({ where: { id: { in: userIds } } })
    } finally {
      await tx.$executeRawUnsafe('ALTER TABLE v2_audit_events ENABLE TRIGGER v2_audit_append_only')
    }
  })
}

try {
  applyMigrations()
  adminClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  appClient = new PrismaClient({ datasources: { db: { url: applicationUrl.toString() } } })
  await configureApplicationRole()
  const repository = new PrismaPlatformRepository(appClient)
  const service = new PlatformService(repository, { baseDomain: 'olfactoryops.com', sessionPepper: 'rls-session', passwordPepper: 'rls-password' })
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const slug = `rls-${suffix}`
  const secondSlug = `rls-second-${suffix}`
  const result = await service.signup({ organizationName: 'RLS Verification', workspaceSlug: slug, email: `${slug}@example.test`, displayName: 'RLS Verification', password: 'Correct Horse Battery 12!' })
  firstOrganizationId = result.membership.organizationId
  firstUserId = result.user.id
  await service.verifyEmail(result.verificationToken)
  const login = await service.login({ email: `${slug}@example.test`, password: 'Correct Horse Battery 12!', hostname: `${slug}.olfactoryops.com` })
  const context = await service.contextFromToken(login.rawSessionToken, `${slug}.olfactoryops.com`)
  const second = await service.signup({ organizationName: 'RLS Second', workspaceSlug: secondSlug, email: `${secondSlug}@example.test`, displayName: 'RLS Second', password: 'Correct Horse Battery 12!' })
  secondOrganizationId = second.membership.organizationId
  secondUserId = second.user.id
  await service.verifyEmail(second.verificationToken)

  let crossTenantDenied = false
  try {
    await service.contextFromToken(login.rawSessionToken, `${secondSlug}.olfactoryops.com`)
  } catch (error) {
    crossTenantDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'TENANT_ACCESS_DENIED'
  }

  const unscopedMemberships = await scopedMembershipCount()
  const firstTenantMemberships = await scopedMembershipCount(firstOrganizationId, context.user.id)
  const secondTenantVisibleFromFirstContext = await appClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", firstOrganizationId)
    await tx.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", context.user.id)
    return tx.membership.count({ where: { organizationId: secondOrganizationId! } })
  })

  if (!crossTenantDenied || unscopedMemberships !== 0 || firstTenantMemberships !== 1 || secondTenantVisibleFromFirstContext !== 0) {
    throw new Error(`V2_RLS=FAIL unexpected isolation result: ${JSON.stringify({ crossTenantDenied, unscopedMemberships, firstTenantMemberships, secondTenantVisibleFromFirstContext })}`)
  }

  console.log(JSON.stringify({
    applicationRole: 'v2_app',
    roleBypassesRls: false,
    signup: result.membership.role,
    login: login.membership.role,
    organizationId: context.context.organizationId,
    crossTenantDenied,
    unscopedMemberships,
    firstTenantMemberships,
    secondTenantVisibleFromFirstContext,
  }))
} finally {
  await appClient?.$disconnect()
  await removeTestFixtures()
  await adminClient?.$disconnect()
}
