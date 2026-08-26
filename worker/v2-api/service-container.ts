import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { DurableAgentService } from '../../services/agent-runtime/src/durable-agent-service.js'
import { FormulaService } from '../../services/formula/src/formula-service.js'
import { LabOperationsService } from '../../services/lab-ops/src/service.js'
import { PlatformService } from '../../services/platform/src/service.js'
import { PlatformAdminService } from '../../services/platform/src/platform-admin-service.js'
import type { V2DatabaseHealth } from '../../server/src/routes/v2-platform.worker.js'
import { PrismaPlatformRepository } from '../../services/platform/src/prisma-repository.js'
import { MaterialEvidenceService } from '../../services/rag/src/material-evidence-service.js'
import { GlobalMaterialIntelligenceCatalog } from '../../services/scientific/src/global-material-intelligence-catalog.js'
import { ConsumerIntelligenceService } from '../../services/sentiment/src/consumer-intelligence-service.js'
import { ModelDatasetService } from '../../services/scientific/src/model-dataset-service.js'
import { OlfactoryIntelligenceService } from '../../services/scientific/src/olfactory-intelligence-service.js'
import { ScientificFeatureService, ScientificRuntimeUnavailable } from '../../services/scientific/src/service.js'
import { CloudflareScientificDispatcher } from './cloud-scientific-dispatch.js'
import { CloudflarePasswordResetDispatcher } from './cloud-password-reset-dispatch.js'
import { odorPredictionRuntimeForBinding } from './cloud-odor-prediction-runtime.js'

export type V2ApiServiceEnv = {
  HYPERDRIVE: Hyperdrive
  R2_ARTIFACTS: R2Bucket
  CLOUD_RUNTIME?: Fetcher
  V2_WORKSPACE_BASE_DOMAIN: string
  V2_API_PUBLIC_HOSTNAME?: string
  V2_PUBLIC_PAGES_HOSTNAME?: string
  V2_PLATFORM_ADMIN_HOSTNAME?: string
  V2_SESSION_PEPPER: string
  V2_PASSWORD_PEPPER: string
  V2_INVITATION_ENCRYPTION_KEY: string
  V2_PASSWORD_RESET_ENCRYPTION_KEY: string
}

export type V2ApiServices = {
  prisma: PrismaClient
  databaseHealth: V2DatabaseHealth
  platform: PlatformService
  platformAdmin: PlatformAdminService
  lab: LabOperationsService
  scientific: ScientificFeatureService
  materialIntelligence: GlobalMaterialIntelligenceCatalog
  modelDataset: ModelDatasetService
  olfactory: OlfactoryIntelligenceService
  consumer: ConsumerIntelligenceService
  formula: FormulaService
  evidence: MaterialEvidenceService
  agent: DurableAgentService
}

function required(value: string | undefined, name: string) {
  if (!value || value.length < 16) throw new Error(`${name}_NOT_CONFIGURED`)
  return value
}

/**
 * The worker receives only a Hyperdrive binding. No browser URL, D1 binding,
 * or localhost fallback can become a V2 transactional path.
 */
export function createV2ApiServices(env: V2ApiServiceEnv): V2ApiServices {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.HYPERDRIVE.connectionString }) })
  const platform = new PlatformService(new PrismaPlatformRepository(prisma), {
    baseDomain: env.V2_WORKSPACE_BASE_DOMAIN,
    // The platform-admin host is public application surface, never a tenant
    // hostname. Including it here keeps the server-side session resolver from
    // treating admin.labofscents.org as an untrusted workspace hostname.
    publicHostnames: [env.V2_API_PUBLIC_HOSTNAME, env.V2_PUBLIC_PAGES_HOSTNAME, env.V2_PLATFORM_ADMIN_HOSTNAME].filter((value): value is string => Boolean(value)),
    sessionPepper: required(env.V2_SESSION_PEPPER, 'V2_SESSION_PEPPER'),
    passwordPepper: required(env.V2_PASSWORD_PEPPER, 'V2_PASSWORD_PEPPER'),
    invitationEncryptionKey: required(env.V2_INVITATION_ENCRYPTION_KEY, 'V2_INVITATION_ENCRYPTION_KEY'),
    passwordResetEncryptionKey: required(env.V2_PASSWORD_RESET_ENCRYPTION_KEY, 'V2_PASSWORD_RESET_ENCRYPTION_KEY'),
    passwordResetDispatcher: env.CLOUD_RUNTIME
      ? new CloudflarePasswordResetDispatcher({ CLOUD_RUNTIME: env.CLOUD_RUNTIME })
      : undefined,
  })
  const lab = new LabOperationsService(prisma, platform)
  const formula = new FormulaService(prisma, platform)
  const cloudDispatcher = env.CLOUD_RUNTIME
    ? new CloudflareScientificDispatcher({ ...env, CLOUD_RUNTIME: env.CLOUD_RUNTIME })
    : undefined
  return {
    prisma,
    databaseHealth: async () => {
      try {
        await prisma.$queryRawUnsafe('SELECT 1')
        return 'PASS'
      } catch {
        return 'DEGRADED'
      }
    },
    platform,
    platformAdmin: new PlatformAdminService(prisma, platform),
    lab,
    scientific: new ScientificFeatureService(prisma, platform, new ScientificRuntimeUnavailable(), cloudDispatcher),
    materialIntelligence: new GlobalMaterialIntelligenceCatalog(prisma, platform),
    modelDataset: new ModelDatasetService(prisma, platform),
    olfactory: new OlfactoryIntelligenceService(prisma, platform, odorPredictionRuntimeForBinding(env.CLOUD_RUNTIME)),
    consumer: new ConsumerIntelligenceService(prisma, platform),
    formula,
    evidence: new MaterialEvidenceService(prisma, platform),
    agent: new DurableAgentService(prisma, platform),
  }
}

export async function disconnectV2ApiServices(services: V2ApiServices) {
  await services.prisma.$disconnect()
}
