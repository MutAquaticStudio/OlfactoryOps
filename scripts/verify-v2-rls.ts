import { PrismaClient } from '@prisma/client'
import { PrismaPlatformRepository } from '../services/platform/src/prisma-repository.js'
import { PlatformService } from '../services/platform/src/service.js'

const client = new PrismaClient()
const service = new PlatformService(new PrismaPlatformRepository(client), { baseDomain: 'olfactoryops.com', sessionPepper: 'rls-session', passwordPepper: 'rls-password' })
const slug = `rls-${Date.now()}`
const result = await service.signup({ organizationName: 'RLS Verification', workspaceSlug: slug, email: `${slug}@example.test`, displayName: 'RLS Verification', password: 'Correct Horse Battery 12!' })
await service.verifyEmail(result.verificationToken)
const login = await service.login({ email: `${slug}@example.test`, password: 'Correct Horse Battery 12!', hostname: `${slug}.olfactoryops.com` })
const context = await service.contextFromToken(login.rawSessionToken, `${slug}.olfactoryops.com`)
const secondSlug = `rls-second-${Date.now()}`
const second = await service.signup({ organizationName: 'RLS Second', workspaceSlug: secondSlug, email: `${secondSlug}@example.test`, displayName: 'RLS Second', password: 'Correct Horse Battery 12!' })
await service.verifyEmail(second.verificationToken)
let crossTenantDenied = false
try { await service.contextFromToken(login.rawSessionToken, `${secondSlug}.olfactoryops.com`) } catch (error) { crossTenantDenied = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'TENANT_ACCESS_DENIED' }
console.log(JSON.stringify({ signup: result.membership.role, login: login.membership.role, organizationId: context.context.organizationId, crossTenantDenied }))
await client.$disconnect()
