export const V2_PLATFORM_REGISTRY_TABLES = Object.freeze([
  'v2_plans',
  'v2_scientific_component_pins',
  'v2_model_component_pins',
])

export const V2_PLATFORM_REGISTRY_CLIENT_ROLES = Object.freeze(['anon', 'authenticated'])
export const V2_PLATFORM_REGISTRY_RUNTIME_ROLES = Object.freeze(['v2_app', 'hyperdrive_user'])
export const V2_PLATFORM_REGISTRY_READER_ROLE = 'v2_platform_registry_reader'

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

function requireOwnerPredicate(row, tableOwner, expectedCommand) {
  const roles = normalizedRoles(row.roles)
  const usingExpression = normalizedExpression(row.usingExpression)
  const checkExpression = normalizedExpression(row.checkExpression)
  const usingValid = expectedCommand === 'INSERT'
    ? row.usingExpression == null
    : usingExpression.includes('pg_has_role')
      && usingExpression.includes('current_user')
      && usingExpression.includes(tableOwner.toLowerCase())
  if (
    row.permissive !== 'PERMISSIVE'
    || row.command !== expectedCommand
    || !roles.includes(tableOwner)
    || !usingValid
    || !checkExpression.includes('pg_has_role')
    || !checkExpression.includes('current_user')
    || !checkExpression.includes(tableOwner.toLowerCase())
  ) {
    throw new Error(`V2_PLATFORM_REGISTRY_ADMIN_${expectedCommand}_POLICY_FAILED`)
  }
}

export function assertV2PlatformRegistryReaderRole(rows) {
  if (rows.length !== 1) throw new Error('V2_PLATFORM_REGISTRY_READER_ROLE_MISSING')
  const row = rows[0]
  if (
    row.roleName !== V2_PLATFORM_REGISTRY_READER_ROLE
    || row.canLogin
    || row.superuser
    || row.createDb
    || row.createRole
    || row.inherit
    || row.bypassRls
    || row.replication
  ) {
    throw new Error('V2_PLATFORM_REGISTRY_READER_ROLE_UNSAFE')
  }
}

export function assertV2PlatformRegistryRlsContract({ rlsRows, policyRows }) {
  if (!hasExactTableCoverage(rlsRows)) throw new Error('V2_PLATFORM_REGISTRY_RLS_TABLE_COVERAGE_FAILED')
  if (rlsRows.some((row) => !row.rlsEnabled || !row.rlsForced || !row.tableOwner)) {
    throw new Error('V2_PLATFORM_REGISTRY_FORCE_RLS_FAILED')
  }

  const expectedPolicyCount = V2_PLATFORM_REGISTRY_TABLES.length * 3
  if (
    policyRows.length !== expectedPolicyCount
    || new Set(policyRows.map((row) => `${row.tableName}:${row.policyName}`)).size !== expectedPolicyCount
    || policyRows.some((row) => !expectedTables.has(row.tableName))
  ) {
    throw new Error('V2_PLATFORM_REGISTRY_POLICY_COVERAGE_FAILED')
  }

  for (const rlsRow of rlsRows) {
    const tablePolicies = policyRows.filter((row) => row.tableName === rlsRow.tableName)
    const readPolicy = tablePolicies.find((row) => row.policyName === 'v2_platform_registry_runtime_read')
    const insertPolicy = tablePolicies.find((row) => row.policyName === 'v2_platform_registry_admin_insert')
    const updatePolicy = tablePolicies.find((row) => row.policyName === 'v2_platform_registry_admin_update')
    const readExpression = normalizedExpression(readPolicy?.usingExpression)
    if (
      !readPolicy
      || readPolicy.permissive !== 'PERMISSIVE'
      || readPolicy.command !== 'SELECT'
      || !normalizedRoles(readPolicy.roles).includes('public')
      || readPolicy.checkExpression != null
      || !readExpression.includes('pg_has_role')
      || !readExpression.includes('current_user')
      || !readExpression.includes(V2_PLATFORM_REGISTRY_READER_ROLE)
      || !readExpression.includes(rlsRow.tableOwner.toLowerCase())
    ) {
      throw new Error('V2_PLATFORM_REGISTRY_READ_POLICY_FAILED')
    }
    requireOwnerPredicate(insertPolicy ?? {}, rlsRow.tableOwner, 'INSERT')
    requireOwnerPredicate(updatePolicy ?? {}, rlsRow.tableOwner, 'UPDATE')
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
  if (rows.some((row) => row.canSelect || row.readerMembership || writePrivileges.some((privilege) => row[privilege]))) {
    throw new Error('V2_PLATFORM_REGISTRY_CLIENT_PRIVILEGES_FAILED')
  }
}

export function assertV2PlatformRegistryRuntimeGrants(rows) {
  if (!hasExactTableCoverage(rows)) throw new Error('V2_PLATFORM_REGISTRY_RUNTIME_GRANT_COVERAGE_FAILED')
  if (rows.some((row) => !row.canSelect || !row.readerMembership || writePrivileges.some((privilege) => row[privilege]))) {
    throw new Error('V2_PLATFORM_REGISTRY_RUNTIME_READ_ONLY_FAILED')
  }
}
