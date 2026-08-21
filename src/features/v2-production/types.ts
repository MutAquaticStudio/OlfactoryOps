export type CapabilityMap = Record<string, boolean>

export type ProductionOrderStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'READY_FOR_WEIGHING'
  | 'WEIGHING'
  | 'COMPOUNDING'
  | 'CONDITIONING'
  | 'FILTRATION'
  | 'FILLING'
  | 'QC'
  | 'HOLD'
  | 'REWORK'
  | 'RELEASED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'CLOSED'

export type ProductionStageKind = 'COMPOUNDING' | 'CONDITIONING' | 'FILTRATION' | 'FILLING'
export type ProductionStageStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'FAILED'

export type ProductionOrder = {
  id: string
  orderNumber?: string | null
  code?: string | null
  name?: string | null
  status: ProductionOrderStatus | string
  formulaVersionId?: string | null
  qcSpecificationId?: string | null
  formulaVersionName?: string | null
  targetBulkGrams?: number | null
  targetOutputGrams?: number | null
  targetQuantityGrams?: number | null
  plannedQuantityGrams?: number | null
  plannedStartAt?: string | null
  scheduledFor?: string | null
  dueAt?: string | null
  notes?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  releasedAt?: string | null
  finishedGoodLotId?: string | null
  finishedLotId?: string | null
}

export type FormulaVersion = {
  id: string
  name: string
  versionNumber?: number | null
  formulaProjectId?: string | null
  formulaType?: string | null
  approvedAt?: string | null
}

export type ProductionRequirement = {
  id?: string
  materialId: string
  materialName?: string | null
  materialCode?: string | null
  requiredQuantityGrams?: number | null
  requiredGrams?: number | null
  plannedQuantityGrams?: number | null
  toleranceGrams?: number | null
  allocatedQuantityGrams?: number | null
  allocatedGrams?: number | null
  weighedQuantityGrams?: number | null
  weighedGrams?: number | null
  unit?: string | null
}

export type AllocationSuggestion = {
  id?: string
  requirementId?: string | null
  materialId?: string | null
  materialName?: string | null
  requiredGrams?: number | null
  reason?: string | null
  lots?: Array<{
    lotId: string
    materialId?: string | null
    status?: string | null
    qualityStatus?: string | null
    expiresAt?: string | null
    availableGrams?: number | null
    allocatedGrams?: number | null
  }>
  lotId?: string | null
  lotCode?: string | null
  availableQuantityGrams?: number | null
  availableGrams?: number | null
  suggestedQuantityGrams?: number | null
  quantityGrams?: number | null
  expiresAt?: string | null
  qualityStatus?: string | null
}

export type ProductionAllocation = AllocationSuggestion & {
  allocatedQuantityGrams?: number | null
  allocatedGrams?: number | null
  inventoryLotId?: string | null
  supplierLot?: string | null
  allocatedAt?: string | null
  status?: string | null
}

export type WeighingRecord = {
  id: string
  requirementId?: string | null
  materialId?: string | null
  materialName?: string | null
  lotId?: string | null
  lotCode?: string | null
  expectedQuantityGrams?: number | null
  targetGrams?: number | null
  actualQuantityGrams?: number | null
  actualGrams?: number | null
  recordedAt?: string | null
  recordedBy?: string | null
  note?: string | null
}

export type WeighingSession = {
  id: string
  labWeighingSessionId?: string | null
  status?: string | null
  plannedTotalGrams?: number | null
  actualTotalGrams?: number | null
  startedAt?: string | null
  confirmedAt?: string | null
  lines?: Array<{
    id: string
    allocationId?: string | null
    materialName?: string | null
    lotId?: string | null
    lotCode?: string | null
    requestedGrams?: number | null
    toleranceGrams?: number | null
    actualGrams?: number | null
  }>
}

export type WeighingLine = {
  productionWeighingSessionId: string
  lineId: string
  materialId: string
  materialName: string
  lotId?: string | null
  requestedGrams: number
  actualGrams?: number | null
  toleranceGrams: number
  consumptionMovementId?: string | null
}

export type ProductionMaterialUsage = {
  id: string
  requirementId: string
  allocationId: string
  weighingSessionId: string
  materialId: string
  materialName: string
  lotId: string
  actualQuantityGrams: number
  inventoryMovementId: string
  status: string
  reversalMovementId?: string | null
  createdAt?: string | null
  reversedAt?: string | null
}

export type StageRecord = {
  id?: string
  reworkId?: string | null
  stage: ProductionStageKind | string
  status: ProductionStageStatus | string
  startedAt?: string | null
  completedAt?: string | null
  notes?: string | null
  note?: string | null
  operatorName?: string | null
}

