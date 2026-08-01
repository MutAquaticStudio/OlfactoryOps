import type { AgentFormulaProposal, FormulaDesignBrief, FormulaOptimizationObjectives, FormulaOptimizerIntent } from './agentRuntime.js'
import type { ApprovedMaterialSubstitutionRecord, Formula, FormulaPyramidNote, Material, WorkspacePreferenceProfile } from './northStar.js'

type MaterialSeed = Pick<Material, 'id' | 'name' | 'family' | 'odor' | 'tier' | 'costPerGram' | 'ifraLimit'> & { availabilityRank?: number }

const weightSets = [
  [42, 25, 18, 15],
  [34, 31, 21, 14],
  [28, 27, 25, 20],
]

function noteForTier(tier: Material['tier']): FormulaPyramidNote {
  return tier === 'Heart' ? 'Middle' : tier
}

function normalizedTerms(values: string[]) {
  return values.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 3)
}

function materialScore(material: MaterialSeed, terms: string[], avoided: string[]) {
  const haystack = `${material.name} ${material.family} ${material.odor.join(' ')}`.toLowerCase()
  const desired = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 5 : 0), 0)
  const avoidedScore = avoided.reduce((sum, term) => sum + (haystack.includes(term) ? 8 : 0), 0)
  return desired - avoidedScore
}

function rotate<T>(values: T[], by: number) {
  return values.map((_, index) => values[(index + by) % values.length]!)
}

function weights(length: number, pattern: number[]) {
  if (length === 1) return [100]
  if (length === 2) return [60, 40]
  if (length === 3) return [45, 30, 25]
  if (length === 4) return pattern.slice(0, 4).map((value, index, values) => index === values.length - 1 ? 100 - values.slice(0, -1).reduce((sum, item) => sum + item, 0) : value)
  const denominator = (length * (length + 1)) / 2
  return Array.from({ length }, (_, index) => index === length - 1
    ? Number((100 - Array.from({ length: index }, (_, prior) => Number((((length - prior) / denominator) * 100).toFixed(4))).reduce((sum, value) => sum + value, 0)).toFixed(4))
    : Number((((length - index) / denominator) * 100).toFixed(4)))
}

function proposalFromMaterials(name: string, brief: FormulaDesignBrief, materials: MaterialSeed[], pattern: number[]): AgentFormulaProposal {
  const percentages = weights(materials.length, pattern)
  return {
    name,
    formulaType: brief.formulaType,
    targetGrams: brief.targetGrams,
    concentrationType: brief.concentrationType,
    finalProductConcentrationPercent: brief.finalProductConcentrationPercent,
    ifraCategory: brief.ifraCategory,
    brief: brief.creativeBrief,
    ingredients: materials.map((material, index) => ({
      materialId: material.id,
      percentage: percentages[index] ?? 0,
      pyramidNote: noteForTier(material.tier),
    })),
  }
}

export function buildDesignDirectionProposals(brief: FormulaDesignBrief, materials: MaterialSeed[]): Array<{ title: string; narrative: string; pyramidSummary: string; proposal: AgentFormulaProposal }> {
  const desiredTerms = normalizedTerms([brief.creativeBrief, ...brief.desiredNotes])
  const avoidedTerms = normalizedTerms(brief.avoidedNotes)
  const ranked = [...materials]
    .sort((left, right) => {
      const availability = brief.availabilityFirst ? (right.availabilityRank ?? 0) - (left.availabilityRank ?? 0) : 0
      return availability || materialScore(right, desiredTerms, avoidedTerms) - materialScore(left, desiredTerms, avoidedTerms) || left.name.localeCompare(right.name)
    })
  const locked = brief.lockedMaterialIds.map((id) => ranked.find((material) => material.id === id))
  if (locked.some((material) => !material)) throw new Error('A locked material is not eligible or is not visible in this workspace')
  const resolvedLocked = locked as MaterialSeed[]
  const paletteSize = Math.max(4, resolvedLocked.length)
  const palette = [...resolvedLocked, ...ranked.filter((material) => !resolvedLocked.some((item) => item.id === material.id))].slice(0, paletteSize)
  if (palette.length === 0) throw new Error('No eligible workspace materials match this design brief')
  const labels = ['Luminous opening', 'Textural heart', 'Enduring trail']
  return labels.map((label, index) => {
    const unlocked = palette.filter((material) => !resolvedLocked.some((item) => item.id === material.id))
    const choice = [...resolvedLocked, ...rotate(unlocked, index)].slice(0, palette.length)
    const title = `${brief.name} - ${label}`
    return {
      title,
      narrative: `${label} for ${brief.creativeBrief.slice(0, 180)}. This direction prioritizes eligible materials and identifies availability or compliance review before a draft is saved.`,
      pyramidSummary: choice.map((material) => `${noteForTier(material.tier)}: ${material.name}`).join(' / '),
      proposal: proposalFromMaterials(title, brief, choice, weightSets[index]!),
    }
  })
}

