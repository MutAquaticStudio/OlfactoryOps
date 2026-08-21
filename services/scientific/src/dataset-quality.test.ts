import { describe, expect, it } from 'vitest'
import { assessDatasetPartitions, groupAwareSplit, type OdorDatasetRow } from './dataset-quality.js'

const rows: OdorDatasetRow[] = [
  { structure: 'CCO', targets: { floral: 0.1 } }, { structure: 'CCO', targets: { floral: 0.2 } },
  { structure: 'CCN', targets: { floral: 0.3 } }, { structure: 'CCC', targets: { floral: null } },
  { structure: 'CCCl', targets: { floral: 0.4 } }, { structure: 'CCBr', targets: { floral: 0.5 } },
]

describe('group-aware dataset quality', () => {
  it('keeps identical canonical structures in one partition deterministically', () => {
    const result = groupAwareSplit(rows, { seed: 42, groupFor: (structure) => structure, validationFraction: 0.2, testFraction: 0.2 })
    const locations = [result.train, result.validation, result.test].filter((partition) => partition.some((row) => row.structure === 'CCO'))
    expect(locations).toHaveLength(1)
    expect(result.quality.leakageStatus).toBe('PASS')
    expect(result.quality.missingTargetCount).toBe(1)
    expect(groupAwareSplit(rows, { seed: 42, groupFor: (structure) => structure, validationFraction: 0.2, testFraction: 0.2 }).splitHash).toBe(result.splitHash)
  })

  it('reports split leakage rather than allowing it silently', () => {
    const report = assessDatasetPartitions({ train: [rows[0]], validation: [rows[1]], test: [] }, (structure) => structure)
    expect(report.leakageStatus).toBe('FAIL')
    expect(report.overlapCount).toBe(1)
  })
})
