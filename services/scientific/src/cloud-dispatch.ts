import type { ScientificFeatureKind } from '../../../packages/contracts/src/scientific.js'

/**
 * A narrow infrastructure port. The scientific domain owns authorization,
 * tenant context, and idempotency before it reaches this boundary; the Worker
 * adapter owns private R2 persistence and the internal Cloud Runtime call.
 */
export type CloudScientificFeatureDispatch = {
  jobId: string
  organizationId: string
  actorUserId: string
  correlationId: string
  idempotencyKey: string
  canonicalSmiles: string
  featureKinds: ScientificFeatureKind[]
}

export type CloudScientificDispatchResult = {
  dispatchId: string
  queued: boolean
}

export interface CloudScientificDispatcher {
  dispatchFeatures(input: CloudScientificFeatureDispatch): Promise<CloudScientificDispatchResult>
}
