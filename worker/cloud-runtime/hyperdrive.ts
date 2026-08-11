import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

export type HyperdriveRuntimeEnv = { HYPERDRIVE: Hyperdrive }

/**
 * Cloud runtime database creation is intentionally binding-only. The browser
 * never receives a database URL and workers cannot fall back to localhost.
 */
export function createHyperdrivePrisma(env: HyperdriveRuntimeEnv): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.HYPERDRIVE.connectionString })
  return new PrismaClient({ adapter })
}

export async function withTenantTransaction<T>(
  client: PrismaClient,
  context: { organizationId: string; actorUserId?: string },
  work: (transaction: PrismaClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SELECT set_config('app.organization_id', $1, true)", context.organizationId)
    if (context.actorUserId) await transaction.$executeRawUnsafe("SELECT set_config('app.user_id', $1, true)", context.actorUserId)
    return work(transaction as unknown as PrismaClient)
  })
}
