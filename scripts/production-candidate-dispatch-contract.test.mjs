import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const workflow = readFileSync('.github/workflows/v2-production-candidate-dispatch.yml', 'utf8')

function job(name, nextName) {
  const start = workflow.indexOf(`  ${name}:`)
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start) : workflow.length
  if (start < 0 || end < 0) throw new Error(`${name} is missing from the candidate dispatcher`)
  return workflow.slice(start, end)
}

test('candidate dispatcher accepts only the current release branch head', () => {
  const validation = job('validate-candidate-revision', 'deploy-candidate-pages')

  expect(validation).toContain('test "$RELEASE_SHA" = "$release_branch_sha"')
  expect(validation).not.toContain('git merge-base --is-ancestor')
  expect(validation).not.toContain('git tag --contains')
})

test('candidate router derives the Pages origin from a validated isolated project', () => {
  const router = job('deploy-candidate-tenant-router', 'smoke-candidate')

  expect(router).toContain('[[ "$PRODUCTION_CANDIDATE_PAGES_PROJECT" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]')
  expect(router).toContain('candidate_pages_origin="https://production-candidate.${PRODUCTION_CANDIDATE_PAGES_PROJECT}.pages.dev"')
  expect(router).toContain('export CANDIDATE_PAGES_ORIGIN="$candidate_pages_origin"')
  expect(router).toContain('candidate Pages origin is not the exact isolated Pages branch origin')
  expect(router).not.toContain('CANDIDATE_PAGES_ORIGIN: https://production-candidate.${{ vars.PRODUCTION_CANDIDATE_PAGES_PROJECT }}.pages.dev')
})

test('candidate smoke is fail-closed and has no legacy public-root configuration', () => {
  const smoke = job('smoke-candidate')
  const browserStart = smoke.indexOf('      - name: Verify the isolated candidate browser entrypoints')
  const acceptanceStart = smoke.indexOf('      - name: Run bounded generated-fixture candidate acceptance')
  if (browserStart < 0 || acceptanceStart < 0) throw new Error('candidate browser or acceptance step is missing')
  const browser = smoke.slice(browserStart, acceptanceStart)
  const acceptance = smoke.slice(acceptanceStart)

  expect(browser).toContain('V2_PRODUCTION_CANDIDATE_ACCEPTANCE_APPROVED: RUN_V2_PRODUCTION_CANDIDATE_ACCEPTANCE')
  expect(browser).toContain('V2_PRODUCTION_CANDIDATE_PROFILE: production-candidate')
  expect(browser).toContain('V2_PRODUCTION_CANDIDATE_API_ORIGIN: https://api-next.labofscents.org')
  expect(browser).toContain('V2_PRODUCTION_CANDIDATE_WORKSPACE_BASE_DOMAIN: next.labofscents.org')
  expect(browser).toContain('V2_PRODUCTION_CANDIDATE_TENANT_URL: ${{ vars.PRODUCTION_CANDIDATE_SMOKE_TENANT_URL }}')
  expect(browser).toContain('V2_PRODUCTION_CANDIDATE_EXPECTED_SHA: ${{ needs.validate-candidate-revision.outputs.release_sha }}')
  expect(browser).toContain('V2_PRODUCTION_CANDIDATE_FIXTURE_MODE: GENERATED_ISOLATED')
  expect(browser).toContain('npx playwright install --with-deps chromium')
  expect(browser).toContain('npm run test:qa:v2-production-candidate-browser')
  expect(browser).not.toContain('PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL')
  expect(acceptance).toContain('PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}')
  expect(acceptance).toContain('node scripts/verify-v2-production-candidate-acceptance.mjs --validate-only')
  expect(acceptance).toContain('npm run test:qa:v2-production-candidate-acceptance')
  expect(smoke).not.toContain('https://next.labofscents.org')
  expect(smoke).not.toContain('test:qa:production-smoke')
  expect(smoke).not.toContain('PRODUCTION_SMOKE_LOGIN_')
  expect(smoke).not.toContain('PRODUCTION_CANDIDATE_SMOKE_LOGIN_')
  expect(smoke).not.toContain('secrets.PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL')
})