export type QcSpec = {
  id: string
  name: string
  stage?: string | null
  target?: string | null
  unit?: string | null
  lowerLimit?: number | null
  upperLimit?: number | null
  required?: boolean | null
  checks?: Array<{
    key: string
    label: string
    kind: 'NUMERIC' | 'TEXT' | 'BOOLEAN' | 'ENUM' | string
    required?: boolean
    minimum?: number
    maximum?: number
    expectedText?: string
    allowedValues?: string[]
    unit?: string
  }>
  specification?: {
    checks?: Array<{
      key: string
      label: string
      kind: 'NUMERIC' | 'TEXT' | 'BOOLEAN' | 'ENUM' | string
      required?: boolean
      minimum?: number
      maximum?: number
      expectedText?: string
      allowedValues?: string[]
      unit?: string
    }>
  }
}

export type QcResult = {
  id: string
  qcSpecificationId?: string | null
  checkKey?: string | null
  resultStatus?: string | null
  observedValue?: unknown
  specId?: string | null
  specName?: string | null
  value?: string | number | null
  unit?: string | null
  status?: string | null
  note?: string | null
  recordedAt?: string | null
  approvedAt?: string | null
}

export type DeviationRecord = {
  id: string
  category?: string | null
  title?: string | null
  description?: string | null
  status?: string | null
  disposition?: string | null
  reworkTargetStage?: ProductionStageKind | string | null
  severity?: string | null
  openedAt?: string | null
  detectedAt?: string | null
  closedAt?: string | null
}

export type CapaRecord = {
  id: string
  deviationId?: string | null
  actionType?: string | null
  title?: string | null
  action?: string | null
  status?: string | null
  dueAt?: string | null
  completedAt?: string | null
  verifiedAt?: string | null
}

export type YieldRecord = {
  id?: string
  inputConsumedGrams?: number | null
  bulkOutputGrams?: number | null
  filledOutputGrams?: number | null
  reconciliationDeltaGrams?: number | null
  expectedQuantityGrams?: number | null
  expectedGrams?: number | null
  actualQuantityGrams?: number | null
  actualGrams?: number | null
  wasteQuantityGrams?: number | null
  wasteGrams?: number | null
  recordedAt?: string | null
}

export type ProductionReworkRecord = {
  id: string
  deviationId?: string | null
  sourceKind: 'IN_PROCESS' | 'FINISHED_GOOD_LOT' | string
  sourceFinishedGoodLotId?: string | null
  quantityGrams: number
  targetStage: ProductionStageKind | string
  status: string
  reason?: string | null
  createdAt?: string | null
  completedAt?: string | null
}

export type ProductionDocument = {
  id: string
  documentKind?: string | null
  objectRef?: string | null
  contentHash?: string | null
  versionLabel?: string | null
  status?: string | null
  title?: string | null
  documentType?: string | null
  createdAt?: string | null
  capturedAt?: string | null
  reference?: string | null
}

export type FinishedLotGenealogy = {
  finishedGoodLot?: FinishedGoodLot | null
  finishedLot?: {
    id: string
    lotCode?: string | null
    status?: string | null
    releasedAt?: string | null
  } | null
  inputs?: Array<{
    lotId: string
    lotCode?: string | null
    materialName?: string | null
    quantityGrams?: number | null
  }>
  rawMaterialUsages?: Array<{
    usageId: string
    materialId: string
    materialName: string
    lotId: string
    supplierLot?: string | null
    actualQuantityGrams: number
    inventoryMovementId?: string
  }>
  documents?: ProductionDocument[]
  events?: Array<{
    id?: string
    title?: string | null
    kind?: string | null
    occurredAt?: string | null
  }>
}

export type FinishedGoodLot = {
  id: string
  lotNumber?: string | null
  initialQuantityGrams?: number | null
  location?: string | null
  status?: string | null
  releasedAt?: string | null
}

export type ProductionOrderDetail = {
  order: ProductionOrder
  requirements?: ProductionRequirement[]
  allocations?: ProductionAllocation[]
  weighing?: WeighingSession[]
  weighingLines?: WeighingLine[]
  materialUsages?: ProductionMaterialUsage[]
  weighingSessions?: WeighingSession[]
  stages?: StageRecord[]
  qcSpec?: QcSpec | null
  qcSpecs?: QcSpec[]
  qcSpecifications?: QcSpec[]
  qcSpecification?: QcSpec | null
  qcResults?: QcResult[]
  deviations?: DeviationRecord[]
  capas?: CapaRecord[]
  yield?: YieldRecord | null
  yields?: YieldRecord[]
  reworks?: ProductionReworkRecord[]
  documents?: ProductionDocument[]
  finishedLot?: FinishedGoodLot | null
  finishedLots?: FinishedGoodLot[]
}
