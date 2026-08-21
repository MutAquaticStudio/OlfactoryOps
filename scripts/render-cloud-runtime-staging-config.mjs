import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const templatePath = 'wrangler.v2-cloud-runtime.example.toml'
const outputPath = process.env.CLOUD_RUNTIME_STAGING_CONFIG || '.qa/wrangler.v2-cloud-runtime.staging.toml'
const required = ['CLOUD_RUNTIME_GIT_SHA', 'CLOUD_RUNTIME_HYPERDRIVE_ID', 'SCIENTIFIC_FEATURE_IMAGE_DIGEST', 'SCIENTIFIC_MODEL_IMAGE_DIGEST']
const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length) {
  console.log(`CLOUD_RUNTIME_RENDER=BLOCKED missing:${missing.join(',')}`)
  process.exit(process.env.CLOUD_RUNTIME_REQUIRE_READY === 'true' ? 2 : 0)
}
const hyperdriveId = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
if (!hyperdriveId.test(process.env.CLOUD_RUNTIME_HYPERDRIVE_ID ?? '')) throw new Error('CLOUD_RUNTIME_HYPERDRIVE_ID must be a valid Cloudflare Hyperdrive ID')
for (const key of ['SCIENTIFIC_FEATURE_IMAGE_DIGEST', 'SCIENTIFIC_MODEL_IMAGE_DIGEST']) {
  if (!/^sha256:[a-f0-9]{64}$/i.test(process.env[key] ?? '')) throw new Error(`${key} must be an immutable sha256 digest`)
}
let rendered = readFileSync(templatePath, 'utf8')
const outputDirectory = dirname(resolve(outputPath))
const workerEntrypoint = relative(outputDirectory, resolve('worker/cloud-runtime/index.ts')).replaceAll('\\', '/')
if (!workerEntrypoint || workerEntrypoint.startsWith('/')) throw new Error('Unable to resolve cloud runtime Worker entrypoint')
rendered = rendered.replace('main = "worker/cloud-runtime/index.ts"', `main = "${workerEntrypoint}"`)
rendered = rendered.replaceAll('REPLACE_WITH_GIT_SHA', process.env.CLOUD_RUNTIME_GIT_SHA ?? '')
rendered = rendered.replaceAll('REPLACE_WITH_SHA256_DIGEST', process.env.SCIENTIFIC_FEATURE_IMAGE_DIGEST ?? '')
rendered = rendered.replaceAll('REPLACE_WITH_HYPERDRIVE_ID', process.env.CLOUD_RUNTIME_HYPERDRIVE_ID ?? '')
rendered = rendered.replace('registry.cloudflare.com/00000000000000000000000000000000/olfactoryops-scientific-feature@sha256:0000000000000000000000000000000000000000000000000000000000000000', process.env.SCIENTIFIC_FEATURE_IMAGE ?? `registry.cloudflare.com/${process.env.CLOUDFLARE_ACCOUNT_ID ?? 'REPLACE_WITH_ACCOUNT_ID'}/olfactoryops-scientific-feature@${process.env.SCIENTIFIC_FEATURE_IMAGE_DIGEST}`)
rendered = rendered.replace('registry.cloudflare.com/00000000000000000000000000000000/olfactoryops-scientific-model@sha256:0000000000000000000000000000000000000000000000000000000000000000', process.env.SCIENTIFIC_MODEL_IMAGE ?? `registry.cloudflare.com/${process.env.CLOUDFLARE_ACCOUNT_ID ?? 'REPLACE_WITH_ACCOUNT_ID'}/olfactoryops-scientific-model@${process.env.SCIENTIFIC_MODEL_IMAGE_DIGEST}`)
if (rendered.includes('REPLACE_WITH_')) throw new Error('Staging config still contains a placeholder')
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(outputPath, rendered, 'utf8')
console.log(`CLOUD_RUNTIME_RENDER=PASS ${outputPath}`)
