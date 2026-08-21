import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const required = [
  'CLOUD_RUNTIME_GIT_SHA',
  'CLOUD_RUNTIME_HYPERDRIVE_ID',
  'SCIENTIFIC_FEATURE_IMAGE',
  'SCIENTIFIC_MODEL_IMAGE',
  'SCIENTIFIC_FEATURE_IMAGE_DIGEST',
  'SCIENTIFIC_MODEL_IMAGE_DIGEST',
]
const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length) throw new Error(`CLOUD_RUNTIME_PRODUCTION_CONFIG=BLOCKED missing:${missing.join(',')}`)
if (!/^[0-9a-f]{40}$/i.test(process.env.CLOUD_RUNTIME_GIT_SHA ?? '')) throw new Error('CLOUD_RUNTIME_GIT_SHA must be an exact commit SHA')
if (!/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(process.env.CLOUD_RUNTIME_HYPERDRIVE_ID ?? '')) throw new Error('CLOUD_RUNTIME_HYPERDRIVE_ID must be a valid Cloudflare Hyperdrive ID')
for (const key of ['SCIENTIFIC_FEATURE_IMAGE_DIGEST', 'SCIENTIFIC_MODEL_IMAGE_DIGEST']) {
  if (!/^sha256:[a-f0-9]{64}$/i.test(process.env[key] ?? '')) throw new Error(`${key} must be an immutable sha256 digest`)
}
for (const key of ['SCIENTIFIC_FEATURE_IMAGE', 'SCIENTIFIC_MODEL_IMAGE']) {
  if (!/^registry\.cloudflare\.com\/[a-z0-9]+\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/i.test(process.env[key] ?? '')) throw new Error(`${key} must be an immutable Cloudflare registry image reference`)
}

const outputPath = process.env.CLOUD_RUNTIME_PRODUCTION_CONFIG ?? '.qa/wrangler.v2-cloud-runtime.production.toml'
const outputDirectory = dirname(resolve(outputPath))
const main = relative(outputDirectory, resolve('worker/cloud-runtime/index.ts')).replaceAll('\\', '/')
let rendered = readFileSync('wrangler.v2-cloud-runtime-production.example.toml', 'utf8')
rendered = rendered.replace('main = "worker/cloud-runtime/index.ts"', `main = "${main}"`)
rendered = rendered.replaceAll('REPLACE_WITH_GIT_SHA', process.env.CLOUD_RUNTIME_GIT_SHA ?? '')
rendered = rendered.replaceAll('REPLACE_WITH_HYPERDRIVE_ID', process.env.CLOUD_RUNTIME_HYPERDRIVE_ID ?? '')
rendered = rendered.replaceAll('REPLACE_WITH_FEATURE_IMAGE_DIGEST', process.env.SCIENTIFIC_FEATURE_IMAGE_DIGEST ?? '')
rendered = rendered.replaceAll('REPLACE_WITH_FEATURE_IMAGE', process.env.SCIENTIFIC_FEATURE_IMAGE ?? '')
rendered = rendered.replaceAll('REPLACE_WITH_MODEL_IMAGE', process.env.SCIENTIFIC_MODEL_IMAGE ?? '')
if (rendered.includes('REPLACE_WITH_')) throw new Error('CLOUD_RUNTIME_PRODUCTION_CONFIG=FAIL unresolved production placeholder')
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(outputPath, rendered, 'utf8')
console.log(`CLOUD_RUNTIME_PRODUCTION_CONFIG=PASS ${outputPath}`)
