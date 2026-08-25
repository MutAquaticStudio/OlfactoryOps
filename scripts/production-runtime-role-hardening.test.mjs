import { expect, test } from 'vitest'
import {
  assertHostedRoleIsNotPrivileged,
  hostedSafeAlterRoleStatement,
  quotePostgresIdentifier,
  requiresSafeAttributeHardening,
} from './production-runtime-role-hardening.mjs'

const hostedSafeRole = {
  rolcanlogin: true,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolinherit: false,
  rolbypassrls: false,
  rolreplication: false,
}

test('Supabase hardening asserts privileged role attributes before mutation', () => {
  expect(() => assertHostedRoleIsNotPrivileged(hostedSafeRole)).not.toThrow()
  for (const attribute of ['rolsuper', 'rolbypassrls', 'rolreplication']) {
    expect(() => assertHostedRoleIsNotPrivileged({ ...hostedSafeRole, [attribute]: true })).toThrow('PRODUCTION_RUNTIME_PRIVILEGES=BLOCKED_PRIVILEGED_ROLE_ATTRIBUTE')
  }
  expect(() => assertHostedRoleIsNotPrivileged({ ...hostedSafeRole, rolsuper: true }, 'RUNTIME_DB_PRIVILEGES'))
    .toThrow('RUNTIME_DB_PRIVILEGES=BLOCKED_PRIVILEGED_ROLE_ATTRIBUTE')
})

test('Supabase hosted hardening changes only supported least-privilege attributes', () => {
  const statement = hostedSafeAlterRoleStatement(quotePostgresIdentifier('hyperdrive_user'))
  expect(statement).toBe('ALTER ROLE "hyperdrive_user" LOGIN NOCREATEDB NOCREATEROLE NOINHERIT')
  expect(statement).not.toMatch(/NOSUPERUSER|NOBYPASSRLS|NOREPLICATION/)
  expect(requiresSafeAttributeHardening(hostedSafeRole)).toBe(false)
  expect(requiresSafeAttributeHardening({ ...hostedSafeRole, rolinherit: true })).toBe(true)
  expect(requiresSafeAttributeHardening({ ...hostedSafeRole, rolcanlogin: false })).toBe(true)
})

test('staging uses the hosted-safe ALTER ROLE contract without protected attribute clauses', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile('scripts/configure-v2-runtime-role.mjs', 'utf8'))
  expect(source).toContain("assertHostedRoleIsNotPrivileged(roleState, 'RUNTIME_DB_PRIVILEGES')")
  expect(source).toContain('hostedSafeAlterRoleStatement(identifier)')
  expect(source).not.toMatch(/ALTER ROLE[^\n]*(NOSUPERUSER|NOBYPASSRLS|NOREPLICATION)/)
})
