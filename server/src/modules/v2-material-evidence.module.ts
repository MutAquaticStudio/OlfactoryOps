import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { MaterialEvidenceService } from '../../../services/rag/src/material-evidence-service.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import { V2MaterialEvidenceController } from '../routes/v2-material-evidence.controller.js'
import { V2PlatformModule } from './v2-platform.module.js'

@Module({
  imports: [V2PlatformModule],
  controllers: [V2MaterialEvidenceController],
  providers: [{ provide: MaterialEvidenceService, inject: [PlatformService], useFactory: (platform: PlatformService) => new MaterialEvidenceService(new PrismaClient(), platform) }],
})
export class V2MaterialEvidenceModule {}
