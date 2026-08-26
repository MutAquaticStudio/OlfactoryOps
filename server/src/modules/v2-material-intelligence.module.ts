import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { GlobalMaterialIntelligenceCatalog } from "../../../services/scientific/src/global-material-intelligence-catalog.js";
import { PlatformService } from "../../../services/platform/src/service.js";
import { V2MaterialIntelligenceController } from "../routes/v2-material-intelligence.controller.js";
import { V2PlatformModule } from "./v2-platform.module.js";

@Module({
  imports: [V2PlatformModule],
  controllers: [V2MaterialIntelligenceController],
  providers: [
    {
      provide: GlobalMaterialIntelligenceCatalog,
      inject: [PlatformService],
      useFactory: (platform: PlatformService) =>
        new GlobalMaterialIntelligenceCatalog(new PrismaClient(), platform),
    },
  ],
})
export class V2MaterialIntelligenceModule {}
