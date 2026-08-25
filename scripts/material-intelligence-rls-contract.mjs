export const MATERIAL_INTELLIGENCE_MUTABLE_TABLES = Object.freeze([
  'v2_chemical_entities',
  'v2_chemical_identifiers',
  'v2_material_components',
])

export const MATERIAL_INTELLIGENCE_APPEND_ONLY_TABLES = Object.freeze([
  'v2_material_intelligence_evidence',
  'v2_scientific_eligibility_decisions',
])

export const MATERIAL_INTELLIGENCE_TABLES = Object.freeze([
  ...MATERIAL_INTELLIGENCE_MUTABLE_TABLES,
  ...MATERIAL_INTELLIGENCE_APPEND_ONLY_TABLES,
])

const expectedTables = new Set(MATERIAL_INTELLIGENCE_TABLES)
const expectedTenantExpression = normalizePolicyExpression(
  "organization_id::text = current_setting('app.organization_id', true)",
)

function normalizePolicyExpression(value) {
  return String(value ?? '')
    .replaceAll('::text', '')
    .replaceAll(/[\s()]/g, '')
}

function hasExactTableCoverage(rows) {
  return rows.length === expectedTables.size
    && new Set(rows.map((row) => row.tableName)).size === expectedTables.size
    && rows.every((row) => expectedTables.has(row.tableName))
}

export function assertMaterialIntelligenceRlsContract({ rlsRows, policyRows }) {
  if (!hasExactTableCoverage(rlsRows)) {
    throw new Error('MATERIAL_INTELLIGENCE_RLS_TABLE_COVERAGE_FAILED')
  }
  if (rlsRows.some((row) => !row.rlsEnabled || !row.rlsForced)) {
    throw new Error('MATERIAL_INTELLIGENCE_FORCE_RLS_FAILED')
  }
  if (!hasExactTableCoverage(policyRows)) {
    throw new Error('MATERIAL_INTELLIGENCE_RLS_POLICY_COVERAGE_FAILED')
  }
  for (const row of policyRows) {
    const roles = Array.isArray(row.roles)
      ? row.roles
      : String(row.roles ?? '').replaceAll(/[{}]/g, '').split(',').filter(Boolean)
    if (
      row.policyName !== 'v2_tenant_scope'
      || row.permissive !== 'PERMISSIVE'
      || row.command !== 'ALL'
      || !roles.includes('public')
      || normalizePolicyExpression(row.usingExpression) !== expectedTenantExpression
      || normalizePolicyExpression(row.checkExpression) !== expectedTenantExpression
    ) {
      throw new Error('MATERIAL_INTELLIGENCE_TENANT_POLICY_FAILED')
    }
  }
}

export function assertMaterialIntelligenceRuntimeGrants(rows) {
  if (!hasExactTableCoverage(rows)) {
    throw new Error('MATERIAL_INTELLIGENCE_RUNTIME_GRANT_COVERAGE_FAILED')
  }
  for (const row of rows) {
    if (!row.canSelect || !row.canInsert) {
      throw new Error('MATERIAL_INTELLIGENCE_RUNTIME_REQUIRED_GRANTS_FAILED')
    }
    if (MATERIAL_INTELLIGENCE_MUTABLE_TABLES.includes(row.tableName) && (!row.canUpdate || !row.canDelete)) {
      throw new Error('MATERIAL_INTELLIGENCE_MUTABLE_GRANTS_FAILED')
    }
    if (MATERIAL_INTELLIGENCE_APPEND_ONLY_TABLES.includes(row.tableName) && (row.canUpdate || row.canDelete)) {
      throw new Error('MATERIAL_INTELLIGENCE_APPEND_ONLY_GRANTS_FAILED')
    }
  }
}
