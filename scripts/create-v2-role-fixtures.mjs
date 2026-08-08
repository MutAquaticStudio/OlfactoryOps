import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PlatformService } from '../dist-api/services/platform/src/service.js'
import { PrismaPlatformRepository } from '../dist-api/services/platform/src/prisma-repository.js'
import { hashPassword } from '../dist-api/services/platform/src/crypto.js'

const roles = ['Owner', 'Admin', 'Lab Manager', 'Perfumer', 'R&D Scientist', 'Lab Technician', 'Procurement', 'Sensory Panelist', 'Brand', 'Supplier', 'Finance', 'Viewer']
const databaseUrl = process.env.V2_QA_DATABASE_URL || process.env.DATABASE_URL
const outputDir = path.resolve(process.env.V2_QA_FIXTURE_DIR || '.qa/v2-role-fixtures')
const appOrigin = 'http://127.0.0.1:4173'
const baseDomain = 'olfactoryops.com'
const passwordPepper = process.env.V2_PASSWORD_PEPPER || 'v2-e2e-password'
const sessionPepper = process.env.V2_SESSION_PEPPER || 'v2-e2e-session'

if (process.env.V2_QA_ENVIRONMENT !== 'test') throw new Error('V2_QA_ENVIRONMENT=test is required.')
if (!databaseUrl) throw new Error('V2_QA_DATABASE_URL or DATABASE_URL is required.')
const parsed = new URL(databaseUrl)
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) throw new Error('Refusing V2 fixture creation outside disposable loopback PostgreSQL.')

const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const repository = new PrismaPlatformRepository(client)
const service = new PlatformService(repository, { baseDomain, passwordPepper, sessionPepper })
const runId = randomUUID().slice(0, 8)
const slug = `qa-v2-${runId}`
const ownerEmail = `owner-${runId}@qa.invalid`
const ownerPassword = `Qa-${randomBytes(18).toString('base64url')}-7`
const signup = await service.signup({ organizationName: `V2 QA ${runId}`, workspaceSlug: slug, email: ownerEmail, displayName: 'QA Owner', password: ownerPassword })
await service.verifyEmail(signup.verificationToken)
const second = await service.signup({ organizationName: `V2 QA Other ${runId}`, workspaceSlug: `qa-v2-other-${runId}`, email: `other-${runId}@qa.invalid`, displayName: 'QA Other', password: ownerPassword })
await service.verifyEmail(second.verificationToken)
const credentials = [{ role: 'Owner', email: ownerEmail, password: ownerPassword }]
const now = new Date()

for (const role of roles.filter((item) => item !== 'Owner')) {
  const email = `${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${runId}@qa.invalid`
  const password = `Qa-${randomBytes(18).toString('base64url')}-7`
  const userId = `usr_qa_${runId}_${role.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
  const membershipId = `mem_qa_${runId}_${role.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
  await client.user.create({ data: { id: userId, email, displayName: `QA ${role}`, passwordHash: hashPassword(email, password, passwordPepper), status: 'ACTIVE', verifiedAt: now } })
  await client.membership.create({ data: { id: membershipId, organizationId: signup.membership.organizationId, userId, roleKey: role, status: 'ACTIVE' } })
  credentials.push({ role, email, password })
}

const states = {}
for (const credential of credentials) {
  const login = await service.login({ email: credential.email, password: credential.password, hostname: `${slug}.${baseDomain}`, userAgent: `V2 QA ${credential.role}` })
  states[credential.role] = { cookies: [{ name: 'oo_v2_session', value: login.rawSessionToken, domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [{ origin: appOrigin, localStorage: [{ name: 'oo_v2_csrf', value: login.csrfToken }] }] }
}

await mkdir(outputDir, { recursive: true })
const statePaths = {}
for (const role of roles) {
  const file = path.join(outputDir, `${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.storage-state.json`)
  await writeFile(file, JSON.stringify(states[role]), 'utf8')
  statePaths[role] = file
}
await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ runId, organizationIds: [signup.membership.organizationId, second.membership.organizationId], organizationId: signup.membership.organizationId, hostname: `${slug}.${baseDomain}`, otherHostname: `${second.membership.organizationSlug}.${baseDomain}`, statePaths }, null, 2), 'utf8')
console.log(`V2 QA fixtures created for ${roles.length} roles in disposable PostgreSQL.`)
await client.$disconnect()
