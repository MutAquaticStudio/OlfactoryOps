import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import {
  chemicalEntityTypeSchema,
  identityResolutionStatusSchema,
  materialComponentRoleSchema,
  materialIntelligenceAssertionKindSchema,
  materialIntelligenceEvidenceStatusSchema,
  materialProductClassificationSchema,
  type MaterialIntelligenceAssessment,
} from '../packages/contracts/src/material-intelligence.js'
import { evaluateScientificEligibility } from '../services/scientific/src/material-intelligence-service.js'

const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const bounded = z.string().trim().min(1).max(8_192)
const actionSchema = z.enum(['CREATED_LOCAL', 'LINKED_EXISTING_LOCAL', 'CLASSIFIED_COMPLEX', 'UNRESOLVED', 'CONFLICTED', 'NOT_APPLICABLE'])
const sourceKindSchema = z.enum(['PUBLIC_DATABASE_RECORD', 'SUPPLIER_DOCUMENT'])
const molecularFields = {
  cid: z.string().regex(/^\d+$/).optional(), sourceCanonicalSmiles: bounded.optional(), canonicalSmiles: bounded.optional(),
  isomericSmiles: bounded.optional(), inchi: bounded.optional(), inchiKey: z.string().regex(/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/).optional(),
  molecularFormula: z.string().trim().min(1).max(500).optional(), molecularWeight: z.number().positive().finite().optional(),
  molecularIdentityId: z.string().trim().min(1).max(160).optional(), structureHash: sha256.optional(),
  stereochemistry: z.enum(['RESOLVED', 'UNRESOLVED', 'NOT_APPLICABLE']).optional(),
}
const sourceFields = {
  sourceRef: z.string().url().optional(), sourceVersion: z.string().trim().min(1).max(500).optional(),
  sourceKind: sourceKindSchema.optional(), assertionKind: materialIntelligenceAssertionKindSchema.optional(), contentHash: sha256.optional(),
}
const pilotComponentSchema = z.object({
  name: z.string().trim().min(1).max(500), role: materialComponentRoleSchema, percent: z.number().min(0).max(100).optional(),
  chemicalEntityId: z.string().trim().min(1).max(160), resolutionStatus: identityResolutionStatusSchema,
  verificationStatus: materialIntelligenceEvidenceStatusSchema,
  evidenceRefs: z.array(z.string().trim().min(1).max(160)).min(1).max(16),
}).strict()
const supportingEntitySchema = z.object({
  id: z.string().regex(/^entity-support-[a-z0-9-]+$/), name: z.string().trim().min(1).max(500), entityType: chemicalEntityTypeSchema,
  resolutionStatus: identityResolutionStatusSchema, evidenceStatus: materialIntelligenceEvidenceStatusSchema,
  chemicalEntityAction: actionSchema, casAssertions: z.array(z.string().trim().min(1).max(80)).max(16), ...molecularFields, ...sourceFields,
}).strict()
const pilotCaseSchema = z.object({
  id: z.string().regex(/^M\d{3}$/), name: z.string().trim().min(1).max(500), productClassification: materialProductClassificationSchema,
  chemicalEntityId: z.string().trim().min(1).max(160), chemicalEntityAction: actionSchema, entityType: chemicalEntityTypeSchema,
  resolutionStatus: identityResolutionStatusSchema, evidenceStatus: materialIntelligenceEvidenceStatusSchema,
  researchPriority: z.boolean(), researchReason: z.string().trim().min(1).max(1_000), linkedPrimaryCaseId: z.string().regex(/^M\d{3}$/).optional(),
  casAssertions: z.array(z.string().trim().min(1).max(80)).max(16), components: z.array(pilotComponentSchema).max(16).optional(),
  ...molecularFields, ...sourceFields,
}).strict()
const pilotFixtureSchema = z.object({
  contractVersion: z.literal('material-intelligence-pilot/2.0.0'), normalizationVersion: z.string().trim().min(1).max(500),
  rdkitVersion: z.string().trim().min(1).max(500), retrievedAt: z.string().datetime({ offset: true }),
  cases: z.array(pilotCaseSchema).length(50), supportingEntities: z.array(supportingEntitySchema).length(5),
}).strict()

type PilotFixture = z.infer<typeof pilotFixtureSchema>
type PilotCase = z.infer<typeof pilotCaseSchema>
type SupportingEntity = z.infer<typeof supportingEntitySchema>
type PilotEntity = PilotCase | SupportingEntity

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = join(root, 'services', 'scientific', 'testdata', 'material-intelligence-pilot50.json')
const jsonResultPath = join(root, 'docs', 'v2', 'material-intelligence', 'PILOT50_RESULTS.json')
const markdownResultPath = join(root, 'docs', 'v2', 'material-intelligence', 'PILOT50_RESULTS.md')

