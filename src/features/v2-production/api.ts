const configuredApiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1'

function productionApiBase() {
  const trimmed = configuredApiBase.replace(/\/$/, '')
  if (/\/api\/v1$/.test(trimmed)) return `${trimmed}/v2/production`
  return `${trimmed}/api/v1/v2/production`
}

export const defaultProductionApiBase = productionApiBase()

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
  return `production-ui-${Date.now()}-${fallbackRequestSequence}`
}

export type ProductionOperationKeyCache = {
  acquire: (operationId: string, fingerprint: string) => string
  settle: (operationId: string, fingerprint: string) => void
}

/** Retain the key for an uncertain client retry; changed payloads create a new operation. */
export function createProductionOperationKeyCache(): ProductionOperationKeyCache {
  const pending = new Map<string, { fingerprint: string; key: string }>()
  return {
    acquire(operationId, fingerprint) {
      const existing = pending.get(operationId)
      if (existing?.fingerprint === fingerprint) return existing.key
      const key = idempotencyKey()
      pending.set(operationId, { fingerprint, key })
      return key
    },
    settle(operationId, fingerprint) {
      if (pending.get(operationId)?.fingerprint === fingerprint) pending.delete(operationId)
    },
  }
}

function joinUrl(apiBase: string, path: string) {
  const base = apiBase.replace(/\/$/, '')
  return path ? `${base}/${path.replace(/^\//, '')}` : base
}

async function responsePayload(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}))
}

function failureMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'Unable to complete this action.'
  const body = payload as { message?: unknown; error?: { message?: unknown } }
  if (typeof body.error?.message === 'string') return body.error.message
  if (typeof body.message === 'string') return body.message
  return 'Unable to complete this action.'
}

function isMutation(method?: string) {
  return method !== undefined && method.toUpperCase() !== 'GET'
}

export async function productionRequest<T>(apiBase: string, path = '', init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const csrf = csrfToken()
  if (csrf) headers.set('X-CSRF-Token', decodeURIComponent(csrf))
  if (isMutation(init.method) && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', idempotencyKey())

  const response = await fetch(joinUrl(apiBase, path), {
    ...init,
    credentials: 'include',
    headers,
  })
  const payload = await responsePayload(response)
  if (!response.ok) throw new Error(failureMessage(payload))
  return payload as T
}
