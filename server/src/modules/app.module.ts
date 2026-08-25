import { Module } from '@nestjs/common'
import { HealthController } from '../routes/health.controller.js'
import { NorthStarController } from '../routes/northstar.controller.js'
import { NorthStarService } from '../services/northstar.service.js'
import { MutationIdempotencyService } from '../services/mutation-idempotency.service.js'
import { seededAdminCredentialsForEnv } from './auth-credentials.js'
import { V2PlatformModule } from './v2-platform.module.js'
import { V2LabOperationsModule } from './v2-lab-ops.module.js'
import { V2ScientificModule } from './v2-scientific.module.js'
import { V2MaterialIntelligenceModule } from './v2-material-intelligence.module.js'
import { V2ModelDatasetModule } from './v2-model-dataset.module.js'
import { V2OlfactoryIntelligenceModule } from './v2-olfactory-intelligence.module.js'
import { V2ConsumerIntelligenceModule } from './v2-consumer-intelligence.module.js'
import { V2FormulaIntelligenceModule } from './v2-formula-intelligence.module.js'
import { V2MaterialEvidenceModule } from './v2-material-evidence.module.js'
import { V2AgentRuntimeModule } from './v2-agent-runtime.module.js'
import { V2TrialsSensoryModule } from './v2-trials-sensory.module.js'
import { V2ProductionModule } from './v2-production.module.js'
import { V2CommerceModule } from './v2-commerce.module.js'
import { V2AdvancedModule } from './v2-advanced.module.js'

@Module({
  imports: [V2PlatformModule, V2LabOperationsModule, V2ScientificModule, V2MaterialIntelligenceModule, V2ModelDatasetModule, V2OlfactoryIntelligenceModule, V2ConsumerIntelligenceModule, V2FormulaIntelligenceModule, V2MaterialEvidenceModule, V2AgentRuntimeModule, V2TrialsSensoryModule, V2ProductionModule, V2CommerceModule, V2AdvancedModule],
  controllers: [HealthController, NorthStarController],
  providers: [
    MutationIdempotencyService,
    {
      provide: NorthStarService,
      useFactory: () => new NorthStarService({
        authCredentials: seededAdminCredentialsForEnv(process.env.SEEDED_ADMIN_PASSWORD_HASH),
        mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY,
        workspaceBaseDomain: process.env.SYSTEM_WORKSPACE_DOMAIN,
      }),
    },
  ],
})
export class AppModule {}
