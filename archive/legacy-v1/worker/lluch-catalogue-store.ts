import { lluchCatalogue2026Products } from '../src/data/lluch-catalogue-2026-products.js'
import { lluchCatalogue2026Source, type LluchCatalogueProduct } from '../src/data/lluch-catalogue-2026.js'

type CatalogueImportRow = {
  status: 'IMPORTING' | 'READY' | 'FAILED'
  content_hash: string
  product_count: number
  updated_at: string
}

type CatalogueProductRow = {
  id: string
  product_name: string
  cas: string | null
  einecs: string | null
  fema: string | null
  category: LluchCatalogueProduct['category']
  source_page: number
}

export type LluchCatalogueSearchResult = {
  id: string
  productName: string
  cas: string | null
  einecs: string | null
  fema: string | null
  category: LluchCatalogueProduct['category']
  page: number
}

export type LluchCatalogueImportResult = {
  organizationId: string
  imported: boolean
  productCount: number
  status: 'IMPORTING' | 'READY' | 'FAILED'
  updatedAt: string
}

const ACTIVE_IMPORT_LEASE_MS = 5 * 60 * 1000

function sourceIdentity() {
  return [
    lluchCatalogue2026Source.supplier,
    lluchCatalogue2026Source.catalogue,
    lluchCatalogue2026Source.catalogueVersion,
  ] as const
}

async function runBatches(db: D1Database, statements: D1PreparedStatement[], batchSize = 75) {
  for (let index = 0; index < statements.length; index += batchSize) {
    await db.batch(statements.slice(index, index + batchSize))
  }
}

