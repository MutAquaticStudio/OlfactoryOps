import { expect, test } from 'vitest'
import { verifyRc13ReleaseWorkflows } from './verify-v2-rc13-release-workflows.mjs'

test('RC13 release workflows keep RC12 live routing intact and protect the V2 auth release', () => {
  expect(() => verifyRc13ReleaseWorkflows()).not.toThrow()
})
