import type { Material, MaterialOlfactiveProfile, MaterialProvenance, MaterialSupplierCatalogueReference } from './northStar.js'

export const lluchCatalogue2026Source = {
  supplier: 'Lluch Essence',
  catalogue: 'Main Catalogue',
  catalogueVersion: '2026-07-16',
  title: 'Lluch Essence Product List 2026',
  pageCount: 55,
} as const

type CatalogueDefinition = {
  matches: (material: Material) => boolean
  references: MaterialSupplierCatalogueReference[]
}

const catalogueDefinitions: CatalogueDefinition[] = [
  {
    matches: (material) => material.cas === '24851-98-7',
    references: [{
      supplier: lluchCatalogue2026Source.supplier,
      catalogue: lluchCatalogue2026Source.catalogue,
      catalogueVersion: lluchCatalogue2026Source.catalogueVersion,
      category: 'Synthetic aroma chemical',
      productName: 'METHYL DIHYDROJASMONATE (10/90, 30/70, 60/40, 70/30, 80/20 grades)',
      productCas: '24851-98-7',
      einecs: '246-495-9',
      fema: '3408',
      page: 21,
      match: 'CAS_EQUIVALENT',
      note: 'Catalogue identifies the chemical family; confirm the selected supplier grade before procurement.',
    }],
  },
  {
    matches: (material) => material.name.trim().toLowerCase() === 'bergamot fcf',
    references: [{
      supplier: lluchCatalogue2026Source.supplier,
      catalogue: lluchCatalogue2026Source.catalogue,
      catalogueVersion: lluchCatalogue2026Source.catalogueVersion,
      category: 'Natural product',
      productName: 'BERGAMOT FUROC./FREE ITALY ESS. OIL',
      productCas: '68648-33-9',
      einecs: '289-612-9',
      fema: '2153',
      page: 40,
      match: 'RELATED_VARIANT',
      note: 'The supplier FCF catalogue CAS differs from the current material master. Keep the existing CAS until the supplier specification is reviewed.',
    }],
  },
  {
    matches: (material) => material.cas === '16409-43-1',
    references: [{
      supplier: lluchCatalogue2026Source.supplier,
      catalogue: lluchCatalogue2026Source.catalogue,
      catalogueVersion: lluchCatalogue2026Source.catalogueVersion,
      category: 'Synthetic aroma chemical',
      productName: 'ROSE OXIDE (70/30 or 90/10 grade)',
      productCas: '16409-43-1',
      einecs: '939-429-1 (240-457-5)',
      fema: '3236',
      page: 26,
      match: 'CAS_EQUIVALENT',
      note: 'Catalogue lists multiple isomer grades; confirm the required grade before procurement.',
    }],
  },
  {
    matches: (material) => material.cas === '121-33-5',
    references: [{
      supplier: lluchCatalogue2026Source.supplier,
      catalogue: lluchCatalogue2026Source.catalogue,
      catalogueVersion: lluchCatalogue2026Source.catalogueVersion,
      category: 'Synthetic aroma chemical',
      productName: 'VANILLIN',
      productCas: '121-33-5',
      einecs: '204-465-2',
      fema: '3107',
      page: 29,
      match: 'EXACT_PRODUCT',
    }],
  },
]

const olfactiveProfilesByCas: Record<string, Omit<MaterialOlfactiveProfile, 'source' | 'version' | 'reviewedAt'>> = {
  '54464-57-2': {
    primaryFamily: 'Woody amber',
    descriptors: ['woody', 'cedar', 'amber', 'velvet'],
    facets: ['diffusive', 'dry', 'transparent'],
    description: 'A transparent woody-amber body with a soft cedar and velvety drydown.',
    status: 'CURATED',
  },
  '24851-98-7': {
    primaryFamily: 'Floral jasmine',
    descriptors: ['jasmine', 'radiant', 'tea', 'airy'],
    facets: ['diffusive', 'fresh', 'petal-like'],
    description: 'An expansive jasmine floralizer with a luminous, airy petal effect.',
    status: 'CURATED',
  },
  '8007-75-8': {
    primaryFamily: 'Citrus',
    descriptors: ['bergamot', 'sparkling', 'peel', 'green', 'bitter'],
    facets: ['fresh', 'lively', 'natural'],
    description: 'A bright citrus peel profile with a lively green and gently bitter lift.',
    status: 'REVIEW_REQUIRED',
  },
  '6790-58-5': {
    primaryFamily: 'Ambergris',
    descriptors: ['ambergris', 'mineral', 'warm', 'woody'],
    facets: ['dry', 'long-lasting', 'radiant'],
    description: 'A warm ambergris effect with mineral depth and a persistent woody trail.',
    status: 'CURATED',
  },
  '82356-51-2': {
    primaryFamily: 'Musk',
    descriptors: ['musk', 'skin', 'powder', 'soft'],
    facets: ['clean', 'warm', 'long-lasting'],
    description: 'A soft macrocyclic musk with a clean skin-like and powdery finish.',
    status: 'CURATED',
  },
  '16409-43-1': {
    primaryFamily: 'Rosy green',
    descriptors: ['rose', 'metallic', 'green', 'geranium'],
    facets: ['fresh', 'bright', 'diffusive'],
    description: 'A vivid rosy-green accent with a metallic, geranium-like lift.',
    status: 'REVIEW_REQUIRED',
  },
  '121-33-5': {
    primaryFamily: 'Gourmand',
    descriptors: ['vanilla', 'creamy', 'sweet', 'balsamic'],
    facets: ['warm', 'powdery', 'long-lasting'],
    description: 'A warm vanillic sweetener with creamy, balsamic depth.',
    status: 'CURATED',
  },
  '64-17-5': {
    primaryFamily: 'Carrier',
    descriptors: ['neutral', 'volatile', 'clean'],
    facets: ['solvent', 'lifting', 'evaporative'],
    description: 'A neutral volatile carrier that lifts the opening without adding a fragrance character.',
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
  const matchingReferences = catalogueDefinitions.flatMap((definition) => definition.matches(material) ? definition.references : [])
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
        version: '2026-07',
        reviewedAt: '2026-07-16',
      }
    : undefined
  const olfactiveProfile = material.olfactiveProfile ?? catalogueOlfactiveProfile
  const profileWasAdded = Boolean(catalogueOlfactiveProfile && !material.olfactiveProfile)
  if (profileWasAdded) changedFields.push('olfactiveProfile')

  const odor = profileWasAdded && olfactiveProfile
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
  if (profileWasAdded) {
    provenance = appendProvenance(provenance, {
      field: 'olfactiveProfile',
      source: 'OlfactoryOps olfactive taxonomy',
      version: '2026-07',
      date: '2026-07-16',
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
