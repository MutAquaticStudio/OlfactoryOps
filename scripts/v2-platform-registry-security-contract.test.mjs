import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  V2_PLATFORM_REGISTRY_READER_ROLE,
  V2_PLATFORM_REGISTRY_TABLES,
  assertV2PlatformRegistryClientGrants,
  assertV2PlatformRegistryReaderRole,
  assertV2PlatformRegistryRlsContract,
  assertV2PlatformRegistryRuntimeGrants,
} from './v2-platform-registry-security-contract.mjs'

const read = (path) => readFile(path, 'utf8')
const tableOwner = 'registry_owner'
const rlsRows = V2_PLATFORM_REGISTRY_TABLES.map((tableName) => ({
  tableName,
  tableOwner,
  rlsEnabled: true,
  rlsForced: true,
}))
const policyRows = V2_PLATFORM_REGISTRY_TABLES.flatMap((tableName) => [
  {
    tableName,
    policyName: 'v2_platform_registry_runtime_read',
    permissive: 'PERMISSIVE',
    roles: ['public'],
    command: 'SELECT',
    usingExpression: `pg_has_role(CURRENT_USER, '${V2_PLATFORM_REGISTRY_READER_ROLE}', 'MEMBER') OR pg_has_role(CURRENT_USER, '${tableOwner}', 'MEMBER')`,
    checkExpression: null,
  },
  {
    tableName,
    policyName: 'v2_platform_registry_admin_insert',
    permissive: 'PERMISSIVE',
    roles: [tableOwner],
    command: 'INSERT',
    usingExpression: null,
    checkExpression: `pg_has_role(CURRENT_USER, '${tableOwner}', 'MEMBER')`,
  },
  {
    tableName,
    policyName: 'v2_platform_registry_admin_update',
    permissive: 'PERMISSIVE',
    roles: [tableOwner],
    command: 'UPDATE',
    usingExpression: `pg_has_role(CURRENT_USER, '${tableOwner}', 'MEMBER')`,
    checkExpression: `pg_has_role(CURRENT_USER, '${tableOwner}', 'MEMBER')`,
  },
])
const grants = (extra = {}) => V2_PLATFORM_REGISTRY_TABLES.map((tableName) => ({
  tableName,
  readerMembership: true,
  canSelect: true,
  canInsert: false,
  canUpdate: false,
  canDelete: false,
  canTruncate: false,
  canReferences: false,
  canTrigger: false,
  ...extra,
}))

