import { describe, expect, it } from 'vitest'
import { materials } from './northStar'
import {
  enrichMaterialFromLluchCatalogue,
  isLluchCatalogueSourceMaterial,
  lluchCatalogue2026Source,
  lluchCatalogueGlobalMasterMaterialById,
  lluchCatalogueGlobalMasterMaterials,
  lluchCatalogueMaterialDirectoryForOrganization,
  rankLluchCatalogueGlobalMasterMaterials,
  searchLluchCatalogue2026,
} from './lluch-catalogue-2026'
import { lluchCatalogue2026Evidence } from './lluch-catalogue-2026-evidence'

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

  it('projects one shared supplier range for every tenant without asserting missing technical data', () => {
    const directory = lluchCatalogueMaterialDirectoryForOrganization('org-catalogue-test')
    const secondTenantDirectory = lluchCatalogueMaterialDirectoryForOrganization('org-other-tenant')
    const astrolide = directory.find((material) => material.name === 'ASTROLIDE PURE')

    expect(directory).toHaveLength(1986)
    expect(secondTenantDirectory).toBe(directory)
    expect(astrolide?.libraryScope).toBe('GLOBAL')
    expect(astrolide?.organizationId).toBeUndefined()
    expect(astrolide?.cas).toBe('1222-05-5')
    expect(astrolide?.catalogueSource?.status).toBe('SOURCE_ONLY')
    expect(astrolide?.supplierCatalogueReferences?.[0]?.sourceProductId).toBe('lluch-2026-0104')
    expect(astrolide?.costPerGram).toBe(0)
    expect(isLluchCatalogueSourceMaterial(astrolide!)).toBe(true)
  })

  it('projects supplier-declared odour and physical ranges for every imported catalogue product without fabricating compliance data', () => {
    const directory = lluchCatalogueMaterialDirectoryForOrganization('org-catalogue-evidence')
    const evidenceBacked = directory.filter((material) => material.catalogueEvidence)
    const densityBacked = evidenceBacked.filter((material) => material.catalogueEvidence?.density)

    expect(lluchCatalogue2026Evidence).toHaveLength(1986)
    expect(evidenceBacked).toHaveLength(1986)
    expect(evidenceBacked.every((material) => material.catalogueEvidence!.declaredOdour.length > 0)).toBe(true)
    expect(densityBacked).toHaveLength(1646)
    expect(evidenceBacked.every((material) => material.catalogueSource?.status === 'SOURCE_ONLY')).toBe(true)
    expect(evidenceBacked.every((material) => material.ifraLimit === 0 && material.costPerGram === 0)).toBe(true)
  })

  it('reuses NOX Lab editorial sensory profiles by exact CAS without treating them as compliance evidence', () => {
    const cashmeran = lluchCatalogueMaterialDirectoryForOrganization('org-catalogue-editorial')
      .find((material) => material.name === 'CASHMERAN')

    expect(cashmeran?.olfactiveProfile).toMatchObject({
      source: 'NOX Lab editorial material profiles',
      strength: 'Strong',
      diffusion: 'High',
      tenacity: 'Very long',
      volatility: 'Low',
    })
    expect(cashmeran?.catalogueSource?.status).toBe('SOURCE_ONLY')
    expect(cashmeran?.ifraLimit).toBe(0)
  })

  it('exposes every Lluch source row as a global master reference for governed research while retaining its source-only gate', () => {
    const masters = lluchCatalogueGlobalMasterMaterials()
    const astrolide = lluchCatalogueGlobalMasterMaterialById('mat-lluch-2026-0104')
    const citrusResearch = rankLluchCatalogueGlobalMasterMaterials('fresh citric citrus', 8)

    expect(masters).toHaveLength(1986)
    expect(masters.every((material) => material.libraryScope === 'GLOBAL' && material.catalogueSource?.status === 'SOURCE_ONLY')).toBe(true)
    expect(astrolide?.name).toBe('ASTROLIDE PURE')
    expect(citrusResearch).toHaveLength(8)
    expect(citrusResearch.some((material) => material.odor.some((descriptor) => /citric|citrus/i.test(descriptor)))).toBe(true)
  })
})
