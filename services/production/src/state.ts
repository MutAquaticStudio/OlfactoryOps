import { PlatformError } from '../../platform/src/service.js'

export const PRODUCTION_ORDER_STATUSES = [
  'DRAFT',
  'PLANNED',
  'READY_FOR_WEIGHING',
  'WEIGHING',
  'COMPOUNDING',
  'CONDITIONING',
  'FILTRATION',
  'FILLING',
  'QC',
  'HOLD',
  'REWORK',
  'RELEASED',
  'REJECTED',
  'CANCELLED',
  'CLOSED',
] as const

export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number]

export const PRODUCTION_STAGE_KINDS = ['COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING'] as const
export type ProductionStageKind = (typeof PRODUCTION_STAGE_KINDS)[number]

export const PRODUCTION_STAGE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'FAILED'] as const
export type ProductionStageStatus = (typeof PRODUCTION_STAGE_STATUSES)[number]

const TRANSITIONS: Readonly<Record<ProductionOrderStatus, readonly ProductionOrderStatus[]>> = {
  DRAFT: ['PLANNED', 'CANCELLED'],
  PLANNED: ['READY_FOR_WEIGHING', 'CANCELLED'],
  READY_FOR_WEIGHING: ['WEIGHING', 'CANCELLED'],
  // Once a controlled weighing session has started, cancellation would leave
  // an ambiguous path around possible immutable inventory consumption. A
  // stopped batch must instead be held and resolved through deviation/rework.
  WEIGHING: ['COMPOUNDING', 'HOLD'],
  COMPOUNDING: ['CONDITIONING', 'HOLD', 'REWORK'],
  CONDITIONING: ['FILTRATION', 'HOLD', 'REWORK'],
  FILTRATION: ['FILLING', 'HOLD', 'REWORK'],
  FILLING: ['QC', 'HOLD', 'REWORK'],
  QC: ['RELEASED', 'REJECTED', 'HOLD', 'REWORK'],
  HOLD: ['READY_FOR_WEIGHING', 'WEIGHING', 'COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING', 'QC', 'REWORK', 'RELEASED', 'REJECTED'],
  REWORK: ['COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING', 'QC', 'HOLD'],
  // A released finished-good may be returned to HOLD only by the dedicated
  // quality-hold service path, which atomically moves the FG ledger balance.
  RELEASED: ['HOLD', 'CLOSED'],
  REJECTED: ['CLOSED'],
  CANCELLED: [],
  CLOSED: [],
}

export function isProductionOrderStatus(value: string): value is ProductionOrderStatus {
  return (PRODUCTION_ORDER_STATUSES as readonly string[]).includes(value)
}

export function assertProductionTransition(from: string, to: ProductionOrderStatus) {
  if (!isProductionOrderStatus(from) || !TRANSITIONS[from].includes(to)) {
    throw new PlatformError('PRODUCTION_ORDER_TRANSITION_INVALID', 'This production order transition is not allowed.', 409)
  }
}

export function expectedPriorStage(stage: ProductionStageKind): ProductionStageKind | null {
  const index = PRODUCTION_STAGE_KINDS.indexOf(stage)
  return index > 0 ? PRODUCTION_STAGE_KINDS[index - 1]! : null
}

export function assertStageTransition(from: string, to: ProductionStageStatus) {
  const allowed: Record<ProductionStageStatus, readonly ProductionStageStatus[]> = {
    NOT_STARTED: ['IN_PROGRESS', 'SKIPPED'],
    IN_PROGRESS: ['COMPLETED', 'FAILED'],
    COMPLETED: [],
    SKIPPED: [],
    FAILED: ['IN_PROGRESS'],
  }
  if (!(PRODUCTION_STAGE_STATUSES as readonly string[]).includes(from) || !allowed[from as ProductionStageStatus].includes(to)) {
    throw new PlatformError('PRODUCTION_STAGE_TRANSITION_INVALID', 'This production stage transition is not allowed.', 409)
  }
}