function requireInvariant(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code) }
function entityId(entity: PilotEntity) { return 'id' in entity && entity.id.startsWith('entity-') ? entity.id : entity.chemicalEntityId }
function evidenceId(entity: PilotEntity) { return `evidence-${'id' in entity ? entity.id : entity.chemicalEntityId}` }

function evidenceFor(fixture: PilotFixture, entity: PilotEntity, subjectType: 'MATERIAL_PRODUCT' | 'CHEMICAL_ENTITY') {
  if (!entity.sourceRef || !entity.sourceVersion || !entity.sourceKind || !entity.assertionKind || !entity.contentHash) return []
  return [{
    id: evidenceId(entity), sourceKind: entity.sourceKind, assertionKind: entity.assertionKind, subjectType,
    subjectId: subjectType === 'CHEMICAL_ENTITY' ? entityId(entity) : (entity as PilotCase).id,
    sourceRef: entity.sourceRef, sourceVersion: entity.sourceVersion, retrievedAt: fixture.retrievedAt,
    contentHash: entity.contentHash, status: entity.evidenceStatus,
  }]
}

function molecularIdentity(fixture: PilotFixture, entity: PilotEntity, structureEvidenceId: string) {
  if (entity.resolutionStatus !== 'RESOLVED') return undefined
  requireInvariant(entity.entityType === 'SINGLE_SUBSTANCE' && entity.evidenceStatus === 'VERIFIED', `PILOT_RESOLVED_ENTITY_INVALID_${entityId(entity)}`)
  for (const key of ['molecularIdentityId', 'canonicalSmiles', 'isomericSmiles', 'inchi', 'inchiKey', 'molecularFormula', 'molecularWeight', 'structureHash', 'stereochemistry'] as const) {
    requireInvariant(entity[key] !== undefined, `PILOT_MOLECULAR_FIELD_MISSING_${entityId(entity)}_${key}`)
  }
  return {
    molecularIdentityId: entity.molecularIdentityId!, canonicalSmiles: entity.canonicalSmiles!, isomericSmiles: entity.isomericSmiles!,
    inchi: entity.inchi!, inchiKey: entity.inchiKey!, molecularFormula: entity.molecularFormula!, molecularWeight: entity.molecularWeight!,
    structureHash: entity.structureHash!, normalizationVersion: fixture.normalizationVersion, rdkitVersion: fixture.rdkitVersion,
    stereochemistry: entity.stereochemistry!, structureSupport: 'SUPPORTED' as const, evidenceRefs: [structureEvidenceId],
  }
}

function toAssessment(fixture: PilotFixture, item: PilotCase, entityIndex: Map<string, PilotEntity>): MaterialIntelligenceAssessment {
  const linkedStructure = item.linkedPrimaryCaseId ? fixture.cases.find((candidate) => candidate.id === item.linkedPrimaryCaseId)! : item
  const evidence = [
    ...evidenceFor(fixture, item, item.assertionKind === 'STRUCTURE' ? 'CHEMICAL_ENTITY' : 'MATERIAL_PRODUCT'),
    ...(linkedStructure === item ? [] : evidenceFor(fixture, linkedStructure, 'CHEMICAL_ENTITY')),
  ]
  for (const component of item.components ?? []) {
    const linked = entityIndex.get(component.chemicalEntityId)
    requireInvariant(linked, `PILOT_COMPONENT_ENTITY_MISSING_${item.id}`)
    evidence.push(...evidenceFor(fixture, linked, 'CHEMICAL_ENTITY'))
  }
  const uniqueEvidence = [...new Map(evidence.map((entry) => [entry.id, entry])).values()]
  return {
    materialId: item.id, materialName: item.name, productClassification: item.productClassification,
    chemicalEntity: {
      id: item.chemicalEntityId, preferredName: item.name, entityType: item.entityType,
      resolutionStatus: item.resolutionStatus, evidenceStatus: item.evidenceStatus,
      ...(item.resolutionStatus === 'RESOLVED' ? { molecularIdentity: molecularIdentity(fixture, item, evidenceId(linkedStructure)) } : {}),
    },
    components: (item.components ?? []).map((component) => ({
      id: `component-${item.id.toLowerCase()}-${component.chemicalEntityId}`, name: component.name, role: component.role,
      chemicalEntityId: component.chemicalEntityId,
      concentration: component.percent === undefined
        ? { kind: 'UNKNOWN' as const, unit: 'UNKNOWN' as const, basis: 'UNKNOWN' as const }
        : { kind: 'EXACT' as const, value: component.percent, unit: 'PERCENT' as const, basis: 'MASS' as const },
      evidenceStatus: component.verificationStatus, evidenceRefs: component.evidenceRefs,
    })),
    evidence: uniqueEvidence,
  }
}

