import type { AgentFormulaProposal, FormulaDesignBrief, FormulaOptimizationObjectives, FormulaOptimizerIntent } from './agentRuntime.js'
import type { ApprovedMaterialSubstitutionRecord, Formula, FormulaPyramidNote, FormulaVersionRecord, Material, WorkspacePreferenceProfile } from './northStar.js'

type MaterialSeed = Pick<Material, 'id' | 'name' | 'family' | 'odor' | 'tier' | 'costPerGram' | 'ifraLimit'> & { availabilityRank?: number }

const directionProfiles = [
  { label: 'Luminous opening', tierWeights: { Top: 1.8, Heart: 1.1, Base: 0.75 } },
  { label: 'Textural heart', tierWeights: { Top: 0.9, Heart: 1.8, Base: 1.05 } },
  { label: 'Enduring trail', tierWeights: { Top: 0.7, Heart: 1.05, Base: 1.9 } },
] as const

function noteForTier(tier: Material['tier']): FormulaPyramidNote {
  return tier === 'Heart' ? 'Middle' : tier
}

function isCarrier(material: MaterialSeed) {
  return material.family.toLowerCase() === 'carrier' || /\b(ethanol|alcohol|solvent)\b/i.test(material.name)
}

function noteForMaterial(material: MaterialSeed): AgentFormulaProposal['ingredients'][number]['pyramidNote'] {
  return isCarrier(material) ? 'Solvent' : noteForTier(material.tier)
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

function normalizedAllocation(total: number, scores: number[]) {
  if (scores.length === 0) return []
  const denominator = scores.reduce((sum, score) => sum + score, 0)
  const values: number[] = []
  for (let index = 0; index < scores.length; index += 1) {
    const allocated = index === scores.length - 1
      ? total - values.reduce((sum, value) => sum + value, 0)
      : (scores[index]! / denominator) * total
    values.push(Number(allocated.toFixed(4)))
  }
  return values
}

function proposalFromMaterials(
  name: string,
  brief: FormulaDesignBrief,
  materials: MaterialSeed[],
  tierWeights: Record<'Top' | 'Heart' | 'Base', number>,
): AgentFormulaProposal {
  const percentages = normalizedAllocation(100, materials.map((material, index) => (
    Math.max(0.25, (materials.length - index) * tierWeights[material.tier])
  )))
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
      pyramidNote: noteForMaterial(material),
    })),
  }
}

function selectDirectionPalette(ranked: MaterialSeed[], locked: MaterialSeed[], directionIndex: number, formulaType: FormulaDesignBrief['formulaType']) {
  const targetSize = Math.min(ranked.length, Math.min(24, Math.max(6, locked.length + 4)))
  const selected = [...locked]
  const selectedIds = new Set(selected.map((material) => material.id))
  const add = (material: MaterialSeed | undefined) => {
    if (!material || selectedIds.has(material.id) || selected.length >= targetSize) return
    selected.push(material)
    selectedIds.add(material.id)
  }

  const candidates = ranked.filter((material) => formulaType === 'ACCORD' || !isCarrier(material))
  for (const tier of ['Top', 'Heart', 'Base'] as const) {
    const tierCandidates = candidates.filter((material) => material.tier === tier && !selectedIds.has(material.id))
    add(tierCandidates[directionIndex % Math.max(1, tierCandidates.length)])
  }

  const familyKeys = new Set(selected.map((material) => material.family.trim().toLowerCase()))
  for (const material of rotate(candidates, directionIndex * 2)) {
    const familyKey = material.family.trim().toLowerCase()
    if (!familyKeys.has(familyKey)) {
      add(material)
      familyKeys.add(familyKey)
    }
  }
  for (const material of rotate(candidates, directionIndex * 2)) add(material)
  return selected
}

