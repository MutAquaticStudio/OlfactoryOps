import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.V2_QA_DATABASE_URL || process.env.DATABASE_URL
const manifestPath = path.resolve(process.env.V2_QA_FIXTURE_MANIFEST || '.qa/v2-role-fixtures/manifest.json')
if (!databaseUrl) throw new Error('V2_QA_DATABASE_URL or DATABASE_URL is required.')
const parsed = new URL(databaseUrl)
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) throw new Error('Refusing V2 fixture cleanup outside disposable loopback PostgreSQL.')
const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
await readFile(manifestPath, 'utf8')
// The database is explicitly disposable for this harness. Dropping the schema
// preserves append-only audit semantics while guaranteeing no fixture survives.
await client.$executeRawUnsafe('DROP SCHEMA public CASCADE')
await client.$executeRawUnsafe('CREATE SCHEMA public')
await client.$disconnect()
await rm(path.dirname(manifestPath), { recursive: true, force: true })
console.log('V2 QA fixture tenant removed from disposable PostgreSQL.')
