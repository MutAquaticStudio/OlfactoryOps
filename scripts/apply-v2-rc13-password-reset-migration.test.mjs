import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import {
  PASSWORD_RESET_MIGRATION_PATH,
  RC13_SHA,
  validateImmutableMigration,
} from './apply-v2-rc13-password-reset-migration.mjs'

function immutableMigration() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  return readFileSync(join(root, PASSWORD_RESET_MIGRATION_PATH), 'utf8')
}

test('the RC13 password-reset migration is anchored to the immutable release source', () => {
  expect(() => validateImmutableMigration(RC13_SHA, immutableMigration())).not.toThrow()
})

test('a different release or altered SQL fails before any database connection', () => {
  const migrationSql = immutableMigration()
  expect(() => validateImmutableMigration('0000000000000000000000000000000000000000', migrationSql)).toThrow('RELEASE_IDENTITY_INVALID')
  expect(() => validateImmutableMigration(RC13_SHA, `${migrationSql}\n-- altered`)).toThrow('MIGRATION_SOURCE_INVALID')
})
