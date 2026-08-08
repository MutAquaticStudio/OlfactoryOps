import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const schema = 'infra/postgres/prisma/schema.prisma'
const migrations = [
  'infra/postgres/migrations/0001_platform_security_core.sql',
  'infra/postgres/migrations/0002_phase1_members_notifications.sql',
  'infra/postgres/migrations/0003_phase2_lab_operations.sql',
  'infra/postgres/migrations/0004_phase3_scientific_features.sql',
  'infra/postgres/migrations/0005_phase4_model_dataset_platform.sql',
  'infra/postgres/migrations/0006_phase5_olfactory_intelligence.sql',
]
const localTestDatabaseUrl = 'postgresql://olfactoryops:olfactoryops@127.0.0.1:5432/olfactoryops'
const prismaCli = path.resolve('node_modules/prisma/build/index.js')

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  return JSON.stringify(value)
}

function componentHash(component) {
  return createHash('sha256').update(stableJson(component)).digest('hex')
}

function isLoopbackDatabase(url) {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

if (!existsSync(schema) || migrations.some((migration) => !existsSync(migration))) {
  console.error('V2_POSTGRES=FAIL missing schema or migration')
  process.exit(1)
}

const configuredUrl = process.env.V2_QA_DATABASE_URL || process.env.V2_DATABASE_URL || process.env.DATABASE_URL
const databaseUrl = configuredUrl || (process.env.V2_QA_ENVIRONMENT === 'test' ? localTestDatabaseUrl : undefined)
if (databaseUrl && !isLoopbackDatabase(databaseUrl) && process.env.V2_QA_ENVIRONMENT === 'test') {
  console.error('V2_POSTGRES=FAIL refusing a non-loopback database in test mode')
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL: databaseUrl || localTestDatabaseUrl }
try {
  execFileSync(process.execPath, [prismaCli, 'validate', '--schema', schema], { stdio: 'inherit', env })
} catch {
  console.error('V2_POSTGRES=FAIL prisma schema validation')
  process.exit(1)
}

if (!databaseUrl) {
  console.log('V2_POSTGRES=NOT_CONFIGURED no database URL supplied; schema-only verification completed')
  process.exit(process.env.V2_REQUIRE_DATABASE === 'true' ? 2 : 0)
}

try {
  for (const migration of migrations) execFileSync(process.execPath, [prismaCli, 'db', 'execute', '--schema', schema, '--file', migration], { stdio: 'inherit', env })
  const pins = JSON.parse(readFileSync('services/scientific/runtime/component-pins.json', 'utf8')).components
  const modelPins = JSON.parse(readFileSync('services/scientific/runtime/model-component-pins.json', 'utf8')).components
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    const rows = await client.$queryRawUnsafe('SELECT component_key, repository, license, upstream_ref, upstream_commit, adapter_version, runtime_version, patch_status, compatibility_test, manifest_hash FROM v2_scientific_component_pins')
    if (rows.length !== Object.keys(pins).length) throw new Error('Scientific component registry row count mismatch')
    for (const row of rows) {
      const pin = pins[row.component_key]
      if (!pin || row.repository !== pin.repository || row.license !== pin.license || row.upstream_ref !== pin.upstreamRef || row.upstream_commit !== pin.upstreamCommit || row.adapter_version !== pin.adapterVersion || row.runtime_version !== pin.runtimeVersion || row.patch_status !== pin.patchStatus || row.compatibility_test !== pin.compatibilityTest || row.manifest_hash !== componentHash(pin)) {
        throw new Error(`Scientific component registry diverged for ${row.component_key}`)
      }
    }
    const modelRows = await client.$queryRawUnsafe('SELECT component_key, repository, license, license_evidence_status, upstream_ref, upstream_commit, adapter_version, patch_status, compatibility_test, manifest_hash FROM v2_model_component_pins')
    if (modelRows.length !== Object.keys(modelPins).length) throw new Error('Model component registry row count mismatch')
    for (const row of modelRows) {
      const pin = modelPins[row.component_key]
      if (!pin || row.repository !== pin.repository || row.license !== pin.license || row.license_evidence_status !== pin.licenseEvidenceStatus || row.upstream_ref !== pin.upstreamRef || row.upstream_commit !== pin.upstreamCommit || row.adapter_version !== pin.adapterVersion || row.patch_status !== pin.patchStatus || row.compatibility_test !== pin.compatibilityTest || row.manifest_hash !== componentHash(pin)) {
        throw new Error(`Model component registry diverged for ${row.component_key}`)
      }
    }
  } finally {
    await client.$disconnect()
  }
  console.log('V2_POSTGRES=PASS migration executed against configured database')
} catch {
  console.error('V2_POSTGRES=FAIL migration execution')
  process.exit(1)
}
