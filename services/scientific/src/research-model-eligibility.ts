export const researchEligibleEvaluationStatuses = ['REVIEW_REQUIRED', 'APPROVED'] as const

export function isResearchEvaluationEligible(status: string, leakageStatus: string) {
  return leakageStatus === 'PASS' && researchEligibleEvaluationStatuses.some((eligible) => eligible === status)
}
