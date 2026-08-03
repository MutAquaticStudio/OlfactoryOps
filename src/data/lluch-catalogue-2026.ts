import type { Material, MaterialCatalogueEvidence, MaterialCatalogueSource, MaterialOlfactiveProfile, MaterialProvenance, MaterialSupplierCatalogueReference } from './northStar.js'
import { lluchCatalogue2026EvidenceById } from './lluch-catalogue-2026-evidence.js'
import { noxLabEditorialMaterialProfileByCas } from './nox-lab-editorial-material-profiles.js'
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

function supplierReferenceForProduct(product: LluchCatalogueProduct): MaterialSupplierCatalogueReference {
  return {
    sourceProductId: product.id,
    supplier: lluchCatalogue2026Source.supplier,
    catalogue: lluchCatalogue2026Source.catalogue,
    catalogueVersion: lluchCatalogue2026Source.catalogueVersion,
    category: catalogueCategory[product.category],
    productName: product.productName,
    productCas: product.cas ?? 'Not listed',
    einecs: product.einecs ?? undefined,
    fema: product.fema ?? undefined,
    page: product.page,
    match: 'EXACT_PRODUCT',
  }
}

/**
 * Produces a directory entry from the supplier's published product identity.
 * Supplier-declared odour, appearance, density range, and technical identity
 * are projected when available. Missing commercial and compliance values stay
 * guarded placeholders. The platform has approved the catalogue record for
 * research and formula drafting, never as operational compliance evidence.
 */
export function lluchCatalogueMaterialForOrganization(product: LluchCatalogueProduct, _organizationId: string): Material {
  const reference = supplierReferenceForProduct(product)
  const supplierEvidence = lluchCatalogue2026EvidenceById.get(product.id)
  const olfactiveProfile = catalogueOlfactiveProfileForCas(product.cas)
  const catalogueEvidence: MaterialCatalogueEvidence | undefined = supplierEvidence
    ? {
        source: 'Lluch Platform catalogue snapshot via NOX Lab',
        version: lluchCatalogue2026Source.catalogueVersion,
        declaredOdour: [...supplierEvidence.declaredOdour],
        chemicalIdentification: supplierEvidence.chemicalIdentification,
        declaredUse: supplierEvidence.declaredUse,
        appearance: supplierEvidence.appearance,
        density: supplierEvidence.density ? { ...supplierEvidence.density } : undefined,
        vaporPressure: supplierEvidence.vaporPressure ? { ...supplierEvidence.vaporPressure } : undefined,
      }
    : undefined
  const catalogueSource: MaterialCatalogueSource = {
    sourceProductId: product.id,
    supplier: reference.supplier,
    catalogue: reference.catalogue,
    catalogueVersion: reference.catalogueVersion,
    category: reference.category,
    page: reference.page,
    status: 'MASTER_APPROVED',
  }
  return {
    id: `mat-${product.id}`,
    libraryScope: 'GLOBAL',
    name: product.productName,
    cas: product.cas ?? 'Not listed',
    family: reference.category,
    // The source catalogue does not classify pyramid placement. Base is only a
    // neutral system default; the directory labels it as not evaluated.
    tier: 'Base',
    vaporPressure: 0,
    density: 0,
    mw: 0,
    logP: 0,
    substantivityHours: 0,
    // A zero placeholder prevents an unreviewed source row from passing an
    // IFRA-based approval calculation as though it had a documented limit.
    ifraLimit: 0,
    costPerGram: 0,
    odor: unique([...(catalogueEvidence?.declaredOdour ?? []), ...(olfactiveProfile?.descriptors ?? [])]),
    olfactiveProfile,
    supplierCatalogueReferences: [reference],
    catalogueEvidence,
    catalogueSource,
    provenance: [
      {
        field: 'Material identity',
        source: lluchCatalogue2026Source.title,
        version: lluchCatalogue2026Source.catalogueVersion,
        date: lluchCatalogue2026Source.catalogueVersion,
      },
      ...(catalogueEvidence
        ? [{
            field: 'Supplier-declared odour and physical evidence',
            source: catalogueEvidence.source,
            version: catalogueEvidence.version,
            date: lluchCatalogue2026Source.catalogueVersion,
          }]
        : []),
    ],
  }
}

let catalogueMaterialDirectoryCache: Material[] | undefined

