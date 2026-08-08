import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { ModelDatasetService } from '../../../services/scientific/src/model-dataset-service.js'
import { V2ModelDatasetController } from '../routes/v2-model-dataset.controller.js'
import { V2PlatformModule } from './v2-platform.module.js'
import { PlatformService } from '../../../services/platform/src/service.js'

@Module({
  imports: [V2PlatformModule],
  controllers: [V2ModelDatasetController],
  providers: [{
    provide: ModelDatasetService,
    inject: [PlatformService],
    useFactory: (platform: PlatformService) => new ModelDatasetService(new PrismaClient(), platform),
  }],
})
export class V2ModelDatasetModule {}
