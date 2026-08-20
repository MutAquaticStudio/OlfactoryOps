import { readFileSync } from 'node:fs'

const workflow = readFileSync(
  '.github/workflows/v2-rc10-production-smoke-tenant-selection.yml',
  'utf8',
)
const inventory = readFileSync(
  'scripts/inspect-v2-rc10-production-smoke-tenant-selection.mjs',
  'utf8',
)

const requiredWorkflow = [
  'name: V2 RC10 Production Smoke Tenant Selection',
  'workflow_dispatch:',
  "github.ref == 'refs/heads/main'",
  'RC10_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd',
  'RC10_TAG: v2-production-rc10',
  'SELECT_RC10_PRODUCTION_SMOKE_TENANT',
  'environment: production',
  'ref: ${{ needs.validate.outputs.release_sha }}',
  'npm ci --ignore-scripts',
  'PRODUCTION_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}',
  'inspect-v2-rc10-production-smoke-tenant-selection.mjs',
  'SMOKE_TENANT_SELECTION_REQUIRED=YES',
  'Remove runner-local tenant-selection evidence',
]

const requiredInventory = [
  'BEGIN READ ONLY',
  "hostname.status = 'ACTIVE'",
  "organization.status = 'ACTIVE'",
  'ORDER BY hostname.hostname ASC',
  'LIMIT 21',
  'SMOKE_TENANT_CANDIDATE_COUNT=',
  'SMOKE_TENANT_CANDIDATE_${index + 1}=',
]

const forbidden =
  /(?:PRODUCTION_SMOKE_LOGIN_(?:EMAIL|PASSWORD)|V2_PASSWORD_PEPPER|v2_(?:users|memberships|platform_operators)|wrangler\s+(?:deploy|pages|delete|secret)|workers\/(?:routes|domains)|gh\s+(?:api|workflow|secret|variable)|git\s+(?:tag|push)|\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b|console\.(?:error|warn))/i

const inspectStart = workflow.indexOf(
  '- name: List active tenant hostname candidates with a read-only database session',
)
const installStart = workflow.indexOf(
  '- name: Install exact RC10 dependencies without provider credentials',
)

if (!requiredWorkflow.every((entry) => workflow.includes(entry))) {
  throw new Error('PRODUCTION_SMOKE_TENANT_SELECTION_WORKFLOW_CONTRACT=FAIL')
}
if (!requiredInventory.every((entry) => inventory.includes(entry))) {
  throw new Error('PRODUCTION_SMOKE_TENANT_SELECTION_INVENTORY_CONTRACT=FAIL')
}
if (forbidden.test(workflow) || forbidden.test(inventory)) {
  throw new Error('PRODUCTION_SMOKE_TENANT_SELECTION_BOUNDARY=FAIL')
}
if (
  inspectStart <= installStart ||
  !/on:\s*\n\s+workflow_dispatch:/m.test(workflow) ||
  /^\s+(?:push|pull_request|schedule|workflow_call|workflow_run):/m.test(workflow)
) {
  throw new Error('PRODUCTION_SMOKE_TENANT_SELECTION_WORKFLOW_SHAPE=FAIL')
}

console.log('PRODUCTION_SMOKE_TENANT_SELECTION_WORKFLOW=PASS')
console.log('PRODUCTION_SMOKE_TENANT_SELECTION_BOUNDARY=PASS')
