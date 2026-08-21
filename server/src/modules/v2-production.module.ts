import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { LabOperationsService } from '../../../services/lab-ops/src/service.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import { ProductionService } from '../../../services/production/src/production-service.js'
import { V2ProductionController } from '../routes/v2-production.controller.js'
import { V2LabOperationsModule } from './v2-lab-ops.module.js'
import { V2PlatformModule } from './v2-platform.module.js'

@Module({
  imports: [V2PlatformModule, V2LabOperationsModule],
  controllers: [V2ProductionController],
  providers: [{
    provide: ProductionService,
    inject: [PlatformService, LabOperationsService],
    useFactory: (platform: PlatformService, lab: LabOperationsService) => new ProductionService(new PrismaClient(), platform, lab),
  }],
  exports: [ProductionService],
})
export class V2ProductionModule {}
