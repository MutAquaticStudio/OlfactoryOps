import { provisionRoleFixtures, validateIsolatedFixtureConfig } from './qa-isolated-fixture-support.mjs'

const config = validateIsolatedFixtureConfig()
const result = await provisionRoleFixtures(config, {
  cleanup: process.argv.includes('--cleanup'),
})

console.log(`Role fixture manifest: ${result.manifestPath}`)
console.log(`Role fixture report: ${result.reportPath}`)
console.log('Role fixtures created in isolated local storage. Credentials and session tokens were not logged.')
