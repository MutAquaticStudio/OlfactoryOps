import type { Material, MaterialOlfactiveProfile, MaterialProvenance, MaterialSupplierCatalogueReference } from './northStar.js'
import {
  lluchCatalogue2026Products,
  lluchCatalogue2026SourceHash,
  type LluchCatalogueProductSeed,
} from './lluch-catalogue-2026-products.js'

export const lluchCatalogue2026Source = {
  supplier: 'Lluch Essence',
  catalogue: 'Main Catalogue',
  catalogueVersion: '2026-07-16',
  title: 'Lluch Essence Product List 2026',
  pageCount: 55,
  productCount: lluchCatalogue2026Products.length,
  contentHash: lluchCatalogue2026SourceHash,
} as const

export type LluchCatalogueProduct = LluchCatalogueProductSeed

export function searchLluchCatalogue2026(query: string, limit = 24) {
  const normalizedQuery = normalizeName(query)
  if (normalizedQuery.length < 2) return [] as LluchCatalogueProduct[]
  return lluchCatalogue2026Products
    .filter((product) => normalizeName(product.productName).includes(normalizedQuery) || product.cas?.includes(query.trim()))
    .sort((left, right) => {
      const leftExact = normalizeName(left.productName) === normalizedQuery ? 0 : 1
      const rightExact = normalizeName(right.productName) === normalizedQuery ? 0 : 1
      return leftExact - rightExact || left.productName.localeCompare(right.productName)
    })
    .slice(0, Math.max(1, Math.min(limit, 48)))
}

const catalogueCategory: Record<LluchCatalogueProduct['category'], MaterialSupplierCatalogueReference['category']> = {
  SYNTHETIC_AROMA_CHEMICAL: 'Synthetic aroma chemical',
  NATURAL_AROMA_CHEMICAL: 'Natural aroma chemical',
  NATURAL_PRODUCT: 'Natural product',
  ORGANIC_PRODUCT: 'Organic product',
}

const casPattern = /\b\d{2,7}-\d{2}-\d\b/g

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function casTokens(value: string | null | undefined) {
  return new Set((value?.match(casPattern) ?? []).map((candidate) => candidate.trim()))
}

function relatedSupplierGrade(material: Material, product: LluchCatalogueProduct) {
  const materialName = normalizeName(material.name)
  const productName = normalizeName(product.productName)
  if (materialName === 'bergamot fcf') return productName.includes('bergamot furoc free')
  return productName.includes(materialName) || materialName.includes(productName)
}

function referenceMatch(material: Material, product: LluchCatalogueProduct): MaterialSupplierCatalogueReference['match'] | null {
  const materialName = normalizeName(material.name)
  const productName = normalizeName(product.productName)
  if (materialName === productName) return 'EXACT_PRODUCT'
  if (relatedSupplierGrade(material, product)) return 'RELATED_VARIANT'
  const materialCas = casTokens(material.cas)
  if ([...casTokens(product.cas)].some((candidate) => materialCas.has(candidate))) return 'CAS_EQUIVALENT'
  return null
}

function referenceNote(match: MaterialSupplierCatalogueReference['match']) {
  if (match === 'EXACT_PRODUCT') return undefined
  if (match === 'RELATED_VARIANT') return 'Supplier catalogue product is a related grade; confirm the specification before procurement.'
  return 'Supplier catalogue lists a matching CAS; confirm the selected grade before procurement.'
}

function catalogueReferencesForMaterial(material: Material) {
  const rank: Record<MaterialSupplierCatalogueReference['match'], number> = {
    EXACT_PRODUCT: 0,
    RELATED_VARIANT: 1,
    CAS_EQUIVALENT: 2,
  }
  return lluchCatalogue2026Products
    .map((product) => ({ product, match: referenceMatch(material, product) }))
    .filter((candidate): candidate is { product: LluchCatalogueProduct; match: MaterialSupplierCatalogueReference['match'] } => candidate.match !== null)
    .sort((left, right) => rank[left.match] - rank[right.match] || left.product.page - right.product.page || left.product.productName.localeCompare(right.product.productName))
    .map(({ product, match }) => ({
      supplier: lluchCatalogue2026Source.supplier,
      catalogue: lluchCatalogue2026Source.catalogue,
      catalogueVersion: lluchCatalogue2026Source.catalogueVersion,
      category: catalogueCategory[product.category],
      productName: product.productName,
      productCas: product.cas ?? 'Not listed',
      einecs: product.einecs ?? undefined,
      fema: product.fema ?? undefined,
      page: product.page,
      match,
      note: referenceNote(match),
    }))
}

