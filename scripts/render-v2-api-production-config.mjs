import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const required = ['V2_API_PRODUCTION_GIT_SHA', 'V2_API_PRODUCTION_HYPERDRIVE_ID']
const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length) throw new Error(`V2_API_PRODUCTION_CONFIG=BLOCKED missing:${missing.join(',')}`)
if (!/^[0-9a-f]{40}$/i.test(process.env.V2_API_PRODUCTION_GIT_SHA ?? '')) throw new Error('V2_API_PRODUCTION_GIT_SHA must be an exact commit SHA')
if (!/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(process.env.V2_API_PRODUCTION_HYPERDRIVE_ID ?? '')) throw new Error('V2_API_PRODUCTION_HYPERDRIVE_ID must be a valid Cloudflare Hyperdrive ID')

const outputPath = process.env.V2_API_PRODUCTION_CONFIG ?? '.qa/wrangler.v2-api-production.toml'
const outputDirectory = dirname(resolve(outputPath))
const main = relative(outputDirectory, resolve('worker/v2-api/index.ts')).replaceAll('\\', '/')
let rendered = readFileSync('wrangler.v2-api-production.example.toml', 'utf8')
rendered = rendered.replace('main = "worker/v2-api/index.ts"', `main = "${main}"`)
rendered = rendered.replaceAll('REPLACE_WITH_VERIFIED_RELEASE_SHA', process.env.V2_API_PRODUCTION_GIT_SHA ?? '')
rendered = rendered.replaceAll('REPLACE_WITH_PRODUCTION_HYPERDRIVE_ID', process.env.V2_API_PRODUCTION_HYPERDRIVE_ID ?? '')
if (rendered.includes('REPLACE_WITH_')) throw new Error('V2_API_PRODUCTION_CONFIG=FAIL unresolved production placeholder')
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(outputPath, rendered, 'utf8')
console.log(`V2_API_PRODUCTION_CONFIG=PASS ${outputPath}`)
