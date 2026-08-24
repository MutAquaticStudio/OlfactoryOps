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

function stepBlock(value, name) {
  const directMarker = `      - name: ${name}\n`
  const nestedMarker = `        name: ${name}\n`
  const direct = value.indexOf(directMarker)
  const nested = value.indexOf(nestedMarker)
  const start = direct >= 0 ? direct : nested >= 0 ? value.lastIndexOf('\n      - ', nested) + 1 : -1
  assert.ok(start >= 0, `workflow step exists: ${name}`)
  const next = value.indexOf('\n      - ', start + 1)
  return value.slice(start, next >= 0 ? next : undefined)
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
  const upgradeState = readFileSync(join(root, 'scripts', 'capture-v2-rc12-upgrade-state.mjs'), 'utf8')
  const uploadFailureClassifier = readFileSync(join(root, 'scripts', 'classify-v2-rc12-inactive-upload-failure.mjs'), 'utf8')
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
  const inactiveUpload = stepBlock(upgrade, 'Upload only inactive exact RC12 Worker versions')
  const promotion = stepBlock(upgrade, 'Promote exact RC12 Workers then Pages in bounded order')
  const automaticRollback = stepBlock(upgrade, 'Restore captured RC10 versions and Pages deployment on failed promotion')
  const explicitRollback = stepBlock(upgrade, 'Run an explicit RC10 rollback without route changes')
  requireText(inactiveUpload, 'set -euo pipefail', 'upgrade: inactive upload runs fail-closed')
  requireText(inactiveUpload, 'RELEASE_SHA: ${{ inputs.release_sha }}', 'upgrade: inactive upload receives exact release SHA')
  requireText(inactiveUpload, 'rc12-${RELEASE_SHA:0:12}', 'upgrade: inactive upload tag derives from exact release SHA')
  requireText(inactiveUpload, 'capture-v2-rc12-upgrade-state.mjs prepare-uploads', 'upgrade: existing inactive uploads are revalidated before upload')
  requireText(inactiveUpload, 'RC12_INACTIVE_UPLOAD_REUSED=PASS', 'upgrade: matching inactive versions are reused')
  forbid(inactiveUpload, /wrangler versions list --json/, 'upgrade: unverified Wrangler version-list shape is not used')
  requireText(promotion, 'RELEASE_SHA: ${{ inputs.release_sha }}', 'upgrade: promotion receives exact release SHA')
  requireText(promotion, '--commit-hash "$RELEASE_SHA"', 'upgrade: Pages promotion receives exact release SHA')
  for (const [name, value] of Object.entries({ inactiveUpload, promotion, automaticRollback, explicitRollback })) {
    requireText(value, 'set -euo pipefail', `upgrade: ${name} uses strict shell mode`)
    requireText(value, 'RC12_UPGRADE_STATE_DIRECTORY: ${{ steps.capture.outputs.state_directory }}', `upgrade: ${name} receives the captured private state directory`)
  }
  requireText(upgrade, 'classify-v2-rc12-inactive-upload-failure.mjs "$name" "$state/upload-$name.err"', 'upgrade: upload failure has safe classification')
  for (const marker of ['RC12_INACTIVE_UPLOAD_COMPONENT=', 'RC12_INACTIVE_UPLOAD_HTTP_STATUS=', 'RC12_INACTIVE_UPLOAD_CF_ERROR_CODE=', 'RC12_INACTIVE_UPLOAD_FAILURE_CLASS=']) requireText(uploadFailureClassifier, marker, `upgrade: safe upload evidence ${marker}`)
  forbid(uploadFailureClassifier, /console\.(?:error|log)\([^\n]*(?:stderr|text|message|file)/, 'upgrade: raw upload failure output is forbidden')
  requireText(upgrade, 'wrangler versions deploy', 'upgrade: exact version promotion')
  requireText(upgrade, 'PAGES_PROJECT_ROOT_ORIGIN: https://olfactoryops-v2-production.pages.dev', 'upgrade: production Pages project-root origin')
  for (const binding of [
    'V2_API_PRODUCTION_GIT_SHA: ${{ inputs.release_sha }}',
    'V2_API_PRODUCTION_HYPERDRIVE_ID: ${{ vars.PRODUCTION_HYPERDRIVE_ID }}',
    'V2_TENANT_ROUTER_PRODUCTION_GIT_SHA: ${{ inputs.release_sha }}',
    'V2_TENANT_ROUTER_PRODUCTION_HYPERDRIVE_ID: ${{ vars.PRODUCTION_HYPERDRIVE_ID }}',
    'V2_TENANT_ROUTER_PRODUCTION_PAGES_ORIGIN: ${{ env.PAGES_PROJECT_ROOT_ORIGIN }}',
    'CLOUD_RUNTIME_GIT_SHA: ${{ inputs.release_sha }}',
    'CLOUD_RUNTIME_HYPERDRIVE_ID: ${{ vars.PRODUCTION_HYPERDRIVE_ID }}',
  ]) requireText(upgrade, binding, `upgrade: required renderer binding ${binding}`)
  requireText(upgrade, 'prepare-v2-first-release-unrouted-config.mjs .qa/wrangler.v2-api-production.toml api', 'upgrade: API upload configuration is route-free')
  requireText(upgrade, 'prepare-v2-first-release-unrouted-config.mjs .qa/wrangler.v2-tenant-router-production.toml tenantRouter', 'upgrade: tenant-router upload configuration is route-free')
  requireText(upgrade, 'id: promote_components', 'upgrade: promotion step has an outcome identifier')
  requireText(upgrade, "steps.promote_components.outcome == 'failure'", 'upgrade: rollback only starts after failed promotion')
  forbid(upgrade, /steps\.capture\.outcome == 'success'/, 'upgrade: capture alone cannot trigger rollback')
  requireText(upgrade, 'Restore captured RC10 versions', 'upgrade: automatic RC10 rollback')
  requireText(upgrade, 'rollback-pages', 'upgrade: exact Pages rollback')
  requireText(rollback, 'wrangler rollback', 'rollback: Worker version rollback')
  requireText(rollback, 'rollback-pages', 'rollback: Pages rollback')
  requireText(finalizer, 'v2-production-live-rc12', 'finalizer: RC12 live tag')
  requireText(finalizer, 'V2 RC12 Production Public Acceptance', 'finalizer: fresh public acceptance gate')
  requireText(finalizer, 'verify-live', 'finalizer: active RC12 component recheck')
  requireText(finalizer, 'verify-rollback-capability', 'finalizer: rollback recheck')
  requireText(readiness, 'contents: read', 'readiness: no tag write permission')
  assert.equal((readiness.match(/PRODUCTION_PAGES_BASELINE_POLICY: EXISTING_LIVE_UPGRADE/g) ?? []).length, 2, 'readiness: live-upgrade Pages policy guards resolution and rollback')
  requireText(readiness, `v2-production-live)" = "$RC10_RUNTIME_BASE_SHA`, 'readiness: legacy RC10 live tag preserved')
  forbid(readiness, /git tag\b|git push\b/, 'readiness: no tag mutation')
  requireText(acceptance, rc10Sha, 'acceptance: legacy RC10 readiness target preserved')
  requireText(upgradeState, 'record?.latest_stage?.status === "success"', 'upgrade state: Pages success is determined by stage status')
  forbid(upgradeState, /latest_stage\?\.name === "success"/, 'upgrade state: stage names are not success evidence')
  requireText(upgradeState, 'record?.annotations?.["workers/tag"] === tag', 'upgrade state: Cloudflare version annotation tags are recognized')
  requireText(upgradeState, 'UPLOADED_VERSION_STATE_INCONSISTENT', 'upgrade state: partial inactive uploads fail closed')
  requireText(upgradeState, 'UPLOADED_VERSION_IDENTITY_UNPROVEN', 'upgrade state: inactive upload identity is rechecked')
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
  console.log('RC12_UPGRADE_ENV_CONTRACT=PASS')
  console.log('RC12_ROUTE_FREE_UPLOAD_CONTRACT=PASS')
  console.log('RC12_ROLLBACK_CONTRACT=PASS')
  console.log('STATIC_WORKFLOW_POLICY=PASS')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) verifyRc12ReleaseWorkflows()