const olfactiveProfilesByCas: Record<string, Omit<MaterialOlfactiveProfile, 'source' | 'version' | 'reviewedAt'>> = {
  '54464-57-2': {
    primaryFamily: 'Woody amber',
    descriptors: ['woody', 'cedar', 'amber', 'velvet'],
    facets: ['diffusive', 'dry', 'transparent'],
    description: 'A transparent woody-amber body with a soft cedar and velvety drydown.',
    strength: 'Moderate',
    diffusion: 'High',
    tenacity: 'Long',
    volatility: 'Low',
    formulaRole: 'Woody body and diffusion',
    status: 'CURATED',
  },
  '24851-98-7': {
    primaryFamily: 'Floral jasmine',
    descriptors: ['jasmine', 'radiant', 'tea', 'airy'],
    facets: ['diffusive', 'fresh', 'petal-like'],
    description: 'An expansive jasmine floralizer with a luminous, airy petal effect.',
    strength: 'Moderate',
    diffusion: 'Expansive',
    tenacity: 'Medium',
    volatility: 'Medium',
    formulaRole: 'Floral volume and radiance',
    status: 'CURATED',
  },
  '8007-75-8': {
    primaryFamily: 'Citrus',
    descriptors: ['bergamot', 'sparkling', 'peel', 'green', 'bitter'],
    facets: ['fresh', 'lively', 'natural'],
    description: 'A bright citrus peel profile with a lively green and gently bitter lift.',
    strength: 'Strong',
    diffusion: 'High',
    tenacity: 'Short',
    volatility: 'High',
    formulaRole: 'Citrus opening and lift',
    status: 'REVIEW_REQUIRED',
  },
  '6790-58-5': {
    primaryFamily: 'Ambergris',
    descriptors: ['ambergris', 'mineral', 'warm', 'woody'],
    facets: ['dry', 'long-lasting', 'radiant'],
    description: 'A warm ambergris effect with mineral depth and a persistent woody trail.',
    strength: 'Strong',
    diffusion: 'High',
    tenacity: 'Very long',
    volatility: 'Low',
    formulaRole: 'Ambergris diffusion and fixation',
    status: 'CURATED',
  },
  '82356-51-2': {
    primaryFamily: 'Musk',
    descriptors: ['musk', 'skin', 'powder', 'soft'],
    facets: ['clean', 'warm', 'long-lasting'],
    description: 'A soft macrocyclic musk with a clean skin-like and powdery finish.',
    strength: 'Soft',
    diffusion: 'Moderate',
    tenacity: 'Very long',
    volatility: 'Low',
    formulaRole: 'Musk body and fixation',
    status: 'CURATED',
  },
  '16409-43-1': {
    primaryFamily: 'Rosy green',
    descriptors: ['rose', 'metallic', 'green', 'geranium'],
    facets: ['fresh', 'bright', 'diffusive'],
    description: 'A vivid rosy-green accent with a metallic, geranium-like lift.',
    strength: 'Strong',
    diffusion: 'High',
    tenacity: 'Medium',
    volatility: 'High',
    formulaRole: 'Rosy-green accent',
    status: 'REVIEW_REQUIRED',
  },
  '121-33-5': {
    primaryFamily: 'Gourmand',
    descriptors: ['vanilla', 'creamy', 'sweet', 'balsamic'],
    facets: ['warm', 'powdery', 'long-lasting'],
    description: 'A warm vanillic sweetener with creamy, balsamic depth.',
    strength: 'Strong',
    diffusion: 'Moderate',
    tenacity: 'Long',
    volatility: 'Low',
    formulaRole: 'Gourmand sweetness and drydown',
    status: 'CURATED',
  },
  '64-17-5': {
    primaryFamily: 'Carrier',
    descriptors: ['neutral', 'volatile', 'clean'],
    facets: ['solvent', 'lifting', 'evaporative'],
    description: 'A neutral volatile carrier that lifts the opening without adding a fragrance character.',
    strength: 'Soft',
    diffusion: 'High',
    tenacity: 'Short',
    volatility: 'High',
    formulaRole: 'Carrier and opening lift',
    status: 'CURATED',
  },
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function sameReference(left: MaterialSupplierCatalogueReference, right: MaterialSupplierCatalogueReference) {
  return left.supplier === right.supplier && left.catalogueVersion === right.catalogueVersion && left.productName === right.productName
}

function appendProvenance(
  provenance: MaterialProvenance[],
  entry: MaterialProvenance,
) {
  return provenance.some((candidate) =>
    candidate.field === entry.field && candidate.source === entry.source && candidate.version === entry.version,
  )
    ? provenance
    : [entry, ...provenance]
}

export type LluchCatalogueEnrichment = {
  material: Material
  changed: boolean
  changedFields: Array<'olfactiveProfile' | 'odor' | 'supplierCatalogueReferences'>
}

/**
 * Applies only traceable catalogue references and curated sensory metadata.
 * It deliberately leaves CAS, cost, lot state, IFRA limits, and compliance untouched.
 */
export function enrichMaterialFromLluchCatalogue(material: Material): LluchCatalogueEnrichment {
  const changedFields: LluchCatalogueEnrichment['changedFields'] = []
  const matchingReferences = catalogueReferencesForMaterial(material)
  const supplierCatalogueReferences = [...(material.supplierCatalogueReferences ?? [])]
  for (const reference of matchingReferences) {
    if (!supplierCatalogueReferences.some((candidate) => sameReference(candidate, reference))) {
      supplierCatalogueReferences.push(reference)
      changedFields.push('supplierCatalogueReferences')
    }
  }

  const profileDefinition = olfactiveProfilesByCas[material.cas]
  const catalogueOlfactiveProfile = profileDefinition
    ? {
        ...profileDefinition,
        source: 'OlfactoryOps olfactive taxonomy',
        version: '2026-07.1',
        reviewedAt: '2026-07-30',
      }
    : undefined
  const olfactiveProfile = catalogueOlfactiveProfile
    ? mergeCatalogueOlfactiveProfile(material.olfactiveProfile, catalogueOlfactiveProfile)
    : material.olfactiveProfile
  const profileChanged = JSON.stringify(olfactiveProfile) !== JSON.stringify(material.olfactiveProfile)
  if (profileChanged) changedFields.push('olfactiveProfile')

  const odor = profileChanged && olfactiveProfile
    ? unique([...material.odor, ...olfactiveProfile.descriptors])
    : material.odor
  if (JSON.stringify(odor) !== JSON.stringify(material.odor)) changedFields.push('odor')

  let provenance = material.provenance
  if (changedFields.includes('supplierCatalogueReferences')) {
    provenance = appendProvenance(provenance, {
      field: 'supplierCatalogueReferences',
      source: lluchCatalogue2026Source.title,
      version: lluchCatalogue2026Source.catalogueVersion,
      date: lluchCatalogue2026Source.catalogueVersion,
    })
  }
  if (profileChanged) {
    provenance = appendProvenance(provenance, {
      field: 'olfactiveProfile',
      source: 'OlfactoryOps olfactive taxonomy',
      version: '2026-07.1',
      date: '2026-07-30',
    })
  }

  return {
    material: {
      ...material,
      odor,
      olfactiveProfile,
      supplierCatalogueReferences: supplierCatalogueReferences.length > 0 ? supplierCatalogueReferences : material.supplierCatalogueReferences,
      provenance,
    },
    changed: changedFields.length > 0,
    changedFields: unique(changedFields) as LluchCatalogueEnrichment['changedFields'],
  }
}

function mergeCatalogueOlfactiveProfile(
  existing: MaterialOlfactiveProfile | undefined,
  catalogue: MaterialOlfactiveProfile,
) {
  if (!existing) return catalogue
  if (existing.source === catalogue.source) return catalogue
  return {
    ...catalogue,
    ...existing,
    strength: existing.strength ?? catalogue.strength,
    diffusion: existing.diffusion ?? catalogue.diffusion,
    tenacity: existing.tenacity ?? catalogue.tenacity,
    volatility: existing.volatility ?? catalogue.volatility,
    formulaRole: existing.formulaRole ?? catalogue.formulaRole,
  }
}
