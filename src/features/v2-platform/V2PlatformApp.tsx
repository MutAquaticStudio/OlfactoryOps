import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { PublicSensoryFeedback, TrialsSensoryWorkspace } from '../v2-trials-sensory'
import { ProductionWorkspace } from '../v2-production'
import { AgentRuntimeWorkspace } from '../v2-agent-runtime'
import { CommerceWorkspace } from '../v2-commerce'

type Locale = 'en-US' | 'vi-VN'
type V2Session = { user: { email: string; displayName: string; verified: boolean }; membership: { organizationName: string; organizationSlug: string; role: string }; capabilities: Record<string, boolean> }
type V2Invitation = { id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string }

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/api\/v1\/?$/, '/api/v1/v2/platform')
const labApiBase = apiBase.replace(/\/platform$/, '/lab')
const formulaApiBase = apiBase.replace(/\/platform$/, '/formula-intelligence')
const trialsApiBase = apiBase.replace(/\/platform$/, '/trials')
const productionApiBase = apiBase.replace(/\/platform$/, '/production')
const agentRuntimeApiBase = apiBase.replace(/\/platform$/, '/agent-runtime')
const commerceApiBase = apiBase.replace(/\/platform$/, '/commerce')

const copy = {
  'en-US': {
    product: 'OlfactoryOps Platform', signIn: 'Sign in', signUp: 'Create workspace', email: 'Email', password: 'Password', name: 'Your name', workspace: 'Workspace name', slug: 'Workspace address', submitLogin: 'Sign in securely', submitSignup: 'Create workspace', security: 'Platform security', members: 'Members & roles', domains: 'Workspace domains', billing: 'Managed beta', notifications: 'Notifications', privacy: 'Privacy & exports', observability: 'Observability', loading: 'Loading workspace', verify: 'Check your inbox to verify this email before opening the workspace.', unavailable: 'Platform database is not configured for this environment.', switchSignup: 'Need a workspace?', switchLogin: 'Already have an account?', locale: 'VI', signOut: 'Sign out', status: 'Protected workspace', role: 'Role', address: 'System address', session: 'Sessions', export: 'Request personal export', consent: 'Record privacy consent', save: 'Save changes', back: 'Back to sign in', noAccess: 'This section is not available for your role.',
  },
  'vi-VN': {
    product: 'Nền tảng OlfactoryOps', signIn: 'Đăng nhập', signUp: 'Tạo workspace', email: 'Email', password: 'Mật khẩu', name: 'Tên của bạn', workspace: 'Tên workspace', slug: 'Địa chỉ workspace', submitLogin: 'Đăng nhập an toàn', submitSignup: 'Tạo workspace', security: 'Bảo mật nền tảng', members: 'Thành viên & vai trò', domains: 'Tên miền workspace', billing: 'Managed beta', notifications: 'Thông báo', privacy: 'Quyền riêng tư & xuất dữ liệu', observability: 'Quan sát hệ thống', loading: 'Đang tải workspace', verify: 'Hãy kiểm tra email để xác minh trước khi mở workspace.', unavailable: 'Database nền tảng chưa được cấu hình ở môi trường này.', switchSignup: 'Chưa có workspace?', switchLogin: 'Đã có tài khoản?', locale: 'EN', signOut: 'Đăng xuất', status: 'Workspace được bảo vệ', role: 'Vai trò', address: 'Địa chỉ hệ thống', session: 'Phiên đăng nhập', export: 'Yêu cầu xuất dữ liệu cá nhân', consent: 'Ghi nhận đồng ý quyền riêng tư', save: 'Lưu thay đổi', back: 'Quay lại đăng nhập', noAccess: 'Vai trò của bạn không có quyền xem phần này.',
  },
} as const
type PlatformCopy = { [K in keyof typeof copy['en-US']]: string }

function currentLocale(): Locale { return window.localStorage.getItem('olfactoryops.locale') === 'vi-VN' ? 'vi-VN' : 'en-US' }
function pathMode() { const path = window.location.pathname; if (path === '/v2/signup') return 'signup'; if (path === '/v2/login') return 'login'; if (path === '/v2/invitations/accept') return 'accept'; if (path.startsWith('/v2/public/sensory/')) return 'public-sensory'; return 'workspace' }
function workspaceSection() {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const workspaceIndex = segments.indexOf('workspace')
  return workspaceIndex >= 0 ? segments[workspaceIndex + 1] || 'workspace' : 'workspace'
}
function trialRouteId() {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const trialIndex = segments.indexOf('trials')
  if (trialIndex < 0) return undefined
  const candidate = segments[trialIndex + 1]
  return candidate && candidate !== 'sessions' ? decodeURIComponent(candidate) : undefined
}
function productionRouteId() {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const productionIndex = segments.indexOf('production')
  if (productionIndex < 0) return undefined
  const candidate = segments[productionIndex + 1]
  return candidate ? decodeURIComponent(candidate) : undefined
}
function commerceRouteId() {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const commerceIndex = segments.indexOf('commerce')
  if (commerceIndex < 0) return undefined
  const candidate = segments[commerceIndex + 1]
  return candidate ? decodeURIComponent(candidate) : undefined
}
function publicSensoryToken() {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const sensoryIndex = segments.lastIndexOf('sensory')
  return sensoryIndex >= 0 ? decodeURIComponent(segments[sensoryIndex + 1] ?? '') : ''
}
function navigate(path: string) { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')) }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const csrf = document.cookie.match(/(?:^|;\s*)oo_v2_csrf=([^;]+)/)?.[1] || window.localStorage.getItem('oo_v2_csrf') || undefined
  const response = await fetch(`${apiBase}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}), ...(init?.headers || {}) } })
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string }
  if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Request failed')
  return payload as T
}

async function labRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const csrf = document.cookie.match(/(?:^|;\s*)oo_v2_csrf=([^;]+)/)?.[1] || window.localStorage.getItem('oo_v2_csrf') || undefined
  const response = await fetch(`${labApiBase}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}), ...(init?.method && init.method !== 'GET' ? { 'Idempotency-Key': crypto.randomUUID() } : {}), ...(init?.headers || {}) } })
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string }
  if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Request failed')
  return payload as T
}

