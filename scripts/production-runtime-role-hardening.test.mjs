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
})

test('Supabase hosted hardening changes only supported least-privilege attributes', () => {
  const statement = hostedSafeAlterRoleStatement(quotePostgresIdentifier('hyperdrive_user'))
  expect(statement).toBe('ALTER ROLE "hyperdrive_user" LOGIN NOCREATEDB NOCREATEROLE NOINHERIT')
  expect(statement).not.toMatch(/NOSUPERUSER|NOBYPASSRLS|NOREPLICATION/)
  expect(requiresSafeAttributeHardening(hostedSafeRole)).toBe(false)
  expect(requiresSafeAttributeHardening({ ...hostedSafeRole, rolinherit: true })).toBe(true)
  expect(requiresSafeAttributeHardening({ ...hostedSafeRole, rolcanlogin: false })).toBe(true)
})
