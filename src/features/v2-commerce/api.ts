const apiRoot = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/api\/v1\/?$/, '/api/v1/v2')
export const defaultCommerceApiBase = `${apiRoot}/commerce`

function csrfToken() {
  if (typeof document === 'undefined') return undefined
  return document.cookie.match(/(?:^|;\s*)oo_v2_csrf=([^;]+)/)?.[1]
    || window.localStorage.getItem('oo_v2_csrf')
    || undefined
}

let fallbackSequence = 0
function newKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  fallbackSequence += 1
  return `commerce-ui-${Date.now()}-${fallbackSequence}`
}

type PendingKey = { fingerprint: string; key: string }
export type CommerceOperationKeyCache = {
  acquire: (operationId: string, fingerprint: string) => string
  settle: (operationId: string, fingerprint: string) => void
}

function requestFingerprint(path: string, init: RequestInit) {
  return JSON.stringify({ path, method: init.method ?? 'GET', body: init.body ?? null })
}

/** Keeps a key only until a definitive HTTP response settles the operation. */
export function createCommerceOperationKeyCache(): CommerceOperationKeyCache {
  const pendingKeys = new Map<string, PendingKey>()
  return {
    acquire(operationId, fingerprint) {
      const existing = pendingKeys.get(operationId)
      if (existing?.fingerprint === fingerprint) return existing.key
      const key = newKey()
      pendingKeys.set(operationId, { fingerprint, key })
      return key
    },
    settle(operationId, fingerprint) {
      if (pendingKeys.get(operationId)?.fingerprint === fingerprint) pendingKeys.delete(operationId)
    },
  }
}

const operationKeyCache = createCommerceOperationKeyCache()

function joinUrl(base: string, path: string) {
  return path ? `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}` : base.replace(/\/$/, '')
}

async function payloadOf(response: Response) {
  return response.json().catch(() => ({})) as Promise<{ error?: { message?: string }; message?: string }>
}

/** Retains a mutation key after a transport failure so a user retry is safe. */
export async function commerceRequest<T>(apiBase: string, path = '', init: RequestInit = {}, operationId?: string): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const csrf = csrfToken()
  if (csrf) headers.set('X-CSRF-Token', decodeURIComponent(csrf))
  const mutation = (init.method ?? 'GET').toUpperCase() !== 'GET'
  const fingerprint = requestFingerprint(path, init)
  const activeOperationId = mutation ? operationId ?? `commerce-request-${fingerprint}` : undefined
  if (activeOperationId && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', operationKeyCache.acquire(activeOperationId, fingerprint))

  // A rejected fetch intentionally skips `settle`: the server may have
  // committed before the response was interrupted, so a retry must reuse its
  // idempotency key.
  const response = await fetch(joinUrl(apiBase, path), { ...init, credentials: 'include', headers })
  const payload = await payloadOf(response)
  if (activeOperationId) operationKeyCache.settle(activeOperationId, fingerprint)
  if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Unable to complete this commerce action.')
  return payload as T
}
