import { describe, expect, it } from 'vitest'
import { materials } from './northStar'
import {
  enrichMaterialFromLluchCatalogue,
  lluchCatalogue2026Source,
  searchLluchCatalogue2026,
} from './lluch-catalogue-2026'

describe('Lluch catalogue 2026 import source', () => {
  it('keeps the complete supplier product list searchable with source traceability', () => {
    expect(lluchCatalogue2026Source.productCount).toBe(1986)
    expect(lluchCatalogue2026Source.pageCount).toBe(55)
    expect(lluchCatalogue2026Source.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    const results = searchLluchCatalogue2026('bergamot')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((product) => product.productName.includes('BERGAMOT'))).toBe(true)
    expect(results.every((product) => product.page >= 4 && product.page <= 54)).toBe(true)
  })

  it('adds only supplier references and curated sensory metadata to matching material records', () => {
    const bergamot = materials.find((material) => material.id === 'mat-bergamot')!
    const result = enrichMaterialFromLluchCatalogue(bergamot)

    expect(result.material.cas).toBe(bergamot.cas)
    expect(result.material.costPerGram).toBe(bergamot.costPerGram)
    expect(result.material.ifraLimit).toBe(bergamot.ifraLimit)
    expect(result.material.supplierCatalogueReferences?.some((reference) => reference.supplier === 'Lluch Essence')).toBe(true)
    expect(result.material.olfactiveProfile?.strength).toBe('Strong')
  })
})
