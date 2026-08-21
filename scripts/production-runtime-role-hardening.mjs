const privilegedAttributes = ['rolsuper', 'rolbypassrls', 'rolreplication']

export const quotePostgresIdentifier = (value) => `"${value.replaceAll('"', '""')}"`

export const assertHostedRoleIsNotPrivileged = (roleState) => {
  const enabled = privilegedAttributes.filter((attribute) => roleState?.[attribute] === true)
  if (enabled.length) {
    throw new Error(`PRODUCTION_RUNTIME_PRIVILEGES=BLOCKED_PRIVILEGED_ROLE_ATTRIBUTE ${enabled.join(',')}`)
  }
}

export const requiresSafeAttributeHardening = (roleState) => (
  !roleState?.rolcanlogin || roleState.rolcreatedb || roleState.rolcreaterole || roleState.rolinherit
)

export const hostedSafeAlterRoleStatement = (quotedRole) => (
  `ALTER ROLE ${quotedRole} LOGIN NOCREATEDB NOCREATEROLE NOINHERIT`
)
