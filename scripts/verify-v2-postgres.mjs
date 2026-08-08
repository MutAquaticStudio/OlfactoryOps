import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const schema = 'infra/postgres/prisma/schema.prisma'
const migrations = ['infra/postgres/migrations/0001_platform_security_core.sql', 'infra/postgres/migrations/0002_phase1_members_notifications.sql']
if (!existsSync(schema) || migrations.some((migration) => !existsSync(migration))) {
  console.error('V2_POSTGRES=FAIL missing schema or migration')
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL: process.env.V2_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/olfactoryops' }
try {
  execSync(`npx prisma validate --schema ${schema}`, { stdio: 'inherit', env, shell: true })
} catch {
  console.error('V2_POSTGRES=FAIL prisma schema validation')
  process.exit(1)
}

if (!process.env.V2_DATABASE_URL && !process.env.DATABASE_URL) {
  console.log('V2_POSTGRES=NOT_CONFIGURED no database URL supplied; schema-only verification completed')
  process.exit(process.env.V2_REQUIRE_DATABASE === 'true' ? 2 : 0)
}

try {
  for (const migration of migrations) execSync(`npx prisma db execute --schema ${schema} --file ${migration}`, { stdio: 'inherit', env, shell: true })
  console.log('V2_POSTGRES=PASS migration executed against configured database')
} catch {
  console.error('V2_POSTGRES=FAIL migration execution')
  process.exit(1)
}
