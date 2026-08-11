import { useEffect, useState } from 'react'

type Operator = { id: string; role: string; status: string; mfaRequired: boolean }
type Overview = { active_workspaces: number; suspended_workspaces: number; archived_workspaces: number; active_users: number; active_sessions: number; pending_privacy_reviews: number; release: { environment: string; gitSha: string } }
type Workspace = { id: string; name: string; slug: string; status: string; hostname: string | null; members: number; sessions: number }

const platformApiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/api\/v1\/?$/, '/api/v1/v2/admin')

function csrf() {
  return document.cookie.match(/(?:^|;\s*)oo_v2_csrf=([^;]+)/)?.[1] || window.localStorage.getItem('oo_v2_csrf') || undefined
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

export function PlatformAdminApp() {
  const [operator, setOperator] = useState<Operator | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([])
  const [active, setActive] = useState<'overview' | 'workspaces' | 'security' | 'infrastructure' | 'audit'>('overview')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    void Promise.all([request<{ operator: Operator }>('/me'), request<Overview>('/overview')])
      .then(([me, next]) => { setOperator(me.operator); setOverview(next) })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Platform access is unavailable.'))
      .finally(() => setBusy(false))
  }, [])

  useEffect(() => {
    if (!operator) return
    if (active === 'workspaces') void request<{ workspaces: Workspace[] }>('/workspaces').then((result) => setWorkspaces(result.workspaces)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Workspace directory is unavailable.'))
    if (active === 'audit') void request<{ events: Array<Record<string, unknown>> }>('/audit').then((result) => setAudit(result.events)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Audit evidence is unavailable.'))
  }, [active, operator])

  if (busy) return <main className="v2-platform-page"><section className="v2-auth-card">Loading Platform Control Panel</section></main>
  if (error || !operator) return <main className="v2-platform-page"><section className="v2-auth-card"><h1>Platform access denied</h1><p>{error || 'A server-side Platform Operator assignment is required.'}</p></section></main>
  const metric = (label: string, value: number | string | undefined) => <div key={label}><span>{label}</span><strong>{value ?? 'Not configured'}</strong></div>
  return <main className="v2-platform-page" data-testid="v2-platform-admin"><div className="v2-platform-topbar"><strong>Platform Control Panel</strong><span>{operator.role} | Production controls are server enforced</span></div><div className="v2-workspace-layout"><aside className="v2-workspace-nav" aria-label="Platform administration">{(['overview', 'workspaces', 'security', 'infrastructure', 'audit'] as const).map((item) => <button type="button" className={active === item ? 'is-active' : ''} key={item} onClick={() => setActive(item)}>{item}</button>)}</aside><section className="v2-workspace-content"><span className="v2-eyebrow">Platform role: {operator.role}</span>{active === 'overview' && <><h1>Overview</h1><div className="v2-metric-grid">{metric('Active workspaces', overview?.active_workspaces)}{metric('Suspended workspaces', overview?.suspended_workspaces)}{metric('Archived workspaces', overview?.archived_workspaces)}{metric('Active users', overview?.active_users)}{metric('Active sessions', overview?.active_sessions)}{metric('Pending privacy reviews', overview?.pending_privacy_reviews)}</div></>}{active === 'workspaces' && <><h1>Workspace Directory</h1><div className="v2-member-list">{workspaces.map((workspace) => <div className="v2-member-row" key={workspace.id}><strong>{workspace.name}</strong><span>{workspace.slug}</span><span>{workspace.status}</span><span>{workspace.hostname || 'No hostname'}</span><span>{workspace.members} members / {workspace.sessions} sessions</span></div>)}</div></>}{active === 'security' && <><h1>Platform Security</h1><p className="v2-muted">Operator status, MFA requirements, and security audit actions are controlled server-side. Operator rotation is unavailable until the production TOTP enrollment ceremony is configured.</p></>}{active === 'infrastructure' && <><h1>Infrastructure & Release</h1><div className="v2-metric-grid">{metric('Environment', overview?.release.environment)}{metric('Release SHA', overview?.release.gitSha)}</div><p className="v2-muted">Cloudflare resource controls remain read-only at this panel boundary.</p></>}{active === 'audit' && <><h1>Platform Audit</h1><div className="v2-member-list">{audit.map((event) => <div className="v2-member-row" key={String(event.id)}><strong>{String(event.action)}</strong><span>{String(event.outcome)}</span><span>{String(event.subjectType)}</span><span>{String(event.createdAt)}</span></div>)}</div></>}</section></div></main>
}
