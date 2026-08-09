import type { FormulaComponent } from '../../../packages/contracts/src/formula-intelligence.js'

export type FormulaMathResult = {
  totalPercentage: number
  normalized: boolean
  valid: boolean
  issues: Array<'TOTAL_NOT_100' | 'DUPLICATE_MATERIAL' | 'DUPLICATE_POSITION' | 'INVALID_COMPONENT'>
  components: Array<FormulaComponent & { weightGrams: number; percentage: number }>
}

const precision = (value: number, digits: number) => Number(value.toFixed(digits))

/**
 * This is the only Formula percentage/mass calculation. It is deliberately
 * independent of model and UI output: callers may request a preview, but a
 * version can be created only when this result is valid.
 */
export function calculateFormulaMath(components: FormulaComponent[], targetMassGrams: number, options: { normalize?: boolean } = {}): FormulaMathResult {
  const issues = new Set<FormulaMathResult['issues'][number]>()
  if (!Number.isFinite(targetMassGrams) || targetMassGrams <= 0) issues.add('INVALID_COMPONENT')
  if (new Set(components.map((component) => component.materialId)).size !== components.length) issues.add('DUPLICATE_MATERIAL')
  if (new Set(components.map((component) => component.position)).size !== components.length) issues.add('DUPLICATE_POSITION')
  if (!components.length || components.some((component) => !Number.isFinite(component.percentage) || component.percentage <= 0 || component.percentage > 100 || !Number.isInteger(component.position) || component.position < 0)) issues.add('INVALID_COMPONENT')
  const rawTotal = components.reduce((total, component) => total + component.percentage, 0)
  const normalize = options.normalize === true && rawTotal > 0 && !issues.has('INVALID_COMPONENT')
  const resolved = components.map((component) => {
    const percentage = normalize ? precision((component.percentage / rawTotal) * 100, 6) : precision(component.percentage, 6)
    return { ...component, percentage, weightGrams: precision((percentage / 100) * targetMassGrams, 6) }
  })
  const resolvedTotal = precision(resolved.reduce((total, component) => total + component.percentage, 0), 6)
  if (Math.abs(resolvedTotal - 100) > 0.000001) issues.add('TOTAL_NOT_100')
  return { totalPercentage: resolvedTotal, normalized: normalize, valid: issues.size === 0, issues: [...issues], components: resolved }
}
