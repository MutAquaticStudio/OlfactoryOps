import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AuthSession } from '../../../src/data/northStar.js'

type IdempotencyRecord = { requestHash: string; response: unknown; createdAt: string }
type LocalState = Record<string, IdempotencyRecord>

function actorScope(session: AuthSession, route: string, key: string) {
  return `${session.organizationId}:${session.userId}:${route}:${key}`
}

@Injectable()
export class MutationIdempotencyService {
  private readonly storagePath = join(process.cwd(), '.olfactoryops-idempotency.local.json')
  private state: LocalState = {}
  private initialized = false
  private writeQueue: Promise<void> = Promise.resolve()

  private async ready() {
    if (this.initialized) return
    this.initialized = true
    try {
      this.state = JSON.parse(await readFile(this.storagePath, 'utf8')) as LocalState
    } catch {
      this.state = {}
    }
  }

  private async persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.storagePath), { recursive: true })
      const temporary = `${this.storagePath}.tmp`
      await writeFile(temporary, JSON.stringify(this.state), 'utf8')
      await rename(temporary, this.storagePath)
    })
    return this.writeQueue
  }

  async idempotentMutation<T>(
    session: AuthSession,
    route: string,
    idempotencyKey: string | undefined,
    request: unknown,
    mutation: () => Promise<T>,
  ) {
    await this.ready()
    const key = idempotencyKey?.trim() ?? ''
    if (key.length < 8 || key.length > 160) {
      throw new UnprocessableEntityException('Idempotency-Key header must be between 8 and 160 characters')
    }
    const scope = actorScope(session, route, key)
    const requestHash = createHash('sha256').update(JSON.stringify(request ?? {})).digest('hex')
    const existing = this.state[scope]
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('Idempotency-Key was already used for a different request')
      }
      return existing.response as T
    }
    const response = await mutation()
    this.state[scope] = { requestHash, response, createdAt: new Date().toISOString() }
    await this.persist()
    return response
  }
}
