const LOCAL_CORS_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173']
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '[::1]', 'localhost'])
const LOCAL_API_ENVIRONMENTS = new Set(['development', 'test'])

export type LocalApiConfig = {
  host: string
  port: number
  corsOrigins: string[]
}

export function parseCsvEnv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function resolveLocalApiConfig(env: NodeJS.ProcessEnv = process.env): LocalApiConfig {
  const environment = (env.NODE_ENV?.trim().toLowerCase() || 'development')
  if (!LOCAL_API_ENVIRONMENTS.has(environment)) {
    throw new Error('The local Nest/Fastify API only runs in development or test. Use the Cloudflare Worker for hosted environments.')
  }

  const host = env.HOST?.trim() || '127.0.0.1'
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error('The local Nest/Fastify API must bind to a loopback host. Refusing non-loopback HOST configuration.')
  }

  const port = Number(env.PORT ?? 4000)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  const corsOrigins = parseCsvEnv(env.CORS_ORIGINS)
  const effectiveCorsOrigins = corsOrigins.length > 0 ? corsOrigins : LOCAL_CORS_ORIGINS
  if (effectiveCorsOrigins.some((origin) => !isExactCorsOrigin(origin))) {
    throw new Error('CORS_ORIGINS for the local API must contain exact origins without wildcards.')
  }

  return { host, port, corsOrigins: effectiveCorsOrigins }
}

function isExactCorsOrigin(value: string) {
  if (value.includes('*')) {
    return false
  }
  try {
    const parsed = new URL(value)
    return parsed.origin === value && !parsed.username && !parsed.password
  } catch {
    return false
  }
}
