import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const required = ['V2_TENANT_ROUTER_PRODUCTION_GIT_SHA', 'V2_TENANT_ROUTER_PRODUCTION_HYPERDRIVE_ID', 'V2_TENANT_ROUTER_PRODUCTION_PAGES_ORIGIN']
const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length) throw new Error(`V2_TENANT_ROUTER_PRODUCTION_CONFIG=BLOCKED missing:${missing.join(',')}`)
if (!/^[0-9a-f]{40}$/i.test(process.env.V2_TENANT_ROUTER_PRODUCTION_GIT_SHA ?? '')) throw new Error('V2_TENANT_ROUTER_PRODUCTION_GIT_SHA must be an exact commit SHA')
if (!/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(process.env.V2_TENANT_ROUTER_PRODUCTION_HYPERDRIVE_ID ?? '')) throw new Error('V2_TENANT_ROUTER_PRODUCTION_HYPERDRIVE_ID must be a valid Cloudflare Hyperdrive ID')
const pagesOrigin = new URL(process.env.V2_TENANT_ROUTER_PRODUCTION_PAGES_ORIGIN ?? '')
if (pagesOrigin.protocol !== 'https:' || pagesOrigin.hostname === 'labofscents.org') throw new Error('V2_TENANT_ROUTER_PRODUCTION_PAGES_ORIGIN must be an isolated HTTPS candidate origin')

const outputPath = process.env.V2_TENANT_ROUTER_PRODUCTION_CONFIG ?? '.qa/wrangler.v2-tenant-router-production.toml'
const outputDirectory = dirname(resolve(outputPath))
const main = relative(outputDirectory, resolve('worker/v2-tenant-router.ts')).replaceAll('\\', '/')
let rendered = readFileSync('wrangler.v2-tenant-router-production.example.toml', 'utf8')
rendered = rendered.replace('main = "worker/v2-tenant-router.ts"', `main = "${main}"`)
rendered = rendered.replaceAll('REPLACE_WITH_VERIFIED_RELEASE_SHA', process.env.V2_TENANT_ROUTER_PRODUCTION_GIT_SHA ?? '')
rendered = rendered.replaceAll('REPLACE_WITH_PRODUCTION_HYPERDRIVE_ID', process.env.V2_TENANT_ROUTER_PRODUCTION_HYPERDRIVE_ID ?? '')
rendered = rendered.replaceAll('https://REPLACE_WITH_PRODUCTION_PAGES_ORIGIN', pagesOrigin.toString().replace(/\/$/, ''))
if (rendered.includes('REPLACE_WITH_')) throw new Error('V2_TENANT_ROUTER_PRODUCTION_CONFIG=FAIL unresolved production placeholder')
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(outputPath, rendered, 'utf8')
console.log(`V2_TENANT_ROUTER_PRODUCTION_CONFIG=PASS ${outputPath}`)