async function formulaRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const csrf = document.cookie.match(/(?:^|;\s*)oo_v2_csrf=([^;]+)/)?.[1] || window.localStorage.getItem('oo_v2_csrf') || undefined
  const response = await fetch(`${formulaApiBase}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}), ...(init?.method && init.method !== 'GET' ? { 'Idempotency-Key': crypto.randomUUID() } : {}), ...(init?.headers || {}) } })
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string }
  if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Request failed')
  return payload as T
}

export function V2PlatformApp() {
  const [locale, setLocale] = useState<Locale>(currentLocale)
  const [mode, setMode] = useState(pathMode)
  useEffect(() => { const onPop = () => setMode(pathMode()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])
  const text = copy[locale]
  const toggleLocale = () => { const next = locale === 'en-US' ? 'vi-VN' : 'en-US'; window.localStorage.setItem('olfactoryops.locale', next); setLocale(next) }
  if (mode === 'login' || mode === 'signup') return <AuthView mode={mode} text={text} onLocale={toggleLocale} onNavigate={navigate} />
  if (mode === 'accept') return <InvitationAcceptView text={text} onLocale={toggleLocale} onNavigate={navigate} />
  if (mode === 'public-sensory') return <PublicSensoryFeedback token={publicSensoryToken()} />
  return <WorkspaceView text={text} onLocale={toggleLocale} onNavigate={navigate} />
}

function InvitationAcceptView({ text, onLocale, onNavigate }: { text: PlatformCopy; onLocale: () => void; onNavigate: (path: string) => void }) {
  const [form, setForm] = useState({ token: '', email: '', displayName: '', password: '' })
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { const result = await request<{ csrfToken?: string; workspaceUrl?: string }>('/auth/invitations/accept', { method: 'POST', body: JSON.stringify(form) }); if (result.csrfToken) window.localStorage.setItem('oo_v2_csrf', result.csrfToken); if (result.workspaceUrl && !['localhost', '127.0.0.1'].includes(window.location.hostname)) window.location.assign(result.workspaceUrl); else onNavigate('/v2/workspace') } catch (err) { setError(err instanceof Error ? err.message : text.unavailable) } finally { setBusy(false) } }
  return <main className="v2-platform-page"><div className="v2-platform-topbar"><strong>{text.product}</strong><div><button type="button" className="v2-text-button" onClick={onLocale}>{text.locale}</button><button type="button" className="v2-text-button" onClick={() => onNavigate('/v2/login')}>{text.signIn}</button></div></div><section className="v2-auth-card" data-testid="v2-invitation-accept"><span className="v2-eyebrow">{text.members}</span><h1>Accept invitation</h1><p>Use the invited email and one-time token to join this workspace.</p><form onSubmit={submit}><label>Invitation token<input required value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} /></label><label>{text.email}<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>{text.name}<input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label><label>{text.password}<input type="password" required minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>{error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}<button className="v2-primary-button" disabled={busy}>{busy ? text.loading : 'Accept invitation'}</button></form></section></main>
}

function AuthView({ mode, text, onLocale, onNavigate }: { mode: 'login' | 'signup'; text: PlatformCopy; onLocale: () => void; onNavigate: (path: string) => void }) {
  const [form, setForm] = useState({ email: '', password: '', displayName: '', organizationName: '', workspaceSlug: '' })
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null); const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); setNotice(null); try { if (mode === 'login') { const result = await request<{ csrfToken?: string; workspaceUrl?: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.email, password: form.password }) }); if (result.csrfToken) window.localStorage.setItem('oo_v2_csrf', result.csrfToken); if (result.workspaceUrl && !['localhost', '127.0.0.1'].includes(window.location.hostname)) window.location.assign(result.workspaceUrl); else onNavigate('/v2/workspace') } else { const result = await request<{ csrfToken?: string; workspaceUrl?: string }>('/auth/signup', { method: 'POST', body: JSON.stringify(form) }); if (result.csrfToken) window.localStorage.setItem('oo_v2_csrf', result.csrfToken); setNotice(`${text.verify}${result.workspaceUrl ? ` ${result.workspaceUrl}` : ''}`) } } catch (err) { const message = err instanceof Error ? err.message : text.unavailable; setError(message.includes('not configured') ? text.unavailable : message) } finally { setBusy(false) } }
  return <main className="v2-platform-page"><div className="v2-platform-topbar"><strong>{text.product}</strong><div><button type="button" className="v2-text-button" onClick={onLocale}>{text.locale}</button><button type="button" className="v2-text-button" onClick={() => onNavigate(mode === 'login' ? '/v2/signup' : '/v2/login')}>{mode === 'login' ? text.signUp : text.signIn}</button></div></div><section className="v2-auth-card" data-testid="v2-auth-card"><span className="v2-eyebrow">{text.status}</span><h1>{mode === 'login' ? text.signIn : text.signUp}</h1><p>{mode === 'login' ? text.switchSignup : text.switchLogin}</p><form onSubmit={submit}>{mode === 'signup' ? <><label>{text.name}<input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label><label>{text.workspace}<input required value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} /></label><label>{text.slug}<input required value={form.workspaceSlug} onChange={(e) => setForm({ ...form, workspaceSlug: e.target.value })} /></label></> : null}<label>{text.email}<input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>{text.password}<input type="password" required minLength={12} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>{error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}{notice ? <div className="v2-alert is-success" role="status">{notice}</div> : null}<button className="v2-primary-button" disabled={busy}>{busy ? text.loading : mode === 'login' ? text.submitLogin : text.submitSignup}</button></form></section></main>
}

function WorkspaceView({ text, onLocale, onNavigate }: { text: PlatformCopy; onLocale: () => void; onNavigate: (path: string) => void }) {
  const [session, setSession] = useState<V2Session | null>(null); const [busy, setBusy] = useState(true); const [error, setError] = useState<string | null>(null); const [active, setActive] = useState(workspaceSection)
  useEffect(() => { const onPop = () => setActive(workspaceSection()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])
  useEffect(() => { void request<V2Session>('/me').then(setSession).catch((err) => { setError(err instanceof Error ? err.message : text.unavailable); onNavigate('/v2/login') }).finally(() => setBusy(false)) }, [onNavigate, text.unavailable])
  const items = useMemo(() => [
    { key: 'workspace', label: text.status, permissions: ['tenant.view'] },
    { key: 'materials', label: 'Materials', permissions: ['materials.view'] },
    { key: 'formulas', label: 'Formulas', permissions: ['formula.view'] },
    { key: 'design-studio', label: 'Design Studio', permissions: ['formula.edit'] },
    { key: 'trials', label: 'Trials & Sensory', permissions: ['trials.viewAll', 'trials.viewAssigned'] },
    { key: 'production', label: 'Production', permissions: ['production.view'] },
    { key: 'commerce', label: 'Commerce', permissions: ['commerce.view', 'orders.view'] },
    { key: 'agents', label: 'Agent Console', permissions: ['agent.view', 'agent.execute', 'agent.manageTools', 'agent.confirmWrite', 'agent.evaluate', 'agent.observe'] },
    { key: 'suppliers', label: 'Suppliers', permissions: ['suppliers.view'] },
    { key: 'inventory', label: 'Inventory', permissions: ['inventory.view'] },
    { key: 'procurement', label: 'Procurement', permissions: ['procurement.view'] },
    { key: 'security', label: text.security, permissions: ['security.sessions.view'] },
    { key: 'members', label: text.members, permissions: ['members.view'] },
    { key: 'domains', label: text.domains, permissions: ['domains.view'] },
    { key: 'billing', label: text.billing, permissions: ['billing.capabilities'] },
    { key: 'notifications', label: text.notifications, permissions: ['notifications.view'] },
    { key: 'privacy', label: text.privacy, permissions: ['security.profile.view'] },
    { key: 'observability', label: text.observability, permissions: ['observability.view'] },
  ].filter((item) => item.permissions.some((permission) => session?.capabilities?.[permission] === true)), [session, text])
  if (busy) return <main className="v2-platform-page"><div className="v2-loading">{text.loading}</div></main>
  if (error && !session) return <main className="v2-platform-page"><div className="v2-auth-card"><div className="v2-alert is-error">{error}</div></div></main>
  const signOut = async () => { await request('/auth/logout', { method: 'POST' }).catch(() => undefined); onNavigate('/v2/login') }
  return <main className="v2-platform-page"><div className="v2-platform-topbar"><strong>{session?.membership.organizationName || text.product}</strong><div><button type="button" className="v2-text-button" onClick={onLocale}>{text.locale}</button><button type="button" className="v2-text-button" onClick={() => void signOut()}>{text.signOut}</button></div></div><div className="v2-workspace-layout"><aside className="v2-workspace-nav" aria-label="V2 workspace navigation">{items.map((item) => <button type="button" key={item.key} className={active === item.key ? 'is-active' : ''} onClick={() => { setActive(item.key); onNavigate(`/v2/workspace${item.key === 'workspace' ? '' : `/${item.key}`}`) }}>{item.label}</button>)}</aside><section className="v2-workspace-content" data-testid="v2-workspace"><span className="v2-eyebrow">{text.status}</span><h1>{session?.membership.organizationName}</h1><p className="v2-muted">{session?.user.email}</p><div className="v2-metric-grid"><div><span>{text.role}</span><strong>{session?.membership.role}</strong></div><div><span>{text.address}</span><strong>{session?.membership.organizationSlug}.olfactoryops.com</strong></div><div><span>{text.session}</span><strong>Protected</strong></div></div><V2Section active={active} text={text} session={session} onNavigate={onNavigate} /> </section></div></main>
}

function V2Section({ active, text, session, onNavigate }: { active: string; text: PlatformCopy; session: V2Session | null; onNavigate: (path: string) => void }) {
  const [notice, setNotice] = useState<string | null>(null)
  const [members, setMembers] = useState<Array<{ displayName: string; email: string; role: string; status: string }>>([])
  const [invitations, setInvitations] = useState<V2Invitation[]>([])
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'Perfumer' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' })
  const [emailForm, setEmailForm] = useState({ currentPassword: '', newEmail: '' })
  useEffect(() => {
    setNotice(null)
    if (active === 'members') void Promise.all([request<{ members: typeof members }>('/workspace/members'), request<{ invitations: V2Invitation[] }>('/workspace/invitations')]).then(([memberPayload, invitationPayload]) => { setMembers(memberPayload.members); setInvitations(invitationPayload.invitations) }).catch((error) => setNotice(error instanceof Error ? error.message : text.noAccess))
  }, [active, text.noAccess])
  const post = async (path: string, body?: unknown) => { setNotice(null); try { await request(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }); setNotice('Saved securely.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Request failed') } }
  const requiredPermissions: Record<string, string[]> = { materials: ['materials.view'], formulas: ['formula.view'], 'design-studio': ['formula.edit'], trials: ['trials.viewAll', 'trials.viewAssigned'], production: ['production.view'], commerce: ['commerce.view', 'orders.view'], agents: ['agent.view', 'agent.execute', 'agent.manageTools', 'agent.confirmWrite', 'agent.evaluate', 'agent.observe'], suppliers: ['suppliers.view'], inventory: ['inventory.view'], procurement: ['procurement.view'], security: ['security.sessions.view'], members: ['members.view'], domains: ['domains.view'], billing: ['billing.capabilities'], notifications: ['notifications.view'], observability: ['observability.view'], workspace: ['tenant.view'] }
  if (requiredPermissions[active] && !requiredPermissions[active].some((permission) => session?.capabilities?.[permission] === true)) return <div className="v2-panel"><h2>{text.noAccess}</h2><p>Access is enforced by the workspace role policy.</p></div>
  if (active === 'materials' || active === 'suppliers' || active === 'inventory' || active === 'procurement') return <LabOperationsPanel active={active} capabilities={session?.capabilities ?? {}} />
  if (active === 'formulas' || active === 'design-studio') return <FormulaIntelligencePanel active={active} />
  if (active === 'trials') return <TrialsSensoryWorkspace apiBase={trialsApiBase} capabilities={session?.capabilities ?? {}} initialTrialId={trialRouteId()} onNavigate={onNavigate} />
  if (active === 'production') return <ProductionWorkspace apiBase={productionApiBase} capabilities={session?.capabilities ?? {}} initialOrderId={productionRouteId()} onNavigate={onNavigate} />
  if (active === 'commerce') return <CommerceWorkspace apiBase={commerceApiBase} capabilities={session?.capabilities ?? {}} initialOrderId={commerceRouteId()} onNavigate={onNavigate} />
  if (active === 'agents') return <AgentRuntimeWorkspace apiBase={agentRuntimeApiBase} capabilities={session?.capabilities ?? {}} />
  if (active === 'billing') return <div className="v2-panel"><h2>{text.billing}</h2><p>Self-service billing is disabled during managed beta. Workspace access and capability limits remain enforced server-side.</p></div>
  if (active === 'security') return <div className="v2-panel"><h2>{text.security}</h2><p>Sessions are opaque, rotated, hash-only, and protected by CSRF for unsafe requests.</p><form className="v2-inline-form" onSubmit={(event) => { event.preventDefault(); void post('/security/password', passwords); setPasswords({ currentPassword: '', newPassword: '' }) }}><label>Current password<input type="password" required value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label><label>New password<input type="password" required minLength={12} value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></label><button className="v2-secondary-button" type="submit">Change password</button></form><form className="v2-inline-form" onSubmit={(event) => { event.preventDefault(); void post('/security/email', emailForm); setEmailForm({ currentPassword: '', newEmail: '' }) }}><label>New email<input type="email" required value={emailForm.newEmail} onChange={(event) => setEmailForm({ ...emailForm, newEmail: event.target.value })} /></label><label>Current password<input type="password" required value={emailForm.currentPassword} onChange={(event) => setEmailForm({ ...emailForm, currentPassword: event.target.value })} /></label><button className="v2-secondary-button" type="submit">Change email</button></form>{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>
  if (active === 'privacy') return <div className="v2-panel"><h2>{text.privacy}</h2><p>Personal export and workspace export are separate authorization boundaries.</p><button className="v2-secondary-button" type="button" onClick={() => void post('/workspace/exports/privacy')}>{text.export}</button><button className="v2-secondary-button" type="button" onClick={() => void post('/workspace/consents', { purpose: 'PRIVACY', policyVersion: 'v2-2026-08' })}>{text.consent}</button>{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>
  if (active === 'members') return <div className="v2-panel"><h2>{text.members}</h2>{session?.capabilities?.['members.invite'] ? <form className="v2-inline-form" onSubmit={async (event) => { event.preventDefault(); await post('/workspace/invitations', inviteForm); setInviteForm({ email: '', role: 'Perfumer' }); const refreshed = await request<{ invitations: V2Invitation[] }>('/workspace/invitations').catch(() => ({ invitations: [] })); setInvitations(refreshed.invitations) }}><label>Invite email<input type="email" required value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} /></label><label>Role<select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}>{['Admin', 'Lab Manager', 'Perfumer', 'R&D Scientist', 'Lab Technician', 'Procurement', 'Sensory Panelist', 'Brand', 'Supplier', 'Finance', 'Viewer'].map((role) => <option key={role}>{role}</option>)}</select></label><button className="v2-secondary-button" type="submit">Invite member</button></form> : null}<div className="v2-member-list">{members.map((member) => <div className="v2-member-row" key={`${member.email}-${member.role}`}><strong>{member.displayName}</strong><span>{member.email}</span><span>{member.role}</span><span>{member.status}</span></div>)}</div>{invitations.filter((item) => item.status === 'PENDING').map((invitation) => <div className="v2-member-row" key={invitation.id}><strong>Pending invitation</strong><span>{invitation.email}</span><span>{invitation.role}</span><button type="button" className="v2-text-button" onClick={async () => { await post(`/workspace/invitations/${invitation.id}/resend`, undefined); const refreshed = await request<{ invitations: V2Invitation[] }>('/workspace/invitations').catch(() => ({ invitations: [] })); setInvitations(refreshed.invitations) }}>Resend</button><button type="button" className="v2-text-button" onClick={async () => { await post(`/workspace/invitations/${invitation.id}/revoke`, undefined); setInvitations(invitations.map((item) => item.id === invitation.id ? { ...item, status: 'REVOKED' } : item)) }}>Revoke</button></div>)}{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>
  if (active === 'domains') return <div className="v2-panel"><h2>{text.domains}</h2><p>System hostname is active. Customer-owned domains remain pending until validation and SSL confirmation.</p></div>
  if (active === 'notifications') return <div className="v2-panel"><h2>{text.notifications}</h2><p>In-app, email, and web-push delivery preferences are tenant-scoped.</p></div>
  if (active === 'observability') return <ObservabilityPanel text={text} />
  return <div className="v2-panel"><h2>{text.product}</h2><p>Platform Security Core is active. Lab and scientific modules remain outside this Phase 1 surface.</p></div>
}

type MaterialRow = { id: string; name: string; internalCode?: string | null; status: string; scope: 'TENANT'; description?: string | null }
type LotRow = { id: string; materialId: string; status: string; qualityStatus: string; location: string; projection: { onHandGrams: number; reservedGrams: number; availableGrams: number } }
type SupplierRow = { id: string; legalName: string; tradeName?: string | null; currency: string; leadTimeDays?: number | null; status: string }
type ProcurementOverview = { requests: Array<{ id: string; status: string }>; orders: Array<{ id: string; status: string; currency: string }>; shipments: Array<{ id: string; status: string; carrier?: string | null; trackingReference?: string | null }> }

function LabOperationsPanel({ active, capabilities }: { active: 'materials' | 'suppliers' | 'inventory' | 'procurement'; capabilities: Record<string, boolean> }) {
  const [materials, setMaterials] = useState<MaterialRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [lots, setLots] = useState<LotRow[]>([])
  const [procurement, setProcurement] = useState<ProcurementOverview | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const refresh = useCallback(async () => {
    try {
      if ((active === 'materials' || active === 'procurement') && capabilities['materials.view']) setMaterials((await labRequest<{ materials: MaterialRow[] }>('/materials')).materials)
      if (active === 'suppliers') setSuppliers((await labRequest<{ suppliers: SupplierRow[] }>('/suppliers')).suppliers)
      if (active === 'inventory') setLots((await labRequest<{ lots: LotRow[] }>('/inventory/lots')).lots)
      if (active === 'procurement') setProcurement(await labRequest<ProcurementOverview>('/procurement/overview'))
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load this workspace data.') }
  }, [active, capabilities])
  useEffect(() => { void refresh() }, [refresh])
  const createMaterial = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    try {
      await labRequest('/materials', { method: 'POST', body: JSON.stringify({ name, internalCode: code || undefined, identifiers: [], sensoryMetadata: {} }) })
      setName(''); setCode(''); await refresh(); setNotice('Material created as a draft. Review it before operational use.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Material could not be created.') }
  }
  const createSupplier = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    try {
      await labRequest('/suppliers', { method: 'POST', body: JSON.stringify({ legalName: supplierName, currency: 'USD', paymentTerms: {} }) })
      setSupplierName(''); await refresh(); setNotice('Supplier profile created as a draft for review.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Supplier profile could not be created.') }
  }
  if (active === 'materials') return <div className="v2-panel" data-testid="v2-materials"><div className="v2-panel-heading"><div><h2>Materials</h2><p>Tenant-owned materials remain private. A draft cannot be received or consumed until an authorized reviewer makes it active.</p></div></div>{capabilities['materials.edit'] ? <form className="v2-inline-form" onSubmit={createMaterial}><label>Material name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Internal code<input value={code} onChange={(event) => setCode(event.target.value)} /></label><button className="v2-secondary-button" type="submit">Create draft material</button></form> : null}<div className="v2-member-list">{materials.length ? materials.map((material) => <div className="v2-member-row" key={material.id}><strong>{material.name}</strong><span>{material.internalCode || 'No internal code'}</span><span>{material.status.replaceAll('_', ' ')}</span><span>Tenant material</span></div>) : <p className="v2-muted">No tenant materials have been created yet.</p>}</div>{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>
  if (active === 'suppliers') return <div className="v2-panel" data-testid="v2-suppliers"><h2>Supplier profiles</h2><p>Supplier identity, evidence and offer pricing are tenant-owned. Operational purchasing accepts only active supplier offers.</p>{capabilities['suppliers.edit'] ? <form className="v2-inline-form" onSubmit={createSupplier}><label>Legal supplier name<input required value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label><button className="v2-secondary-button" type="submit">Create draft supplier</button></form> : null}<div className="v2-member-list">{suppliers.length ? suppliers.map((supplier) => <div className="v2-member-row" key={supplier.id}><strong>{supplier.tradeName || supplier.legalName}</strong><span>{supplier.status}</span><span>{supplier.currency}</span><span>{supplier.leadTimeDays === null || supplier.leadTimeDays === undefined ? 'Lead time not set' : `${supplier.leadTimeDays} days`}</span></div>) : <p className="v2-muted">No supplier profile is available in this workspace.</p>}</div>{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>
  if (active === 'inventory') return <div className="v2-panel" data-testid="v2-inventory"><h2>Inventory lots</h2><p>Available stock is derived from the immutable ledger. Quarantine and failed-quality lots are excluded from FEFO allocation.</p><div className="v2-member-list">{lots.length ? lots.map((lot) => <div className="v2-member-row" key={lot.id}><strong>{lot.id.slice(0, 14)}</strong><span>{lot.status} / {lot.qualityStatus}</span><span>{lot.location}</span><span>{lot.projection.availableGrams.toFixed(3)} g available</span></div>) : <p className="v2-muted">No lots exist in this workspace.</p>}</div>{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>
  return <div className="v2-panel" data-testid="v2-procurement"><h2>Procurement & receiving</h2><p>Request, approval, order, shipment, receipt, inspection and landed-cost operations are all tenant-scoped. Receiving always creates a quarantine lot; inspection is the gate into available inventory.</p><div className="v2-member-list">{procurement?.orders.length ? procurement.orders.map((order) => <div className="v2-member-row" key={order.id}><strong>{order.id.slice(0, 16)}</strong><span>{order.status.replaceAll('_', ' ')}</span><span>{order.currency}</span><span>Order</span></div>) : <p className="v2-muted">No purchase order is available. Create an approved request, then select an active supplier offer.</p>}{procurement?.shipments.map((shipment) => <div className="v2-member-row" key={shipment.id}><strong>{shipment.carrier || 'Supplier shipment'}</strong><span>{shipment.status.replaceAll('_', ' ')}</span><span>{shipment.trackingReference || 'No tracking reference'}</span><span>Shipment</span></div>)}</div>{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>
}

type FormulaProjectRow = { id: string; name: string; formulaType: 'ACCORD' | 'FINE_FRAGRANCE'; status: string; latestVersion: number }
type DesignProjectRow = { id: string; name: string; status: string; briefStatus: string; candidateCount: number; createdAt: string }
type FormulaDraftDetail = { draft: { id: string; formulaProjectId: string; targetGrams: number; status: string }; components: Array<{ materialId: string; percentage: number; position: number; note?: string }>; math: { valid: boolean; totalPercentage: number; components: Array<{ materialId: string; grams: number }> }; reviews: Array<{ decision: string; rationale?: string | null; createdAt: string }> }

function FormulaIntelligencePanel({ active }: { active: 'formulas' | 'design-studio' }) {
  const [formulaProjects, setFormulaProjects] = useState<FormulaProjectRow[]>([])
  const [designProjects, setDesignProjects] = useState<DesignProjectRow[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [formula, setFormula] = useState({ name: '', formulaType: 'FINE_FRAGRANCE' as 'ACCORD' | 'FINE_FRAGRANCE' })
  const [design, setDesign] = useState({ name: '', rawBrief: '' })
  const [review, setReview] = useState({ projectId: '', creativeDirection: '', productType: 'FINE_FRAGRANCE' as 'ACCORD' | 'FINE_FRAGRANCE', availabilityFirst: true })
  const [materials, setMaterials] = useState<MaterialRow[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [componentRows, setComponentRows] = useState<Array<{ materialId: string; percentage: string; note: string }>>([{ materialId: '', percentage: '100', note: '' }])
  const [targetMassGrams, setTargetMassGrams] = useState('100')
  const [draftDetail, setDraftDetail] = useState<FormulaDraftDetail | null>(null)
  const [rationale, setRationale] = useState('')

  const refresh = useCallback(async () => {
    try {
      if (active === 'formulas') {
        const [formulaPayload, materialPayload] = await Promise.all([
          formulaRequest<{ projects: FormulaProjectRow[] }>('/projects'),
          labRequest<{ materials: MaterialRow[] }>('/materials'),
        ])
        setFormulaProjects(formulaPayload.projects); setMaterials(materialPayload.materials.filter((material) => material.status === 'ACTIVE'))
      }
      if (active === 'design-studio') setDesignProjects((await formulaRequest<{ projects: DesignProjectRow[] }>('/design-projects')).projects)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load Formula Intelligence.') }
  }, [active])
  useEffect(() => { void refresh() }, [refresh])

  const createFormula = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    try {
      await formulaRequest('/projects', { method: 'POST', body: JSON.stringify(formula) })
      setFormula({ name: '', formulaType: 'FINE_FRAGRANCE' }); await refresh(); setNotice('Formula project created. Add an explicit material composition before submitting review.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Formula project could not be created.') }
  }
  const openDraft = async (draftId: string) => {
    try { setDraftDetail((await formulaRequest<{ draft: FormulaDraftDetail }>(`/drafts/${draftId}`)).draft) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Draft detail could not be loaded.') }
  }
  const saveDraft = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    const components = componentRows.map((row, position) => ({ materialId: row.materialId, percentage: Number(row.percentage), position, note: row.note || undefined }))
    try {
      if (draftDetail) await formulaRequest(`/drafts/${draftDetail.draft.id}/components`, { method: 'PUT', body: JSON.stringify({ components, targetMassGrams: Number(targetMassGrams) }) })
      else if (selectedProjectId) {
        const created = await formulaRequest<{ draft: { id: string } }>(`/projects/${selectedProjectId}/drafts`, { method: 'POST', body: JSON.stringify({ components, targetMassGrams: Number(targetMassGrams), origin: 'MANUAL' }) })
        await openDraft(created.draft.id)
      }
      else throw new Error('Select a formula project before saving a draft.')
      setNotice('Draft saved. Validation and review remain server-authoritative.');
      if (draftDetail) await openDraft(draftDetail.draft.id)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Draft could not be saved.') }
  }
  const draftAction = async (action: 'validation' | 'submit-review' | 'approve' | 'reject') => {
    if (!draftDetail) return
    try {
      if (action === 'validation') {
        const result = await formulaRequest<{ validation: FormulaDraftDetail['math'] }>(`/drafts/${draftDetail.draft.id}/validation`)
        setNotice(result.validation.valid ? `Formula math is valid at ${result.validation.totalPercentage.toFixed(3)}%.` : 'Formula math is not valid.')
      } else {
        await formulaRequest(`/drafts/${draftDetail.draft.id}/${action}`, { method: 'POST', body: JSON.stringify({ rationale: rationale || 'Reviewed in Formula R&D.' }) })
        setNotice(action === 'approve' ? 'Immutable Formula Version approved.' : action === 'reject' ? 'Draft returned for revision.' : 'Draft submitted for review.')
      }
      await openDraft(draftDetail.draft.id); await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Formula action could not be completed.') }
  }
  const createDesign = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    try {
      const result = await formulaRequest<{ project: { id: string } }>('/design-projects', { method: 'POST', body: JSON.stringify(design) })
      setReview((current) => ({ ...current, projectId: result.project.id })); setDesign({ name: '', rawBrief: '' }); await refresh(); setNotice('Brief saved. Review its structured constraints before selecting an authorized material universe.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Research brief could not be created.') }
  }
  const reviewBrief = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    try {
      await formulaRequest(`/design-projects/${review.projectId}/review-brief`, { method: 'POST', body: JSON.stringify({ structuredBrief: { product: { type: review.productType }, creativeDirection: review.creativeDirection, performance: [], audience: [], markets: [], availabilityFirst: review.availabilityFirst, requiredMaterialIds: [], prohibitedMaterialIds: [], unresolvedQuestions: [] } }) })
      setNotice('Structured brief reviewed. You can now create an immutable material universe for this research project.'); await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The structured brief needs more information.') }
  }
  const buildUniverse = async () => {
    if (!review.projectId) return
    setNotice(null)
    try {
      const response = await formulaRequest<{ universe: { materialIds: string[] } }>(`/design-projects/${review.projectId}/material-universe`, { method: 'POST' })
      setNotice(`Material universe pinned with ${response.universe.materialIds.length} eligible workspace materials. Candidate generation remains deterministic and provider-free until an approved research provider is configured.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Material universe could not be created.') }
  }

  if (active === 'formulas') return <div className="v2-panel" data-testid="v2-formulas"><div className="v2-panel-heading"><div><h2>Formula R&D</h2><p>Formula identity, composition and approval are server-authoritative. Saving a draft never reserves or consumes inventory.</p></div></div><form className="v2-inline-form" onSubmit={createFormula}><label>Formula name<input required value={formula.name} onChange={(event) => setFormula({ ...formula, name: event.target.value })} /></label><label>Formula type<select value={formula.formulaType} onChange={(event) => setFormula({ ...formula, formulaType: event.target.value as 'ACCORD' | 'FINE_FRAGRANCE' })}><option value="ACCORD">Accord</option><option value="FINE_FRAGRANCE">Fine fragrance</option></select></label><button className="v2-secondary-button" type="submit">Create formula project</button></form><div className="v2-member-list">{formulaProjects.length ? formulaProjects.map((project) => <div className="v2-member-row" key={project.id}><strong>{project.name}</strong><span>{project.formulaType === 'ACCORD' ? 'Accord' : 'Fine fragrance'}</span><span>{project.status}</span><span>{project.latestVersion ? `Version ${project.latestVersion}` : 'No approved version'}</span><button type="button" className="v2-text-button" onClick={() => { setSelectedProjectId(project.id); setDraftDetail(null); setNotice(`Selected ${project.name}.`) }}>New draft</button></div>) : <p className="v2-muted">No formula project exists yet.</p>}</div>{selectedProjectId || draftDetail ? <form className="v2-inline-form" onSubmit={saveDraft}><label>Target mass (g)<input type="number" min="0.001" step="0.001" required value={targetMassGrams} onChange={(event) => setTargetMassGrams(event.target.value)} /></label>{componentRows.map((row, index) => <div className="v2-component-row" key={`${index}-${row.materialId}`}><label>Material<select required value={row.materialId} onChange={(event) => setComponentRows(componentRows.map((item, itemIndex) => itemIndex === index ? { ...item, materialId: event.target.value } : item))}><option value="">Choose active material</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label><label>Percentage<input type="number" min="0.000001" max="100" step="0.000001" required value={row.percentage} onChange={(event) => setComponentRows(componentRows.map((item, itemIndex) => itemIndex === index ? { ...item, percentage: event.target.value } : item))} /></label><label>Note<input value={row.note} onChange={(event) => setComponentRows(componentRows.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value } : item))} /></label>{componentRows.length > 1 ? <button type="button" className="v2-text-button" onClick={() => setComponentRows(componentRows.filter((_, itemIndex) => itemIndex !== index))}>Remove</button> : null}</div>)}<button type="button" className="v2-text-button" onClick={() => setComponentRows([...componentRows, { materialId: '', percentage: '', note: '' }])}>Add component</button><button className="v2-secondary-button" type="submit">{draftDetail ? 'Save composition' : 'Create draft'}</button></form> : null}{draftDetail ? <div className="v2-member-list"><div className="v2-member-row"><strong>Draft {draftDetail.draft.status}</strong><span>{draftDetail.math.totalPercentage.toFixed(3)}%</span><span>{draftDetail.math.valid ? 'Math valid' : 'Math invalid'}</span><span>{draftDetail.draft.targetGrams.toFixed(3)} g</span></div>{draftDetail.components.map((component) => <div className="v2-member-row" key={component.materialId}><strong>{materials.find((material) => material.id === component.materialId)?.name || component.materialId}</strong><span>{component.percentage.toFixed(3)}%</span><span>{draftDetail.math.components.find((item) => item.materialId === component.materialId)?.grams.toFixed(3)} g</span></div>)}<label>Review rationale<input value={rationale} onChange={(event) => setRationale(event.target.value)} /></label><div><button type="button" className="v2-secondary-button" onClick={() => void draftAction('validation')}>Validate</button><button type="button" className="v2-secondary-button" onClick={() => void draftAction('submit-review')}>Submit review</button><button type="button" className="v2-secondary-button" onClick={() => void draftAction('approve')}>Approve</button><button type="button" className="v2-text-button" onClick={() => void draftAction('reject')}>Reject</button></div>{draftDetail.reviews.map((item) => <div className="v2-member-row" key={`${item.decision}-${item.createdAt}`}><strong>{item.decision}</strong><span>{item.rationale || 'No rationale'}</span><span>{new Date(item.createdAt).toLocaleString()}</span></div>)}</div> : null}{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>

  return <div className="v2-panel" data-testid="v2-design-studio"><div className="v2-panel-heading"><div><h2>Formula Design Studio</h2><p>Create a research brief, review its structured constraints, then pin a private material universe. No external provider or hidden formula-generation heuristic is active.</p></div></div><form className="v2-inline-form" onSubmit={createDesign}><label>Project name<input required value={design.name} onChange={(event) => setDesign({ ...design, name: event.target.value })} /></label><label>Creative brief<textarea required maxLength={5000} value={design.rawBrief} onChange={(event) => setDesign({ ...design, rawBrief: event.target.value })} /></label><button className="v2-secondary-button" type="submit">Save research brief</button></form><div className="v2-member-list">{designProjects.length ? designProjects.map((project) => <div className="v2-member-row" key={project.id}><strong>{project.name}</strong><span>Brief: {project.briefStatus.replaceAll('_', ' ')}</span><span>{project.candidateCount} candidate{project.candidateCount === 1 ? '' : 's'}</span><button type="button" className="v2-text-button" onClick={() => setReview((current) => ({ ...current, projectId: project.id }))}>Review brief</button></div>) : <p className="v2-muted">No research brief exists yet.</p>}</div>{review.projectId ? <form className="v2-inline-form" onSubmit={reviewBrief}><label>Creative direction<input required value={review.creativeDirection} onChange={(event) => setReview({ ...review, creativeDirection: event.target.value })} /></label><label>Outcome<select value={review.productType} onChange={(event) => setReview({ ...review, productType: event.target.value as 'ACCORD' | 'FINE_FRAGRANCE' })}><option value="ACCORD">Accord</option><option value="FINE_FRAGRANCE">Fine fragrance</option></select></label><label className="v2-checkbox"><input type="checkbox" checked={review.availabilityFirst} onChange={(event) => setReview({ ...review, availabilityFirst: event.target.checked })} /> Prefer available materials</label><button className="v2-secondary-button" type="submit">Approve structured brief</button><button className="v2-text-button" type="button" onClick={() => void buildUniverse()}>Build material universe</button></form> : null}{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>
}

function ObservabilityPanel({ text }: { text: PlatformCopy }) {
  const [status, setStatus] = useState<Record<string, string> | null>(null)
  useEffect(() => { void request<{ observability: Record<string, string> }>('/workspace/observability').then((payload) => setStatus(payload.observability)).catch(() => setStatus(null)) }, [])
  return <div className="v2-panel"><h2>{text.observability}</h2>{status ? <div className="v2-member-list">{Object.entries(status).filter(([key]) => key !== 'capturedAt' && key !== 'degradedCount').map(([key, value]) => <div className="v2-member-row" key={key}><strong>{key}</strong><span>{value}</span></div>)}</div> : <p>{text.noAccess}</p>}</div>
}
