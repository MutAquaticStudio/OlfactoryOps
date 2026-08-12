import { useEffect, useRef, useState } from 'react'

type Operator = { id: string; userId?: string; email?: string; role: string; status: string; mfaRequired: boolean }
type Overview = { activeWorkspaces?: number; suspendedWorkspaces?: number; archivedWorkspaces?: number; activeUsers?: number; activeSessions?: number; pendingPrivacyReviews?: number; pendingWorkspaceRequests?: number; release: { environment: string; gitSha: string } }
type Workspace = { id: string; name: string; slug: string; status: string; hostname: string | null; members: number; sessions: number; planId?: string | null; planName?: string | null; subscriptionStatus?: string | null }
type WorkspaceDetail = { workspace: { id: string; name: string; slug: string; status: string }; hostnames: Array<{ hostname: string; kind: string; status: string; validationStatus?: string | null; sslStatus?: string | null }>; plan: { id?: string; name?: string; billingMode?: string; status?: string }; entitlements: Record<string, { enabled: boolean; source: string; expiresAt?: string | null }>; limits: Record<string, { value: number; used: number; period: string }>; requestSummary: Record<string, string> }

const platformApiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/api\/v1\/?$/, '/api/v1/v2/admin')

function csrf() {
  return document.cookie.match(/(?:^|;\s*)oo_v2_csrf=([^;]+)/)?.[1] || window.localStorage.getItem('oo_v2_csrf') || undefined
}

