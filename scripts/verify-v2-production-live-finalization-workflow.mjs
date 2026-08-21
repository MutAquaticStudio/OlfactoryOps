import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../.github/workflows/v2-production-live-finalization.yml', import.meta.url), 'utf8')
const required = [
  'name: V2 RC10 Production Live Finalization',
  'workflow_dispatch:',
  'contents: write',
  'actions: read',
  'environment: production',
  "github.ref == 'refs/heads/main'",
  "github.ref_type == 'branch'",
  'fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd',
  'v2-production-rc10',
  'v2-production-ready',
  'v2-production-rc9',
  'v2-production-rc11',
  'verify-v2-production-live-finalization.mjs',
  'verify-v2-production-rollback-readiness.mjs',
  'rollback_status=$?',
  'ROLLBACK_PAGES_(BASELINE|READY)',
  'PUBLIC_ACCEPTANCE_RUN_ID: ${{ inputs.public_acceptance_run_id }}',
  'PRODUCTION_ROLLBACK_READY=PASS',
  'refs/tags/$LIVE_TAG',
  'V2_PRODUCTION_LIVE_TAG=$RC10_SHA',
  'GO_LIVE=YES',
]

for (const fragment of required) {
  if (!workflow.includes(fragment)) throw new Error('LIVE_FINALIZATION_WORKFLOW_CONTRACT_FAIL')
}

if (!/^on:\s*\n\s+workflow_dispatch:/m.test(workflow) || /\n\s*(?:push|pull_request|pull_request_target|schedule|workflow_call|workflow_run):/m.test(workflow)) {
  throw new Error('LIVE_FINALIZATION_TRIGGER_CONTRACT_FAIL')
}

if (/gh\s+secret|gh\s+variable|git\s+push[^\n]*--force|git\s+tag\s+-[df]|wrangler\s+(?:deploy|pages)|workers\/(?:routes|domains)|curl\s+[^\n]*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)/i.test(workflow)) {
  throw new Error('LIVE_FINALIZATION_NO_MUTATION_CONTRACT_FAIL')
}

console.log('RC10_PRODUCTION_LIVE_FINALIZATION_WORKFLOW=PASS')