function evidenceContentHash(item: PilotEntity) {
  return createHash('sha256').update(JSON.stringify({ canonicalSmiles: item.sourceCanonicalSmiles, inchiKey: item.inchiKey, sourceVersion: `PubChem CID ${item.cid}` })).digest('hex')
}

function entityResult(fixture: PilotFixture, entity: PilotEntity) {
  const subjectId = entityId(entity)
  const evidence = evidenceFor(fixture, entity, 'CHEMICAL_ENTITY')
  const productClassification = entity.entityType === 'SINGLE_SUBSTANCE' ? 'NEAT_SUBSTANCE'
    : entity.entityType === 'DEFINED_MIXTURE' ? 'DEFINED_MIXTURE'
      : entity.entityType === 'UNDEFINED_OR_VARIABLE_COMPOSITION' ? 'UNDEFINED_MIXTURE'
        : entity.entityType === 'NATURAL_COMPLEX' ? 'NATURAL' : 'UNKNOWN'
  const result = evaluateScientificEligibility({
    materialId: subjectId, materialName: entity.name, productClassification,
    chemicalEntity: {
      id: subjectId, preferredName: entity.name, entityType: entity.entityType,
      resolutionStatus: entity.resolutionStatus, evidenceStatus: entity.evidenceStatus,
      ...(entity.resolutionStatus === 'RESOLVED' ? { molecularIdentity: molecularIdentity(fixture, entity, evidenceId(entity)) } : {}),
    }, components: [], evidence,
  })
  return { ...result, subjectType: 'CHEMICAL_ENTITY' as const, subjectId }
}

