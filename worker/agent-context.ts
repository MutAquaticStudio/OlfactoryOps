import type { NorthStarService } from '../server/src/services/northstar.service.js'
import { ForbiddenException } from '../server/src/shared/http-error.js'

/**
 * Minimal request context shared by evidence/audit adapters.
 * Product-specific agent execution is intentionally not part of the active
 * pre-V2 Worker surface; future V2 workflows must build on this scoped actor.
 */
export type AgentActor = {
  organizationId: string
  userId: string
  sessionId: string
  role: string
}

export function actorFromService(service: NorthStarService): AgentActor {
  const session = service.me().data.session
  return { organizationId: session.organizationId, userId: session.userId, sessionId: session.id, role: session.role }
}

export function ensureAgentReadAccess(service: NorthStarService) {
  const actor = actorFromService(service)
  if (!actor.organizationId || !actor.userId || !actor.sessionId) throw new ForbiddenException('Active workspace session is required')
  return actor
}
