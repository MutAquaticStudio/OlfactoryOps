import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../.github/workflows/v2-rc11-release-source-finalization.yml', import.meta.url), 'utf8')
const required = [
  'name: V2 RC11 Release Source Finalization',
  'workflow_dispatch:',
  'contents: write',
  'environment: production',
  "github.ref == 'refs/heads/main'",
  "github.ref_type == 'branch'",
  '98cfac77853ffb0b6b69235bb3483117dc3b6961',
  'fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd',
  'codex/v2-production-rc11',
  'v2-production-rc11',
  'FINALIZE_RC11_RELEASE_SOURCE',
  'v2-rc11-release-policy.mjs',
  'git tag -a v2-production-rc11',
  'git push origin refs/tags/v2-production-rc11',
  'RC11_SOURCE_DEPLOYED=NO',
]
for (const fragment of required) {
  if (!workflow.includes(fragment)) throw new Error('RC11_RELEASE_SOURCE_FINALIZATION_CONTRACT_FAIL')
}
if (!/^on:\s*\n\s+workflow_dispatch:/m.test(workflow) || /\n\s*(?:push|pull_request|pull_request_target|schedule|workflow_call|workflow_run):/m.test(workflow)) throw new Error('RC11_RELEASE_SOURCE_FINALIZATION_TRIGGER_FAIL')
if (/wrangler\s+(?:deploy|pages|rollback)|workers\/(?:routes|domains)|curl\s+[^\n]*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)|git\s+tag\s+-[df]|git\s+push[^\n]*--force|PRODUCTION_DATABASE_URL|migrations\//i.test(workflow)) throw new Error('RC11_RELEASE_SOURCE_FINALIZATION_SCOPE_FAIL')
console.log('RC11_RELEASE_SOURCE_FINALIZATION_WORKFLOW=PASS')
