import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { ConsumerIntelligenceService } from '../../../services/sentiment/src/consumer-intelligence-service.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import { V2ConsumerIntelligenceController } from '../routes/v2-consumer-intelligence.controller.js'
import { V2PlatformModule } from './v2-platform.module.js'

@Module({
  imports: [V2PlatformModule],
  controllers: [V2ConsumerIntelligenceController],
  providers: [{ provide: ConsumerIntelligenceService, inject: [PlatformService], useFactory: (platform: PlatformService) => new ConsumerIntelligenceService(new PrismaClient(), platform) }],
})
export class V2ConsumerIntelligenceModule {}
