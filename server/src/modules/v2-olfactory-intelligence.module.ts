import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { OlfactoryIntelligenceService } from '../../../services/scientific/src/olfactory-intelligence-service.js'
import { V2OlfactoryIntelligenceController } from '../routes/v2-olfactory-intelligence.controller.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import { V2PlatformModule } from './v2-platform.module.js'
import { OdorPredictionHttpRuntime, OdorPredictionRuntimeUnavailable } from '../../../services/scientific/src/model-http-runtime.js'

@Module({
  imports: [V2PlatformModule],
  controllers: [V2OlfactoryIntelligenceController],
  providers: [{ provide: OlfactoryIntelligenceService, inject: [PlatformService], useFactory: (platform: PlatformService) => {
    const url = process.env.SCIENTIFIC_MODEL_SERVICE_URL
    const sharedSecret = process.env.SCIENTIFIC_SERVICE_SHARED_SECRET
    const runtime = url && sharedSecret ? new OdorPredictionHttpRuntime({ baseUrl: url, sharedSecret }) : new OdorPredictionRuntimeUnavailable()
    return new OlfactoryIntelligenceService(new PrismaClient(), platform, runtime)
  } }],
})
export class V2OlfactoryIntelligenceModule {}
