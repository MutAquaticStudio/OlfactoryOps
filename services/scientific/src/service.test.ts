import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { CompositeScientificRuntime, ScientificRuntimeUnavailable, type ScientificRuntime } from './service.js'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

class FixedRuntime implements ScientificRuntime {
  async normalize(input: { smiles: string }) {
    const canonicalSmiles = input.smiles === 'OCC' ? 'CCO' : input.smiles
    const inputHash = hash(input.smiles)
    const structureHash = hash(`structure:${canonicalSmiles}`)
    const outputHash = hash({ canonicalSmiles, structureHash })
    return {
      runtimeVersion: 'test-runtime/1',
      structure: { canonicalSmiles, inchi: null, inchiKey: null, structureHash, inputHash, outputHash, molecularGraph: { atoms: [{ index: 0, symbol: 'C', atomicNumber: 6 }], bonds: [] }, rdkitVersion: 'test-rdkit', standardizationVersion: 'standardization/1' },
      artifacts: [],
    }
  }

  async generateFeatures(input: { canonicalSmiles: string; featureKinds: Array<'ECFP' | 'BCFP' | 'MOLFTP' | 'OSMORDRED'> }) {
    const structure = (await this.normalize({ smiles: input.canonicalSmiles })).structure
    return {
      runtimeVersion: 'test-runtime/1', structure,
      artifacts: input.featureKinds.map((kind) => ({
        kind, status: kind === 'MOLFTP' ? 'NOT_EVALUATED' as const : 'VERIFIED' as const, schemaVersion: `${kind.toLowerCase()}/1`, componentKey: kind, componentVersion: 'fixture', inputHash: structure.outputHash,
        contentHash: hash({ kind, smiles: input.canonicalSmiles }), payload: kind === 'MOLFTP' ? { reason: 'No target dataset is registered.' } : { bits: [1, 4, 9] },
        provenance: [{ kind: 'component', id: kind, version: 'fixture' }],
      })),
    }
  }
}

class MismatchedRuntime extends FixedRuntime {
  override async generateFeatures(input: { canonicalSmiles: string; featureKinds: Array<'ECFP' | 'BCFP' | 'MOLFTP' | 'OSMORDRED'> }) {
    const result = await super.generateFeatures(input)
    return {
      ...result,
      structure: {
        ...result.structure,
        structureHash: 'unexpected-structure-hash',
      },
    }
  }
}

describe('ScientificFeatureService runtime boundary', () => {
  it('keeps runtime requests typed and marks MolFTP not evaluated without target evidence', async () => {
    const runtime = new FixedRuntime()
    const result = await runtime.generateFeatures({ canonicalSmiles: 'CCO', featureKinds: ['ECFP', 'MOLFTP'] })
    expect(result.artifacts.map((item) => item.status)).toEqual(['VERIFIED', 'NOT_EVALUATED'])
    expect(result.artifacts[1]?.payload).toEqual({ reason: 'No target dataset is registered.' })
  })

  it('fails closed when the private runtime is not configured', async () => {
    const runtime = new ScientificRuntimeUnavailable()
    await expect(runtime.normalize({ smiles: 'CCO' })).rejects.toThrow('SCIENTIFIC_RUNTIME_NOT_CONFIGURED')
    await expect(runtime.generateFeatures({ canonicalSmiles: 'CCO', featureKinds: ['BCFP'] })).rejects.toThrow('SCIENTIFIC_RUNTIME_NOT_CONFIGURED')
  })

  it('combines the isolated Osmordred artifact only when both runtimes agree on structure identity', async () => {
    const runtime = new CompositeScientificRuntime(new FixedRuntime(), new FixedRuntime())
    const result = await runtime.generateFeatures({ canonicalSmiles: 'CCO', featureKinds: ['ECFP', 'OSMORDRED'] })
    expect(result.artifacts.map((item) => item.kind)).toEqual(['ECFP', 'OSMORDRED'])
    expect(result.structure.structureHash).toBe(hash('structure:CCO'))
  })

  it('fails closed when isolated runtimes disagree on structure identity', async () => {
    const runtime = new CompositeScientificRuntime(new FixedRuntime(), new MismatchedRuntime())
    await expect(runtime.generateFeatures({ canonicalSmiles: 'CCO', featureKinds: ['ECFP', 'OSMORDRED'] })).rejects.toThrow('SCIENTIFIC_RUNTIME_STRUCTURE_MISMATCH')
  })
})