/**
 * The supplier catalogue is the global master-reference directory. It remains
 * published as read-only R&D master materials. Worker persistence mirrors the
 * same records into D1 so every tenant receives a stable shared library.
 */
export function lluchCatalogueGlobalMasterMaterials() {
  if (catalogueMaterialDirectoryCache) return catalogueMaterialDirectoryCache
  catalogueMaterialDirectoryCache = lluchCatalogue2026Products.map((product) =>
    lluchCatalogueMaterialForOrganization(product, 'global-master-library'),
  )
  return catalogueMaterialDirectoryCache
}

/**
 * A catalogue master is global and read-only. The active organization is not
 * part of its identity; this wrapper preserves the existing Materials API.
 */
export function lluchCatalogueMaterialDirectoryForOrganization(_organizationId: string) {
  return lluchCatalogueGlobalMasterMaterials()
}

export function lluchCatalogueGlobalMasterMaterialById(id: string) {
  return lluchCatalogueGlobalMasterMaterials().find((material) => material.id === id)
}

export function rankLluchCatalogueGlobalMasterMaterials(query: string, limit = 12) {
  const terms = normalizeName(query).split(' ').filter((term) => term.length >= 3)
  const score = (material: Material) => {
    const evidence = material.catalogueEvidence
    const name = normalizeName(material.name)
    const descriptors = normalizeName([
      ...material.odor,
      ...(material.olfactiveProfile?.descriptors ?? []),
      ...(material.olfactiveProfile?.facets ?? []),
    ].join(' '))
    const identity = normalizeName([
      material.family,
      evidence?.chemicalIdentification ?? '',
      evidence?.declaredUse ?? '',
      evidence?.appearance ?? '',
    ].join(' '))
    return terms.reduce((total, term) => total
      + (name.includes(term) ? 8 : 0)
      + (descriptors.includes(term) ? 5 : 0)
      + (identity.includes(term) ? 2 : 0), 0)
  }
  return [...lluchCatalogueGlobalMasterMaterials()]
    .sort((left, right) => score(right) - score(left) || left.name.localeCompare(right.name))
    .slice(0, Math.max(1, Math.min(limit, 24)))
}

export function isLluchCatalogueSourceMaterial(material: Material) {
  return material.catalogueSource?.supplier === lluchCatalogue2026Source.supplier
    && material.catalogueSource.catalogueVersion === lluchCatalogue2026Source.catalogueVersion
    && material.catalogueSource.status === 'SOURCE_ONLY'
}

export function isLluchCatalogueMasterMaterial(material: Material) {
  return material.libraryScope === 'GLOBAL'
    && material.catalogueSource?.supplier === lluchCatalogue2026Source.supplier
    && material.catalogueSource.catalogueVersion === lluchCatalogue2026Source.catalogueVersion
    && material.catalogueSource.status === 'MASTER_APPROVED'
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
      sourceProductId: product.id,
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

function catalogueOlfactiveProfileForCas(cas: string | null | undefined): MaterialOlfactiveProfile | undefined {
  if (!cas) return undefined
  const curated = olfactiveProfilesByCas[cas]
  if (curated) {
    return {
      ...curated,
      descriptors: [...curated.descriptors],
      facets: [...curated.facets],
      source: 'OlfactoryOps olfactive taxonomy',
      version: '2026-07.1',
      reviewedAt: '2026-07-30',
    }
  }
  const editorial = noxLabEditorialMaterialProfileByCas.get(cas)
  if (!editorial) return undefined
  return {
    primaryFamily: editorial.primaryFamily,
    descriptors: [...editorial.descriptors],
    facets: [...editorial.facets],
    description: editorial.description,
    strength: editorial.strength,
    diffusion: editorial.diffusion,
    tenacity: editorial.tenacity,
    volatility: editorial.volatility,
    formulaRole: editorial.formulaRole,
    status: editorial.status,
    source: 'NOX Lab editorial material profiles',
    version: '2026-07.18',
    reviewedAt: editorial.reviewedAt,
  }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function sameReference(left: MaterialSupplierCatalogueReference, right: MaterialSupplierCatalogueReference) {
  return left.sourceProductId === right.sourceProductId
    || (left.supplier === right.supplier && left.catalogueVersion === right.catalogueVersion && left.productName === right.productName)
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

  const catalogueOlfactiveProfile = catalogueOlfactiveProfileForCas(material.cas)
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