describe('V2 platform registry security contract', () => {
  it('requires forced RLS plus bounded reader and owner policies per table', () => {
    expect(() => assertV2PlatformRegistryRlsContract({ rlsRows, policyRows })).not.toThrow()
    expect(() => assertV2PlatformRegistryRlsContract({
      rlsRows: rlsRows.map((row, index) => index === 0 ? { ...row, rlsForced: false } : row),
      policyRows,
    })).toThrow('V2_PLATFORM_REGISTRY_FORCE_RLS_FAILED')
    expect(() => assertV2PlatformRegistryRlsContract({
      rlsRows,
      policyRows: policyRows.map((row, index) => index === 0
        ? { ...row, usingExpression: `pg_has_role(CURRENT_USER, '${tableOwner}', 'MEMBER')` }
        : row),
    })).toThrow('V2_PLATFORM_REGISTRY_READ_POLICY_FAILED')
  })

  it('requires a safe NOLOGIN reader role', () => {
    const safeRole = [{
      roleName: V2_PLATFORM_REGISTRY_READER_ROLE,
      canLogin: false,
      superuser: false,
      createDb: false,
      createRole: false,
      inherit: false,
      bypassRls: false,
      replication: false,
    }]
    expect(() => assertV2PlatformRegistryReaderRole(safeRole)).not.toThrow()
    expect(() => assertV2PlatformRegistryReaderRole([{ ...safeRole[0], canLogin: true }]))
      .toThrow('V2_PLATFORM_REGISTRY_READER_ROLE_UNSAFE')
  })

  it('rejects every direct client privilege and reader membership', () => {
    const rows = ['anon', 'authenticated'].flatMap((roleName) => grants({
      roleName,
      readerMembership: false,
      canSelect: false,
    }))
    expect(() => assertV2PlatformRegistryClientGrants(rows)).not.toThrow()
    expect(() => assertV2PlatformRegistryClientGrants(rows.map((row, index) => index === 0 ? { ...row, canInsert: true } : row)))
      .toThrow('V2_PLATFORM_REGISTRY_CLIENT_PRIVILEGES_FAILED')
    expect(() => assertV2PlatformRegistryClientGrants(rows.map((row, index) => index === 0 ? { ...row, readerMembership: true } : row)))
      .toThrow('V2_PLATFORM_REGISTRY_CLIENT_PRIVILEGES_FAILED')
  })

  it('keeps every configured application runtime read-only and reader-authorized', () => {
    expect(() => assertV2PlatformRegistryRuntimeGrants(grants())).not.toThrow()
    expect(() => assertV2PlatformRegistryRuntimeGrants(grants({ canUpdate: true })))
      .toThrow('V2_PLATFORM_REGISTRY_RUNTIME_READ_ONLY_FAILED')
    expect(() => assertV2PlatformRegistryRuntimeGrants(grants({ readerMembership: false })))
      .toThrow('V2_PLATFORM_REGISTRY_RUNTIME_READ_ONLY_FAILED')
  })

  it('registers the forward-only migration in every controlled Postgres chain', async () => {
    for (const path of [
      'scripts/apply-v2-staging-migrations.mjs',
      'scripts/apply-v2-production-migrations.mjs',
      'scripts/verify-v2-postgres.mjs',
      'scripts/verify-v2-rls.ts',
    ]) {
      expect(await read(path)).toContain('0028_harden_v2_plans_and_component_pins_rls.sql')
    }
  })

  it('uses a governed reader group and explicit owner policies without broad bypasses', async () => {
    const migration = await read('infra/postgres/migrations/0028_harden_v2_plans_and_component_pins_rls.sql')
    for (const table of V2_PLATFORM_REGISTRY_TABLES) expect(migration).toContain(table)
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('CREATE ROLE v2_platform_registry_reader')
    expect(migration).toContain('NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION')
    expect(migration).toContain('v2_platform_registry_admin_insert')
    expect(migration).toContain('v2_platform_registry_admin_update')
    expect(migration).toContain("ARRAY['anon', 'authenticated']")
    expect(migration).toContain('REVOKE ALL PRIVILEGES')
    expect(migration).not.toContain("current_user IN ('v2_app', 'hyperdrive_user')")
    expect(migration).not.toContain('USING (true)')
    expect(migration).not.toContain('WITH CHECK (true)')
    expect(migration).not.toContain('SECURITY DEFINER')
    expect(migration).not.toContain('v2_platform_registry_admin_delete')
  })

  it('keeps runtime configurators consistent with the reader membership boundary', async () => {
    for (const path of ['scripts/configure-v2-runtime-role.mjs', 'scripts/configure-v2-production-runtime-role.mjs']) {
      const source = await read(path)
      expect(source).toContain('V2_PLATFORM_REGISTRY_READER_ROLE')
      expect(source).toContain('GRANT SELECT ON public.v2_plans, public.v2_scientific_component_pins, public.v2_model_component_pins')
      expect(source).toContain('assertV2PlatformRegistryReaderRole')
      expect(source).toContain('assertV2PlatformRegistryRuntimeGrants')
    }
  })

  it('preserves plan and scientific registry reads without adding application write paths', async () => {
    const platformRepository = await read('services/platform/src/prisma-repository.ts')
    expect(platformRepository).toContain('include: { plan: true }')
    expect(platformRepository).not.toMatch(/this\.client\.plan\.(create|update|upsert|delete)/)
    for (const path of ['services/scientific/src/service.ts', 'services/scientific/src/model-dataset-service.ts']) {
      const source = await read(path)
      expect(source).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM) v2_(scientific|model)_component_pins/i)
    }
  })

  it('keeps the integration verifier loopback-only and remote-credential free', async () => {
    const source = await read('scripts/verify-v2-platform-registry-security-postgres.mjs')
    expect(source).toContain("V2_QA_DISPOSABLE_DATABASE !== 'CONFIRMED'")
    expect(source).toContain("['localhost', '127.0.0.1', '::1']")
    expect(source).toContain('custom_runtime')
    expect(source).toContain('SECURITY_DEFINER_PLAN_READ')
    expect(source).not.toContain('STAGING_DATABASE_URL')
    expect(source).not.toContain('PRODUCTION_DATABASE_URL')
  })
})
