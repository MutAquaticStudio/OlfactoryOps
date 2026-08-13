import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const required = [
  'V2_RUNTIME_DIAGNOSTIC_TARGET_RELEASE_SHA',
  'V2_RUNTIME_DIAGNOSTIC_HYPERDRIVE_ID',
  'V2_RUNTIME_DIAGNOSTIC_FIXTURE_HOSTNAME',
  'V2_RUNTIME_DIAGNOSTIC_EXPECTED_DATABASE_NAME_SHA',
]
const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length) throw new Error(`V2_RUNTIME_DIAGNOSTIC_CONFIG=BLOCKED missing:${missing.join(',')}`)

const releaseSha = process.env.V2_RUNTIME_DIAGNOSTIC_TARGET_RELEASE_SHA ?? ''
const hyperdriveId = process.env.V2_RUNTIME_DIAGNOSTIC_HYPERDRIVE_ID ?? ''
const hostname = process.env.V2_RUNTIME_DIAGNOSTIC_FIXTURE_HOSTNAME ?? ''
const expectedDatabaseNameSha = process.env.V2_RUNTIME_DIAGNOSTIC_EXPECTED_DATABASE_NAME_SHA ?? ''
if (!/^[0-9a-f]{40}$/i.test(releaseSha)) throw new Error('V2_RUNTIME_DIAGNOSTIC_TARGET_RELEASE_SHA must be an exact commit SHA')
if (!/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(hyperdriveId)) throw new Error('V2_RUNTIME_DIAGNOSTIC_HYPERDRIVE_ID must be a valid Cloudflare Hyperdrive ID')
if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.next\.labofscents\.org$/.test(hostname)) throw new Error('V2_RUNTIME_DIAGNOSTIC_FIXTURE_HOSTNAME must be one lowercase candidate workspace hostname')
if (!/^[a-f0-9]{64}$/i.test(expectedDatabaseNameSha)) throw new Error('V2_RUNTIME_DIAGNOSTIC_EXPECTED_DATABASE_NAME_SHA must be a SHA-256 digest')

const outputPath = process.env.V2_RUNTIME_DIAGNOSTIC_CONFIG ?? '.qa/wrangler.v2-tenant-router-runtime-diagnostic.toml'
const outputDirectory = dirname(resolve(outputPath))
const main = relative(outputDirectory, resolve('worker/v2-tenant-router-runtime-diagnostic.ts')).replaceAll('\\', '/')
let rendered = readFileSync('wrangler.v2-tenant-router-runtime-diagnostic.example.toml', 'utf8')
rendered = rendered.replace('main = "worker/v2-tenant-router-runtime-diagnostic.ts"', `main = "${main}"`)
rendered = rendered.replaceAll('REPLACE_WITH_DIAGNOSTIC_FIXTURE_HOSTNAME', hostname)
rendered = rendered.replaceAll('REPLACE_WITH_TARGET_RELEASE_SHA', releaseSha)
rendered = rendered.replaceAll('REPLACE_WITH_EXPECTED_DATABASE_NAME_SHA', expectedDatabaseNameSha.toLowerCase())
rendered = rendered.replaceAll('REPLACE_WITH_PRODUCTION_HYPERDRIVE_ID', hyperdriveId)
if (rendered.includes('REPLACE_WITH_') || /^routes\s*=|^\[\[routes\]\]/m.test(rendered) || !/^workers_dev\s*=\s*true$/m.test(rendered)) {
  throw new Error('V2_RUNTIME_DIAGNOSTIC_CONFIG=FAIL diagnostic config must remain workers.dev only without routes')
}
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(outputPath, rendered, 'utf8')
console.log(`V2_RUNTIME_DIAGNOSTIC_CONFIG=PASS ${outputPath}`)
