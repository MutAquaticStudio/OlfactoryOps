import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const root = process.cwd()
const scriptPath = join(root, 'scripts', 'material_intelligence_bulk_precheck.py')
const artifactRoot = join(root, 'docs', 'v2', 'material-intelligence')
const precheck = JSON.parse(readFileSync(join(artifactRoot, 'BULK_INGEST_PRECHECK.json'), 'utf8'))
const enrichment = JSON.parse(readFileSync(join(artifactRoot, 'BULK_ENRICHMENT_QUEUE.json'), 'utf8'))
const conflicts = JSON.parse(readFileSync(join(artifactRoot, 'BULK_CONFLICT_REPORT.json'), 'utf8'))
const summary = readFileSync(join(artifactRoot, 'BULK_INGEST_PRECHECK.md'), 'utf8')

describe('Material Intelligence bulk precheck contract', () => {
  test('runs the focused local-only Python suite', () => {
    expect(() => execFileSync(process.env.PYTHON ?? 'python', [
        '-m',
        'unittest',
        'discover',
        '-s',
        'scripts',
        '-p',
        'test_material_intelligence_*.py',
      ], { cwd: root, encoding: 'utf8' })).not.toThrow()
  })

  test('keeps preview fail-closed and provider-free', () => {
    const source = readFileSync(scriptPath, 'utf8')
    expect(source).toContain('choices=("preview",)')
    expect(source).toContain('FORMULA_TO_SMILES_ALLOWED=NO')
    expect(source).toContain('NAME_ONLY_STRUCTURE_GUESSING_ALLOWED=NO')
    expect(source).toContain('CAS_ONLY_MODEL_ELIGIBLE=NO')
    expect(source).not.toMatch(/DATABASE_URL|HYPERDRIVE|SUPABASE_URL|fetch\(|requests\.|urllib\.|socket\./)
  })

  test('requires an external source and does not embed the user workbook', () => {
    const source = readFileSync(scriptPath, 'utf8')
    expect(source).toContain('parser.add_argument("--source", required=True')
    expect(source).not.toContain('OlfactoryOps_Material_Intelligence_Master_v1.xlsx')
  })

  test('hardens CAS evidence and assigns one fail-closed ingest wave', () => {
    const source = readFileSync(scriptPath, 'utf8')
    expect(source).toContain('CAS_ALLOWED_RESIDUE_PATTERN')
    expect(source).toContain('"sourceCasRaw": source_cas_raw')
    expect(source).toContain('"casValue": cas_value')
    expect(source).toContain('"rowCount": len(row_ids)')
    expect(source).toContain('def assign_ingest_wave(item: dict[str, Any]) -> str:')
    expect(source).toContain('item["recommendedWave"] = assign_ingest_wave(item)')
    expect(source).toContain('MANUAL_REVIEW_ACTION_WITHOUT_REQUIREMENT_COUNT')
    expect(source).toContain('INGEST_WAVE_EXCLUSIVITY_FAILED')
  })

  test('committed artifacts account for every row in exactly one wave', () => {
    const allowedWaves = new Set(['Wave A', 'Wave B', 'Wave C', 'Wave D', 'Wave E'])
    expect(precheck.source.fileSha256).toBe('a49bede2801da2e0edb25a305fc3df8b751837e3d0aba6779bf0750e1e456ef4')
    expect(precheck.source.rowCount).toBe(1986)
    expect(precheck.results).toHaveLength(1986)
    expect(precheck.results.every((item) => allowedWaves.has(item.recommendedWave))).toBe(true)
    expect(precheck.counts.ROWS_WITH_ZERO_WAVES).toBe(0)
    expect(precheck.counts.ROWS_WITH_MULTIPLE_WAVES).toBe(0)
    expect(precheck.counts.TOTAL_WAVE_ROW_COUNT).toBe(1986)
    expect(precheck.recommendedIngestBatches.reduce((total, batch) => total + batch.rowCount, 0)).toBe(1986)
  })

  test('committed artifacts preserve CAS evidence and review requirements', () => {
    expect(precheck.results.every((item) => Object.hasOwn(item, 'sourceCasRaw'))).toBe(true)
    expect(precheck.results.filter((item) => item.enrichmentAction === 'MANUAL_REVIEW_REQUIRED')
      .every((item) => item.evidenceRequirements.includes('MANUAL_IDENTITY_REVIEW'))).toBe(true)
    expect(precheck.counts.MANUAL_REVIEW_ACTION_WITHOUT_REQUIREMENT_COUNT).toBe(0)
    expect(conflicts.casCollisionGroups).toHaveLength(precheck.counts.CAS_COLLISION_GROUPS)
    expect(new Set(conflicts.casCollisionGroups.map((group) => group.casValue)).size).toBe(conflicts.casCollisionGroups.length)
    expect(conflicts.casCollisionGroups.every((group) => group.casValue && group.rowCount === group.sourceRowIds.length)).toBe(true)
    expect(enrichment.items).toHaveLength(1986)
  })

  test('generated Markdown and JSON counts reconcile exactly', () => {
    for (const [key, value] of Object.entries(precheck.counts)) {
      expect(summary).toContain(`| \`${key}\` | ${value} |`)
    }
    expect(conflicts.counts.CAS_COLLISION_GROUPS).toBe(precheck.counts.CAS_COLLISION_GROUPS)
    expect(enrichment.counts.MANUAL_REVIEW_REQUIRED).toBe(precheck.counts.MANUAL_REVIEW_REQUIRED_COUNT)
  })
})
