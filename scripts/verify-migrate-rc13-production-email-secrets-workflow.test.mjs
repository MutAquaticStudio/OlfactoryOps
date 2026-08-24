import { expect, test } from 'vitest'
import { verifyRc13ProductionEmailSecretMigrationWorkflow } from './verify-migrate-rc13-production-email-secrets-workflow.mjs'

test('the one-shot RC13 production email-secret migration is protected and non-disclosing', () => {
  expect(() => verifyRc13ProductionEmailSecretMigrationWorkflow()).not.toThrow()
})