function normalizeSearch(value: string | null) {
  const query = value?.trim().replace(/\s+/g, ' ') ?? ''
  if (query.length > 96) return query.slice(0, 96)
  return query
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function productFromRow(row: CatalogueProductRow): LluchCatalogueSearchResult {
  return {
    id: row.id,
    productName: row.product_name,
    cas: row.cas,
    einecs: row.einecs,
    fema: row.fema,
    category: row.category,
    page: row.source_page,
  }
}

/**
 * Writes only source data. It never creates a material, supplier approval,
 * procurement offer, inventory lot, or compliance conclusion.
 */
export async function importLluchCatalogueForOrganization(
  db: D1Database,
  organizationId: string,
): Promise<LluchCatalogueImportResult> {
  const [supplier, catalogue, version] = sourceIdentity()
  const now = new Date().toISOString()
  const existing = await db
    .prepare(
      `SELECT status, content_hash, product_count, updated_at
       FROM supplier_catalogue_imports
       WHERE organization_id = ?1 AND supplier = ?2 AND catalogue = ?3 AND catalogue_version = ?4`,
    )
    .bind(organizationId, supplier, catalogue, version)
    .first<CatalogueImportRow>()

  const existingUpdatedAt = existing ? Date.parse(existing.updated_at) : Number.NaN
  if (existing?.status === 'IMPORTING' && Number.isFinite(existingUpdatedAt) && Date.now() - existingUpdatedAt < ACTIVE_IMPORT_LEASE_MS) {
    return {
      organizationId,
      imported: false,
      productCount: existing.product_count,
      status: existing.status,
      updatedAt: existing.updated_at,
    }
  }

  if (
    existing?.status === 'READY'
    && existing.product_count === lluchCatalogue2026Source.productCount
    && existing.content_hash === lluchCatalogue2026Source.contentHash
  ) {
    return {
      organizationId,
      imported: false,
      productCount: existing.product_count,
      status: existing.status,
      updatedAt: existing.updated_at,
    }
  }

  await db
    .prepare(
      `INSERT INTO supplier_catalogue_imports (
        organization_id, supplier, catalogue, catalogue_version, content_hash,
        product_count, status, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'IMPORTING', ?7, ?7)
      ON CONFLICT(organization_id, supplier, catalogue, catalogue_version) DO UPDATE SET
        content_hash = excluded.content_hash,
        product_count = excluded.product_count,
        status = 'IMPORTING',
        updated_at = excluded.updated_at`,
    )
    .bind(
      organizationId,
      supplier,
      catalogue,
      version,
      lluchCatalogue2026Source.contentHash,
      lluchCatalogue2026Source.productCount,
      now,
    )
    .run()

  const statements = lluchCatalogue2026Products.map((product) =>
    db
      .prepare(
        `INSERT INTO supplier_catalogue_products (
          id, organization_id, supplier, catalogue, catalogue_version, source_product_id,
          product_name, cas, einecs, fema, category, source_page, source_hash, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
        ON CONFLICT(organization_id, supplier, catalogue, catalogue_version, source_product_id) DO UPDATE SET
          product_name = excluded.product_name,
          cas = excluded.cas,
          einecs = excluded.einecs,
          fema = excluded.fema,
          category = excluded.category,
          source_page = excluded.source_page,
          source_hash = excluded.source_hash,
          updated_at = excluded.updated_at`,
      )
      .bind(
        `${organizationId}:${product.id}`,
        organizationId,
        supplier,
        catalogue,
        version,
        product.id,
        product.productName,
        product.cas,
        product.einecs,
        product.fema,
        product.category,
        product.page,
        lluchCatalogue2026Source.contentHash,
        now,
      ),
  )

  try {
    await runBatches(db, statements)
    await db
      .prepare(
        `UPDATE supplier_catalogue_imports
         SET status = 'READY', product_count = ?5, updated_at = ?6
         WHERE organization_id = ?1 AND supplier = ?2 AND catalogue = ?3 AND catalogue_version = ?4`,
      )
      .bind(organizationId, supplier, catalogue, version, lluchCatalogue2026Source.productCount, now)
      .run()
    return {
      organizationId,
      imported: true,
      productCount: lluchCatalogue2026Source.productCount,
      status: 'READY',
      updatedAt: now,
    }
  } catch (error) {
    await db
      .prepare(
        `UPDATE supplier_catalogue_imports
         SET status = 'FAILED', updated_at = ?5
         WHERE organization_id = ?1 AND supplier = ?2 AND catalogue = ?3 AND catalogue_version = ?4`,
      )
      .bind(organizationId, supplier, catalogue, version, now)
      .run()
    throw error
  }
}

export async function importLluchCatalogueForAllOrganizations(
  db: D1Database,
  onImported?: (result: LluchCatalogueImportResult) => Promise<void>,
) {
  const organizations = await db
    .prepare(`SELECT id FROM tenant_organizations WHERE status = 'ACTIVE' ORDER BY id ASC`)
    .all<{ id: string }>()
  const results: LluchCatalogueImportResult[] = []
  for (const organization of organizations.results ?? []) {
    const result = await importLluchCatalogueForOrganization(db, organization.id)
    results.push(result)
    if (result.imported) {
      await onImported?.(result)
    }
  }
  return results
}

export async function organizationsMissingLluchCatalogueImportAudit(db: D1Database, limit = 128) {
  const [supplier, catalogue, version] = sourceIdentity()
  const rows = await db
    .prepare(
      `SELECT imports.organization_id
       FROM supplier_catalogue_imports imports
       WHERE imports.supplier = ?1
         AND imports.catalogue = ?2
         AND imports.catalogue_version = ?3
         AND imports.status = 'READY'
         AND NOT EXISTS (
           SELECT 1
           FROM tenant_audit_events events
           WHERE events.organization_id = imports.organization_id
             AND events.action = 'material.catalogue.import'
             AND events.request_id = ('system_lluch_import_' || imports.organization_id || '_' || imports.catalogue_version)
         )
       ORDER BY imports.organization_id ASC
       LIMIT ?4`,
    )
    .bind(supplier, catalogue, version, Math.max(1, Math.min(limit, 256)))
    .all<{ organization_id: string }>()
  return (rows.results ?? []).map((row) => row.organization_id)
}

export async function searchLluchCatalogue(
  db: D1Database,
  organizationId: string,
  rawQuery: string | null,
) {
  const [supplier, catalogue, version] = sourceIdentity()
  const query = normalizeSearch(rawQuery)
  const source = await db
    .prepare(
      `SELECT status, content_hash, product_count, updated_at
       FROM supplier_catalogue_imports
       WHERE organization_id = ?1 AND supplier = ?2 AND catalogue = ?3 AND catalogue_version = ?4`,
    )
    .bind(organizationId, supplier, catalogue, version)
    .first<CatalogueImportRow>()
  if (!source || source.status !== 'READY') {
    return {
      source: { ...lluchCatalogue2026Source, status: source?.status ?? 'NOT_IMPORTED', updatedAt: source?.updated_at ?? null },
      products: [] as LluchCatalogueSearchResult[],
    }
  }
  if (query.length < 2) {
    return {
      source: { ...lluchCatalogue2026Source, status: source.status, updatedAt: source.updated_at },
      products: [] as LluchCatalogueSearchResult[],
    }
  }
  const pattern = `%${escapeLike(query)}%`
  const rows = await db
    .prepare(
      `SELECT id, product_name, cas, einecs, fema, category, source_page
       FROM supplier_catalogue_products
       WHERE organization_id = ?1 AND supplier = ?2 AND catalogue = ?3 AND catalogue_version = ?4
         AND (product_name LIKE ?5 ESCAPE '\\' OR cas LIKE ?5 ESCAPE '\\')
       ORDER BY CASE WHEN lower(product_name) = lower(?6) THEN 0 ELSE 1 END, product_name ASC
       LIMIT 24`,
    )
    .bind(organizationId, supplier, catalogue, version, pattern, query)
    .all<CatalogueProductRow>()
  return {
    source: { ...lluchCatalogue2026Source, status: source.status, updatedAt: source.updated_at },
    products: (rows.results ?? []).map(productFromRow),
  }
}
