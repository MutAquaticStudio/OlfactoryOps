import { PlatformError } from '../../platform/src/service.js'

export type FormulaComponent = {
  materialId: string
  percentage: number
}

export type ProductionRequirementCalculation = {
  materialId: string
  percentage: number
  requiredGrams: number
}

export type ProductionYield = {
  theoreticalGrams: number
  actualGrams: number
  lossGrams: number
  yieldPercent: number
}

const EPSILON = 0.000001

function rounded(value: number) {
  return Number(value.toFixed(6))
}

/**
 * Production quantities are a deterministic projection of a pinned Formula
 * Version. Keeping this calculation independent from persistence makes it
 * possible to re-check the immutable snapshot before every critical gate.
 */
export function calculateProductionRequirements(components: readonly FormulaComponent[], targetBulkGrams: number): ProductionRequirementCalculation[] {
  if (!Number.isFinite(targetBulkGrams) || targetBulkGrams <= 0) {
    throw new PlatformError('PRODUCTION_TARGET_INVALID', 'The target production quantity must be greater than zero.', 422)
  }
  if (!components.length) throw new PlatformError('PRODUCTION_FORMULA_EMPTY', 'A Production Order needs at least one Formula material.', 409)
  const seen = new Set<string>()
  let total = 0
  for (const component of components) {
    if (!component.materialId || !Number.isFinite(component.percentage) || component.percentage <= 0 || component.percentage > 100) {
      throw new PlatformError('PRODUCTION_FORMULA_COMPONENT_INVALID', 'A Formula component is not valid for production planning.', 409)
    }
    if (seen.has(component.materialId)) throw new PlatformError('PRODUCTION_FORMULA_DUPLICATE_MATERIAL', 'A Formula material may appear only once in a production snapshot.', 409)
    seen.add(component.materialId)
    total += component.percentage
  }
  if (Math.abs(total - 100) > EPSILON) {
    throw new PlatformError('PRODUCTION_FORMULA_MATH_INVALID', 'The Formula composition must total 100 percent before production can be planned.', 409)
  }
  return components.map((component) => ({
    materialId: component.materialId,
    percentage: rounded(component.percentage),
    requiredGrams: rounded(targetBulkGrams * component.percentage / 100),
  }))
}

export function calculateYield(theoreticalGrams: number, actualGrams: number): ProductionYield {
  if (!Number.isFinite(theoreticalGrams) || theoreticalGrams <= 0 || !Number.isFinite(actualGrams) || actualGrams < 0) {
    throw new PlatformError('PRODUCTION_YIELD_INVALID', 'Production yield values must be finite non-negative quantities.', 422)
  }
  const lossGrams = Math.max(0, theoreticalGrams - actualGrams)
  return {
    theoreticalGrams: rounded(theoreticalGrams),
    actualGrams: rounded(actualGrams),
    lossGrams: rounded(lossGrams),
    yieldPercent: rounded(actualGrams / theoreticalGrams * 100),
  }
}

export function evaluateNumericSpecification(value: number, lowerLimit: number | null, upperLimit: number | null) {
  if (!Number.isFinite(value)) throw new PlatformError('PRODUCTION_QC_VALUE_INVALID', 'A numeric QC result must be finite.', 422)
  if (lowerLimit !== null && value < lowerLimit) return 'FAIL' as const
  if (upperLimit !== null && value > upperLimit) return 'FAIL' as const
  return 'PASS' as const
}
