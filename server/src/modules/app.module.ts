import { Module } from '@nestjs/common'
import { HealthController } from '../routes/health.controller.js'
import { NorthStarController } from '../routes/northstar.controller.js'
import { NorthStarService } from '../services/northstar.service.js'
import { MutationIdempotencyService } from '../services/mutation-idempotency.service.js'
import { seededAdminCredentialsForEnv } from './auth-credentials.js'

@Module({
  controllers: [HealthController, NorthStarController],
  providers: [
    MutationIdempotencyService,
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
