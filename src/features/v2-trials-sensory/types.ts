export type CapabilityMap = Record<string, boolean>

export type TrialStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'PREPARED'
  | 'EVALUATION_READY'
  | 'EVALUATED'
  | 'CLOSED'
  | 'CANCELLED'

export type SensorySessionStatus = 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'VOIDED'
export type SensoryDimensionKind = 'RATING' | 'ORDINAL' | 'DESCRIPTOR' | 'TEXT'

export type TrialSummary = {
  id: string
  title: string
  status: TrialStatus
  sourceKind: 'FORMULA_VERSION' | 'MANUAL_EXPERIMENT' | string
  formulaVersionId: string | null
  plannedMassGrams: number
  revision: number
  createdAt: string
  decision: string | null
}

export type ApprovedFormulaVersion = {
  id: string
  formulaProjectId: string
  name: string
  formulaType: string
  versionNumber: number
  contentHash: string
  approvedAt: string
}

export type SensoryFormSummary = {
  id: string
  name: string
  versionLabel: string
  minimumEvidenceCount: number
  status: string
  createdAt: string
}

export type SensoryDimension = {
  key: string
  label: string
  kind: SensoryDimensionKind
  minimum?: number
  maximum?: number
  required?: boolean
  options?: string[]
}

export type SensoryFormSchema = {
  timepoints: string[]
  dimensions: SensoryDimension[]
  descriptorVocabulary: string[]
}

export type TrialDetail = {
  trial: {
    id: string
    title: string
    sourceKind: string
    formulaVersionId?: string
    formula?: {
      components?: Array<{
        materialId: string
        name?: string
        percentage: number
        position?: number
        note?: string
      }>
    }
    plannedMassGrams: number
    status: TrialStatus
    revision: number
    createdAt: string
    updatedAt: string
  }
  preparations: Array<{
    id: string
    status: string
    weighingSessionId: string
    confirmedAt: string | null
  }>
  samples: Array<{
    id: string
    sampleCode: string
    status: string
    concentrationPercent: number | null
    expiresAt: string | null
  }>
  sessions: Array<{
    id: string
    title: string
    status: SensorySessionStatus
    blindMode: boolean
    formVersionId: string
    allowPeerResultsAfterClose: boolean
  }>
  decisions: Array<{
    id: string
    decision: string
    rationale: string
    decidedAt: string
  }>
  evidence: Array<{
    id: string
    evidenceKind: string
    objectRef?: string
    contentHash: string
    status: string
    createdAt: string
  }>
  usages: Array<{
    materialId: string
    lotId: string
    actualGrams: number
    landedUnitCost?: number | null
    currency?: string | null
  }>
  evaluations: Array<{
    sessionId: string
    sampleAssignmentId: string
    timepoint: string
    final: boolean
  }>
}

export type ScorecardPayload = {
  timepoint: string
  ratings: Record<string, number>
  controlledResponses: Record<string, string | string[]>
  descriptors: string[]
  observation?: string
  comparison?: string
  preferenceRank?: number
  final: boolean
}

export type InternalSensoryAssignment = {
  id: string
  blindCode?: string
  sampleCode?: string
  blindingStatus?: string
  sampleStatus?: string
  status?: string
  final?: boolean
}

export type TrialPreparationDetail = {
  preparation: {
    id: string
    status: string
    plannedScaleGrams: number
    actualTotalGrams: number | null
    confirmedAt: string | null
  }
  lines: Array<{
    id: string
    materialId: string
    materialName: string
    requestedGrams: number
    toleranceGrams: number
    lotId: string | null
    actualGrams: number | null
    movementId: string | null
  }>
}

export type LabMaterial = {
  id: string
  name: string
  internalCode?: string | null
  status: string
}

export type InventoryLot = {
  id: string
  materialId: string
  status: string
  qualityStatus?: string
  location?: string
  projection?: { availableGrams?: number }
}

export type WorkspaceMember = {
  id: string
  userId: string
  email: string
  displayName: string
  role: string
  status: string
}

export type SensoryPanelist = {
  id: string
  userId: string
  status: string
  invitedAt: string
}

export type SensoryAssignment = {
  id: string
  blindCode: string
  blindingStatus: string
  sampleStatus: string
  panelAssignmentId?: string | null
  panelistUserId?: string | null
}

export type SensoryPublicLink = {
  id: string
  sampleAssignmentId: string
  presentationMode: string
  maxSubmissions: number
  submissionCount: number
  expiresAt: string
  revokedAt: string | null
  issuedAt: string
}

export type TrialDecisionEvidence = {
  evidenceCount: number
  minimumEvidenceCount: number
  confidence: string
  conclusion?: string
}

export type InternalSensoryAssignments = {
  session: {
    id: string
    title: string
    status: SensorySessionStatus
    blindMode: boolean
    form?: SensoryFormSchema
  }
  form?: SensoryFormSchema
  assignments: InternalSensoryAssignment[]
}

export type PublicSensoryPresentation = {
  presentationMode: 'BLIND' | 'BRAND_REVIEW' | string
  sampleCode: string
  title: string
  instructions: string
  form: SensoryFormSchema
}