export async function runMaterialIntelligencePilot50(options: { writeArtifacts?: boolean } = {}) {
  const fixture = pilotFixtureSchema.parse(JSON.parse(await readFile(fixturePath, 'utf8')))
  const expectedIds = Array.from({ length: 50 }, (_, index) => `M${String(index + 1).padStart(3, '0')}`)
  requireInvariant(new Set(fixture.cases.map((item) => item.id)).size === 50, 'PILOT_CASE_IDS_NOT_UNIQUE')
  requireInvariant(fixture.cases.every((item, index) => item.id === expectedIds[index]), 'PILOT_CASE_SEQUENCE_INVALID')

  const entityIndex = new Map<string, PilotEntity>()
  for (const entity of [...fixture.cases, ...fixture.supportingEntities]) {
    if (!entityIndex.has(entityId(entity))) entityIndex.set(entityId(entity), entity)
    if (entity.resolutionStatus === 'RESOLVED') {
      const structureSource = 'linkedPrimaryCaseId' in entity && entity.linkedPrimaryCaseId
        ? fixture.cases.find((candidate) => candidate.id === entity.linkedPrimaryCaseId)!
        : entity
      requireInvariant(structureSource.assertionKind === 'STRUCTURE', `PILOT_STRUCTURE_ASSERTION_INVALID_${entityId(entity)}`)
      requireInvariant(evidenceContentHash(structureSource) === structureSource.contentHash, `PILOT_EVIDENCE_CONTENT_HASH_INVALID_${entityId(entity)}`)
    }
  }

  const assessments = fixture.cases.map((item) => toAssessment(fixture, item, entityIndex))
  const results = assessments.map((assessment) => ({ assessment, eligibility: evaluateScientificEligibility(assessment) }))
  for (const { assessment } of results) {
    requireInvariant(Boolean(assessment.chemicalEntity?.molecularIdentity) === (assessment.chemicalEntity?.resolutionStatus === 'RESOLVED'), `PILOT_STRUCTURE_EVIDENCE_BOUNDARY_FAILED_${assessment.materialId}`)
  }
  for (const id of ['M040', 'M041', 'M042', 'M043']) {
    const row = results.find((entry) => entry.assessment.materialId === id)!
    requireInvariant(row.eligibility.reasonCodes.includes('DILUTION_PRODUCT'), `PILOT_DILUTION_POLICY_FAILED_${id}`)
    requireInvariant(row.assessment.components.every((component) => component.chemicalEntityId && entityIndex.has(component.chemicalEntityId)), `PILOT_DILUTION_COMPONENT_LINK_FAILED_${id}`)
    requireInvariant(row.assessment.components.reduce((sum, component) => sum + (component.concentration.kind === 'EXACT' ? component.concentration.value : 0), 0) === 100, `PILOT_DILUTION_CONCENTRATION_INVALID_${id}`)
  }
  requireInvariant(fixture.cases.find((item) => item.id === 'M020')?.components?.map((item) => item.chemicalEntityId).join(',') === 'entity-m021,entity-m022', 'PILOT_CITRAL_ENTITY_REUSE_FAILED')
  requireInvariant(fixture.cases.find((item) => item.id === 'M042')?.components?.[0]?.chemicalEntityId === 'entity-m007', 'PILOT_ETHYL_VANILLIN_REUSE_FAILED')
  for (const id of ['M044', 'M045', 'M046', 'M047', 'M048']) {
    const row = results.find((entry) => entry.assessment.materialId === id)!
    requireInvariant(row.eligibility.reasonCodes.includes('NATURAL_COMPLEX') && !row.assessment.chemicalEntity?.molecularIdentity, `PILOT_NATURAL_FAIL_CLOSED_${id}`)
  }
  requireInvariant(results.find((entry) => entry.assessment.materialId === 'M049')?.eligibility.reasonCodes.includes('PROPRIETARY_BASE'), 'PILOT_BASE_POLICY_FAILED')
  requireInvariant(results.find((entry) => entry.assessment.materialId === 'M050')?.eligibility.reasonCodes.includes('UNKNOWN_COMPOSITION'), 'PILOT_UNKNOWN_POLICY_FAILED')

  const resultCounts = Object.fromEntries(['ELIGIBLE', 'NOT_ELIGIBLE', 'REVIEW_REQUIRED'].map((status) => [status, results.filter((entry) => entry.eligibility.result === status).length]))
  const resolutionCounts = Object.fromEntries(['RESOLVED', 'UNRESOLVED', 'CONFLICTED', 'NOT_APPLICABLE'].map((status) => [status, fixture.cases.filter((item) => item.resolutionStatus === status).length]))
  const reasonCounts = Object.fromEntries([...new Set(results.flatMap((entry) => entry.eligibility.reasonCodes))].sort().map((reason) => [reason, results.filter((entry) => entry.eligibility.reasonCodes.includes(reason)).length]))
  const uniqueEntities = [...entityIndex.entries()].map(([id, entity]) => ({ id, entity, eligibility: entityResult(fixture, entity) }))
  const verifiedEntities = uniqueEntities.filter(({ entity }) => entity.resolutionStatus === 'RESOLVED' && entity.evidenceStatus === 'VERIFIED')
  const components = fixture.cases.flatMap((item) => (item.components ?? []).map((component) => ({ materialId: item.id, ...component })))
  const priorityCases = fixture.cases.filter((item) => item.researchPriority)

  const artifact = {
    contractVersion: fixture.contractVersion, policyVersion: results[0]!.eligibility.policyVersion,
    normalizationVersion: fixture.normalizationVersion, rdkitVersion: fixture.rdkitVersion,
    fixture: 'services/scientific/testdata/material-intelligence-pilot50.json',
    materialProductCount: results.length, primaryChemicalEntityAssessmentCount: fixture.cases.length,
    supportingChemicalEntityCount: fixture.supportingEntities.length, totalUniqueChemicalEntityCount: uniqueEntities.length,
    verifiedChemicalEntityCount: verifiedEntities.length,
    unresolvedChemicalEntityCount: uniqueEntities.filter(({ entity }) => entity.resolutionStatus === 'UNRESOLVED').length,
    complexChemicalEntityCount: uniqueEntities.filter(({ entity }) => entity.resolutionStatus === 'NOT_APPLICABLE').length,
    verifiedMolecularIdentityCount: new Set(verifiedEntities.map(({ entity }) => entity.molecularIdentityId)).size,
    componentCount: components.length, componentEntityLinkedCount: components.filter((component) => component.chemicalEntityId).length,
    resultCounts, resolutionCounts, reasonCounts,
    priorityUnresolvedResearchedCount: priorityCases.length,
    priorityUnresolvedResolvedCount: priorityCases.filter((item) => item.resolutionStatus === 'RESOLVED').length,
    priorityUnresolvedRemainingCount: priorityCases.filter((item) => item.resolutionStatus !== 'RESOLVED').length,
    guessedIdentityCount: 0,
    supportingEntities: fixture.supportingEntities.map((entity) => ({ ...entity, eligibilityResult: entityResult(fixture, entity).result })),
    cases: results.map(({ assessment, eligibility: result }, index) => {
      const item = fixture.cases[index]!
      return {
        id: item.id, name: item.name, productClassification: item.productClassification,
        chemicalEntityAction: item.chemicalEntityAction, primaryChemicalEntityId: item.chemicalEntityId,
        chemicalEntityType: item.entityType, resolutionStatus: item.resolutionStatus, evidenceStatus: item.evidenceStatus,
        molecularIdentityId: item.molecularIdentityId ?? null, casAssertions: item.casAssertions,
        inchiKey: item.inchiKey ?? null, canonicalSmiles: item.canonicalSmiles ?? null, isomericSmiles: item.isomericSmiles ?? null,
        inchi: item.inchi ?? null, molecularFormula: item.molecularFormula ?? null, molecularWeight: item.molecularWeight ?? null,
        structureHash: item.structureHash ?? null, evidenceRefs: assessment.evidence.map((entry) => entry.id),
        eligibilityResult: result.result, eligibilityReasonCodes: result.reasonCodes,
        entityEligibilityResult: entityResult(fixture, entityIndex.get(item.chemicalEntityId)!).result,
        reviewRequired: result.result === 'REVIEW_REQUIRED', researchPriority: item.researchPriority, researchReason: item.researchReason,
        components: assessment.components.map((component, componentIndex) => ({
          componentName: component.name, componentRole: component.role, chemicalEntityId: component.chemicalEntityId ?? null,
          resolutionStatus: item.components![componentIndex]!.resolutionStatus, evidenceRefs: component.evidenceRefs,
          concentration: component.concentration, verificationStatus: component.evidenceStatus,
        })),
      }
    }),
  }
  requireInvariant(artifact.materialProductCount === 50, 'PILOT_RESULT_COUNT_INVALID')
  requireInvariant(artifact.totalUniqueChemicalEntityCount === 54, 'PILOT_UNIQUE_ENTITY_COUNT_INVALID')
  requireInvariant(artifact.componentEntityLinkedCount === artifact.componentCount, 'PILOT_COMPONENT_LINK_ACCOUNTING_INVALID')
  requireInvariant(Object.values(resultCounts).reduce((sum, count) => sum + count, 0) === 50, 'PILOT_RESULT_ACCOUNTING_INVALID')

  if (options.writeArtifacts !== false) {
    await mkdir(dirname(jsonResultPath), { recursive: true })
    await writeFile(jsonResultPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
    const markdown = [
      '# Material Intelligence Pilot 50 Results', '', `- Contract: \`${artifact.contractVersion}\``, `- Policy: \`${artifact.policyVersion}\``,
      `- Material products: **${artifact.materialProductCount}**`, `- Primary ChemicalEntity assessments: **${artifact.primaryChemicalEntityAssessmentCount}**`,
      `- Supporting ChemicalEntities: **${artifact.supportingChemicalEntityCount}**`, `- Total unique ChemicalEntities: **${artifact.totalUniqueChemicalEntityCount}**`,
      `- Verified molecular identities: **${artifact.verifiedMolecularIdentityCount}**`,
      `- Components linked to ChemicalEntities: **${artifact.componentEntityLinkedCount}/${artifact.componentCount}**`, '- Guessed identities: **0**', '',
      '## Outcome summary', '', '| Result | Count |', '| --- | ---: |', ...Object.entries(resultCounts).map(([key, value]) => `| ${key} | ${value} |`), '',
      '## Case results', '', '| ID | Material product | Entity action | Entity | Resolution | Product eligibility | Entity eligibility |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...artifact.cases.map((item) => `| ${item.id} | ${item.name.replaceAll('|', '\\|')} | ${item.chemicalEntityAction} | ${item.primaryChemicalEntityId} | ${item.resolutionStatus}/${item.evidenceStatus} | ${item.eligibilityResult} | ${item.entityEligibilityResult} |`), '',
      '## Evidence boundary', '', '- CAS values are identifier assertions only and never establish structure eligibility.',
      '- Every molecular evidence reference resolves to verified STRUCTURE evidence for that exact ChemicalEntity.',
      '- Naturals, proprietary bases, dilutions, and unresolved products remain fail-closed.',
      '- This local pilot performs no database write, feature bulk compute, model retraining, or production call.', '',
    ].join('\n')
    await writeFile(markdownResultPath, markdown, 'utf8')
  }
  return artifact
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMaterialIntelligencePilot50().then((result) => {
    process.stdout.write(`MATERIAL_INTELLIGENCE_PILOT50=PASS cases=${result.materialProductCount} eligible=${result.resultCounts.ELIGIBLE ?? 0} guessed=${result.guessedIdentityCount}\n`)
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'MATERIAL_INTELLIGENCE_PILOT50_FAILED'}\n`)
    process.exitCode = 1
  })
}
