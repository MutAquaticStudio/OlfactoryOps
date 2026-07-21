import { Module } from '@nestjs/common'
import { HealthController } from '../routes/health.controller.js'
import { NorthStarController } from '../routes/northstar.controller.js'
import { NorthStarService } from '../services/northstar.service.js'

@Module({
  controllers: [HealthController, NorthStarController],
  providers: [
    {
      provide: NorthStarService,
      useFactory: () => new NorthStarService({ mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY }),
    },
  ],
})
export class AppModule {}
