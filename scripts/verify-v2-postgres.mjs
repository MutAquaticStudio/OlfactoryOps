import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const schema = 'infra/postgres/prisma/schema.prisma'
const migrations = [
  'infra/postgres/migrations/0001_platform_security_core.sql',
  'infra/postgres/migrations/0002_phase1_members_notifications.sql',
  'infra/postgres/migrations/0003_phase2_lab_operations.sql',
]
const localTestDatabaseUrl = 'postgresql://olfactoryops:olfactoryops@127.0.0.1:5432/olfactoryops'
const prismaCli = path.resolve('node_modules/prisma/build/index.js')

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
  console.log('V2_POSTGRES=PASS migration executed against configured database')
} catch {
  console.error('V2_POSTGRES=FAIL migration execution')
  process.exit(1)
}
