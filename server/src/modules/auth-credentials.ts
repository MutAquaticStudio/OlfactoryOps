const seededAdminEmail = 'm.thuanwork@gmail.com'
const seededAdminPasswordSetAt = '2026-07-16T00:00:00.000Z'
const seededAdminPasswordHashPattern = /^pbkdf2:v1:sha256:100000:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/

type SeededAdminCredential = {
  email: string
  passwordHash: string
  passwordSetAt: string
}

export function readConfiguredSeededAdminPasswordHash(value: string | undefined) {
  const candidate = value?.trim()
  return candidate && seededAdminPasswordHashPattern.test(candidate) ? candidate : undefined
}

export function seededAdminCredentialsForEnv(passwordHash: string | undefined): SeededAdminCredential[] {
  const configuredPasswordHash = readConfiguredSeededAdminPasswordHash(passwordHash)
  if (!configuredPasswordHash) {
    return []
  }

  return [
    {
      email: seededAdminEmail,
      passwordHash: configuredPasswordHash,
      passwordSetAt: seededAdminPasswordSetAt,
    },
  ]
}
