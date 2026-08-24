import { Module } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { MemoryPlatformRepository } from '../../../services/platform/src/memory-repository.js'
import { PlatformService } from '../../../services/platform/src/service.js'
import type { PlatformRepository } from '../../../services/platform/src/repository.js'
import { PrismaPlatformRepository } from '../../../services/platform/src/prisma-repository.js'
import { V2PlatformController } from '../routes/v2-platform.controller.js'
import { V2PlatformAdminController } from '../routes/v2-platform-admin.controller.js'
import { PlatformAdminService } from '../../../services/platform/src/platform-admin-service.js'

function unavailableRepository(): PlatformRepository {
  return new Proxy({} as PlatformRepository, {
    get() {
      return async () => { throw new Error('V2_DATABASE_NOT_CONFIGURED') }
    },
  })
}

@Module({
  controllers: [V2PlatformController, V2PlatformAdminController],
  providers: [
    {
      provide: PlatformService,
      useFactory: () => {
        const repository = process.env.DATABASE_URL
          ? new PrismaPlatformRepository(new PrismaClient())
          : unavailableRepository()
        return new PlatformService(repository, {
          baseDomain: process.env.V2_WORKSPACE_BASE_DOMAIN ?? 'olfactoryops.com',
          sessionPepper: process.env.V2_SESSION_PEPPER,
          passwordPepper: process.env.V2_PASSWORD_PEPPER,
          invitationEncryptionKey: process.env.V2_INVITATION_ENCRYPTION_KEY,
          passwordResetEncryptionKey: process.env.V2_PASSWORD_RESET_ENCRYPTION_KEY,
        })
      },
    },
    {
      provide: PlatformAdminService,
      inject: [PlatformService],
      useFactory: (platform: PlatformService) => new PlatformAdminService(new PrismaClient(), platform),
    },
  ],
  exports: [PlatformService],
})
export class V2PlatformModule {}

export function createMemoryPlatformService() {
  return new PlatformService(new MemoryPlatformRepository(), { baseDomain: 'olfactoryops.com' })
}
