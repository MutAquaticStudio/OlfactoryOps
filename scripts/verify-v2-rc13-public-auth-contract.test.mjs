import { expect, test } from 'vitest'
import { verifyRc13PublicAuthContract } from './verify-v2-rc13-public-auth-contract.mjs'

test('RC13 public auth replaces only the legacy public auth boundary', () => {
  expect(() => verifyRc13PublicAuthContract()).not.toThrow()
})
