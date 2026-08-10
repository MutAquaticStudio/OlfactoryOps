import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { AdvancedOperationsService } from '../../../services/advanced/src/advanced-service.js'
import { FormulaService } from '../../../services/formula/src/formula-service.js'
import { LabOperationsService } from '../../../services/lab-ops/src/service.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import { V2AdvancedController } from '../routes/v2-advanced.controller.js'
import { V2FormulaIntelligenceModule } from './v2-formula-intelligence.module.js'
import { V2LabOperationsModule } from './v2-lab-ops.module.js'
import { V2PlatformModule } from './v2-platform.module.js'

@Module({
  imports: [V2PlatformModule, V2FormulaIntelligenceModule, V2LabOperationsModule],
  controllers: [V2AdvancedController],
  providers: [{
    provide: AdvancedOperationsService,
    inject: [PlatformService, FormulaService, LabOperationsService],
    useFactory: (platform: PlatformService, formula: FormulaService, lab: LabOperationsService) => new AdvancedOperationsService(new PrismaClient(), platform, formula, lab, { confirmationSecret: process.env.V2_ADVANCED_CONFIRMATION_SECRET }),
  }],
  exports: [AdvancedOperationsService],
})
export class V2AdvancedModule {}
