const configuredApiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1'

function v2ApiBase(resource: string) {
  const trimmed = configuredApiBase.replace(/\/$/, '')
  if (/\/api\/v1$/.test(trimmed)) return `${trimmed}/v2/${resource}`
  return `${trimmed}/api/v1/v2/${resource}`
}

export const defaultTrialsApiBase = v2ApiBase('trials')
export const defaultPublicSensoryApiBase = v2ApiBase('public/sensory')

function csrfToken() {
  if (typeof document === 'undefined') return undefined
  return document.cookie.match(/(?:^|;\s*)oo_v2_csrf=([^;]+)/)?.[1]
    || window.localStorage.getItem('oo_v2_csrf')
    || undefined
}

let fallbackRequestSequence = 0

export function idempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  fallbackRequestSequence += 1
  return `ui-${Date.now()}-${fallbackRequestSequence}`
}

async function responsePayload(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}))
}

function failureMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'Request failed'
  const body = payload as { message?: unknown; error?: { message?: unknown } }
  if (typeof body.error?.message === 'string') return body.error.message
  if (typeof body.message === 'string') return body.message
  return 'Request failed'
}

function mutation(method?: string) {
  return method !== undefined && method.toUpperCase() !== 'GET'
}

export async function authenticatedRequest<T>(apiBase: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const csrf = csrfToken()
  if (csrf) headers.set('X-CSRF-Token', decodeURIComponent(csrf))
  if (mutation(init.method) && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', idempotencyKey())

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })
  const payload = await responsePayload(response)
  if (!response.ok) throw new Error(failureMessage(payload))
  return payload as T
}

export async function publicSensoryRequest<T>(apiBase: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  if (mutation(init.method) && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', idempotencyKey())

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'omit',
    headers,
  })
  const payload = await responsePayload(response)
  if (!response.ok) throw new Error(failureMessage(payload))
  return payload as T
}
