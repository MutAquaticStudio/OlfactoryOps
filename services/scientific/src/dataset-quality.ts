import { createHash } from 'node:crypto'

export type OdorDatasetRow = { structure: string; targets: Record<string, number | null> }
export type DatasetSplit = { train: OdorDatasetRow[]; validation: OdorDatasetRow[]; test: OdorDatasetRow[]; splitHash: string; quality: DatasetQualityReport }
export type DatasetQualityReport = {
  rowCount: number
  targetCount: number
  missingTargetCount: number
  duplicateStructureCount: number
  overlapCount: number
  leakageStatus: 'PASS' | 'FAIL'
}

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  return JSON.stringify(value)
}
const digest = (value: unknown) => createHash('sha256').update(stableJson(value)).digest('hex')
const bucket = (value: string) => Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16) / 0xffff_ffff

/**
 * The caller supplies a chemistry-canonical structure group from the isolated
 * scientific runtime. Split ownership is assigned by that group, never by row,
 * preventing duplicate structures from leaking between train/validation/test.
 */
export function groupAwareSplit(rows: OdorDatasetRow[], options: { seed: number; groupFor: (structure: string) => string; validationFraction?: number; testFraction?: number }): DatasetSplit {
  const validationFraction = options.validationFraction ?? 0.15
  const testFraction = options.testFraction ?? 0.15
  if (validationFraction <= 0 || testFraction <= 0 || validationFraction + testFraction >= 1) throw new Error('Validation and test fractions must be positive and leave a training partition.')
  const partitions = { train: [] as OdorDatasetRow[], validation: [] as OdorDatasetRow[], test: [] as OdorDatasetRow[] }
  const groups = new Map<string, OdorDatasetRow[]>()
  for (const row of rows) {
    const group = options.groupFor(row.structure)
    if (!group) throw new Error('Every dataset row requires a non-empty canonical structure group.')
    const items = groups.get(group) ?? []; items.push(row); groups.set(group, items)
  }
  for (const [group, members] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const value = bucket(`${options.seed}:${group}`)
    const target = value < testFraction ? partitions.test : value < testFraction + validationFraction ? partitions.validation : partitions.train
    target.push(...members)
  }
  const quality = assessDatasetPartitions(partitions, options.groupFor)
  return { ...partitions, splitHash: digest({ seed: options.seed, validationFraction, testFraction, groups: [...groups.keys()].sort(), partitions: Object.fromEntries(Object.entries(partitions).map(([name, values]) => [name, values.map((row) => row.structure)])) }), quality }
}

export function assessDatasetPartitions(partitions: Pick<DatasetSplit, 'train' | 'validation' | 'test'>, groupFor: (structure: string) => string): DatasetQualityReport {
  const all = [...partitions.train, ...partitions.validation, ...partitions.test]
  const structures = all.map((row) => groupFor(row.structure))
  const targetValues = all.flatMap((row) => Object.values(row.targets))
  const groups = new Map<string, Set<string>>()
  for (const [name, rows] of Object.entries(partitions)) for (const row of rows) {
    const key = groupFor(row.structure); const memberships = groups.get(key) ?? new Set<string>(); memberships.add(name); groups.set(key, memberships)
  }
  const overlapCount = [...groups.values()].filter((membership) => membership.size > 1).length
  return {
    rowCount: all.length,
    targetCount: targetValues.length,
    missingTargetCount: targetValues.filter((value) => value === null || !Number.isFinite(value)).length,
    duplicateStructureCount: structures.length - new Set(structures).size,
    overlapCount,
    leakageStatus: overlapCount ? 'FAIL' : 'PASS',
  }
}
