import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const evidence = (name: string) => resolve(root, 'docs/v2/osmo-demo-finetune', name)
const artifact = (name: string) => resolve(root, 'services/scientific/model-runtime/artifacts/osmo-dravnieks-transformer-cnn', name)
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as Record<string, any>
const fileHash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex')

describe('Osmo research evidence bundle', () => {
  it('records the resolved LFS dataset and explicit normalization outcomes', async () => {
    const provenance = await readJson(evidence('DATASET_PROVENANCE_REPORT.json'))
    const preparation = await readJson(evidence('DATASET_PREPARATION_SUMMARY.json'))
    expect(provenance.rawSha256).toBe('d560c47e9fc9fe8e802144be0c219e84594ef99611cfe1f7e4c861f38720edaf')
    expect(provenance.rawSize).toBe(123443)
    expect(provenance.license).toBe('CC-BY-4.0')
    expect(preparation.normalization).toMatchObject({ rawRowCount: 127, modelRowCount: 127, rejectedRowCount: 0, invalidStructureCount: 0, duplicateStructureGroupCount: 0, conflictingDuplicateGroupCount: 0 })
  })

  it('freezes disjoint canonical and scaffold groups before exposing test metrics', async () => {
    const split = await readJson(evidence('SPLIT_MANIFEST.json'))
    const sets = ['TRAIN', 'VALIDATION', 'TEST'].map((role) => new Set<string>(split.partitions[role].structureHashes))
    expect(split).toMatchObject({ seed: 20260825, leakageStatus: 'PASS', canonicalOverlapCount: 0, scaffoldOverlapCount: 0 })
    expect(new Set(['TRAIN', 'VALIDATION', 'TEST'].map((role) => split.partitions[role].groupHash)).size).toBe(3)
    expect([...sets[0]].filter((item) => sets[1].has(item) || sets[2].has(item))).toEqual([])
    expect([...sets[1]].filter((item) => sets[2].has(item))).toEqual([])
  })

  it('keeps target selection train-driven and bounded to 20 native regression scores', async () => {
    const targets = await readJson(evidence('TARGET_MANIFEST.json'))
    expect(targets.selectionUsesTestPerformance).toBe(false)
    expect(targets.targetCount).toBe(20)
    expect(targets.selectedTargets).toHaveLength(20)
    expect(targets.selectedTargets.every((item: string) => item.startsWith('regression_'))).toBe(true)
    expect(targets.targets.every((item: Record<string, unknown>) => item.rawScale === 'dataset descriptor response score, source range 0-1; not a probability')).toBe(true)
  })

  it('verifies the evaluated research checkpoint and deterministic three-case evidence', async () => {
    const manifest = await readJson(artifact('model_manifest.json'))
    const evaluation = await readJson(artifact('evaluation_report.json'))
    const demo = await readJson(artifact('demo_cases.json'))
    expect(await fileHash(artifact('candidate.weights.h5'))).toBe(manifest.weights.sha256)
    expect(manifest.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(evaluation.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.evaluationHash).toBe(evaluation.contentHash)
    expect(manifest).toMatchObject({ modelStage: 'RESEARCH', evidenceStatus: 'EVALUATED', trainingMode: 'FINE_TUNE_FROZEN_PRETRAINED_ENCODER' })
    expect(evaluation).toMatchObject({ partition: 'TEST', testEvaluations: 1, leakageStatus: 'PASS' })
    expect(evaluation.transformerMetrics.rmse).toBeLessThan(evaluation.baselines.trainMean.metrics.rmse)
    expect(evaluation.transformerMetrics.rmse).toBeLessThan(evaluation.baselines.ecfpRidge.metrics.rmse)
    expect(demo.cases).toHaveLength(3)
    expect(demo.reproducibility).toBe('PASS')
    expect(demo.cases.every((item: Record<string, unknown>) => item.splitMembership === 'TEST' && item.trainingSeen === 'NO' && item.acceptanceStatus === 'PASS')).toBe(true)
  })

  it('records an actual isolated registry transaction rather than production metadata', async () => {
    const registry = await readJson(evidence('MODEL_REGISTRY_EVIDENCE.json'))
    expect(registry).toMatchObject({ registryKind: 'ISOLATED_LOCAL_POSTGRES_INTEGRATION', productionMutation: 'NONE', researchReadyListing: 'PASS', modelStage: 'RESEARCH' })
    expect(registry.dataset.status).toBe('APPROVED')
    expect(registry.checkpoint.status).toBe('VERIFIED')
    expect(registry.trainingRun).toMatchObject({ statusAfterEvaluation: 'SUCCEEDED', leakageStatus: 'PASS' })
    expect(registry.evaluation).toMatchObject({ status: 'REVIEW_REQUIRED', leakageStatus: 'PASS', metricCount: 42 })
  })
})