function idempotencyKey() {
  return `platform-ui-${crypto.randomUUID()}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${platformApiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(csrf() ? { 'X-CSRF-Token': decodeURIComponent(csrf()!) } : {}), ...(init?.headers || {}) },
  })
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message || 'Platform request failed')
  return payload as T
}

function confirmationBody(body: Record<string, unknown>) {
  return { ...body, confirmation: 'CONFIRM_PLATFORM_ACTION' }
}

export function PlatformAdminApp() {
  const [operator, setOperator] = useState<Operator | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selected, setSelected] = useState<WorkspaceDetail | null>(null)
  const [operators, setOperators] = useState<Operator[]>([])
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([])
  const [infrastructure, setInfrastructure] = useState<Record<string, unknown> | null>(null)
  const [active, setActive] = useState<'overview' | 'workspaces' | 'plans' | 'security' | 'infrastructure' | 'audit'>('overview')
  const [search, setSearch] = useState('')
  const [reason, setReason] = useState('')
  const [capability, setCapability] = useState('workspace.access')
  const [enabled, setEnabled] = useState(true)
  const [planId, setPlanId] = useState('managed_beta')
  const [limitKey, setLimitKey] = useState('members')
  const [limitValue, setLimitValue] = useState('25')
  const [nextOperatorRole, setNextOperatorRole] = useState('PLATFORM_SUPPORT')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const operationKeys = useRef(new Map<string, string>())

  const refreshOverview = () => request<Overview>('/overview').then(setOverview)
  const loadWorkspaces = (nextSearch = search) => request<{ workspaces: Workspace[] }>(`/workspaces?search=${encodeURIComponent(nextSearch)}`).then((result) => setWorkspaces(result.workspaces))
  const selectWorkspace = (id: string) => request<WorkspaceDetail>(`/workspaces/${encodeURIComponent(id)}`).then(setSelected)

  useEffect(() => {
    void Promise.all([request<{ operator: Operator }>('/me'), refreshOverview()])
      .then(([me]) => setOperator(me.operator))
      .catch((failure) => setError(failure instanceof Error ? failure.message : 'Platform access is unavailable.'))
      .finally(() => setBusy(false))
  }, [])

  useEffect(() => {
    if (!operator) return
    const load = async () => {
      try {
        setError(null)
        if (active === 'workspaces' || active === 'plans') await loadWorkspaces()
        if (active === 'security') setOperators((await request<{ operators: Operator[] }>('/operators')).operators)
        if (active === 'infrastructure') setInfrastructure(await request<Record<string, unknown>>('/infrastructure'))
        if (active === 'audit') setAudit((await request<{ events: Array<Record<string, unknown>> }>('/audit')).events)
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Platform data is unavailable.') }
    }
    void load()
  }, [active, operator])

  async function mutate<T>(scope: string, path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    const key = operationKeys.current.get(scope) ?? idempotencyKey()
    operationKeys.current.set(scope, key)
    setNotice(null)
    setError(null)
    try {
      const result = await request<T>(path, { method, headers: { 'Idempotency-Key': key }, body: JSON.stringify(confirmationBody(body)) })
      operationKeys.current.delete(scope)
      setNotice('Platform action recorded.')
      await Promise.all([refreshOverview(), selected ? selectWorkspace(selected.workspace.id) : Promise.resolve()])
      if (active === 'workspaces' || active === 'plans') await loadWorkspaces()
      if (active === 'security') setOperators((await request<{ operators: Operator[] }>('/operators')).operators)
      if (active === 'audit') setAudit((await request<{ events: Array<Record<string, unknown>> }>('/audit')).events)
      return result
    } catch (failure) {
      // Keep the key until the user reconciles a potentially lost response.
      setError(failure instanceof Error ? failure.message : 'Platform mutation failed.')
      throw failure
    }
  }

  async function lifecycle(action: 'suspend' | 'reactivate' | 'archive' | 'revoke-sessions' | 'export' | 'erasure-review' | 'hostname-refresh') {
    if (!selected || reason.trim().length < 3) { setError('Provide a reason of at least three characters.'); return }
    if (['suspend', 'archive', 'revoke-sessions'].includes(action) && !window.confirm(`Confirm ${action} for ${selected.workspace.name}?`)) return
    await mutate(`workspace:${selected.workspace.id}:${action}`, `/workspaces/${encodeURIComponent(selected.workspace.id)}/${action}`, 'POST', { reason: reason.trim() }).catch(() => undefined)
  }

  if (busy) return <main className="v2-platform-page"><section className="v2-auth-card">Loading Platform Control Panel</section></main>
  if (error && !operator) return <main className="v2-platform-page"><section className="v2-auth-card"><h1>Platform access denied</h1><p>{error}</p></section></main>
  if (!operator) return <main className="v2-platform-page"><section className="v2-auth-card"><h1>Platform access denied</h1><p>A server-side Platform Operator assignment is required.</p></section></main>

  const metric = (label: string, value: number | string | undefined) => <div key={label}><span>{label}</span><strong>{value ?? 'Not configured'}</strong></div>
  const workspacePanel = <><div className="v2-toolbar"><input aria-label="Search workspaces" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspaces" /><button className="v2-secondary-button" type="button" onClick={() => void loadWorkspaces()}>Search</button></div><div className="v2-member-list">{workspaces.map((workspace) => <button className="v2-member-row" type="button" key={workspace.id} onClick={() => void selectWorkspace(workspace.id)}><strong>{workspace.name}</strong><span>{workspace.slug}</span><span>{workspace.status}</span><span>{workspace.hostname || 'No hostname'}</span><span>{workspace.planName || 'No plan'} | {workspace.members} members / {workspace.sessions} sessions</span></button>)}</div></>
  const selectedPanel = selected ? <section className="v2-panel" aria-live="polite"><h2>{selected.workspace.name}</h2><p>{selected.workspace.slug} | {selected.workspace.status} | {selected.plan.name || 'No plan configured'}</p><div className="v2-member-list">{selected.hostnames.map((host) => <div className="v2-member-row" key={host.hostname}><strong>{host.hostname}</strong><span>{host.status}</span><span>{host.validationStatus || 'Not configured'} / {host.sslStatus || 'Not configured'}</span></div>)}</div><label className="v2-field"><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for every platform action" /></label><div className="v2-toolbar"><button className="v2-secondary-button" type="button" onClick={() => void lifecycle('suspend')}>Suspend</button><button className="v2-secondary-button" type="button" onClick={() => void lifecycle('reactivate')}>Reactivate</button><button className="v2-secondary-button" type="button" onClick={() => void lifecycle('archive')}>Archive</button><button className="v2-secondary-button" type="button" onClick={() => void lifecycle('revoke-sessions')}>Revoke sessions</button><button className="v2-secondary-button" type="button" onClick={() => void lifecycle('export')}>Request export</button><button className="v2-secondary-button" type="button" onClick={() => void lifecycle('erasure-review')}>Erasure review</button><button className="v2-secondary-button" type="button" onClick={() => void lifecycle('hostname-refresh')}>Refresh hostname</button></div><p className="v2-muted">Requests: {Object.entries(selected.requestSummary).map(([kind, status]) => `${kind}: ${status}`).join(' | ') || 'None'}</p></section> : null

  return <main className="v2-platform-page" data-testid="v2-platform-admin"><div className="v2-platform-topbar"><strong>Platform Control Panel</strong><span>{operator.role} | {overview?.release.environment || 'Not configured'} | {overview?.release.gitSha || 'Not configured'}</span></div><div className="v2-workspace-layout"><aside className="v2-workspace-nav" aria-label="Platform administration">{(['overview', 'workspaces', 'plans', 'security', 'infrastructure', 'audit'] as const).map((item) => <button type="button" className={active === item ? 'is-active' : ''} key={item} onClick={() => setActive(item)}>{item === 'plans' ? 'Plans & Entitlements' : item}</button>)}</aside><section className="v2-workspace-content"><span className="v2-eyebrow">Platform role: {operator.role}{operator.mfaRequired ? ' | MFA step-up required for mutations' : ''}</span>{error ? <div className="v2-alert" role="alert">{error}</div> : null}{notice ? <div className="v2-alert" role="status">{notice}</div> : null}{active === 'overview' && <><h1>Overview</h1><div className="v2-metric-grid">{metric('Active workspaces', overview?.activeWorkspaces)}{metric('Suspended workspaces', overview?.suspendedWorkspaces)}{metric('Archived workspaces', overview?.archivedWorkspaces)}{metric('Active users', overview?.activeUsers)}{metric('Active sessions', overview?.activeSessions)}{metric('Pending privacy reviews', overview?.pendingPrivacyReviews)}{metric('Workspace requests', overview?.pendingWorkspaceRequests)}</div></>}{active === 'workspaces' && <><h1>Workspace Directory</h1>{workspacePanel}{selectedPanel}</>}{active === 'plans' && <><h1>Plans & Entitlements</h1>{workspacePanel}{selected ? <section className="v2-panel"><h2>{selected.workspace.name}</h2><div className="v2-toolbar"><label className="v2-field"><span>Plan</span><input value={planId} onChange={(event) => setPlanId(event.target.value)} /></label><label className="v2-field"><span>Capability</span><input value={capability} onChange={(event) => setCapability(event.target.value)} /></label><label><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enabled</label><label className="v2-field"><span>Limit key</span><input value={limitKey} onChange={(event) => setLimitKey(event.target.value)} /></label><label className="v2-field"><span>Limit value</span><input inputMode="numeric" value={limitValue} onChange={(event) => setLimitValue(event.target.value)} /></label></div><label className="v2-field"><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for every plan, entitlement, or limit change" /></label><div className="v2-toolbar"><button className="v2-secondary-button" type="button" onClick={() => { if (reason.trim().length >= 3) void mutate(`workspace:${selected.workspace.id}:plan`, `/workspaces/${encodeURIComponent(selected.workspace.id)}/plan`, 'PATCH', { planId, endsAt: null, reason: reason.trim() }).catch(() => undefined); else setError('Provide a reason of at least three characters.') }}>Assign plan</button><button className="v2-secondary-button" type="button" onClick={() => { if (reason.trim().length >= 3) void mutate(`workspace:${selected.workspace.id}:entitlement`, `/workspaces/${encodeURIComponent(selected.workspace.id)}/entitlements`, 'PATCH', { capability, enabled, expiresAt: null, reason: reason.trim() }).catch(() => undefined); else setError('Provide a reason of at least three characters.') }}>Update entitlement</button><button className="v2-secondary-button" type="button" onClick={() => { const value = Number(limitValue); if (reason.trim().length >= 3 && Number.isSafeInteger(value) && value >= 0) void mutate(`workspace:${selected.workspace.id}:limit:${limitKey}`, `/workspaces/${encodeURIComponent(selected.workspace.id)}/limits`, 'PATCH', { key: limitKey, value, reason: reason.trim() }).catch(() => undefined); else setError('Provide a valid non-negative limit and a reason of at least three characters.') }}>Update limit</button></div><pre className="v2-code-block">{JSON.stringify({ entitlements: selected.entitlements, limits: selected.limits }, null, 2)}</pre></section> : null}</>}{active === 'security' && <><h1>Platform Security</h1><p className="v2-muted">Roles are server-enforced. Operator mutations require a configured MFA step-up; no email allowlist has authority.</p><label className="v2-field"><span>New operator role</span><select value={nextOperatorRole} onChange={(event) => setNextOperatorRole(event.target.value)}>{['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_BILLING', 'PLATFORM_SECURITY_AUDITOR'].map((role) => <option key={role} value={role}>{role}</option>)}</select></label><div className="v2-member-list">{operators.map((item) => <div className="v2-member-row" key={item.id}><strong>{item.email || item.userId || item.id}</strong><span>{item.role}</span><span>{item.status}</span><span>{item.mfaRequired ? 'MFA required' : 'MFA fixture/step-up satisfied'}</span>{item.status === 'ACTIVE' ? <><button className="v2-secondary-button" type="button" onClick={() => { if (window.confirm(`Disable ${item.role}?`)) void mutate(`operator:${item.id}:disable`, `/operators/${encodeURIComponent(item.id)}/status`, 'PATCH', { status: 'DISABLED', reason: 'Platform operator status action.' }).catch(() => undefined) }}>Disable</button><button className="v2-secondary-button" type="button" onClick={() => { if (window.confirm(`Rotate ${item.role} to ${nextOperatorRole}?`)) void mutate(`operator:${item.id}:role`, `/operators/${encodeURIComponent(item.id)}/role`, 'PATCH', { role: nextOperatorRole, reason: 'Platform operator role rotation.' }).catch(() => undefined) }}>Rotate role</button></> : null}</div>)}</div></>}{active === 'infrastructure' && <><h1>Infrastructure & Release</h1><pre className="v2-code-block">{JSON.stringify(infrastructure || { state: 'Loading' }, null, 2)}</pre><p className="v2-muted">This panel is read-only for Cloudflare and database infrastructure. It never exposes secrets or provides arbitrary provider commands.</p></>}{active === 'audit' && <><h1>Platform Audit</h1><div className="v2-member-list">{audit.map((event) => <div className="v2-member-row" key={String(event.id)}><strong>{String(event.action)}</strong><span>{String(event.outcome)}</span><span>{String(event.subjectType)}</span><span>{String(event.createdAt)}</span></div>)}</div></>}</section></div></main>
}
