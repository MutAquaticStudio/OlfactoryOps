export type CapabilityMap = Record<string, boolean>

export type FormulaProject = { id: string; name: string; formulaType: string; status: string; latestVersion: number }
export type FormulaProjectDetail = { project: FormulaProject; versions: Array<{ id: string; versionNumber: number; approvalStatus: string; createdAt: string }> }

export type OptimizerRun = { id: string; parentFormulaVersionId: string; status: string; solverVersion: string; createdAt: string; completedAt?: string | null; candidateCount: number }
export type OptimizerCandidate = { id: string; candidateNumber: number; status: string; scorecard: Record<string, unknown>; componentProposal?: Array<{ materialId: string; percentage: number; position: number; note?: string }>; savedFormulaDraftId?: string | null; createdAt: string }
export type OptimizerDetail = { run: OptimizerRun & { constraintSnapshot?: Record<string, unknown>; objectiveWeights?: Record<string, unknown>; solverConfig?: Record<string, unknown>; evidenceSnapshot?: Record<string, unknown>; inputHash?: string; resultHash?: string | null }; candidates: OptimizerCandidate[] }

export type ImportJob = { id: string; importKind: string; sourceFormat: string; sourceName: string; status: string; dryRun: boolean; parsedRowCount: number; validRowCount: number; invalidRowCount: number; duplicateRowCount: number; committedRowCount: number; createdAt: string }
export type ImportDetail = { job: ImportJob & { mapping?: Record<string, string>; committedAt?: string | null }; rows: Array<{ sourceRowNumber: number; normalizedRow: Record<string, unknown>; validationErrors: string[]; status: string; targetType?: string | null; targetId?: string | null }> }

export type PendingConfirmation = { id: string; token: string }
export type DataOpsRun = { id: string; importJobId: string; adapter: string; status: string; failureCode?: string | null; createdAt: string }