export function buildDesignDirectionProposals(brief: FormulaDesignBrief, materials: MaterialSeed[]): Array<{ title: string; narrative: string; pyramidSummary: string; proposal: AgentFormulaProposal }> {
  const desiredTerms = normalizedTerms([brief.creativeBrief, ...brief.desiredNotes])
  const avoidedTerms = normalizedTerms(brief.avoidedNotes)
  const ranked = [...materials]
    .sort((left, right) => {
      const leftAvailability = brief.availabilityFirst && (left.availabilityRank ?? 0) > 0 ? 3 : 0
      const rightAvailability = brief.availabilityFirst && (right.availabilityRank ?? 0) > 0 ? 3 : 0
      const score = (material: MaterialSeed, availability: number) => materialScore(material, desiredTerms, avoidedTerms) + availability
      return score(right, rightAvailability) - score(left, leftAvailability) || left.name.localeCompare(right.name)
    })
  const locked = brief.lockedMaterialIds.map((id) => ranked.find((material) => material.id === id))
  if (locked.some((material) => !material)) throw new Error('A locked material is not eligible or is not visible in this workspace')
  const resolvedLocked = locked as MaterialSeed[]
  if (ranked.length === 0) throw new Error('No eligible workspace materials match this design brief')
  return directionProfiles.map(({ label, tierWeights }, index) => {
    const choice = selectDirectionPalette(ranked, resolvedLocked, index, brief.formulaType)
    const title = `${brief.name} - ${label}`
    return {
      title,
      narrative: `${label} for ${brief.creativeBrief.slice(0, 180)}. The palette balances brief relevance, note structure, material-family diversity, and eligible availability before a draft is saved.`,
      pyramidSummary: choice.filter((material) => !isCarrier(material)).map((material) => `${noteForTier(material.tier)}: ${material.name}`).join(' / '),
      proposal: proposalFromMaterials(title, brief, choice, tierWeights),
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

export function optimizerBaselineLines(version: Pick<FormulaVersionRecord, 'lines' | 'resolvedLeaves'>): Formula['lines'] {
  const materialOnlyLines = version.lines.filter((line) => Boolean(line.materialId) && line.grams > 0)
  if (materialOnlyLines.length === version.lines.length && materialOnlyLines.length > 0) return materialOnlyLines
  return version.resolvedLeaves
    .filter((leaf) => leaf.grams > 0)
    .map((leaf) => ({
      id: `optimizer-${leaf.materialId}`,
      label: leaf.materialName,
      materialId: leaf.materialId,
      grams: leaf.grams,
      pyramidNote: noteForTier(leaf.tier),
    }))
}

function replaceIngredient(proposal: AgentFormulaProposal, sourceId: string, replacement: MaterialSeed) {
  if (proposal.ingredients.some((ingredient) => ingredient.materialId === replacement.id)) return proposal
  return {
    ...proposal,
    ingredients: proposal.ingredients.map((ingredient) => ingredient.materialId === sourceId ? { ...ingredient, materialId: replacement.id, pyramidNote: noteForTier(replacement.tier) } : ingredient),
  }
}

function rebalanceIngredientPercentages(proposal: AgentFormulaProposal, sourceId: string, targetId: string, maximumShift = 5) {
  if (sourceId === targetId) return proposal
  const source = proposal.ingredients.find((ingredient) => ingredient.materialId === sourceId)
  const target = proposal.ingredients.find((ingredient) => ingredient.materialId === targetId)
  if (!source || !target) return proposal
  const shift = Number(Math.min(maximumShift, Math.max(0, source.percentage * 0.2)).toFixed(4))
  if (shift < 0.01 || source.percentage - shift <= 0) return proposal
  return {
    ...proposal,
    ingredients: proposal.ingredients.map((ingredient) => {
      if (ingredient.materialId === sourceId) return { ...ingredient, percentage: Number((ingredient.percentage - shift).toFixed(4)) }
      if (ingredient.materialId === targetId) return { ...ingredient, percentage: Number((ingredient.percentage + shift).toFixed(4)) }
      return ingredient
    }),
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
  const locked = new Set(lockedMaterialIds)
  const preserved = new Set(objectives?.preserveMaterialIds ?? [])
  const protectedMaterials = new Set([...locked, ...preserved])
  const prohibited = new Set(objectives?.prohibitedMaterialIds ?? [])
  const substitutionSources = baseline.ingredients.filter((ingredient) => !protectedMaterials.has(ingredient.materialId))
  const adjustable = baseline.ingredients.filter((ingredient) => !locked.has(ingredient.materialId) && !prohibited.has(ingredient.materialId))
  const variants: Array<{ title: string; proposal: AgentFormulaProposal }> = []
  const addRebalancedVariant = (title: string, sourceId: string | undefined, targetId: string | undefined) => {
    if (!sourceId || !targetId) return
    const proposal = rebalanceIngredientPercentages(baseline, sourceId, targetId)
    if (proposal !== baseline) variants.push({ title, proposal })
  }
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
  const costSource = [...substitutionSources]
    .sort((left, right) => (current.get(right.materialId)?.costPerGram ?? 0) - (current.get(left.materialId)?.costPerGram ?? 0))[0]
  if (costSource && (intent === 'COST' || intent === 'COMBINED' || objectives?.targetCostReductionPercent !== undefined || objectives?.maxTotalCost !== undefined)) {
    const source = current.get(costSource.materialId)
    const replacement = substitution(costSource.materialId, (material) => material.id !== source?.id && material.tier === source?.tier)
    if (replacement) variants.push({ title: `${baseline.name} - Cost recovery`, proposal: replaceIngredient(baseline, costSource.materialId, replacement) })
  }
  if (intent === 'COST' || intent === 'COMBINED' || objectives?.targetCostReductionPercent !== undefined || objectives?.maxTotalCost !== undefined) {
    const ratioSource = [...adjustable].sort((left, right) => (current.get(right.materialId)?.costPerGram ?? 0) - (current.get(left.materialId)?.costPerGram ?? 0))[0]
    const ratioTarget = [...adjustable]
      .filter((ingredient) => ingredient.materialId !== ratioSource?.materialId)
      .sort((left, right) => (current.get(left.materialId)?.costPerGram ?? Number.POSITIVE_INFINITY) - (current.get(right.materialId)?.costPerGram ?? Number.POSITIVE_INFINITY))[0]
    if ((current.get(ratioSource?.materialId ?? '')?.costPerGram ?? 0) > (current.get(ratioTarget?.materialId ?? '')?.costPerGram ?? Number.POSITIVE_INFINITY)) {
      addRebalancedVariant(`${baseline.name} - Cost balance`, ratioSource?.materialId, ratioTarget?.materialId)
    }
  }
  const inventorySource = [...substitutionSources].find((ingredient) => !availableMaterialIds.has(ingredient.materialId))
  if (inventorySource && (intent === 'INVENTORY' || intent === 'COMBINED' || objectives?.maximizeInventoryCoverage || objectives?.minimizeNewPurchases)) {
    const source = current.get(inventorySource.materialId)
    const replacement = substitution(inventorySource.materialId, (material) => availableMaterialIds.has(material.id) && material.tier === source?.tier)
    if (replacement) variants.push({ title: `${baseline.name} - Stock recovery`, proposal: replaceIngredient(baseline, inventorySource.materialId, replacement) })
  }
  if (intent === 'INVENTORY' || intent === 'COMBINED' || objectives?.maximizeInventoryCoverage || objectives?.minimizeNewPurchases) {
    const ratioSource = [...adjustable].find((ingredient) => !availableMaterialIds.has(ingredient.materialId))
    const sourceTier = current.get(ratioSource?.materialId ?? '')?.tier
    const availableTargets = adjustable.filter((ingredient) => ingredient.materialId !== ratioSource?.materialId && availableMaterialIds.has(ingredient.materialId))
    const ratioTarget = availableTargets.find((ingredient) => current.get(ingredient.materialId)?.tier === sourceTier) ?? availableTargets[0]
    addRebalancedVariant(`${baseline.name} - Stock balance`, ratioSource?.materialId, ratioTarget?.materialId)
  }
  const complianceSource = [...substitutionSources]
    .sort((left, right) => (current.get(left.materialId)?.ifraLimit ?? 100) - (current.get(right.materialId)?.ifraLimit ?? 100))[0]
  if (complianceSource && (intent === 'COMPLIANCE' || intent === 'COMBINED' || objectives?.complianceRequired)) {
    const source = current.get(complianceSource.materialId)
    const replacement = substitution(complianceSource.materialId, (material) => material.id !== source?.id && material.tier === source?.tier && material.ifraLimit > (source?.ifraLimit ?? 0))
    if (replacement) variants.push({ title: `${baseline.name} - Compliance recovery`, proposal: replaceIngredient(baseline, complianceSource.materialId, replacement) })
  }
  if (intent === 'COMPLIANCE' || intent === 'COMBINED' || objectives?.complianceRequired) {
    const ratioSource = [...adjustable].sort((left, right) => (current.get(left.materialId)?.ifraLimit ?? 100) - (current.get(right.materialId)?.ifraLimit ?? 100))[0]
    const ratioTarget = [...adjustable]
      .filter((ingredient) => ingredient.materialId !== ratioSource?.materialId)
      .sort((left, right) => (current.get(right.materialId)?.ifraLimit ?? 0) - (current.get(left.materialId)?.ifraLimit ?? 0))[0]
    if ((current.get(ratioTarget?.materialId ?? '')?.ifraLimit ?? 0) > (current.get(ratioSource?.materialId ?? '')?.ifraLimit ?? 100)) {
      addRebalancedVariant(`${baseline.name} - Compliance balance`, ratioSource?.materialId, ratioTarget?.materialId)
    }
  }
  for (const prohibitedId of prohibited) {
    const source = current.get(prohibitedId)
    if (!source || locked.has(prohibitedId)) continue
    const replacement = substitution(prohibitedId, (material) => material.tier === source.tier)
    if (replacement) variants.push({ title: `${baseline.name} - Restricted material recovery`, proposal: replaceIngredient(baseline, prohibitedId, replacement) })
  }
  const distinct = new Map<string, { title: string; proposal: AgentFormulaProposal }>()
  for (const variant of variants) {
    const signature = variant.proposal.ingredients.map((ingredient) => `${ingredient.materialId}:${ingredient.percentage.toFixed(4)}`).join('|')
    const materialIds = new Set(variant.proposal.ingredients.map((ingredient) => ingredient.materialId))
    if (!distinct.has(signature) && [...protectedMaterials].every((materialId) => materialIds.has(materialId)) && [...prohibited].every((materialId) => !materialIds.has(materialId))) {
      distinct.set(signature, variant)
    }
  }
  if (distinct.size === 0 && prohibited.size === 0) {
    distinct.set(baseline.ingredients.map((ingredient) => `${ingredient.materialId}:${ingredient.percentage.toFixed(4)}`).join('|'), { title: `${baseline.name} - Baseline feasibility`, proposal: baseline })
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
