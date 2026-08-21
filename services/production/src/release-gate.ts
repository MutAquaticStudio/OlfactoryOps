export type ProductionReleaseGateInput = {
  formulaSnapshotPresent: boolean
  requirementStatuses: readonly string[]
  allocationStatuses: readonly string[]
  processSteps: readonly { stage: string; status: string }[]
  qcRequiredCheckKeys: readonly string[]
  qcResults: readonly { checkKey: string; resultStatus: string; revision?: number }[]
  deviationStatuses: readonly string[]
  capaStatuses: readonly string[]
  yieldStatus: string | null
  reworkStatuses: readonly string[]
  finishedQuantityGrams: number
  releaseDocumentSnapshotIds: readonly string[]
}

export type ProductionReleaseGateResult = {
  passed: boolean
  checks: Record<string, boolean>
  failedChecks: string[]
  finishedQuantityGrams: number
  releaseDocumentSnapshotIds: string[]
}

/**
 * Evaluates only deterministic release evidence. The caller owns fetching and
 * locking the evidence rows, while this function makes the resulting decision
 * transparent and independently testable.
 */
export function evaluateProductionReleaseGate(input: ProductionReleaseGateInput): ProductionReleaseGateResult {
  // QC corrections are append-only. A release must only consider the most
  // recent revision for each controlled check; an older passing result cannot
  // mask its later invalidation or replacement.
  const qcByCheck = new Map<string, { revision: number; resultStatus: string }>()
  for (const result of input.qcResults) {
    const revision = result.revision ?? 1
    const existing = qcByCheck.get(result.checkKey)
    if (!existing || revision >= existing.revision) {
      qcByCheck.set(result.checkKey, { revision, resultStatus: result.resultStatus })
    }
  }
  const failedChecks = input.qcRequiredCheckKeys.filter((key) => qcByCheck.get(key)?.resultStatus !== 'PASSED')
  const checks = {
    formulaSnapshot: input.formulaSnapshotPresent,
    requirementsConsumed: input.requirementStatuses.length > 0 && input.requirementStatuses.every((status) => status === 'CONSUMED'),
    allocationsConsumed: input.allocationStatuses.length > 0 && input.allocationStatuses.every((status) => status === 'CONSUMED'),
    processComplete: ['COMPOUNDING', 'CONDITIONING', 'FILTRATION', 'FILLING'].every((stage) => input.processSteps.some((step) => step.stage === stage && step.status === 'COMPLETED')),
    qcSpecification: input.qcRequiredCheckKeys.length > 0,
    qcPassed: input.qcRequiredCheckKeys.length > 0 && failedChecks.length === 0,
    deviationsResolved: input.deviationStatuses.every((status) => status === 'CLOSED' || status === 'VOIDED'),
    capaEffective: input.capaStatuses.every((status) => status === 'EFFECTIVE'),
    yieldReconciled: input.yieldStatus === 'RECONCILED',
    reworkComplete: input.reworkStatuses.every((status) => status === 'COMPLETED' || status === 'CANCELLED'),
    requiredDocumentation: input.releaseDocumentSnapshotIds.length > 0,
    finishedQuantityPositive: input.finishedQuantityGrams > 0,
  }
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    failedChecks,
    finishedQuantityGrams: input.finishedQuantityGrams,
    releaseDocumentSnapshotIds: [...input.releaseDocumentSnapshotIds],
  }
}
