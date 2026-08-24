import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflows = join(root, '.github', 'workflows')
const rc12Sha = '331c1a6054fe1420b063a2e1fe9e5cef4f043ff8'
const rc10Sha = 'fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd'

function source(name) {
  return readFileSync(join(workflows, name), 'utf8').replaceAll('\r\n', '\n')
}

function requireText(value, text, label) {
  assert.ok(value.includes(text), label)
}

function forbid(value, pattern, label) {
  assert.doesNotMatch(value, pattern, label)
}

function assertMainOnly(value, label) {
  requireText(value, "github.event_name == 'workflow_dispatch'", `${label}: workflow dispatch only`)
  requireText(value, "github.ref == 'refs/heads/main'", `${label}: main ref guard`)
  requireText(value, "github.ref_type == 'branch'", `${label}: branch guard`)
}

export function verifyRc12ReleaseWorkflows() {
  const sourceFinalization = source('v2-rc12-release-source-finalization.yml')
  const candidate = source('v2-rc12-isolated-production-candidate.yml')
  const revalidation = source('v2-rc12-production-environment-revalidation.yml')
  const backup = source('v2-rc12-production-backup-snapshot.yml')
  const readiness = source('v2-rc12-production-readiness.yml')
  const upgrade = source('v2-rc12-production-upgrade-dispatcher.yml')
  const rollback = source('v2-rc12-production-upgrade-rollback.yml')
  const acceptance = source('v2-rc12-production-public-acceptance.yml')
  const finalizer = source('v2-rc12-production-live-finalization.yml')
  const renderer = readFileSync(join(root, 'scripts', 'render-v2-rc12-cloud-runtime-candidate-config.mjs'), 'utf8')
  const pagesRootVerifier = readFileSync(join(root, 'scripts', 'verify-v2-rc12-candidate-pages-project-root.mjs'), 'utf8')
  const browserAcceptance = readFileSync(join(root, 'scripts', 'verify-v2-rc12-production-candidate-browser-acceptance.mjs'), 'utf8')
  const generatedAcceptance = readFileSync(join(root, 'scripts', 'verify-v2-rc12-production-candidate-acceptance.mjs'), 'utf8')
  const clientSecretVerifier = readFileSync(join(root, 'scripts', 'verify-v2-rc12-client-secret-references.mjs'), 'utf8')
  const all = [sourceFinalization, candidate, revalidation, backup, readiness, upgrade, rollback, acceptance, finalizer].join('\n')

  for (const [name, value] of Object.entries({ sourceFinalization, candidate, revalidation, backup, readiness, upgrade, rollback, acceptance, finalizer })) {
    requireText(value, 'on:\n  workflow_dispatch:', `${name}: dispatch trigger`)
    assertMainOnly(value, name)
    requireText(value, rc12Sha, `${name}: exact RC12 SHA`)
    requireText(value, 'environment: production', `${name}: protected environment`)
    forbid(value, /git tag -f|git push --force/, `${name}: force tag or push forbidden`)
  }
  requireText(sourceFinalization, 'contents: write', 'source finalization: annotated tag permission')
  requireText(sourceFinalization, 'cat-file -t "refs/tags/$RC12_TAG"', 'source finalization: annotated tag required')
  requireText(sourceFinalization, 'v2-rc12-release-policy.mjs', 'source finalization: manifest policy')
  requireText(candidate, 'render-v2-rc12-cloud-runtime-candidate-config.mjs render', 'candidate: isolated renderer')
  requireText(candidate, 'render-v2-rc12-cloud-runtime-candidate-config.mjs verify', 'candidate: isolated renderer verification')
  requireText(candidate, 'verify-v2-rc12-production-candidate-browser-acceptance.mjs', 'candidate: RC12 browser acceptance')
  requireText(candidate, 'verify-v2-rc12-production-candidate-acceptance.mjs', 'candidate: RC12 generated acceptance')
  requireText(candidate, 'verify-v2-rc12-candidate-pages-project-root.mjs --dist dist', 'candidate: project-root verifier')
  requireText(candidate, 'https://${process.env.PRODUCTION_CANDIDATE_PAGES_PROJECT}.pages.dev', 'candidate: isolated project-root origin')
  requireText(candidate, 'CANDIDATE_PAGES_ORIGIN: ${{ steps.pages-root.outputs.origin }}', 'candidate: only verified origin reaches Router rendering')
  requireText(candidate, 'PROJECT_ROOT_RECHECK_CHECKPOINT: BEFORE_ROUTER', 'candidate: Router project-root recheck')
  requireText(candidate, 'PROJECT_ROOT_RELEASE_RECHECK_BEFORE_ROUTER=PASS', 'candidate: Router recheck evidence')
  requireText(candidate, 'PROJECT_ROOT_RECHECK_CHECKPOINT: BEFORE_SMOKE', 'candidate: Smoke project-root recheck')
  requireText(candidate, 'PROJECT_ROOT_RELEASE_RECHECK_BEFORE_SMOKE=PASS', 'candidate: Smoke recheck evidence')
  forbid(candidate, /https:\/\/production-candidate\.\$\{(?:process\.env\.)?PRODUCTION_CANDIDATE_PAGES_PROJECT\}\.pages\.dev/, 'candidate: invalid production branch alias is forbidden')
  const routerRecheck = candidate.indexOf('Revalidate the mutable candidate Pages project root before Router')
  const routerDeploy = candidate.indexOf('npx wrangler deploy --config wrangler.v2-tenant-router-production-candidate.toml')
  assert.ok(routerRecheck >= 0 && routerDeploy > routerRecheck, 'candidate: Router recheck must precede deploy')
  const smokeRecheck = candidate.indexOf('Revalidate the mutable candidate Pages project root before Smoke')
  const smokeAcceptance = candidate.indexOf('Verify the isolated candidate browser entrypoints')
  assert.ok(smokeRecheck >= 0 && smokeAcceptance > smokeRecheck, 'candidate: Smoke recheck must precede acceptance')
  for (const marker of [
    'CANDIDATE_PROJECT_ROOT_VERIFIED=PASS',
    'CANDIDATE_PROJECT_ROOT_RELEASE_SHA=RC12',
    'CANDIDATE_PROJECT_ROOT_HTTP=PASS',
    'PAGES_PROJECT_ISOLATION=PASS',
    'LIVE_CUSTOM_DOMAIN_OWNERSHIP=NONE',
    'PAGES_API_CONFIGURATION=PASS',
    'PAGES_WORKSPACE_CONFIGURATION=PASS',
    'PROJECT_ROOT_RELEASE_RECHECK_BEFORE_ROUTER=PASS',
    'PROJECT_ROOT_RELEASE_RECHECK_BEFORE_SMOKE=PASS',
  ]) requireText(pagesRootVerifier, marker, `project-root verifier: ${marker}`)
  requireText(pagesRootVerifier, 'olfactoryops-v2-production-candidate', 'project-root verifier: exact candidate project')
  requireText(pagesRootVerifier, 'olfactoryops-v2-production', 'project-root verifier: distinct live project')
  requireText(pagesRootVerifier, 'production-candidate', 'project-root verifier: exact production branch')
  requireText(pagesRootVerifier, 'method: "GET"', 'project-root verifier: read-only requests')
  forbid(pagesRootVerifier, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']|wrangler\s+(?:deploy|pages|delete)|\bgh\s+(?:api|workflow|secret|variable)\b/, 'project-root verifier: mutation paths are forbidden')
  requireText(candidate, 'CANDIDATE_PUBLIC_AUTH_REDIRECT=PASS', 'candidate: first-party public auth redirect evidence')
  requireText(candidate, 'LOGIN_WORKSPACE_REDIRECT=PASS', 'candidate: login workspace redirect evidence')
  requireText(candidate, 'SIGNUP_WORKSPACE_REDIRECT=PASS', 'candidate: signup workspace redirect evidence')
  requireText(candidate, 'BROWSER_LOGIN_POST_TRANSPORT=PASS', 'candidate: browser login POST transport evidence')
  requireText(candidate, 'BROWSER_SIGNUP_POST_TRANSPORT=PASS', 'candidate: browser signup POST transport evidence')
  requireText(candidate, 'BROWSER_AUTH_PREFLIGHT_CORS=PASS', 'candidate: browser auth preflight evidence')
  requireText(candidate, 'RAW_AUTH_NETWORK_ERRORS_VISIBLE=0', 'candidate: no raw browser auth network errors')
  requireText(candidate, 'FAILED_TO_FETCH_REPRODUCED=NO', 'candidate: failed-to-fetch regression gate')
  requireText(candidate, 'test "$CANDIDATE_ACCEPTANCE_MODE" = "POST_BOOTSTRAP"', 'candidate: real owner preserving contract')
  forbid(candidate, /path: rc9|verify-v2-production-candidate-browser-acceptance\.mjs|verify-v2-production-candidate-acceptance\.mjs --validate-only/, 'candidate: historical candidate acceptance is not reused')
  for (const marker of ['CANDIDATE_WORKER_NAME_ISOLATED=PASS', 'CANDIDATE_WORKFLOW_NAME_ISOLATED=PASS', 'PRODUCTION_WORKFLOW_NAME_ABSENT_FROM_CANDIDATE_OWNERSHIP=PASS', 'PRODUCTION_QUEUE_CONSUMERS_ABSENT=PASS', 'PUBLIC_ROUTES_ABSENT=PASS', 'PUBLIC_CUSTOM_DOMAINS_ABSENT=PASS', 'RC12_SHA_UNCHANGED=PASS']) requireText(renderer, marker, `renderer: ${marker}`)
  requireText(browserAcceptance, 'CANDIDATE_PUBLIC_AUTH_ORIGIN = "https://next.labofscents.org"', 'browser: first-party candidate auth origin')
  requireText(browserAcceptance, 'CANDIDATE_PUBLIC_AUTH_REDIRECT=PASS', 'browser: auth redirect evidence')
  requireText(browserAcceptance, 'method: "POST"', 'browser: real auth POST probes')
  requireText(browserAcceptance, 'type !== "Preflight"', 'browser: observes CORS preflight')
  requireText(browserAcceptance, 'response.status < 200', 'browser: requires successful preflight response')
  requireText(browserAcceptance, 'BROWSER_LOGIN_POST_TRANSPORT=PASS', 'browser: login transport evidence')
  requireText(browserAcceptance, 'BROWSER_SIGNUP_POST_TRANSPORT=PASS', 'browser: signup transport evidence')
  requireText(browserAcceptance, 'RAW_AUTH_NETWORK_ERRORS_VISIBLE=${rawAuthNetworkErrors}', 'browser: bounded network-error count')
  requireText(browserAcceptance, 'FAILED_TO_FETCH_REPRODUCED=NO', 'browser: no failed-to-fetch symptom')
  forbid(browserAcceptance, /pages\.dev/, 'browser: raw Pages origin is not accepted for auth')
  requireText(generatedAcceptance, 'REAL_PLATFORM_OWNER_PRESERVED=PASS', 'generated acceptance: real owner preserved')
  requireText(generatedAcceptance, 'generatedWorkspaceRedirectMatches', 'generated acceptance: workspace redirect validation')
  forbid(generatedAcceptance, /'PLATFORM_OWNER', 'ACTIVE'/, 'generated acceptance: no Platform Owner fixture')
  requireText(upgrade, 'wrangler versions upload', 'upgrade: inactive version upload')
  requireText(upgrade, 'wrangler versions deploy', 'upgrade: exact version promotion')
  requireText(upgrade, 'Restore captured RC10 versions', 'upgrade: automatic RC10 rollback')
  requireText(upgrade, 'rollback-pages', 'upgrade: exact Pages rollback')
  requireText(rollback, 'wrangler rollback', 'rollback: Worker version rollback')
  requireText(rollback, 'rollback-pages', 'rollback: Pages rollback')
  requireText(finalizer, 'v2-production-live-rc12', 'finalizer: RC12 live tag')
  requireText(finalizer, 'V2 RC12 Production Public Acceptance', 'finalizer: fresh public acceptance gate')
  requireText(finalizer, 'verify-live', 'finalizer: active RC12 component recheck')
  requireText(finalizer, 'verify-rollback-capability', 'finalizer: rollback recheck')
  requireText(readiness, 'contents: read', 'readiness: no tag write permission')
  requireText(readiness, `v2-production-live)" = "$RC10_RUNTIME_BASE_SHA`, 'readiness: legacy RC10 live tag preserved')
  forbid(readiness, /git tag\b|git push\b/, 'readiness: no tag mutation')
  requireText(acceptance, rc10Sha, 'acceptance: legacy RC10 readiness target preserved')
  requireText(revalidation, 'verify-v2-rc12-client-secret-references.mjs "$RELEASE_WORKTREE"', 'revalidation: scoped client source scan')
  requireText(revalidation, 'npm --prefix "$RELEASE_WORKTREE" run security:client-bundle', 'revalidation: generated bundle scan')
  forbid(revalidation, /git -C "\$RELEASE_WORKTREE" grep/, 'revalidation: repository-wide source scan is forbidden')
  requireText(clientSecretVerifier, "normalized.startsWith('src/')", 'client scan: application sources included')
  requireText(clientSecretVerifier, "normalized.startsWith('public/')", 'client scan: public assets included')
  requireText(clientSecretVerifier, "normalized === '.env.production'", 'client scan: production client environment included')
  forbid(clientSecretVerifier, /console\.(?:log|error)\([^\n]*(?:content|finding|path)/, 'client scan: findings are not emitted')
  forbid(all, /workers\/routes|workers\/domains|route-handoff|git tag -f|git push --force/, 'RC12: no route handoff or force mutation')
  console.log('RC12_RELEASE_WORKFLOW_CONTRACT=PASS')
  console.log('RC12_CANDIDATE_PAGES_PROJECT_ROOT_ORIGIN_CONTRACT=PASS')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) verifyRc12ReleaseWorkflows()
