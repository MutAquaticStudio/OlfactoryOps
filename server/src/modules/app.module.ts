import { Module } from '@nestjs/common'
import { HealthController } from '../routes/health.controller.js'
import { NorthStarController } from '../routes/northstar.controller.js'
import { NorthStarService } from '../services/northstar.service.js'

@Module({
  controllers: [HealthController, NorthStarController],
  providers: [NorthStarService],
})
export class AppModule {}
