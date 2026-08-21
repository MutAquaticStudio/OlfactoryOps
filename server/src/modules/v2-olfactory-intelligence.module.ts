import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { OlfactoryIntelligenceService } from '../../../services/scientific/src/olfactory-intelligence-service.js'
import { V2OlfactoryIntelligenceController } from '../routes/v2-olfactory-intelligence.controller.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import { V2PlatformModule } from './v2-platform.module.js'

@Module({
  imports: [V2PlatformModule],
  controllers: [V2OlfactoryIntelligenceController],
  providers: [{ provide: OlfactoryIntelligenceService, inject: [PlatformService], useFactory: (platform: PlatformService) => new OlfactoryIntelligenceService(new PrismaClient(), platform) }],
})
export class V2OlfactoryIntelligenceModule {}
