import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import {
  chemicalEntityTypeSchema,
  identityResolutionStatusSchema,
  materialComponentRoleSchema,
  materialIntelligenceEvidenceStatusSchema,
  materialProductClassificationSchema,
  type MaterialIntelligenceAssessment,
} from '../packages/contracts/src/material-intelligence.js'
import { evaluateScientificEligibility } from '../services/scientific/src/material-intelligence-service.js'

const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const pilotComponentSchema = z.object({
  name: z.string().trim().min(1).max(500),
  role: materialComponentRoleSchema,
  percent: z.number().min(0).max(100).optional(),
}).strict()
const pilotCaseSchema = z.object({
  id: z.string().regex(/^M\d{3}$/),
  name: z.string().trim().min(1).max(500),
  productClassification: materialProductClassificationSchema,
  entityType: chemicalEntityTypeSchema,
  resolutionStatus: identityResolutionStatusSchema,
  evidenceStatus: materialIntelligenceEvidenceStatusSchema,
  cid: z.string().regex(/^\d+$/).optional(),
  sourceCanonicalSmiles: z.string().trim().min(1).max(4096).optional(),
  canonicalSmiles: z.string().trim().min(1).max(4096).optional(),
  inchiKey: z.string().regex(/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/).optional(),
  structureHash: sha256.optional(),
  contentHash: sha256.optional(),
  stereochemistry: z.enum(['RESOLVED', 'UNRESOLVED', 'NOT_APPLICABLE']).optional(),
  components: z.array(pilotComponentSchema).max(16).optional(),
}).strict().superRefine((value, ctx) => {
  const structureFields = [value.cid, value.sourceCanonicalSmiles, value.canonicalSmiles, value.inchiKey, value.structureHash, value.contentHash, value.stereochemistry]
  const verified = value.resolutionStatus === 'RESOLVED' && value.evidenceStatus === 'VERIFIED' && value.entityType === 'SINGLE_SUBSTANCE'
  if (verified !== structureFields.every(Boolean)) ctx.addIssue({ code: 'custom', message: 'Verified structure evidence must be complete and may not appear on unresolved cases.' })
})
const pilotFixtureSchema = z.object({
  contractVersion: z.literal('material-intelligence-pilot/1.0.0'),
  normalizationVersion: z.string().trim().min(1).max(500),
  rdkitVersion: z.string().trim().min(1).max(500),
  retrievedAt: z.string().datetime({ offset: true }),
  cases: z.array(pilotCaseSchema).length(50),
}).strict()

type PilotFixture = z.infer<typeof pilotFixtureSchema>
type PilotCase = z.infer<typeof pilotCaseSchema>

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = join(root, 'services', 'scientific', 'testdata', 'material-intelligence-pilot50.json')
const jsonResultPath = join(root, 'docs', 'v2', 'material-intelligence', 'PILOT50_RESULTS.json')
const markdownResultPath = join(root, 'docs', 'v2', 'material-intelligence', 'PILOT50_RESULTS.md')

function toAssessment(fixture: PilotFixture, item: PilotCase): MaterialIntelligenceAssessment {
  const evidenceId = `evidence-pubchem-${item.id.toLowerCase()}`
  const evidence = item.cid ? [{
    id: evidenceId,
    sourceKind: 'PUBLIC_DATABASE_RECORD' as const,
    sourceRef: `https://pubchem.ncbi.nlm.nih.gov/compound/${item.cid}`,
    sourceVersion: `PubChem CID ${item.cid}`,
    retrievedAt: fixture.retrievedAt,
    contentHash: item.contentHash!,
    status: 'VERIFIED' as const,
  }] : []
  return {
    materialId: item.id,
    materialName: item.name,
    productClassification: item.productClassification,
    chemicalEntity: {
      id: `entity-${item.id.toLowerCase()}`,
      preferredName: item.name,
      entityType: item.entityType,
      resolutionStatus: item.resolutionStatus,
      evidenceStatus: item.evidenceStatus,
      ...(item.canonicalSmiles ? {
        molecularIdentity: {
          molecularIdentityId: `identity-${item.id.toLowerCase()}`,
          canonicalSmiles: item.canonicalSmiles,
          inchiKey: item.inchiKey!,
          structureHash: item.structureHash!,
          normalizationVersion: fixture.normalizationVersion,
          rdkitVersion: fixture.rdkitVersion,
          stereochemistry: item.stereochemistry!,
          structureSupport: 'SUPPORTED' as const,
          evidenceRefs: [evidenceId],
        },
      } : {}),
    },
    components: (item.components ?? []).map((component) => ({
      name: component.name,
      role: component.role,
      concentration: component.percent === undefined
        ? { kind: 'UNKNOWN' as const, unit: 'UNKNOWN' as const, basis: 'UNKNOWN' as const }
        : { kind: 'EXACT' as const, value: component.percent, unit: 'PERCENT' as const, basis: 'MASS' as const },
      evidenceStatus: 'UNVERIFIED' as const,
      evidenceRefs: [],
    })),
    evidence,
  }
}

function requireInvariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code)
}

function evidenceContentHash(item: PilotCase) {
  return createHash('sha256').update(JSON.stringify({
    canonicalSmiles: item.sourceCanonicalSmiles,
    inchiKey: item.inchiKey,
    sourceVersion: `PubChem CID ${item.cid}`,
  })).digest('hex')
}

export async function runMaterialIntelligencePilot50(options: { writeArtifacts?: boolean } = {}) {
  const fixture = pilotFixtureSchema.parse(JSON.parse(await readFile(fixturePath, 'utf8')))
  const expectedIds = Array.from({ length: 50 }, (_, index) => `M${String(index + 1).padStart(3, '0')}`)
  requireInvariant(new Set(fixture.cases.map((item) => item.id)).size === 50, 'PILOT_CASE_IDS_NOT_UNIQUE')
  requireInvariant(fixture.cases.every((item, index) => item.id === expectedIds[index]), 'PILOT_CASE_SEQUENCE_INVALID')
  for (const item of fixture.cases.filter((candidate) => candidate.evidenceStatus === 'VERIFIED')) {
    requireInvariant(evidenceContentHash(item) === item.contentHash, `PILOT_EVIDENCE_CONTENT_HASH_INVALID_${item.id}`)
  }

  const assessments = fixture.cases.map((item) => toAssessment(fixture, item))
  const results = assessments.map((assessment) => ({ assessment, eligibility: evaluateScientificEligibility(assessment) }))

  for (const { assessment } of results) {
    const identity = assessment.chemicalEntity?.molecularIdentity
    requireInvariant(Boolean(identity) === (assessment.chemicalEntity?.evidenceStatus === 'VERIFIED'), `PILOT_STRUCTURE_EVIDENCE_BOUNDARY_FAILED_${assessment.materialId}`)
  }
  for (const id of ['M040', 'M041', 'M042', 'M043']) {
    const row = results.find((item) => item.assessment.materialId === id)!
    requireInvariant(row.eligibility.reasonCodes.includes('DILUTION_PRODUCT'), `PILOT_DILUTION_POLICY_FAILED_${id}`)
    requireInvariant(row.assessment.components.some((item) => item.role === 'ACTIVE'), `PILOT_DILUTION_ACTIVE_COMPONENT_MISSING_${id}`)
    requireInvariant(row.assessment.components.some((item) => item.role === 'CARRIER' || item.role === 'SOLVENT'), `PILOT_DILUTION_CARRIER_MISSING_${id}`)
    requireInvariant(row.assessment.components.reduce((sum, component) => sum + (component.concentration.kind === 'EXACT' ? component.concentration.value : 0), 0) === 100, `PILOT_DILUTION_CONCENTRATION_INVALID_${id}`)
  }
  for (const id of ['M044', 'M045', 'M046', 'M047', 'M048']) {
    const row = results.find((item) => item.assessment.materialId === id)!
    requireInvariant(row.eligibility.reasonCodes.includes('NATURAL_COMPLEX') && !row.assessment.chemicalEntity?.molecularIdentity, `PILOT_NATURAL_REPRESENTATIVE_MOLECULE_FORBIDDEN_${id}`)
  }
  requireInvariant(results.find((item) => item.assessment.materialId === 'M049')?.eligibility.reasonCodes.includes('PROPRIETARY_BASE'), 'PILOT_BASE_POLICY_FAILED')
  requireInvariant(results.find((item) => item.assessment.materialId === 'M050')?.eligibility.reasonCodes.includes('UNKNOWN_COMPOSITION'), 'PILOT_UNKNOWN_POLICY_FAILED')

  const identities = new Map(results.flatMap(({ assessment }) => assessment.chemicalEntity?.molecularIdentity ? [[assessment.materialId, assessment.chemicalEntity.molecularIdentity] as const] : []))
  for (const [left, right] of [['M012', 'M013'], ['M015', 'M016'], ['M018', 'M019'], ['M021', 'M022'], ['M030', 'M031']] as const) {
    requireInvariant(identities.get(left)?.structureHash !== identities.get(right)?.structureHash, `PILOT_ISOMER_COLLAPSE_${left}_${right}`)
    requireInvariant(identities.get(left)?.inchiKey !== identities.get(right)?.inchiKey, `PILOT_INCHIKEY_COLLAPSE_${left}_${right}`)
  }
  for (const id of ['M001', 'M002', 'M003', 'M004', 'M005', 'M006', 'M023', 'M024', 'M025', 'M028', 'M037', 'M038', 'M039']) {
    requireInvariant(!identities.has(id), `PILOT_TRADE_NAME_GUESS_FORBIDDEN_${id}`)
  }

  const resultCounts = Object.fromEntries(['ELIGIBLE', 'NOT_ELIGIBLE', 'REVIEW_REQUIRED'].map((status) => [status, results.filter((item) => item.eligibility.result === status).length]))
  const resolutionCounts = Object.fromEntries(['RESOLVED', 'UNRESOLVED', 'CONFLICTED', 'NOT_APPLICABLE'].map((status) => [status, results.filter((item) => item.assessment.chemicalEntity?.resolutionStatus === status).length]))
  const reasonCounts = Object.fromEntries([...new Set(results.flatMap((item) => item.eligibility.reasonCodes))].sort().map((reason) => [reason, results.filter((item) => item.eligibility.reasonCodes.includes(reason)).length]))
  const artifact = {
    contractVersion: fixture.contractVersion,
    policyVersion: results[0]!.eligibility.policyVersion,
    normalizationVersion: fixture.normalizationVersion,
    rdkitVersion: fixture.rdkitVersion,
    fixture: 'services/scientific/testdata/material-intelligence-pilot50.json',
    caseCount: results.length,
    resultCounts,
    resolutionCounts,
    reasonCounts,
    componentCount: assessments.reduce((sum, assessment) => sum + assessment.components.length, 0),
    chemicalEntityCount: assessments.filter((assessment) => assessment.chemicalEntity).length,
    verifiedIdentityCount: identities.size,
    guessedIdentityCount: 0,
    cases: results.map(({ assessment, eligibility: result }) => ({
      id: assessment.materialId,
      name: assessment.materialName,
      productClassification: assessment.productClassification,
      resolutionStatus: assessment.chemicalEntity?.resolutionStatus ?? 'UNRESOLVED',
      evidenceStatus: assessment.chemicalEntity?.evidenceStatus ?? 'UNVERIFIED',
      result: result.result,
      reasonCodes: result.reasonCodes,
      sourceRefs: assessment.evidence.map((item) => item.sourceRef),
    })),
  }
  requireInvariant(artifact.caseCount === 50, 'PILOT_RESULT_COUNT_INVALID')
  requireInvariant(Object.values(resultCounts).reduce((sum, count) => sum + count, 0) === 50, 'PILOT_RESULT_ACCOUNTING_INVALID')

  if (options.writeArtifacts !== false) {
    await mkdir(dirname(jsonResultPath), { recursive: true })
    await writeFile(jsonResultPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
    const markdown = [
      '# Material Intelligence Pilot 50 Results', '',
      `- Contract: \`${artifact.contractVersion}\``,
      `- Policy: \`${artifact.policyVersion}\``,
      `- Normalization: \`${artifact.normalizationVersion}\` (RDKit \`${artifact.rdkitVersion}\`)`,
      `- Cases: **${artifact.caseCount}**`,
      `- Verified molecular identities: **${artifact.verifiedIdentityCount}**`,
      '- Guessed identities: **0**', '',
      '## Outcome summary', '',
      '| Result | Count |', '| --- | ---: |',
      ...Object.entries(resultCounts).map(([key, value]) => `| ${key} | ${value} |`), '',
      '## Reason summary', '',
      '| Reason | Count |', '| --- | ---: |',
      ...Object.entries(reasonCounts).map(([key, value]) => `| ${key} | ${value} |`), '',
      '## Foundation counts', '',
      `- Components: **${artifact.componentCount}**`,
      `- Chemical entities: **${artifact.chemicalEntityCount}**`,
      `- Molecular identities: **${artifact.verifiedIdentityCount}**`,
      `- Resolution: ${Object.entries(resolutionCounts).map(([key, value]) => `${key}=${value}`).join(', ')}`, '',
      '## Case results', '',
      '| ID | Material product | Product class | Identity | Eligibility | Reason |', '| --- | --- | --- | --- | --- | --- |',
      ...artifact.cases.map((item) => `| ${item.id} | ${item.name.replaceAll('|', '\\|')} | ${item.productClassification} | ${item.resolutionStatus}/${item.evidenceStatus} | ${item.result} | ${item.reasonCodes.join(', ')} |`), '',
      '## Evidence boundary', '',
      '- Verified molecular structures are limited to pinned PubChem CID records captured in the fixture.',
      '- Trade names, naturals, bases, dilutions, and incomplete supplier identities are never converted into representative molecules.',
      '- The pilot performs classification only. It does not compute features, train a model, write a database, or call production services.', '',
    ].join('\n')
    await writeFile(markdownResultPath, markdown, 'utf8')
  }
  return artifact
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMaterialIntelligencePilot50().then((result) => {
    process.stdout.write(`MATERIAL_INTELLIGENCE_PILOT50=PASS cases=${result.caseCount} eligible=${result.resultCounts.ELIGIBLE ?? 0} guessed=${result.guessedIdentityCount}\n`)
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'MATERIAL_INTELLIGENCE_PILOT50_FAILED'}\n`)
    process.exitCode = 1
  })
}
