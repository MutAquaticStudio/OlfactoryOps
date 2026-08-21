import type { FefoCandidate, LotProjection } from '../../../packages/contracts/src/lab-operations.js'

export type LedgerEntry = {
  type: 'RECEIPT' | 'TRANSFER' | 'RESERVE' | 'RELEASE_RESERVATION' | 'CONSUMPTION' | 'ADJUSTMENT' | 'RETURN' | 'WASTE'
  quantityGrams: number
}

export type LandedCostLine = { id: string; receivedValue: number; quantityGrams: number }

const finite = (value: number, name: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative finite number.`)
  return value
}

export function projectLot(entries: LedgerEntry[]): LotProjection {
  let receivedGrams = 0
  let consumedGrams = 0
  let reservedGrams = 0
  let wastedGrams = 0
  let returnedGrams = 0
  for (const entry of entries) {
    const quantity = finite(entry.quantityGrams, 'Ledger quantity')
    if (entry.type === 'RECEIPT' || entry.type === 'ADJUSTMENT') receivedGrams += quantity
    if (entry.type === 'CONSUMPTION') consumedGrams += quantity
    if (entry.type === 'RESERVE') reservedGrams += quantity
    if (entry.type === 'RELEASE_RESERVATION') reservedGrams -= quantity
    if (entry.type === 'WASTE') wastedGrams += quantity
    if (entry.type === 'RETURN') returnedGrams += quantity
  }
  if (reservedGrams < -1e-9) throw new Error('Reservation release exceeds the active reservation amount.')
  const onHandGrams = receivedGrams - consumedGrams - wastedGrams - returnedGrams
  if (onHandGrams < -1e-9) throw new Error('Ledger would produce negative on-hand stock.')
  const availableGrams = onHandGrams - reservedGrams
  if (availableGrams < -1e-9) throw new Error('Ledger would reserve more than on-hand stock.')
  return { receivedGrams, consumedGrams, reservedGrams, wastedGrams, returnedGrams, onHandGrams, availableGrams }
}

export function selectFefo(candidates: FefoCandidate[], materialId: string, targetGrams: number, now = new Date()): FefoCandidate[] {
  finite(targetGrams, 'Target quantity')
  if (targetGrams <= 0) throw new Error('Target quantity must be greater than zero.')
  const eligible = candidates.filter((candidate) => candidate.materialId === materialId && candidate.status === 'AVAILABLE' && candidate.qualityStatus === 'PASSED' && candidate.availableGrams > 0 && (!candidate.expiresAt || new Date(candidate.expiresAt).getTime() > now.getTime()))
  eligible.sort((left, right) => {
    const leftExpiry = left.expiresAt ? new Date(left.expiresAt).getTime() : Number.POSITIVE_INFINITY
    const rightExpiry = right.expiresAt ? new Date(right.expiresAt).getTime() : Number.POSITIVE_INFINITY
    return leftExpiry - rightExpiry || left.createdAt.localeCompare(right.createdAt) || left.lotId.localeCompare(right.lotId)
  })
  let remaining = targetGrams
  const selected: FefoCandidate[] = []
  for (const candidate of eligible) {
    selected.push(candidate)
    remaining -= candidate.availableGrams
    if (remaining <= 1e-9) return selected
  }
  throw new Error('No eligible FEFO allocation can satisfy the requested quantity.')
}

export function allocateLandedCost(lines: LandedCostLine[], totalCost: number): Array<LandedCostLine & { allocatedCost: number; landedUnitCost: number }> {
  finite(totalCost, 'Landed cost')
  if (!lines.length) throw new Error('At least one receipt line is required.')
  const normalized = lines.map((line) => ({ ...line, receivedValue: finite(line.receivedValue, 'Received value'), quantityGrams: finite(line.quantityGrams, 'Received quantity') }))
  const totalValue = normalized.reduce((sum, line) => sum + line.receivedValue, 0)
  if (totalValue <= 0) throw new Error('Landed cost allocation requires positive receipt value.')
  const ranked = [...normalized].sort((left, right) => right.receivedValue - left.receivedValue || left.id.localeCompare(right.id))
  const residualLineId = ranked[0].id
  const nonResidualAllocation = normalized
    .filter((line) => line.id !== residualLineId)
    .reduce((sum, line) => sum + Math.round((totalCost * (line.receivedValue / totalValue)) * 100) / 100, 0)
  return normalized.map((line) => {
    const allocatedCost = line.id === residualLineId
      ? Math.round((totalCost - nonResidualAllocation) * 100) / 100
      : Math.round((totalCost * (line.receivedValue / totalValue)) * 100) / 100
    return { ...line, allocatedCost, landedUnitCost: line.quantityGrams > 0 ? allocatedCost / line.quantityGrams : 0 }
  })
}
