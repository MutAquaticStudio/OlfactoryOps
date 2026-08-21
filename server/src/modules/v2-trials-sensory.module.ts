import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { LabOperationsService } from '../../../services/lab-ops/src/service.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import { TrialSensoryService } from '../../../services/trials-sensory/src/service.js'
import { V2PublicSensoryController, V2TrialsSensoryController } from '../routes/v2-trials-sensory.controller.js'
import { V2LabOperationsModule } from './v2-lab-ops.module.js'
import { V2PlatformModule } from './v2-platform.module.js'

@Module({
  imports: [V2PlatformModule, V2LabOperationsModule],
  controllers: [V2TrialsSensoryController, V2PublicSensoryController],
  providers: [{
    provide: TrialSensoryService,
    inject: [PlatformService, LabOperationsService],
    useFactory: (platform: PlatformService, lab: LabOperationsService) => new TrialSensoryService(new PrismaClient(), platform, lab),
  }],
  exports: [TrialSensoryService],
})
export class V2TrialsSensoryModule {}
