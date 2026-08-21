const apiRoot = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/api\/v1\/?$/, '/api/v1/v2')

export const defaultAdvancedApiBase = `${apiRoot}/advanced`
export const defaultFormulaApiBase = `${apiRoot}/formula-intelligence`

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
  return `advanced-ui-${Date.now()}-${fallbackSequence}`
}

type PendingKey = { fingerprint: string; key: string }
export type AdvancedOperationKeyCache = {
  acquire: (operationId: string, fingerprint: string) => string
  settle: (operationId: string, fingerprint: string) => void
}

function fingerprint(path: string, init: RequestInit) {
  return JSON.stringify({ path, method: init.method ?? 'GET', body: init.body ?? null })
}

/** Retains a key after transport failure so confirmation retries remain safe. */
export function createAdvancedOperationKeyCache(): AdvancedOperationKeyCache {
  const pending = new Map<string, PendingKey>()
  return {
    acquire(operationId, value) {
      const existing = pending.get(operationId)
      if (existing?.fingerprint === value) return existing.key
      const key = newKey()
      pending.set(operationId, { fingerprint: value, key })
      return key
    },
    settle(operationId, value) {
      if (pending.get(operationId)?.fingerprint === value) pending.delete(operationId)
    },
  }
}

const operationKeys = createAdvancedOperationKeyCache()

function joinUrl(base: string, path: string) {
  return path ? `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}` : base.replace(/\/$/, '')
}

async function responsePayload(response: Response) {
  return response.json().catch(() => ({})) as Promise<{ error?: { message?: string }; message?: string }>
}

export async function advancedRequest<T>(apiBase: string, path = '', init: RequestInit = {}, operationId?: string): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const csrf = csrfToken()
  if (csrf) headers.set('X-CSRF-Token', decodeURIComponent(csrf))
  const mutation = (init.method ?? 'GET').toUpperCase() !== 'GET'
  const value = fingerprint(path, init)
  const id = mutation ? operationId ?? `advanced-request-${value}` : undefined
  if (id && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', operationKeys.acquire(id, value))
  const response = await fetch(joinUrl(apiBase, path), { ...init, credentials: 'include', headers })
  const payload = await responsePayload(response)
  if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Unable to complete this governed operation.')
  if (id) operationKeys.settle(id, value)
  return payload as T
}

export async function formulaRequest<T>(apiBase: string, path = ''): Promise<T> {
  const response = await fetch(joinUrl(apiBase, path), { credentials: 'include', headers: { Accept: 'application/json' } })
  const payload = await responsePayload(response)
  if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Unable to load Formula records.')
  return payload as T
}

export function base64FromFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read the selected import file.'))
    reader.onload = () => {
      const source = reader.result
      if (typeof source !== 'string') return reject(new Error('Unable to encode the selected import file.'))
      const separator = source.indexOf(',')
      resolve(separator >= 0 ? source.slice(separator + 1) : source)
    }
    reader.readAsDataURL(file)
  })
}