export type SensoryMemoryDirectionEvidence = {
  state: 'READY' | 'NOT_ENOUGH_EVIDENCE' | 'DISABLED' | 'NOT_EVALUATED'
  profileVersion?: number
  evidenceCount: number
  adjustment: number
  explanation: string
}

/**
 * Applies a small deterministic presentation/ranking adjustment from a
 * workspace's reviewed trial outcomes. It deliberately does not claim odor
 * prediction and does not mutate a proposed formula.
 */
export function sensoryMemoryEvidenceForDirection(
  direction: Pick<{ title: string; narrative: string; pyramidSummary: string }, 'title' | 'narrative' | 'pyramidSummary'>,
  profile: WorkspacePreferenceProfile | undefined,
  enabled: boolean,
): SensoryMemoryDirectionEvidence {
  if (!enabled) {
    return { state: 'DISABLED', evidenceCount: 0, adjustment: 0, explanation: 'Private sensory learning is disabled for this workspace.' }
  }
  if (!profile || profile.confidence === 'INSUFFICIENT') {
    return { state: 'NOT_ENOUGH_EVIDENCE', evidenceCount: profile?.evidenceCount ?? 0, adjustment: 0, explanation: 'Not enough completed sensory evidence to adjust this direction.' }
  }
  const text = `${direction.title} ${direction.narrative} ${direction.pyramidSummary}`.toLowerCase()
  const preferredHits = profile.preferredDescriptors.filter((term) => text.includes(term.toLowerCase())).length
  const avoidedHits = profile.avoidedDescriptors.filter((term) => text.includes(term.toLowerCase())).length
  const adjustment = Math.max(-12, Math.min(12, preferredHits * 3 - avoidedHits * 4))
  return {
    state: 'READY',
    profileVersion: profile.version,
    evidenceCount: profile.evidenceCount,
    adjustment,
    explanation: adjustment > 0
      ? 'Private completed-trial evidence modestly favors descriptors seen in accepted workspace outcomes.'
      : adjustment < 0
        ? 'Private completed-trial evidence flags descriptors that recur in revised or rejected workspace outcomes.'
        : 'Private completed-trial evidence is relevant but does not distinguish this direction.',
  }
}

export function proposalFromFormulaVersion(formula: Formula, versionLines: Formula['lines']): AgentFormulaProposal {
  const total = versionLines.reduce((sum, line) => sum + line.grams, 0)
  return {
    name: `${formula.name} optimized`,
    formulaType: formula.formulaType,
    targetGrams: formula.targetGrams,
    concentrationType: formula.concentrationType,
    finalProductConcentrationPercent: formula.finalProductConcentrationPercent,
    ifraCategory: formula.ifraCategory,
    brief: formula.brief,
    ingredients: versionLines
      .filter((line) => Boolean(line.materialId) && line.grams > 0)
      .map((line) => ({
        materialId: line.materialId!,
        percentage: Number(((line.grams / Math.max(total, 0.0001)) * 100).toFixed(4)),
        pyramidNote: line.pyramidNote,
        dilution: line.concentration ?? line.dilution,
      })),
  }
}

function replaceIngredient(proposal: AgentFormulaProposal, sourceId: string, replacement: MaterialSeed) {
  if (proposal.ingredients.some((ingredient) => ingredient.materialId === replacement.id)) return proposal
  return {
    ...proposal,
    ingredients: proposal.ingredients.map((ingredient) => ingredient.materialId === sourceId ? { ...ingredient, materialId: replacement.id, pyramidNote: noteForTier(replacement.tier) } : ingredient),
  }
}

