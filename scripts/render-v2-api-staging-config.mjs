import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const templatePath = 'wrangler.v2-api-staging.example.toml'
const outputPath = process.env.V2_API_STAGING_CONFIG ?? '.qa/wrangler.v2-api-staging.toml'
const releaseSha = process.env.V2_API_STAGING_GIT_SHA
const hyperdriveId = process.env.V2_API_STAGING_HYPERDRIVE_ID

if (!/^[0-9a-f]{40}$/i.test(releaseSha ?? '')) throw new Error('V2_API_STAGING_GIT_SHA must be an exact 40-character commit SHA')
if (!/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(hyperdriveId ?? '')) throw new Error('V2_API_STAGING_HYPERDRIVE_ID must be a valid Cloudflare Hyperdrive ID')

const outputDirectory = dirname(resolve(outputPath))
const entrypoint = relative(outputDirectory, resolve('worker/v2-api/index.ts')).replaceAll('\\', '/')
if (!entrypoint || entrypoint.startsWith('/')) throw new Error('Unable to resolve the V2 API Worker entrypoint')

let rendered = readFileSync(templatePath, 'utf8')
rendered = rendered.replace('main = "worker/v2-api/index.ts"', `main = "${entrypoint}"`)
rendered = rendered.replaceAll('REPLACE_WITH_GIT_SHA', releaseSha)
rendered = rendered.replaceAll('REPLACE_WITH_HYPERDRIVE_ID', hyperdriveId)
if (rendered.includes('REPLACE_WITH_')) throw new Error('V2 API staging config still contains a placeholder')

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(outputPath, rendered, 'utf8')
console.log(`V2_API_STAGING_RENDER=PASS ${outputPath}`)
