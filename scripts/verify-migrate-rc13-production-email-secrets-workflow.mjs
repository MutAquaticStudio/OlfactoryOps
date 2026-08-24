import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflow = readFileSync(join(root, '.github', 'workflows', 'migrate-rc13-production-email-secrets.yml'), 'utf8').replaceAll('\r\n', '\n')
const helper = readFileSync(join(root, 'scripts', 'migrate-rc13-production-email-secrets.py'), 'utf8').replaceAll('\r\n', '\n')

function required(source, text, label) {
  assert.ok(source.includes(text), label)
}

function forbidden(source, pattern, label) {
  assert.doesNotMatch(source, pattern, label)
}

export function verifyRc13ProductionEmailSecretMigrationWorkflow() {
  required(workflow, 'name: Migrate RC13 Production Email Secrets', 'workflow identity')
  required(workflow, 'on:\n  workflow_dispatch:', 'dispatch-only trigger')
  required(workflow, "github.event_name == 'workflow_dispatch'", 'dispatch guard')
  required(workflow, "github.ref == 'refs/heads/main'", 'main-only guard')
  required(workflow, "github.ref_type == 'branch'", 'branch guard')
  forbidden(workflow, /^ {4}inputs:/m, 'workflow: no caller-supplied inputs')
  required(workflow, 'environment: production', 'production reviewer gate')
  required(workflow, 'actions: write', 'least privilege secret-management permission')
  required(workflow, 'contents: read', 'least privilege repository permission')
  required(workflow, 'secrets.PRODUCTION_OWNER_ONBOARDING_RESEND_API_KEY', 'legacy Resend injection')
  required(workflow, 'secrets.PRODUCTION_OWNER_ONBOARDING_EMAIL_FROM', 'legacy sender injection')
  required(workflow, 'PyNaCl==1.5.0', 'pinned sealed-box implementation')
  required(workflow, 'migrate-rc13-production-email-secrets.py', 'in-memory migration helper')
  forbidden(workflow, /pull_request|workflow_call|workflow_run|schedule:/, 'unsafe trigger')
  forbidden(workflow, /set -x|printenv|GITHUB_OUTPUT|GITHUB_STEP_SUMMARY|upload-artifact|gh secret set|echo \$|base64/, 'secret exposure or alternate write path')

  for (const marker of [
    "TARGET_ENVIRONMENT = 'production'",
    "LEGACY_RESEND_SECRET = 'PRODUCTION_OWNER_ONBOARDING_RESEND_API_KEY'",
    "LEGACY_EMAIL_FROM_SECRET = 'PRODUCTION_OWNER_ONBOARDING_EMAIL_FROM'",
    "CANONICAL_RESEND_SECRET = 'RESEND_API_KEY'",
    "CANONICAL_EMAIL_FROM_SECRET = 'EMAIL_FROM'",
    "request('GET', base_url, token)",
    "request('GET', f'{base_url}/secrets/public-key', token)",
    "request('PUT', f'{base_url}/secrets/{quote(name, safe=\"\")}', token, body)",
    "SealedBox(PublicKey(",
    "SECRET_WRITE_SCOPE=PRODUCTION_ENVIRONMENT",
    'RC13_REQUIRED_PRODUCTION_SECRET_NAMES=PASS',
    'LEGACY_EMAIL_SECRETS_PRESERVED=YES',
    "fail('UNCLASSIFIED_MIGRATION_FAILURE')",
  ]) required(helper, marker, `helper: ${marker}`)
  forbidden(helper, /print\([^)]*(?:legacy_resend|legacy_email_from|encrypted_value|payloads|token|public_key)|traceback|logging\.|\bopen\(/, 'helper: no secret persistence or disclosure')
  console.log('SECRET_EXPOSURE_STATIC_CHECK=PASS')
  console.log('WORKFLOW_SCOPE_CHECK=PASS')
  console.log('PRODUCTION_APPROVAL_PRESERVED=PASS')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) verifyRc13ProductionEmailSecretMigrationWorkflow()
