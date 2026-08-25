export const V2_PLATFORM_REGISTRY_TABLES = Object.freeze([
  'v2_plans',
  'v2_scientific_component_pins',
  'v2_model_component_pins',
])

export const V2_PLATFORM_REGISTRY_CLIENT_ROLES = Object.freeze(['anon', 'authenticated'])
export const V2_PLATFORM_REGISTRY_RUNTIME_ROLES = Object.freeze(['v2_app', 'hyperdrive_user'])

const expectedTables = new Set(V2_PLATFORM_REGISTRY_TABLES)
const writePrivileges = ['canInsert', 'canUpdate', 'canDelete', 'canTruncate', 'canReferences', 'canTrigger']

function hasExactTableCoverage(rows) {
  return rows.length === expectedTables.size
    && new Set(rows.map((row) => row.tableName)).size === expectedTables.size
    && rows.every((row) => expectedTables.has(row.tableName))
}

function normalizedRoles(value) {
  if (Array.isArray(value)) return value.map(String)
  return String(value ?? '').replaceAll(/[{}]/g, '').split(',').filter(Boolean)
}

function normalizedExpression(value) {
  return String(value ?? '').toLowerCase().replaceAll(/\s+/g, '')
}

export function assertV2PlatformRegistryRlsContract({ rlsRows, policyRows }) {
  if (!hasExactTableCoverage(rlsRows)) throw new Error('V2_PLATFORM_REGISTRY_RLS_TABLE_COVERAGE_FAILED')
  if (rlsRows.some((row) => !row.rlsEnabled || !row.rlsForced)) {
    throw new Error('V2_PLATFORM_REGISTRY_FORCE_RLS_FAILED')
  }
  if (!hasExactTableCoverage(policyRows)) throw new Error('V2_PLATFORM_REGISTRY_POLICY_COVERAGE_FAILED')
  for (const row of policyRows) {
    const expression = normalizedExpression(row.usingExpression)
    if (
      row.policyName !== 'v2_platform_registry_runtime_read'
      || row.permissive !== 'PERMISSIVE'
      || row.command !== 'SELECT'
      || !normalizedRoles(row.roles).includes('public')
      || row.checkExpression != null
      || !expression.includes('current_user')
      || !expression.includes('v2_app')
      || !expression.includes('hyperdrive_user')
    ) {
      throw new Error('V2_PLATFORM_REGISTRY_READ_POLICY_FAILED')
    }
  }
}

export function assertV2PlatformRegistryClientGrants(rows) {
  const expectedCount = V2_PLATFORM_REGISTRY_TABLES.length * V2_PLATFORM_REGISTRY_CLIENT_ROLES.length
  if (
    rows.length !== expectedCount
    || new Set(rows.map((row) => `${row.roleName}:${row.tableName}`)).size !== expectedCount
    || rows.some((row) => !expectedTables.has(row.tableName) || !V2_PLATFORM_REGISTRY_CLIENT_ROLES.includes(row.roleName))
  ) {
    throw new Error('V2_PLATFORM_REGISTRY_CLIENT_GRANT_COVERAGE_FAILED')
  }
  if (rows.some((row) => row.canSelect || writePrivileges.some((privilege) => row[privilege]))) {
    throw new Error('V2_PLATFORM_REGISTRY_CLIENT_PRIVILEGES_FAILED')
  }
}

export function assertV2PlatformRegistryRuntimeGrants(rows) {
  if (!hasExactTableCoverage(rows)) throw new Error('V2_PLATFORM_REGISTRY_RUNTIME_GRANT_COVERAGE_FAILED')
  if (rows.some((row) => !row.canSelect || writePrivileges.some((privilege) => row[privilege]))) {
    throw new Error('V2_PLATFORM_REGISTRY_RUNTIME_READ_ONLY_FAILED')
  }
}