export function buildOptimizerProposals(
  baseline: AgentFormulaProposal,
  materials: MaterialSeed[],
  intent: FormulaOptimizerIntent,
  lockedMaterialIds: string[],
  availableMaterialIds: Set<string>,
  objectives: FormulaOptimizationObjectives | undefined = undefined,
  approvedSubstitutions: ApprovedMaterialSubstitutionRecord[] = [],
) {
  const current = new Map(materials.map((material) => [material.id, material]))
  const locked = new Set([...lockedMaterialIds, ...(objectives?.preserveMaterialIds ?? [])])
  const prohibited = new Set(objectives?.prohibitedMaterialIds ?? [])
  const unlocked = baseline.ingredients.filter((ingredient) => !locked.has(ingredient.materialId))
  const variants: Array<{ title: string; proposal: AgentFormulaProposal }> = prohibited.size === 0 ? [{ title: `${baseline.name} - Baseline`, proposal: baseline }] : []
  const replacementFor = (sourceId: string, predicate: (material: MaterialSeed) => boolean) => {
    const approvedIds = new Set(approvedSubstitutions
      .filter((substitution) => substitution.status === 'APPROVED' && substitution.sourceMaterialId === sourceId && Math.abs(substitution.strengthFactor - 1) < 0.0001)
      .map((substitution) => substitution.replacementMaterialId))
    return materials
      .filter((material) => approvedIds.has(material.id) && !prohibited.has(material.id) && !baseline.ingredients.some((line) => line.materialId === material.id) && predicate(material))
      .sort((left, right) => left.costPerGram - right.costPerGram || left.name.localeCompare(right.name))[0]
  }
  const allowAnySubstitution = objectives?.requireApprovedSubstitutions !== false
  const substitution = (sourceId: string, predicate: (material: MaterialSeed) => boolean) => {
    if (!allowAnySubstitution) {
      return materials
        .filter((material) => !prohibited.has(material.id) && !baseline.ingredients.some((line) => line.materialId === material.id) && predicate(material))
        .sort((left, right) => left.costPerGram - right.costPerGram || left.name.localeCompare(right.name))[0]
    }
    return replacementFor(sourceId, predicate)
  }
  const costSource = [...unlocked]
    .sort((left, right) => (current.get(right.materialId)?.costPerGram ?? 0) - (current.get(left.materialId)?.costPerGram ?? 0))[0]
  if (costSource && (intent === 'COST' || intent === 'COMBINED' || objectives?.targetCostReductionPercent !== undefined || objectives?.maxTotalCost !== undefined)) {
    const source = current.get(costSource.materialId)
    const replacement = substitution(costSource.materialId, (material) => material.id !== source?.id && material.tier === source?.tier)
    if (replacement) variants.push({ title: `${baseline.name} - Cost recovery`, proposal: replaceIngredient(baseline, costSource.materialId, replacement) })
  }
  const inventorySource = [...unlocked].find((ingredient) => !availableMaterialIds.has(ingredient.materialId))
  if (inventorySource && (intent === 'INVENTORY' || intent === 'COMBINED' || objectives?.maximizeInventoryCoverage || objectives?.minimizeNewPurchases)) {
    const source = current.get(inventorySource.materialId)
    const replacement = substitution(inventorySource.materialId, (material) => availableMaterialIds.has(material.id) && material.tier === source?.tier)
    if (replacement) variants.push({ title: `${baseline.name} - Stock recovery`, proposal: replaceIngredient(baseline, inventorySource.materialId, replacement) })
  }
  const complianceSource = [...unlocked]
    .sort((left, right) => (current.get(left.materialId)?.ifraLimit ?? 100) - (current.get(right.materialId)?.ifraLimit ?? 100))[0]
  if (complianceSource && (intent === 'COMPLIANCE' || intent === 'COMBINED' || objectives?.complianceRequired)) {
    const source = current.get(complianceSource.materialId)
    const replacement = substitution(complianceSource.materialId, (material) => material.id !== source?.id && material.tier === source?.tier && material.ifraLimit > (source?.ifraLimit ?? 0))
    if (replacement) variants.push({ title: `${baseline.name} - Compliance recovery`, proposal: replaceIngredient(baseline, complianceSource.materialId, replacement) })
  }
  for (const prohibitedId of prohibited) {
    const source = current.get(prohibitedId)
    if (!source || locked.has(prohibitedId)) continue
    const replacement = substitution(prohibitedId, (material) => material.tier === source.tier)
    if (replacement) variants.push({ title: `${baseline.name} - Restricted material recovery`, proposal: replaceIngredient(baseline, prohibitedId, replacement) })
  }
  const distinct = new Map<string, { title: string; proposal: AgentFormulaProposal }>()
  for (const variant of variants) {
    const signature = variant.proposal.ingredients.map((ingredient) => ingredient.materialId).join('|')
    const materialIds = new Set(variant.proposal.ingredients.map((ingredient) => ingredient.materialId))
    if (!distinct.has(signature) && [...locked].every((materialId) => materialIds.has(materialId)) && [...prohibited].every((materialId) => !materialIds.has(materialId))) {
      distinct.set(signature, variant)
    }
  }
  return Array.from(distinct.values()).slice(0, 3)
}

