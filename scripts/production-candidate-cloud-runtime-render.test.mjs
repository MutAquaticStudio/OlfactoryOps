import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

const workflowPath = '.github/workflows/v2-production-candidate-dispatch.yml'
const workflow = readFileSync(workflowPath, 'utf8')
const marker = "node --input-type=module <<'EOF'"
const start = workflow.indexOf(marker)
const end = workflow.indexOf('\n          EOF', start)
if (start < 0 || end < 0) throw new Error('candidate Cloud Runtime renderer is missing from its protected dispatcher')
const renderer = workflow.slice(start + marker.length, end).trim()

const featureDigest = `sha256:${'a'.repeat(64)}`
const modelDigest = `sha256:${'b'.repeat(64)}`
const featureImage = `registry.cloudflare.com/account/olfactoryops-scientific-feature@${featureDigest}`
const modelImage = `registry.cloudflare.com/account/olfactoryops-scientific-model@${modelDigest}`

const template = `name = "olfactoryops-v2-cloud-runtime-production"
main = "worker/cloud-runtime/index.ts"
workers_dev = false

[vars]
RELEASE_ENVIRONMENT = "production"
RELEASE_GIT_SHA = "REPLACE_WITH_GIT_SHA"
SCIENTIFIC_RUNTIME_IMAGE_DIGEST = "REPLACE_WITH_FEATURE_IMAGE_DIGEST"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "REPLACE_WITH_HYPERDRIVE_ID"

[[r2_buckets]]
binding = "R2_ARTIFACTS"
bucket_name = "olfactoryops-v2-artifacts-production"

[[vectorize]]
binding = "MATERIAL_EVIDENCE_VECTORS"
index_name = "olfactoryops-v2-material-evidence-production"

[[queues.producers]]
binding = "SCIENTIFIC_JOBS"
queue = "olfactoryops-v2-scientific-production"

[[workflows]]
name = "olfactoryops-v2-scientific-production"
binding = "SCIENTIFIC_WORKFLOW"
class_name = "ScientificJobWorkflow"

[[durable_objects.bindings]]
name = "SCIENTIFIC_FEATURE_CONTAINER"
class_name = "ScientificFeatureContainer"

[[durable_objects.bindings]]
name = "SCIENTIFIC_MODEL_CONTAINER"
class_name = "ScientificModelContainer"

[[containers]]
class_name = "ScientificFeatureContainer"
image = "REPLACE_WITH_FEATURE_IMAGE"

[[containers]]
class_name = "ScientificModelContainer"
image = "REPLACE_WITH_MODEL_IMAGE"
`

function renderCandidateConfig() {
  const directory = mkdtempSync(join(tmpdir(), 'olfactoryops-candidate-render-'))
  try {
    writeFileSync(join(directory, 'wrangler.v2-cloud-runtime-production.example.toml'), template)
    execFileSync(process.execPath, ['--input-type=module', '--eval', renderer], {
      cwd: directory,
      env: {
        ...process.env,
        RELEASE_SHA: 'f'.repeat(40),
        PRODUCTION_HYPERDRIVE_ID: 'a'.repeat(32),
        PRODUCTION_SCIENTIFIC_FEATURE_IMAGE: featureImage,
        PRODUCTION_SCIENTIFIC_MODEL_IMAGE: modelImage,
        PRODUCTION_SCIENTIFIC_FEATURE_IMAGE_DIGEST: featureDigest,
        PRODUCTION_SCIENTIFIC_MODEL_IMAGE_DIGEST: modelDigest,
      },
    })
    return readFileSync(join(directory, '.qa', 'wrangler.v2-cloud-runtime.production-candidate.toml'), 'utf8')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function validateCloudRuntimeConfig(contents) {
  const required = [
    'HYPERDRIVE',
    'R2_ARTIFACTS',
    'MATERIAL_EVIDENCE_VECTORS',
    'SCIENTIFIC_JOBS',
    'SCIENTIFIC_WORKFLOW',
    'ScientificFeatureContainer',
    'ScientificModelContainer',
  ]
  for (const token of required) expect(contents).toContain(token)
  for (const forbidden of ['MOLECULAR_EMBEDDING_VECTORS', 'ODOR_EMBEDDING_VECTORS']) {
    expect(contents).not.toContain(forbidden)
  }
  expect(contents).not.toMatch(/REPLACE_WITH_[A-Z0-9_]+/)
  expect(contents).toMatch(/SCIENTIFIC_RUNTIME_IMAGE_DIGEST = "sha256:[a-f0-9]{64}"/i)
}

test('candidate Cloud Runtime renderer replaces overlapping image tokens without corrupting digest pinning', () => {
  const config = renderCandidateConfig()
  expect(config).not.toContain('REPLACE_WITH_')
  expect(config).toContain(`SCIENTIFIC_RUNTIME_IMAGE_DIGEST = "${featureDigest}"`)
  expect(config).toContain(`image = "${featureImage}"`)
  expect(config).toContain(`image = "${modelImage}"`)
  expect(config).not.toContain(`${featureImage}_DIGEST`)
  expect(config).not.toContain(`${modelImage}_DIGEST`)
  expect(config).toMatch(/SCIENTIFIC_RUNTIME_IMAGE_DIGEST = "sha256:[a-f0-9]{64}"/i)
  expect(config).toContain('name = "olfactoryops-v2-cloud-runtime-production-candidate"')
  expect(config).not.toMatch(/^routes\s*=/m)
  validateCloudRuntimeConfig(config)
})

test('every overlapping placeholder replacement in the candidate dispatcher is specific-before-prefix', () => {
  const placeholders = [...workflow.matchAll(/replaceAll\('(?<token>REPLACE_WITH_[A-Z0-9_]+)'/g)]
    .map((match) => ({ token: match.groups.token, index: match.index }))
  for (const prefix of placeholders) {
    for (const candidate of placeholders) {
      if (candidate.token !== prefix.token && candidate.token.startsWith(prefix.token)) {
        expect(candidate.index, `${candidate.token} must precede ${prefix.token}`).toBeLessThan(prefix.index)
      }
    }
  }
})
