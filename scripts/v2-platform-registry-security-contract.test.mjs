import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  V2_PLATFORM_REGISTRY_TABLES,
  assertV2PlatformRegistryClientGrants,
  assertV2PlatformRegistryRlsContract,
  assertV2PlatformRegistryRuntimeGrants,
} from './v2-platform-registry-security-contract.mjs'

const read = (path) => readFile(path, 'utf8')
const rlsRows = V2_PLATFORM_REGISTRY_TABLES.map((tableName) => ({ tableName, rlsEnabled: true, rlsForced: true }))
const policyRows = V2_PLATFORM_REGISTRY_TABLES.map((tableName) => ({
  tableName,
  policyName: 'v2_platform_registry_runtime_read',
  permissive: 'PERMISSIVE',
  roles: ['public'],
  command: 'SELECT',
  usingExpression: "CURRENT_USER = ANY (ARRAY['v2_app'::name, 'hyperdrive_user'::name])",
  checkExpression: null,
}))
const grants = (extra = {}) => V2_PLATFORM_REGISTRY_TABLES.map((tableName) => ({
  tableName,
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
  it('requires forced RLS and one bounded runtime SELECT policy per table', () => {
    expect(() => assertV2PlatformRegistryRlsContract({ rlsRows, policyRows })).not.toThrow()
    expect(() => assertV2PlatformRegistryRlsContract({
      rlsRows: rlsRows.map((row, index) => index === 0 ? { ...row, rlsForced: false } : row),
      policyRows,
    })).toThrow('V2_PLATFORM_REGISTRY_FORCE_RLS_FAILED')
    expect(() => assertV2PlatformRegistryRlsContract({
      rlsRows,
      policyRows: policyRows.map((row, index) => index === 0 ? { ...row, command: 'ALL' } : row),
    })).toThrow('V2_PLATFORM_REGISTRY_READ_POLICY_FAILED')
  })

  it('rejects every direct client privilege, including non-DML privileges', () => {
    const rows = ['anon', 'authenticated'].flatMap((roleName) => grants({ roleName, canSelect: false }))
    expect(() => assertV2PlatformRegistryClientGrants(rows)).not.toThrow()
    expect(() => assertV2PlatformRegistryClientGrants(rows.map((row, index) => index === 0 ? { ...row, canInsert: true } : row)))
      .toThrow('V2_PLATFORM_REGISTRY_CLIENT_PRIVILEGES_FAILED')
    expect(() => assertV2PlatformRegistryClientGrants(rows.map((row, index) => index === 0 ? { ...row, canTrigger: true } : row)))
      .toThrow('V2_PLATFORM_REGISTRY_CLIENT_PRIVILEGES_FAILED')
  })

  it('keeps application runtime access read-only', () => {
    expect(() => assertV2PlatformRegistryRuntimeGrants(grants())).not.toThrow()
    expect(() => assertV2PlatformRegistryRuntimeGrants(grants({ canUpdate: true })))
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

  it('revokes browser writes and creates no broad or security-definer bypass', async () => {
    const migration = await read('infra/postgres/migrations/0028_harden_v2_plans_and_component_pins_rls.sql')
    for (const table of V2_PLATFORM_REGISTRY_TABLES) expect(migration).toContain(table)
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain("ARRAY['anon', 'authenticated']")
    expect(migration).toContain('REVOKE ALL PRIVILEGES')
    expect(migration).toContain('FOR SELECT TO PUBLIC')
    expect(migration).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/)
    expect(migration).not.toContain('USING (true)')
    expect(migration).not.toContain('WITH CHECK (true)')
    expect(migration).not.toContain('SECURITY DEFINER')
  })

  it('prevents runtime role configurators from restoring write privileges', async () => {
    for (const path of ['scripts/configure-v2-runtime-role.mjs', 'scripts/configure-v2-production-runtime-role.mjs']) {
      const source = await read(path)
      expect(source).toContain('REVOKE ALL PRIVILEGES ON public.v2_plans, public.v2_scientific_component_pins, public.v2_model_component_pins')
      expect(source).toContain('GRANT SELECT ON public.v2_plans, public.v2_scientific_component_pins, public.v2_model_component_pins')
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
    expect(source).not.toContain('STAGING_DATABASE_URL')
    expect(source).not.toContain('PRODUCTION_DATABASE_URL')
  })
})