export function compositionChangePercent(baseline: AgentFormulaProposal, candidate: AgentFormulaProposal) {
  const baselineById = new Map(baseline.ingredients.map((line) => [line.materialId, line.percentage]))
  const candidateById = new Map(candidate.ingredients.map((line) => [line.materialId, line.percentage]))
  const ids = new Set([...baselineById.keys(), ...candidateById.keys()])
  return Number((Array.from(ids).reduce((sum, id) => sum + Math.abs((baselineById.get(id) ?? 0) - (candidateById.get(id) ?? 0)), 0) / 2).toFixed(4))
}

type OptimizerRankInput = {
  complianceStatus: 'PASS' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'INSUFFICIENT_DATA'
  availability: 'AVAILABLE' | 'MIXED' | 'UNKNOWN'
  costDelta?: number
  compositionChangePercent: number
  inventoryEvaluated: boolean
}

// The score is presentation-only. Ordering must remain deterministic and
// lexical so an unknown commercial signal can never improve a candidate.
export function compareOptimizerCandidates(left: OptimizerRankInput, right: OptimizerRankInput) {
  const complianceRank = (value: OptimizerRankInput['complianceStatus']) => value === 'PASS' ? 3 : value === 'REVIEW_REQUIRED' ? 2 : 1
  const inventoryRank = (value: OptimizerRankInput) => !value.inventoryEvaluated ? 0 : value.availability === 'AVAILABLE' ? 3 : value.availability === 'MIXED' ? 2 : 1
  const visibleCostRank = (value: OptimizerRankInput) => value.costDelta === undefined ? 0 : 1
  const comparisons = [
    complianceRank(right.complianceStatus) - complianceRank(left.complianceStatus),
    inventoryRank(right) - inventoryRank(left),
    visibleCostRank(right) - visibleCostRank(left),
    (left.costDelta ?? Number.POSITIVE_INFINITY) - (right.costDelta ?? Number.POSITIVE_INFINITY),
    left.compositionChangePercent - right.compositionChangePercent,
  ]
  return comparisons.find((value) => value !== 0) ?? 0
}

export function optimizerParetoState(candidate: OptimizerRankInput, candidates: OptimizerRankInput[]) {
  if (!candidate.inventoryEvaluated || candidate.costDelta === undefined) return 'NOT_EVALUATED' as const
  const candidateCostDelta = candidate.costDelta
  const complianceRank = (value: OptimizerRankInput['complianceStatus']) => value === 'PASS' ? 3 : value === 'REVIEW_REQUIRED' ? 2 : 1
  const inventoryRank = (value: OptimizerRankInput) => value.availability === 'AVAILABLE' ? 3 : value.availability === 'MIXED' ? 2 : 1
  const dominated = candidates.some((other) => {
    if (other === candidate || !other.inventoryEvaluated || other.costDelta === undefined) return false
    const noWorse = complianceRank(other.complianceStatus) >= complianceRank(candidate.complianceStatus)
      && inventoryRank(other) >= inventoryRank(candidate)
      && other.costDelta <= candidateCostDelta
      && other.compositionChangePercent <= candidate.compositionChangePercent
    const strictlyBetter = complianceRank(other.complianceStatus) > complianceRank(candidate.complianceStatus)
      || inventoryRank(other) > inventoryRank(candidate)
      || other.costDelta < candidateCostDelta
      || other.compositionChangePercent < candidate.compositionChangePercent
    return noWorse && strictlyBetter
  })
  return dominated ? 'DOMINATED' as const : 'PARETO' as const
}
