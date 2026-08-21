import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { CommerceService } from '../../../services/commerce/src/commerce-service.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import { V2CommerceController } from '../routes/v2-commerce.controller.js'
import { V2PlatformModule } from './v2-platform.module.js'

@Module({
  imports: [V2PlatformModule],
  controllers: [V2CommerceController],
  providers: [{
    provide: CommerceService,
    inject: [PlatformService],
    useFactory: (platform: PlatformService) => new CommerceService(new PrismaClient(), platform),
  }],
  exports: [CommerceService],
})
export class V2CommerceModule {}
