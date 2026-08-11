import { existsSync, readFileSync } from 'node:fs'

const path = process.argv[2] || 'wrangler.v2-cloud-runtime.example.toml'
if (!existsSync(path)) throw new Error(`Cloud runtime config is missing: ${path}`)
const contents = readFileSync(path, 'utf8')
const required = ['HYPERDRIVE', 'R2_ARTIFACTS', 'MATERIAL_EVIDENCE_VECTORS', 'SCIENTIFIC_JOBS', 'SCIENTIFIC_WORKFLOW', 'ScientificFeatureContainer', 'ScientificModelContainer']
for (const token of required) if (!contents.includes(token)) throw new Error(`Cloud runtime binding is missing: ${token}`)
for (const forbidden of ['MOLECULAR_EMBEDDING_VECTORS', 'ODOR_EMBEDDING_VECTORS']) {
  if (contents.includes(forbidden)) throw new Error(`${forbidden} must remain unbound until its serving contract is approved`)
}
const placeholders = [...contents.matchAll(/REPLACE_WITH_[A-Z0-9_]+/g)].map((match) => match[0])
if (placeholders.length) {
  console.log(`CLOUD_RUNTIME_CONFIG=BLOCKED placeholders:${[...new Set(placeholders)].join(',')}`)
  process.exit(process.env.CLOUD_RUNTIME_REQUIRE_READY === 'true' ? 2 : 0)
}
if (!/SCIENTIFIC_RUNTIME_IMAGE_DIGEST = "sha256:[a-f0-9]{64}"/i.test(contents)) throw new Error('Scientific runtime digest must be pinned')
console.log('CLOUD_RUNTIME_CONFIG=PASS')
