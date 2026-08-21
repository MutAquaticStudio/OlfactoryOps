export type CustomHostnameProviderState = {
  providerRef?: string
  validationStatus: 'NOT_CONFIGURED' | 'PENDING' | 'ACTIVE' | 'FAILED'
  sslStatus: 'NOT_CONFIGURED' | 'PENDING' | 'ACTIVE' | 'FAILED'
  safeMessage?: string
}

export type CloudflareSaasAdapter = {
  request(hostname: string): Promise<CustomHostnameProviderState>
  refresh(providerRef: string): Promise<CustomHostnameProviderState>
}

export class NotConfiguredCloudflareSaasAdapter implements CloudflareSaasAdapter {
  async request(_hostname: string): Promise<CustomHostnameProviderState> { return { validationStatus: 'NOT_CONFIGURED', sslStatus: 'NOT_CONFIGURED', safeMessage: 'Cloudflare for SaaS is not configured for this environment.' } }
  async refresh(_providerRef: string): Promise<CustomHostnameProviderState> { return { validationStatus: 'NOT_CONFIGURED', sslStatus: 'NOT_CONFIGURED', safeMessage: 'Cloudflare for SaaS is not configured for this environment.' } }
}

export class FetchCloudflareSaasAdapter implements CloudflareSaasAdapter {
  constructor(private readonly config: { apiToken: string; zoneId: string; origin: string; fetcher?: typeof fetch }) {}
  async request(hostname: string) { return this.call('/custom_hostnames', { hostname, ssl: { method: 'txt' }, custom_metadata: { origin: this.config.origin } }) }
  async refresh(providerRef: string) { return this.call(`/custom_hostnames/${encodeURIComponent(providerRef)}`, undefined, 'GET') }
  private async call(path: string, body?: Record<string, unknown>, method = body ? 'POST' : 'GET'): Promise<CustomHostnameProviderState> {
    const fetcher = this.config.fetcher ?? fetch
    try {
      const response = await fetcher(`https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}${path}`, { method, headers: { Authorization: `Bearer ${this.config.apiToken}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const payload = await response.json().catch(() => ({})) as { success?: boolean; result?: { id?: string; status?: string; ssl?: { status?: string }; ownership_verification?: unknown }; errors?: unknown[] }
      if (!response.ok || payload.success === false || !payload.result) return { validationStatus: 'FAILED', sslStatus: 'FAILED', safeMessage: 'The domain provider did not accept this request.' }
      const status = String(payload.result.status ?? '').toLowerCase()
      const ssl = String(payload.result.ssl?.status ?? '').toLowerCase()
      return { providerRef: payload.result.id, validationStatus: status === 'active' ? 'ACTIVE' : 'PENDING', sslStatus: ssl === 'active' ? 'ACTIVE' : 'PENDING' }
    } catch { return { validationStatus: 'FAILED', sslStatus: 'FAILED', safeMessage: 'The domain provider could not be reached.' } }
  }
}
