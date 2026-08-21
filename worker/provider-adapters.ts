export type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type ProviderDeliveryResult =
  | { delivered: true }
  | { delivered: false; error: string }

export async function sendResendEmail(
  fetcher: ProviderFetch,
  input: { apiKey: string; from: string; to: string; subject: string; text: string },
): Promise<ProviderDeliveryResult> {
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    })
    if (response.ok) return { delivered: true }
    return { delivered: false, error: `Resend returned ${response.status}` }
  } catch {
    return { delivered: false, error: 'Transactional email provider request failed' }
  }
}

export async function requestStripeForm(
  fetcher: ProviderFetch,
  secretKey: string,
  endpoint: string,
  form: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  const payload = await readProviderJson(response)
  if (!response.ok) {
    throw new Error(providerErrorMessage(payload, `Stripe returned ${response.status}`))
  }
  return payload
}

export async function requestCloudflareSaas(
  fetcher: ProviderFetch,
  token: string,
  endpoint: string,
  init: Omit<RequestInit, 'headers'> = {},
): Promise<Record<string, unknown>> {
  const response = await fetcher(endpoint, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const payload = await readProviderJson(response)
  if (!response.ok) {
    throw new Error(providerErrorMessage(payload, `Cloudflare returned ${response.status}`))
  }
  return payload
}

export async function probeHttpsOrigin(fetcher: ProviderFetch, origin?: string): Promise<boolean | undefined> {
  const candidate = origin?.trim()
  if (!candidate) return undefined
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'https:') return false
    const response = await fetcher(parsed.origin, { method: 'HEAD', redirect: 'manual', signal: controller.signal })
    return response.status >= 200 && response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export function cloudflareValidation(result: Record<string, unknown>) {
  const validation: Record<string, string> = {}
  const ownership = isRecord(result.ownership_verification) ? result.ownership_verification : undefined
  if (ownership && typeof ownership.name === 'string' && typeof ownership.value === 'string') {
    validation.type = typeof ownership.type === 'string' ? ownership.type.toUpperCase() : 'TXT'
    validation.name = ownership.name
    validation.value = ownership.value
  }
  const validationRecords = Array.isArray(result.validation_records) ? result.validation_records : []
  const txtRecord = validationRecords.find((entry) => isRecord(entry) && typeof entry.txt_name === 'string')
  if (isRecord(txtRecord)) {
    validation.type = 'TXT'
    validation.name = typeof txtRecord.txt_name === 'string' ? txtRecord.txt_name : validation.name || ''
    validation.value = typeof txtRecord.txt_value === 'string'
      ? txtRecord.txt_value
      : typeof txtRecord.txt_record === 'string' ? txtRecord.txt_record : validation.value || ''
  }
  return validation
}

export function cloudflareVerificationErrors(result: Record<string, unknown>) {
  const errors = Array.isArray(result.verification_errors) ? result.verification_errors : []
  const ssl = isRecord(result.ssl) ? result.ssl : undefined
  const sslErrors = ssl && Array.isArray(ssl.validation_errors) ? ssl.validation_errors : []
  return [...errors, ...sslErrors]
    .map((error) => typeof error === 'string' ? error : isRecord(error) && typeof error.message === 'string' ? error.message : '')
    .map((error) => error.replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter(Boolean)
}

export function providerErrorMessage(payload: Record<string, unknown>, fallback: string) {
  const message = typeof payload.message === 'string' ? payload.message : undefined
  if (message) return message.replace(/\s+/g, ' ').trim().slice(0, 180)
  const error = isRecord(payload.error) && typeof payload.error.message === 'string' ? payload.error.message : undefined
  return error ? error.replace(/\s+/g, ' ').trim().slice(0, 180) : fallback
}

async function readProviderJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json()
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
