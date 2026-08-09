import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { FormulaService } from '../../../services/formula/src/formula-service.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import { V2FormulaIntelligenceController } from '../routes/v2-formula-intelligence.controller.js'
import { V2PlatformModule } from './v2-platform.module.js'

@Module({
  imports: [V2PlatformModule],
  controllers: [V2FormulaIntelligenceController],
  providers: [{ provide: FormulaService, inject: [PlatformService], useFactory: (platform: PlatformService) => new FormulaService(new PrismaClient(), platform) }],
})
export class V2FormulaIntelligenceModule {}
