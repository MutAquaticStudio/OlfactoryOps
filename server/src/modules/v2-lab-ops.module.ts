import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { LabOperationsService } from '../../../services/lab-ops/src/service.js'
import { V2LabOperationsController } from '../routes/v2-lab-operations.controller.js'
import { V2PlatformModule } from './v2-platform.module.js'
import { PlatformService } from '../../../services/platform/src/service.js'

@Module({
  imports: [V2PlatformModule],
  controllers: [V2LabOperationsController],
  providers: [
    {
      provide: LabOperationsService,
      inject: [PlatformService],
      useFactory: (platform: PlatformService) => new LabOperationsService(new PrismaClient(), platform),
    },
  ],
  exports: [LabOperationsService],
})
export class V2LabOperationsModule {}
