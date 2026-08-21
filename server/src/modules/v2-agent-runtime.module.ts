import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { DurableAgentService } from '../../../services/agent-runtime/src/durable-agent-service.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import { V2AgentRuntimeCatalogController, V2AgentRuntimeController } from '../routes/v2-agent-runtime.controller.js'
import { V2PlatformModule } from './v2-platform.module.js'

@Module({ imports: [V2PlatformModule], controllers: [V2AgentRuntimeController, V2AgentRuntimeCatalogController], providers: [{ provide: DurableAgentService, inject: [PlatformService], useFactory: (platform: PlatformService) => new DurableAgentService(new PrismaClient(), platform) }] })
export class V2AgentRuntimeModule {}
