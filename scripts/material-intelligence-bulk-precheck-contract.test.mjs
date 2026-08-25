import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const root = process.cwd()
const scriptPath = join(root, 'scripts', 'material_intelligence_bulk_precheck.py')

describe('Material Intelligence bulk precheck contract', () => {
  test('runs the focused local-only Python suite', () => {
    expect(() => execFileSync(process.env.PYTHON ?? 'python', [
        '-m',
        'unittest',
        'discover',
        '-s',
        'scripts',
        '-p',
        'test_material_intelligence_bulk_precheck.py',
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
})
