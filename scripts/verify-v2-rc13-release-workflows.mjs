import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflows = join(root, '.github', 'workflows')
const rc13Sha = '09e96feacb9db03325683ee329fb269206a21880'
const rc12Sha = '331c1a6054fe1420b063a2e1fe9e5cef4f043ff8'

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
  requireText(value, "github.event_name == 'workflow_dispatch'", `${label}: dispatch only`)
  requireText(value, "github.ref == 'refs/heads/main'", `${label}: main ref guard`)
  requireText(value, "github.ref_type == 'branch'", `${label}: branch guard`)
}

export function verifyRc13ReleaseWorkflows() {
  const named = {
    sourceFinalization: source('v2-rc13-release-source-finalization.yml'),
    candidate: source('v2-rc13-isolated-production-candidate.yml'),
    revalidation: source('v2-rc13-production-environment-revalidation.yml'),
    migration: source('v2-rc13-production-password-reset-migration.yml'),
    backup: source('v2-rc13-production-backup-snapshot.yml'),
    readiness: source('v2-rc13-production-readiness.yml'),
    upgrade: source('v2-rc13-production-upgrade-dispatcher.yml'),
    rollback: source('v2-rc13-production-upgrade-rollback.yml'),
    acceptance: source('v2-rc13-production-public-acceptance.yml'),
    finalization: source('v2-rc13-production-live-finalization.yml'),
  }
  const renderer = readFileSync(join(root, 'scripts', 'render-v2-rc13-cloud-runtime-candidate-config.mjs'), 'utf8')
  const migrationHelper = readFileSync(join(root, 'scripts', 'apply-v2-rc13-password-reset-migration.mjs'), 'utf8')
  const manifest = JSON.parse(readFileSync(join(root, 'releases', 'v2-production-rc13.json'), 'utf8'))
  const all = Object.values(named).join('\n')

  for (const [name, value] of Object.entries(named)) {
    requireText(value, 'on:\n  workflow_dispatch:', `${name}: sole dispatch trigger`)
    assertMainOnly(value, name)
    requireText(value, 'environment: production', `${name}: protected environment`)
    requireText(value, rc13Sha, `${name}: immutable RC13 identity`)
    forbid(value, /git tag -f|git push --force/, `${name}: force tag forbidden`)
  }
  requireText(named.sourceFinalization, 'RC13_SOURCE_BRANCH: codex/v2-production-rc13', 'finalizer: exact source branch')
  requireText(named.sourceFinalization, 'origin/$RC13_SOURCE_BRANCH', 'finalizer: branch SHA rechecked')
  requireText(named.sourceFinalization, 'v2-rc13-release-policy.mjs', 'finalizer: manifest policy')
  requireText(named.sourceFinalization, 'git tag -a', 'finalizer: annotated source tag')
  requireText(named.candidate, 'render-v2-rc13-cloud-runtime-candidate-config.mjs render', 'candidate: isolated renderer')
  requireText(named.candidate, 'V2_PASSWORD_RESET_ENCRYPTION_KEY', 'candidate: reset key binding name')
  requireText(named.candidate, 'PRODUCTION_PASSWORD_RESET_DELIVERY_READINESS', 'candidate: delivery gate')
  requireText(named.revalidation, 'V2_PASSWORD_RESET_ENCRYPTION_KEY', 'revalidation: reset key gate')
  requireText(named.migration, 'V2 RC13 Production Password Reset Migration', 'migration: dedicated operation')
  requireText(named.migration, 'APPLY_RC13_PASSWORD_RESET_MIGRATION', 'migration: exact confirmation')
  requireText(named.migration, 'apply-v2-rc13-password-reset-migration.mjs', 'migration: bounded helper')
  requireText(named.migration, 'fetch-depth: 0', 'migration: immutable source remains locally addressable')
  forbid(named.migration, /configure:v2-production-runtime-role|migrate:v2-production/, 'migration: no broad production migration chain')
  requireText(named.readiness, 'migration_run_id', 'readiness: migration run required')
  requireText(named.readiness, 'RC13_PASSWORD_RESET_MIGRATION=PASS', 'readiness: migration evidence gate')
  requireText(named.readiness, 'RC13_MIGRATION_BOUNDARY=PASS', 'readiness: manifest migration boundary')
  requireText(named.upgrade, 'wrangler versions upload', 'upgrade: inactive Worker upload')
  requireText(named.upgrade, 'wrangler versions deploy', 'upgrade: bounded Worker promotion')
  requireText(named.upgrade, 'rollback-pages', 'upgrade: exact Pages rollback')
  requireText(named.rollback, 'wrangler rollback', 'rollback: Worker rollback')
  requireText(named.rollback, 'rollback-pages', 'rollback: Pages rollback')
  requireText(named.finalization, 'v2-production-live-rc13', 'finalizer: RC13 live tag')
  requireText(named.finalization, 'V2 RC13 Production Public Acceptance', 'finalizer: public acceptance gate')
  requireText(named.acceptance, 'RC10_BASE_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd', 'acceptance: legacy RC10 readiness tag remains immutable')
  for (const marker of ['CANDIDATE_WORKER_NAME_ISOLATED=PASS', 'CANDIDATE_WORKFLOW_NAME_ISOLATED=PASS', 'PRODUCTION_QUEUE_CONSUMERS_ABSENT=PASS', 'PUBLIC_ROUTES_ABSENT=PASS', 'PUBLIC_CUSTOM_DOMAINS_ABSENT=PASS', 'RC13_SHA_UNCHANGED=PASS']) requireText(renderer, marker, `renderer: ${marker}`)
  requireText(renderer, 'PASSWORD_RESET_DELIVERY_ENABLED = "false"', 'renderer: candidate reset delivery is disabled')
  requireText(migrationHelper, 'infra/postgres/migrations/0026_platform_password_resets.sql', 'migration helper: exact migration path')
  requireText(migrationHelper, '851124f6275af657f121d03fd0a5c845fefd36fdf1eaea1451b2a63e5b3ed5ff', 'migration helper: immutable source hash')
  requireText(migrationHelper, "await client.query('BEGIN')", 'migration helper: transaction begin')
  requireText(migrationHelper, "await client.query('COMMIT')", 'migration helper: transaction commit')
  forbid(migrationHelper, /console\.error|error\.message|console\.log\([^)]*migrationSql/, 'migration helper: no raw database error or SQL output')
  assert.ok(manifest.changedFiles.some((file) => file.path === 'scripts/verify-v2-rc13-public-auth-contract.mjs'), 'manifest: RC13 source auth contract is included')
  forbid(all, /route-handoff|workers\/routes|workers\/domains/, 'RC13: upgrade workflows do not mutate route bindings')
  forbid(all, /\b(?:ALTER|CREATE|DROP|GRANT|REVOKE)\s+(?:TABLE|SCHEMA|POLICY|ROLE)\b/i, 'RC13: release workflows do not mutate database')
  console.log('RC13_RELEASE_WORKFLOW_CONTRACT=PASS')
  console.log('RC13_PASSWORD_RESET_DELIVERY_CONTRACT=PASS')
  console.log('STATIC_WORKFLOW_POLICY=PASS')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) verifyRc13ReleaseWorkflows()
