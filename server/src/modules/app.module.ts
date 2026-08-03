import { Module } from '@nestjs/common'
import { HealthController } from '../routes/health.controller.js'
import { NorthStarController } from '../routes/northstar.controller.js'
import { NorthStarService } from '../services/northstar.service.js'
import { AgentLocalRuntimeService } from '../services/agent-local-runtime.service.js'
import { seededAdminCredentialsForEnv } from './auth-credentials.js'

@Module({
  controllers: [HealthController, NorthStarController],
  providers: [
    AgentLocalRuntimeService,
    {
      provide: NorthStarService,
      useFactory: () => new NorthStarService({
        authCredentials: seededAdminCredentialsForEnv(process.env.SEEDED_ADMIN_PASSWORD_HASH),
        mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY,
        workspaceBaseDomain: process.env.SYSTEM_WORKSPACE_DOMAIN,
      }),
    },
  ],
})
export class AppModule {}
