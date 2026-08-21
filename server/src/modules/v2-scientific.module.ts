import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { ScientificHttpRuntime } from '../../../services/scientific/src/http-runtime.js'
import { CompositeScientificRuntime, ScientificFeatureService, ScientificRuntimeUnavailable } from '../../../services/scientific/src/service.js'
import { V2ScientificController } from '../routes/v2-scientific.controller.js'
import { V2PlatformModule } from './v2-platform.module.js'
import { PlatformService } from '../../../services/platform/src/service.js'

@Module({
  imports: [V2PlatformModule],
  controllers: [V2ScientificController],
  providers: [{
    provide: ScientificFeatureService,
    inject: [PlatformService],
    useFactory: (platform: PlatformService) => {
      const url = process.env.SCIENTIFIC_SERVICE_URL
      const osmordredUrl = process.env.SCIENTIFIC_OSMORDRED_SERVICE_URL
      const sharedSecret = process.env.SCIENTIFIC_SERVICE_SHARED_SECRET
      const primaryRuntime = url && sharedSecret
        ? new ScientificHttpRuntime({ baseUrl: url, sharedSecret })
        : new ScientificRuntimeUnavailable()
      const runtime = url && sharedSecret
        ? new CompositeScientificRuntime(
            primaryRuntime,
            osmordredUrl ? new ScientificHttpRuntime({ baseUrl: osmordredUrl, sharedSecret }) : undefined,
          )
        : primaryRuntime
      return new ScientificFeatureService(new PrismaClient(), platform, runtime)
    },
  }],
})
export class V2ScientificModule {}
