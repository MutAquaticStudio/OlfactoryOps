import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { expect, test } from 'vitest'

const workflowPath = '.github/workflows/v2-production-candidate-dispatch.yml'
const workflow = readFileSync(workflowPath, 'utf8')
const marker = "node --input-type=module <<'EOF'"
const start = workflow.indexOf(marker)
const end = workflow.indexOf('\n          EOF', start)
if (start < 0 || end < 0) throw new Error('candidate Cloud Runtime renderer is missing from its protected dispatcher')
const renderer = workflow.slice(start + marker.length, end).trim()

const immutableRc2Sha = '5985834a0e14728c81c8c028a72122ded544bd6b'
const candidateConfigName = 'wrangler.v2-cloud-runtime.production-candidate.toml'
const featureDigest = `sha256:${'a'.repeat(64)}`
const modelDigest = `sha256:${'b'.repeat(64)}`
const featureImage = `registry.cloudflare.com/account/olfactoryops-scientific-feature@${featureDigest}`
const modelImage = `registry.cloudflare.com/account/olfactoryops-scientific-model@${modelDigest}`

const template = `name = "olfactoryops-v2-cloud-runtime-production"
main = "worker/cloud-runtime/index.ts"
compatibility_date = "2026-08-11"
compatibility_flags = ["nodejs_compat"]
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

const fixtureWorker = `export class ScientificJobWorkflow {}
export class ScientificFeatureContainer {}
export class ScientificModelContainer {}
export default {
  fetch() {
    return new Response('ok')
  },
}
`

function createCandidateWorkspace() {
  const directory = mkdtempSync(join(process.cwd(), '.candidate-render-'))
  mkdirSync(join(directory, 'worker', 'cloud-runtime'), { recursive: true })
  writeFileSync(join(directory, 'worker', 'cloud-runtime', 'index.ts'), fixtureWorker)
  return directory
}

function renderCandidateConfig(directory, sourceTemplate = template) {
  writeFileSync(join(directory, 'wrangler.v2-cloud-runtime-production.example.toml'), sourceTemplate)
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', renderer], {
    cwd: directory,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      RELEASE_SHA: immutableRc2Sha,
      PRODUCTION_HYPERDRIVE_ID: 'a'.repeat(32),
      PRODUCTION_SCIENTIFIC_FEATURE_IMAGE: featureImage,
      PRODUCTION_SCIENTIFIC_MODEL_IMAGE: modelImage,
      PRODUCTION_SCIENTIFIC_FEATURE_IMAGE_DIGEST: featureDigest,
      PRODUCTION_SCIENTIFIC_MODEL_IMAGE_DIGEST: modelDigest,
    },
  })
  const configPath = join(directory, candidateConfigName)
  return { config: readFileSync(configPath, 'utf8'), configPath, output }
}

function withCandidateWorkspace(action) {
  const directory = createCandidateWorkspace()
  try {
    return action(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function resolveEntrypoint(configPath, config) {
  const main = config.match(/^main\s*=\s*"([^"]+)"\s*$/m)?.[1]
  if (!main) throw new Error('candidate config is missing main')
  return { main, path: resolve(dirname(configPath), main) }
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

test('candidate Cloud Runtime renderer keeps the config at root and resolves the immutable RC2 entrypoint', () => {
  withCandidateWorkspace((directory) => {
    const { config, configPath, output } = renderCandidateConfig(directory)
    const entrypoint = resolveEntrypoint(configPath, config)
    const relocatedEntrypoint = resolve(dirname(join(directory, '.qa', candidateConfigName)), entrypoint.main)

    expect(configPath).toBe(join(directory, candidateConfigName))
    expect(entrypoint.main).toBe('worker/cloud-runtime/index.ts')
    expect(relative(directory, entrypoint.path).replaceAll('\\', '/')).toBe('worker/cloud-runtime/index.ts')
    expect(existsSync(entrypoint.path)).toBe(true)
    expect(relative(directory, relocatedEntrypoint).replaceAll('\\', '/')).toBe('.qa/worker/cloud-runtime/index.ts')
    expect(existsSync(relocatedEntrypoint)).toBe(false)
    expect(output).toContain(`CANDIDATE_ENTRYPOINT_CONFIG=${candidateConfigName}`)
    expect(output).toContain('CANDIDATE_ENTRYPOINT_MAIN=worker/cloud-runtime/index.ts')
    expect(output).toContain('CANDIDATE_ENTRYPOINT_RESOLVED=worker/cloud-runtime/index.ts')
    expect(output).toContain('CANDIDATE_ENTRYPOINT_RESOLUTION=PASS')
    expect(config).not.toContain('REPLACE_WITH_')
    expect(config).toContain(`RELEASE_GIT_SHA = "${immutableRc2Sha}"`)
    expect(config).toContain(`SCIENTIFIC_RUNTIME_IMAGE_DIGEST = "${featureDigest}"`)
    expect(config).toContain(`image = "${featureImage}"`)
    expect(config).toContain(`image = "${modelImage}"`)
    expect(config).not.toContain(`${featureImage}_DIGEST`)
    expect(config).not.toContain(`${modelImage}_DIGEST`)
    expect(config).toContain('name = "olfactoryops-v2-cloud-runtime-production-candidate"')
    expect(config).not.toMatch(/^name = "olfactoryops-v2-cloud-runtime-production"$/m)
    expect(config).not.toMatch(/api-next|tenant-router|pages|routes|labofscents\.org/i)
    validateCloudRuntimeConfig(config)
  })
})

test('candidate Cloud Runtime renderer rejects unresolved placeholders before Wrangler can run', () => {
  withCandidateWorkspace((directory) => {
    expect(() => renderCandidateConfig(directory, `${template}\nEXTRA = "REPLACE_WITH_UNHANDLED"\n`)).toThrow(
      /unresolved placeholders/,
    )
  })
})

test('candidate Cloud Runtime config has no unaudited relocatable path fields', () => {
  const relocatableFields = [...template.matchAll(/^\s*(main|base_dir|directory|dir|file|script|command|wasm_modules|text_blobs|data_blobs)\s*=/gim)]
    .map((match) => match[1])
  expect(relocatableFields).toEqual(['main'])
})

test('candidate Cloud Runtime root config bundles with Wrangler dry-run', () => {
  withCandidateWorkspace((directory) => {
    const { configPath } = renderCandidateConfig(directory)
    const wrangler = resolve('node_modules', 'wrangler', 'bin', 'wrangler.js')
    expect(existsSync(wrangler)).toBe(true)
    expect(() => execFileSync(process.execPath, [wrangler, 'deploy', '--dry-run', '--config', configPath, '--outdir', 'dist-candidate-runtime'], {
      cwd: directory,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    })).not.toThrow()
  })
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
