import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity,
  Bell,
  Bot,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Home,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Truck,
  UsersRound,
  Warehouse,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { featureCapabilities, isWorkspaceFeatureAvailableInPublicCutover } from './feature-route-contract.js'
import { trustedWorkspaceRedirectUrl } from '../../data/workspaceHostnames'
import { browserWorkspaceBaseDomain, browserWorkspaceRedirectOrigins } from './workspaceHostnameRuntime'
import { OlfactoryResearchPanel } from './OlfactoryResearchPanel'

const PublicSensoryFeedback = lazy(async () => ({ default: (await import('../v2-trials-sensory')).PublicSensoryFeedback }))
const TrialsSensoryWorkspace = lazy(async () => ({ default: (await import('../v2-trials-sensory')).TrialsSensoryWorkspace }))
const ProductionWorkspace = lazy(async () => ({ default: (await import('../v2-production')).ProductionWorkspace }))
const AgentRuntimeWorkspace = lazy(async () => ({ default: (await import('../v2-agent-runtime')).AgentRuntimeWorkspace }))
const CommerceWorkspace = lazy(async () => ({ default: (await import('../v2-commerce')).CommerceWorkspace }))
const AdvancedWorkspace = lazy(async () => ({ default: (await import('../v2-advanced')).AdvancedWorkspace }))
const PlatformAdminApp = lazy(async () => ({ default: (await import('../v2-platform-admin')).PlatformAdminApp }))
const MaterialIntelligenceWorkspace = lazy(async () => ({ default: (await import('./MaterialIntelligenceWorkspace')).MaterialIntelligenceWorkspace }))

type Locale = 'en-US' | 'vi-VN'
type V2Session = { user: { email: string; displayName: string; verified: boolean }; membership: { organizationName: string; organizationSlug: string; role: string }; capabilities: Record<string, boolean> }
type V2Invitation = { id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string }

export function platformApiBaseFromRuntime(value: string | undefined) {
  return (value || '/api/v1').replace(/\/api\/v1\/?$/, '/api/v1/v2/platform')
}

const apiBase = platformApiBaseFromRuntime(import.meta.env.VITE_API_BASE_URL)

export function safeV2ReturnPath(value: string | null | undefined) {
  if (!value) return undefined
  try {
    const parsed = new URL(value, 'https://olfactoryops.invalid')
    if (parsed.origin !== 'https://olfactoryops.invalid') return undefined
    if (parsed.pathname !== '/v2' && !parsed.pathname.startsWith('/v2/')) return undefined
    if (['/v2/login', '/v2/signup', '/v2/forgot-password', '/v2/reset-password', '/v2/verify-email', '/v2/invitations/accept'].includes(parsed.pathname)) return undefined
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return undefined
  }
}

export function v2LoginPathForLocation(pathname: string, search = '', hash = '') {
  const next = safeV2ReturnPath(`${pathname}${search}${hash}`)
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login'
}

const labApiBase = apiBase.replace(/\/platform$/, '/lab')
const formulaApiBase = apiBase.replace(/\/platform$/, '/formula-intelligence')
const trialsApiBase = apiBase.replace(/\/platform$/, '/trials')
const productionApiBase = apiBase.replace(/\/platform$/, '/production')
const agentRuntimeApiBase = apiBase.replace(/\/platform$/, '/agent-runtime')
const commerceApiBase = apiBase.replace(/\/platform$/, '/commerce')
const advancedApiBase = apiBase.replace(/\/platform$/, '/advanced')
const materialIntelligenceApiBase = apiBase.replace(/\/platform$/, '/material-intelligence')
const stagingPublicCutover = import.meta.env.VITE_V2_STAGING_PUBLIC_CUTOVER === 'true'
const publicFeatureRouteCutover = import.meta.env.PROD || stagingPublicCutover

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
function browserLocation() {
  return typeof window === 'undefined' ? { pathname: '/', search: '' } : window.location
}

export function platformPathMode(pathname = browserLocation().pathname, search = browserLocation().search) {
  const path = pathname
  const legacyToken = new URLSearchParams(search).has('reset') || new URLSearchParams(search).has('verify')
  if (legacyToken && (path === '/login' || path === '/signup')) return 'legacy-recovery'
  if (path === '/signup' || path === '/v2/signup') return 'signup'
  if (path === '/login' || path === '/v2/login') return 'login'
  if (path === '/forgot-password' || path === '/v2/forgot-password') return 'reset-request'
  // Root reset and verification endpoints belonged to the retired V1 UI. New
  // V2 mail uses the explicit /v2 aliases so legacy tokens are never bridged.
  if (path === '/reset-password' || path === '/verify-email') return 'legacy-recovery'
  if (path === '/v2/reset-password') return 'reset-confirm'
  if (path === '/v2/verify-email') return 'verify-confirm'
  if (path === '/v2/platform-admin') return 'platform-admin'
  if (path === '/v2/invitations/accept') return 'accept'
  if (path.startsWith('/v2/public/sensory/')) return 'public-sensory'
  return 'workspace'
}
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

export function workspaceErrorMessage(error: unknown, action: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (/failed to fetch|networkerror|load failed|network request failed/.test(message)) return `Unable to ${action} right now. Check your connection and try again.`
  if (/not configured/.test(message)) return 'This workspace capability is not available in the current environment.'
  if (/forbidden|not authorized|access denied|unauthorized/.test(message)) return 'Your workspace role does not have access to this action.'
  if (/invalid credentials|invalid email|invalid password/.test(message)) return 'We could not verify those sign-in details.'
  return `Unable to ${action}. Please try again.`
}

export function platformRequestHeaders(method: string | undefined, csrf: string | undefined) {
  const isReadRequest = ['GET', 'HEAD'].includes(method?.toUpperCase() ?? 'GET')
  if (isReadRequest) return {}
  return { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const csrf = document.cookie.match(/(?:^|;\s*)oo_v2_csrf=([^;]+)/)?.[1] || window.localStorage.getItem('oo_v2_csrf') || undefined
  const response = await fetch(`${apiBase}${path}`, { ...init, credentials: 'include', headers: { ...platformRequestHeaders(init?.method, csrf), ...(init?.headers || {}) } })
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
  const [mode, setMode] = useState(platformPathMode)
  useEffect(() => { const onPop = () => setMode(platformPathMode()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])
  const text = copy[locale]
  const toggleLocale = () => { const next = locale === 'en-US' ? 'vi-VN' : 'en-US'; window.localStorage.setItem('olfactoryops.locale', next); setLocale(next) }
  if (mode === 'login' || mode === 'signup') return <AuthView mode={mode} text={text} onLocale={toggleLocale} onNavigate={navigate} />
  if (mode === 'reset-request') return <PasswordResetRequestView text={text} onLocale={toggleLocale} onNavigate={navigate} />
  if (mode === 'reset-confirm') return <PasswordResetConfirmView text={text} onLocale={toggleLocale} onNavigate={navigate} />
  if (mode === 'verify-confirm') return <EmailVerificationView text={text} onLocale={toggleLocale} onNavigate={navigate} />
  if (mode === 'legacy-recovery') return <LegacyRecoveryView text={text} onLocale={toggleLocale} onNavigate={navigate} />
  if (mode === 'platform-admin') return <Suspense fallback={<WorkspaceSurfaceFallback />}><PlatformAdminApp /></Suspense>
  if (mode === 'accept') return <InvitationAcceptView text={text} onLocale={toggleLocale} onNavigate={navigate} />
  if (mode === 'public-sensory') return stagingPublicCutover
    ? <UnavailableStagingSurface />
    : <Suspense fallback={<WorkspaceSurfaceFallback />}><PublicSensoryFeedback token={publicSensoryToken()} /></Suspense>
  return <WorkspaceView text={text} locale={locale} onLocale={toggleLocale} onNavigate={navigate} />
}

function WorkspaceSurfaceFallback() { return <div className="v2-loading">Loading workspace module</div> }

function UnavailableStagingSurface() {
  return <main className="v2-platform-page"><section className="v2-auth-card"><span className="v2-eyebrow">Staging boundary</span><h1>This V2 surface is not in the public staging cutover.</h1><p>Only the Platform, Materials/Lab Ops, Formula/Design, Evidence, Scientific, and Agent boundaries are enabled here.</p></section></main>
}

export function workspaceRedirectTarget(workspaceUrl: string | undefined) {
  return trustedWorkspaceRedirectUrl(workspaceUrl, browserWorkspaceBaseDomain, browserWorkspaceRedirectOrigins)
}

function navigateToTrustedWorkspace(workspaceUrl: string | undefined, onNavigate: (path: string) => void) {
  const redirect = workspaceRedirectTarget(workspaceUrl)
  const returnPath = safeV2ReturnPath(new URLSearchParams(window.location.search).get('next'))
  if (workspaceUrl && !redirect) return false
  if (redirect && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    window.location.assign(returnPath ? new URL(returnPath, redirect).toString() : redirect)
    return true
  }
  onNavigate('/v2/workspace')
  return true
}

function InvitationAcceptView({ text, onLocale, onNavigate }: { text: PlatformCopy; onLocale: () => void; onNavigate: (path: string) => void }) {
  const [form, setForm] = useState({ token: '', email: '', displayName: '', password: '' })
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { const result = await request<{ csrfToken?: string; workspaceUrl?: string }>('/auth/invitations/accept', { method: 'POST', body: JSON.stringify(form) }); if (result.csrfToken) window.localStorage.setItem('oo_v2_csrf', result.csrfToken); if (!navigateToTrustedWorkspace(result.workspaceUrl, onNavigate)) throw new Error('WORKSPACE_REDIRECT_REJECTED') } catch (err) { setError(workspaceErrorMessage(err, 'accept this invitation')) } finally { setBusy(false) } }
  return <main className="v2-platform-page"><div className="v2-platform-topbar"><strong>{text.product}</strong><div><button type="button" className="v2-text-button" onClick={onLocale}>{text.locale}</button><button type="button" className="v2-text-button" onClick={() => onNavigate('/login')}>{text.signIn}</button></div></div><section className="v2-auth-card" data-testid="v2-invitation-accept"><span className="v2-eyebrow">{text.members}</span><h1>Accept invitation</h1><p>Use the invited email and one-time token to join this workspace.</p><form onSubmit={submit}><label>Invitation token<input required value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} /></label><label>{text.email}<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>{text.name}<input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label><label>{text.password}<input type="password" required minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>{error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}<button className="v2-primary-button" disabled={busy}>{busy ? text.loading : 'Accept invitation'}</button></form></section></main>
}

function PublicAuthFrame({ text, onLocale, onNavigate, children }: { text: PlatformCopy; onLocale: () => void; onNavigate: (path: string) => void; children: ReactNode }) {
  return <main className="v2-platform-page"><div className="v2-platform-topbar"><strong>{text.product}</strong><div><button type="button" className="v2-text-button" onClick={onLocale}>{text.locale}</button><button type="button" className="v2-text-button" onClick={() => onNavigate('/login')}>{text.signIn}</button></div></div>{children}</main>
}

function PasswordResetRequestView({ text, onLocale, onNavigate }: { text: PlatformCopy; onLocale: () => void; onNavigate: (path: string) => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null)
    try {
      await request('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) })
      setNotice('If this V2 account is eligible, a reset link will arrive shortly.')
    } catch (requestError) { setError(workspaceErrorMessage(requestError, 'request a password reset')) } finally { setBusy(false) }
  }
  return <PublicAuthFrame text={text} onLocale={onLocale} onNavigate={onNavigate}><section className="v2-auth-card" data-testid="v2-password-reset-request"><span className="v2-eyebrow">Account recovery</span><h1>Reset your password</h1><p>Enter your email and we will send a new V2 recovery link if the account is eligible.</p><form onSubmit={submit}><label>{text.email}<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}{notice ? <div className="v2-alert is-success" role="status">{notice}</div> : null}<button className="v2-primary-button" disabled={busy}>{busy ? text.loading : 'Send recovery link'}</button><button className="v2-secondary-button" type="button" onClick={() => onNavigate('/login')}>Back to sign in</button></form></section></PublicAuthFrame>
}

function PasswordResetConfirmView({ text, onLocale, onNavigate }: { text: PlatformCopy; onLocale: () => void; onNavigate: (path: string) => void }) {
  const token = new URLSearchParams(window.location.search).get('token')?.trim() ?? ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(token ? null : 'This recovery link is incomplete. Request a new V2 recovery link.')
  const [notice, setNotice] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!token || password.length < 12 || password !== confirmPassword) { setError('Use matching passwords with at least 12 characters.'); return }
    setBusy(true); setError(null); setNotice(null)
    try { await request('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, password }) }); setNotice('Password reset complete. You can now sign in.'); setPassword(''); setConfirmPassword('') } catch (requestError) { setError(workspaceErrorMessage(requestError, 'reset your password')) } finally { setBusy(false) }
  }
  return <PublicAuthFrame text={text} onLocale={onLocale} onNavigate={onNavigate}><section className="v2-auth-card" data-testid="v2-password-reset-confirm"><span className="v2-eyebrow">Account recovery</span><h1>Choose a new password</h1><p>This V2 recovery link is single-use and expires after 30 minutes.</p><form onSubmit={submit}><label>{text.password}<input required type="password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm password<input required type="password" minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>{error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}{notice ? <div className="v2-alert is-success" role="status">{notice}</div> : null}<button className="v2-primary-button" disabled={busy || !token}>{busy ? text.loading : 'Reset password'}</button><button className="v2-secondary-button" type="button" onClick={() => onNavigate('/forgot-password')}>Request a new link</button></form></section></PublicAuthFrame>
}

function EmailVerificationView({ text, onLocale, onNavigate }: { text: PlatformCopy; onLocale: () => void; onNavigate: (path: string) => void }) {
  const token = new URLSearchParams(window.location.search).get('token')?.trim() ?? ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(token ? null : 'This V2 verification link is incomplete. Request a new recovery link if you need help signing in.')
  const [notice, setNotice] = useState<string | null>(null)
  const confirm = async () => {
    if (!token) return
    setBusy(true); setError(null); setNotice(null)
    try { await request('/auth/email-verification/confirm', { method: 'POST', body: JSON.stringify({ token }) }); setNotice('Your email is verified. You can now sign in.') } catch (requestError) { setError(workspaceErrorMessage(requestError, 'verify your email')) } finally { setBusy(false) }
  }
  return <PublicAuthFrame text={text} onLocale={onLocale} onNavigate={onNavigate}><section className="v2-auth-card" data-testid="v2-email-verification"><span className="v2-eyebrow">Account verification</span><h1>Verify your email</h1><p>Confirm this V2 link to unlock your workspace.</p>{error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}{notice ? <div className="v2-alert is-success" role="status">{notice}</div> : null}<div className="v2-auth-actions"><button className="v2-primary-button" type="button" disabled={busy || !token} onClick={() => void confirm()}>{busy ? text.loading : 'Verify email'}</button><button className="v2-secondary-button" type="button" onClick={() => onNavigate('/login')}>Back to sign in</button></div></section></PublicAuthFrame>
}

function LegacyRecoveryView({ text, onLocale, onNavigate }: { text: PlatformCopy; onLocale: () => void; onNavigate: (path: string) => void }) {
  return <PublicAuthFrame text={text} onLocale={onLocale} onNavigate={onNavigate}><section className="v2-auth-card" data-testid="v2-legacy-auth-recovery"><span className="v2-eyebrow">Secure recovery</span><h1>Request a new V2 recovery link</h1><p>Older verification and password-reset links are not carried into V2. Start a new V2 recovery request instead.</p><div className="v2-auth-actions"><button className="v2-primary-button" type="button" onClick={() => onNavigate('/forgot-password')}>Request recovery link</button><button className="v2-secondary-button" type="button" onClick={() => onNavigate('/login')}>Back to sign in</button></div></section></PublicAuthFrame>
}

function AuthView({ mode, text, onLocale, onNavigate }: { mode: 'login' | 'signup'; text: PlatformCopy; onLocale: () => void; onNavigate: (path: string) => void }) {
  const [form, setForm] = useState({ email: '', password: '', displayName: '', organizationName: '', workspaceSlug: '' })
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null); const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); setNotice(null); try { if (mode === 'login') { const result = await request<{ csrfToken?: string; workspaceUrl?: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.email, password: form.password }) }); if (result.csrfToken) window.localStorage.setItem('oo_v2_csrf', result.csrfToken); if (!navigateToTrustedWorkspace(result.workspaceUrl, onNavigate)) throw new Error('WORKSPACE_REDIRECT_REJECTED') } else { const result = await request<{ csrfToken?: string; workspaceUrl?: string }>('/auth/signup', { method: 'POST', body: JSON.stringify(form) }); if (result.csrfToken) window.localStorage.setItem('oo_v2_csrf', result.csrfToken); setNotice(text.verify) } } catch (err) { setError(workspaceErrorMessage(err, mode === 'login' ? 'sign in' : 'create this workspace')) } finally { setBusy(false) } }
  return <main className="v2-platform-page"><div className="v2-platform-topbar"><strong>{text.product}</strong><div><button type="button" className="v2-text-button" onClick={onLocale}>{text.locale}</button><button type="button" className="v2-text-button" onClick={() => onNavigate(mode === 'login' ? '/signup' : '/login')}>{mode === 'login' ? text.signUp : text.signIn}</button></div></div><section className="v2-auth-card" data-testid="v2-auth-card"><span className="v2-eyebrow">{text.status}</span><h1>{mode === 'login' ? text.signIn : text.signUp}</h1><p>{mode === 'login' ? text.switchSignup : text.switchLogin}</p><form onSubmit={submit}>{mode === 'signup' ? <><label>{text.name}<input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label><label>{text.workspace}<input required value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} /></label><label>{text.slug}<input required value={form.workspaceSlug} onChange={(e) => setForm({ ...form, workspaceSlug: e.target.value })} /></label></> : null}<label>{text.email}<input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>{text.password}<input type="password" required minLength={12} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>{error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}{notice ? <div className="v2-alert is-success" role="status">{notice}</div> : null}<button className="v2-primary-button" disabled={busy}>{busy ? text.loading : mode === 'login' ? text.submitLogin : text.submitSignup}</button>{mode === 'login' ? <button className="v2-secondary-button" type="button" onClick={() => onNavigate('/forgot-password')}>Forgot password?</button> : null}</form></section></main>
}

type WorkspaceNavigationItem = { key: string; label: string; permissions: readonly string[]; icon: LucideIcon }
type WorkspaceNavigationGroup = { label: string; items: readonly WorkspaceNavigationItem[] }

export const workspaceNavigation: readonly WorkspaceNavigationGroup[] = [
  { label: 'Home', items: [{ key: 'workspace', label: 'Workspace overview', permissions: ['tenant.view'], icon: Home }] },
  {
    label: 'R&D',
    items: [
      { key: 'materials', label: 'Materials', permissions: ['materials.view'], icon: FlaskConical },
      { key: 'formulas', label: 'Formulas', permissions: ['formula.view'], icon: Boxes },
      { key: 'design-studio', label: 'Design Studio', permissions: ['formula.edit'], icon: Sparkles },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'inventory', label: 'Inventory', permissions: ['inventory.view'], icon: Warehouse },
      { key: 'suppliers', label: 'Suppliers', permissions: ['suppliers.view'], icon: Truck },
      { key: 'procurement', label: 'Procurement', permissions: ['procurement.view'], icon: ClipboardList },
    ],
  },
  { label: 'Intelligence', items: [{ key: 'agents', label: 'Agent Console', permissions: ['agent.view', 'agent.execute', 'agent.manageTools', 'agent.confirmWrite', 'agent.evaluate', 'agent.observe'], icon: Bot }] },
  {
    label: 'System',
    items: [
      { key: 'domains', label: 'Workspace settings', permissions: ['domains.view'], icon: Settings2 },
      { key: 'members', label: 'Members & security', permissions: ['members.view'], icon: UsersRound },
      { key: 'security', label: 'Security controls', permissions: ['security.sessions.view'], icon: ShieldCheck },
      { key: 'observability', label: 'Observability', permissions: ['observability.view'], icon: Activity },
    ],
  },
]

const workspaceTitles: Record<string, { eyebrow: string; title: string; description: string }> = {
  workspace: { eyebrow: 'Scientific Creative SaaS', title: 'R&D workspace', description: 'A governed operating view for materials, formulas, and evidence.' },
  materials: { eyebrow: 'R&D Materials', title: 'Perfumery library', description: 'A tenant-scoped material library with operational evidence kept distinct from supplier and global records.' },
  formulas: { eyebrow: 'Formula R&D', title: 'Perfumers workbench', description: 'Build auditable compositions without reserving material or inventing formula intelligence.' },
  'design-studio': { eyebrow: 'Design Studio', title: 'Creative research workflow', description: 'Turn a brief into a reviewable research process with no hidden generation claims.' },
  inventory: { eyebrow: 'Operations', title: 'Inventory ledger', description: 'Availability is derived from the immutable inventory ledger.' },
  suppliers: { eyebrow: 'Operations', title: 'Supplier workspace', description: 'Supplier profiles and evidence are private to this tenant.' },
  procurement: { eyebrow: 'Operations', title: 'Procurement flow', description: 'Trace purchase requests through receiving and inspection.' },
  agents: { eyebrow: 'Intelligence', title: 'Agent Console', description: 'Governed runs, tools, approvals, and persisted evidence. No private reasoning is shown.' },
  domains: { eyebrow: 'System', title: 'Workspace settings', description: 'System-hostname and workspace configuration surfaces.' },
  members: { eyebrow: 'System', title: 'Members & security', description: 'Roles and invitations are enforced by server-side policy.' },
  security: { eyebrow: 'System', title: 'Security controls', description: 'Credential actions keep their server-side authorization boundary.' },
  observability: { eyebrow: 'System', title: 'Observability', description: 'Authorized tenant status is shown without exposing infrastructure internals.' },
}

function WorkspaceView({ text, locale, onLocale, onNavigate }: { text: PlatformCopy; locale: Locale; onLocale: () => void; onNavigate: (path: string) => void }) {
  const [session, setSession] = useState<V2Session | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(workspaceSection)
  const [collapsed, setCollapsed] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')

  useEffect(() => { const onPop = () => setActive(workspaceSection()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
      if (event.key === 'Escape') setCommandOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  useEffect(() => {
    void request<{ csrfToken: string }>('/auth/csrf/bootstrap', { method: 'POST', body: '{}' })
      .then((bootstrap) => {
        window.localStorage.setItem('oo_v2_csrf', bootstrap.csrfToken)
        return request<V2Session>('/me')
      })
      .then(setSession)
      .catch((requestError) => { setError(workspaceErrorMessage(requestError, 'open the workspace')); onNavigate(v2LoginPathForLocation(window.location.pathname, window.location.search, window.location.hash)) })
      .finally(() => setBusy(false))
  }, [onNavigate])

  const navigationGroups = useMemo(() => workspaceNavigation
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => isWorkspaceFeatureAvailableInPublicCutover(item.key, publicFeatureRouteCutover))
        .filter((item) => item.permissions.some((permission) => session?.capabilities?.[permission] === true)),
    }))
    .filter((group) => group.items.length > 0), [session])
  const navigationItems = useMemo(() => navigationGroups.flatMap((group) => group.items), [navigationGroups])
  const activeMeta = workspaceTitles[active] ?? workspaceTitles.workspace
  const commandItems = navigationItems.filter((item) => item.label.toLowerCase().includes(commandQuery.trim().toLowerCase()))

  if (busy) return <main className="v2-platform-page"><div className="v2-loading">{text.loading}</div></main>
  if (error && !session) return <main className="v2-platform-page"><div className="v2-auth-card"><div className="v2-alert is-error" role="alert">{error}</div></div></main>

  const selectItem = (key: string) => {
    setActive(key)
    setCommandOpen(false)
    setCommandQuery('')
    onNavigate(`/v2/workspace${key === 'workspace' ? '' : `/${key}`}`)
  }
  const signOut = async () => { await request('/auth/logout', { method: 'POST' }).catch(() => undefined); onNavigate('/v2/login') }

  return <main className="v2-platform-page v2-workspace-page">
    <aside className={`v2-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Workspace navigation">
      <div className="v2-sidebar-brand"><span className="v2-brand-mark" aria-hidden="true"><FlaskConical size={18} /></span><strong>OlfactoryOps</strong><button className="v2-icon-button v2-collapse-button" type="button" title={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button></div>
      <nav className="v2-workspace-nav">{navigationGroups.map((group) => <div className="v2-nav-group" key={group.label}><span className="v2-nav-group-label">{group.label}</span>{group.items.map((item) => { const Icon = item.icon; return <button type="button" key={item.key} className={active === item.key ? 'is-active' : ''} aria-current={active === item.key ? 'page' : undefined} aria-label={item.label} title={collapsed ? item.label : undefined} onClick={() => selectItem(item.key)}><Icon size={17} aria-hidden="true" /><span>{item.label}</span></button> })}</div>)}</nav>
      <div className="v2-sidebar-footer"><button type="button" className="v2-sidebar-utility" aria-label="Change language" onClick={onLocale}><span aria-hidden="true">{text.locale}</span><span>Language</span></button><button type="button" className="v2-sidebar-utility" aria-label={text.signOut} onClick={() => void signOut()}><span aria-hidden="true">↗</span><span>{text.signOut}</span></button></div>
    </aside>
    <section className="v2-workspace-frame">
      <header className="v2-workspace-topbar"><div className="v2-mobile-brand"><button className="v2-icon-button" type="button" aria-label="Toggle navigation" onClick={() => setCollapsed((value) => !value)}><Menu size={18} /></button><strong>OlfactoryOps</strong></div><div className="v2-breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{activeMeta.title}</strong></div><div className="v2-topbar-actions"><button type="button" className="v2-command-trigger" aria-label="Search workspace" onClick={() => setCommandOpen(true)}><Search size={16} aria-hidden="true" /><span>Search workspace</span><kbd>Ctrl K</kbd></button><details className="v2-topbar-menu"><summary aria-label="Notifications"><Bell size={17} aria-hidden="true" /><span className="v2-visually-hidden">Notifications</span></summary><p>Notifications are managed inside this workspace. No unread status is assumed.</p></details><details className="v2-topbar-menu"><summary><span className="v2-user-mark" aria-hidden="true">{session?.user.displayName?.slice(0, 1).toUpperCase() || 'U'}</span><span className="v2-visually-hidden">Workspace account menu</span></summary><div><button type="button" onClick={() => selectItem('security')}>Account & security</button><button type="button" onClick={() => void signOut()}>{text.signOut}</button></div></details></div></header>
      <div className={`v2-workspace-canvas ${inspectorOpen ? 'has-inspector' : ''}`}><section className="v2-workspace-content" data-testid="v2-workspace"><header className="v2-page-heading"><div><span className="v2-eyebrow">{activeMeta.eyebrow}</span><h1>{activeMeta.title}</h1><p>{activeMeta.description}</p></div><button className="v2-icon-button v2-inspector-toggle" type="button" title={inspectorOpen ? 'Hide context inspector' : 'Show context inspector'} aria-label={inspectorOpen ? 'Hide context inspector' : 'Show context inspector'} aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)}>{inspectorOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</button></header>{active === 'workspace' ? <WorkspaceHome capabilities={session?.capabilities ?? {}} onNavigate={selectItem} /> : !isWorkspaceFeatureAvailableInPublicCutover(active, publicFeatureRouteCutover) ? <UnavailableWorkspaceFeatureSurface /> : <V2Section active={active} text={text} locale={locale} session={session} onNavigate={onNavigate} />}</section>{inspectorOpen ? <WorkspaceContextInspector active={active} onNavigate={selectItem} /> : null}</div>
    </section>
    {commandOpen ? <div className="v2-command-layer" role="presentation" onMouseDown={() => setCommandOpen(false)}><section className="v2-command-dialog" role="dialog" aria-modal="true" aria-label="Search workspace" onMouseDown={(event) => event.stopPropagation()}><label htmlFor="workspace-command-search">Search available workspace areas<input id="workspace-command-search" autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Materials, formulas, inventory…" /></label><div className="v2-command-results">{commandItems.length ? commandItems.map((item) => { const Icon = item.icon; return <button key={item.key} type="button" onClick={() => selectItem(item.key)}><Icon size={16} aria-hidden="true" /><span>{item.label}</span><span className="v2-command-group">{workspaceNavigation.find((group) => group.items.some((candidate) => candidate.key === item.key))?.label}</span></button> }) : <p>No available workspace area matches that search.</p>}</div></section></div> : null}
  </main>
}

type WorkspaceSignal = { label: string; value: string; detail: string; route: string }

function WorkspaceHome({ capabilities, onNavigate }: { capabilities: Record<string, boolean>; onNavigate: (key: string) => void }) {
  const [signals, setSignals] = useState<WorkspaceSignal[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    let active = true
    const reads: Array<Promise<WorkspaceSignal>> = []
    if (capabilities['materials.view']) reads.push(labRequest<{ materials: MaterialRow[] }>('/materials').then(({ materials }) => ({ label: 'Material records', value: String(materials.length), detail: materials.length ? 'Tenant library records' : 'No tenant materials yet', route: 'materials' })))
    if (capabilities['formula.view']) reads.push(formulaRequest<{ projects: FormulaProjectRow[] }>('/projects').then(({ projects }) => ({ label: 'Formula projects', value: String(projects.length), detail: projects.length ? 'Active R&D project records' : 'No formula projects yet', route: 'formulas' })))
    if (capabilities['inventory.view']) reads.push(labRequest<{ lots: LotRow[] }>('/inventory/lots').then(({ lots }) => ({ label: 'Inventory lots', value: String(lots.length), detail: lots.length ? 'Ledger-derived lot records' : 'No inventory lots yet', route: 'inventory' })))
    if (!reads.length) { setState('unavailable'); return () => { active = false } }
    void Promise.all(reads).then((result) => { if (active) { setSignals(result); setState('ready') } }).catch(() => { if (active) setState('unavailable') })
    return () => { active = false }
  }, [capabilities])

  const actions = [
    capabilities['materials.view'] ? { label: 'Review materials', detail: 'Open the governed perfumery library.', route: 'materials', icon: FlaskConical } : null,
    capabilities['formula.view'] ? { label: 'Open formula workbench', detail: 'Create or review an auditable composition.', route: 'formulas', icon: Boxes } : null,
    capabilities['formula.edit'] ? { label: 'Start a research brief', detail: 'Move a creative direction into a structured review.', route: 'design-studio', icon: Sparkles } : null,
    capabilities['agent.view'] ? { label: 'Inspect governed runs', detail: 'Review persisted evidence and approvals.', route: 'agents', icon: Bot } : null,
  ].filter((action): action is NonNullable<typeof action> => action !== null)
  const primaryAction = capabilities['formula.edit']
    ? { label: 'Start a research brief', route: 'design-studio' }
    : capabilities['materials.view']
      ? { label: 'Review materials', route: 'materials' }
      : null

  return <div className="v2-home" data-testid="v2-workspace-home"><section className="v2-home-hero"><div><span className="v2-eyebrow">Operating picture</span><h2>Scientific work, creative judgment, and evidence in one governed workspace.</h2><p>Use the workspace to move from material evidence to formula decisions without implying unavailable AI or supplier intelligence.</p></div><div className="v2-home-hero-actions">{primaryAction ? <button className="v2-primary-button" type="button" onClick={() => onNavigate(primaryAction.route)}>{primaryAction.label}</button> : null}{capabilities['materials.view'] ? <button className="v2-secondary-button" type="button" onClick={() => onNavigate('materials')}>Open material library</button> : null}</div></section><section className="v2-section-block" aria-labelledby="workspace-signals-heading"><div className="v2-section-heading"><div><span className="v2-section-kicker">Live workspace signals</span><h2 id="workspace-signals-heading">Current operational picture</h2></div><span className="v2-live-indicator">Live reads only</span></div>{state === 'loading' ? <div className="v2-signal-grid" aria-label="Loading workspace data"><div className="v2-signal-card is-loading" /><div className="v2-signal-card is-loading" /><div className="v2-signal-card is-loading" /></div> : signals.length ? <div className="v2-signal-grid">{signals.map((signal) => <button type="button" className="v2-signal-card" key={signal.label} onClick={() => onNavigate(signal.route)}><span>{signal.label}</span><strong>{signal.value}</strong><small>{signal.detail}</small></button>)}</div> : <div className="v2-empty-state"><Boxes size={20} aria-hidden="true" /><div><h3>Workspace signals are not available to this role yet.</h3><p>Available navigation remains scoped to the capabilities granted to this workspace role.</p></div></div>}</section><section className="v2-section-block" aria-labelledby="workspace-actions-heading"><div className="v2-section-heading"><div><span className="v2-section-kicker">Next actions</span><h2 id="workspace-actions-heading">Move work forward with evidence</h2></div></div><div className="v2-action-grid">{actions.length ? actions.map((action) => { const Icon = action.icon; return <button type="button" className="v2-action-card" key={action.route} onClick={() => onNavigate(action.route)}><Icon size={19} aria-hidden="true" /><strong>{action.label}</strong><span>{action.detail}</span><ChevronRight size={16} aria-hidden="true" /></button> }) : <div className="v2-empty-state"><ShieldCheck size={20} aria-hidden="true" /><div><h3>No operational action is available to this role.</h3><p>Access is determined by the tenant role policy and is enforced by the server.</p></div></div>}</div></section></div>
}

function WorkspaceContextInspector({ active, onNavigate }: { active: string; onNavigate: (key: string) => void }) {
  const context = active === 'formulas' ? ['Composition remains draft until review.', 'Inventory is not reserved by formula editing.', 'Versioning is server-authoritative.']
    : active === 'design-studio' ? ['Briefs are reviewed before a material universe is pinned.', 'No external provider is assumed.', 'Creative recommendations remain a human decision.']
      : active === 'agents' ? ['Runs, approvals, and evidence are persisted.', 'Tool execution is server-authoritative.', 'Private reasoning is never displayed.']
        : active === 'materials' ? ['This route shows tenant material records.', 'Supplier and global catalog records are not fabricated.', 'Operational states are retained as recorded.']
          : ['Navigation and data access are capability-scoped.', 'The workspace avoids inferred infrastructure status.', 'Use the relevant system surface for configuration.']
  return <aside className="v2-context-inspector" aria-label="Context inspector"><div className="v2-inspector-heading"><span className="v2-section-kicker">Context inspector</span><h2>Evidence boundary</h2></div><ul>{context.map((item) => <li key={item}>{item}</li>)}</ul><div className="v2-inspector-footer"><span>Need configuration?</span><button type="button" onClick={() => onNavigate('domains')}>Open workspace settings <ChevronRight size={14} aria-hidden="true" /></button></div></aside>
}

function UnavailableWorkspaceFeatureSurface() {
  return <div className="v2-panel" role="status"><h2>Not available in this release</h2><p>This workspace feature is not included in the current public runtime.</p></div>
}

function V2Section({ active, text, locale, session, onNavigate }: { active: string; text: PlatformCopy; locale: Locale; session: V2Session | null; onNavigate: (path: string) => void }) {
  const [notice, setNotice] = useState<string | null>(null)
  const [members, setMembers] = useState<Array<{ displayName: string; email: string; role: string; status: string }>>([])
  const [invitations, setInvitations] = useState<V2Invitation[]>([])
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'Perfumer' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' })
  const [emailForm, setEmailForm] = useState({ currentPassword: '', newEmail: '' })
  useEffect(() => {
    setNotice(null)
    if (active === 'members') void Promise.all([request<{ members: typeof members }>('/workspace/members'), request<{ invitations: V2Invitation[] }>('/workspace/invitations')]).then(([memberPayload, invitationPayload]) => { setMembers(memberPayload.members); setInvitations(invitationPayload.invitations) }).catch((error) => setNotice(workspaceErrorMessage(error, 'load members and invitations')))
  }, [active, text.noAccess])
  const post = async (path: string, body?: unknown) => { setNotice(null); try { await request(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }); setNotice('Saved securely.') } catch (error) { setNotice(workspaceErrorMessage(error, 'save this workspace change')) } }
  const requiredPermissions = featureCapabilities(active)
  if (requiredPermissions.length > 0 && !requiredPermissions.some((permission) => session?.capabilities?.[permission] === true)) return <div className="v2-panel"><h2>{text.noAccess}</h2><p>Access is enforced by the workspace role policy.</p></div>
  if (active === 'materials') return <Suspense fallback={<WorkspaceSurfaceFallback />}><MaterialIntelligenceWorkspace apiBase={materialIntelligenceApiBase} capabilities={session?.capabilities ?? {}} /></Suspense>
  if (active === 'suppliers' || active === 'inventory' || active === 'procurement') return <LabOperationsPanel active={active} capabilities={session?.capabilities ?? {}} />
  if (active === 'formulas' || active === 'design-studio') return <FormulaIntelligencePanel active={active} />
  if (active === 'trials') return <Suspense fallback={<WorkspaceSurfaceFallback />}><TrialsSensoryWorkspace apiBase={trialsApiBase} capabilities={session?.capabilities ?? {}} initialTrialId={trialRouteId()} onNavigate={onNavigate} /></Suspense>
  if (active === 'production') return <Suspense fallback={<WorkspaceSurfaceFallback />}><ProductionWorkspace apiBase={productionApiBase} capabilities={session?.capabilities ?? {}} initialOrderId={productionRouteId()} onNavigate={onNavigate} /></Suspense>
  if (active === 'commerce') return <Suspense fallback={<WorkspaceSurfaceFallback />}><CommerceWorkspace apiBase={commerceApiBase} capabilities={session?.capabilities ?? {}} initialOrderId={commerceRouteId()} onNavigate={onNavigate} /></Suspense>
  if (active === 'agents') return <Suspense fallback={<WorkspaceSurfaceFallback />}><AgentRuntimeWorkspace apiBase={agentRuntimeApiBase} capabilities={session?.capabilities ?? {}} /></Suspense>
  if (active === 'advanced') return <Suspense fallback={<WorkspaceSurfaceFallback />}><AdvancedWorkspace apiBase={advancedApiBase} formulaApiBase={formulaApiBase} capabilities={session?.capabilities ?? {}} locale={locale} /></Suspense>
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
  const [materialQuery, setMaterialQuery] = useState('')
  const [materialStatus, setMaterialStatus] = useState('ALL')
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialRow | undefined>()
  const refresh = useCallback(async () => {
    try {
      if ((active === 'materials' || active === 'procurement') && capabilities['materials.view']) setMaterials((await labRequest<{ materials: MaterialRow[] }>('/materials')).materials)
      if (active === 'suppliers') setSuppliers((await labRequest<{ suppliers: SupplierRow[] }>('/suppliers')).suppliers)
      if (active === 'inventory') setLots((await labRequest<{ lots: LotRow[] }>('/inventory/lots')).lots)
      if (active === 'procurement') setProcurement(await labRequest<ProcurementOverview>('/procurement/overview'))
    } catch (error) { setNotice(workspaceErrorMessage(error, 'load this workspace data')) }
  }, [active, capabilities])
  useEffect(() => { void refresh() }, [refresh])
  const createMaterial = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    try {
      await labRequest('/materials', { method: 'POST', body: JSON.stringify({ name, internalCode: code || undefined, identifiers: [], sensoryMetadata: {} }) })
      setName(''); setCode(''); await refresh(); setNotice('Material created as a draft. Review it before operational use.')
    } catch (error) { setNotice(workspaceErrorMessage(error, 'create this material')) }
  }
  const createSupplier = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    try {
      await labRequest('/suppliers', { method: 'POST', body: JSON.stringify({ legalName: supplierName, currency: 'USD', paymentTerms: {} }) })
      setSupplierName(''); await refresh(); setNotice('Supplier profile created as a draft for review.')
    } catch (error) { setNotice(workspaceErrorMessage(error, 'create this supplier profile')) }
  }
  if (active === 'materials') {
    const visibleMaterials = materials.filter((material) => {
      const matchesQuery = `${material.name} ${material.internalCode ?? ''}`.toLowerCase().includes(materialQuery.trim().toLowerCase())
      return matchesQuery && (materialStatus === 'ALL' || material.status === materialStatus)
    })
    return <div className="v2-panel v2-material-library" data-testid="v2-materials">
      <div className="v2-panel-heading"><div><span className="v2-section-kicker">Perfumery library</span><h2>Material evidence, not invented metadata</h2><p>Tenant records appear here. Global catalog and supplier offer records are intentionally distinct until their supported routes are released.</p></div><div className="v2-scope-legend"><span className="v2-scope-chip is-active">Tenant library</span><span className="v2-scope-chip">Global catalog unavailable</span><span className="v2-scope-chip">Supplier catalog unavailable</span></div></div>
      <div className="v2-table-toolbar"><label className="v2-search-field"><Search size={16} aria-hidden="true" /><span className="v2-visually-hidden">Search materials</span><input value={materialQuery} onChange={(event) => setMaterialQuery(event.target.value)} placeholder="Search material or internal code" /></label><label className="v2-select-field">Status<select value={materialStatus} onChange={(event) => setMaterialStatus(event.target.value)}><option value="ALL">All recorded states</option>{Array.from(new Set(materials.map((material) => material.status))).map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>{capabilities['materials.edit'] ? <details className="v2-inline-action"><summary>Add material</summary><form onSubmit={createMaterial}><label>Material name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Internal code<input value={code} onChange={(event) => setCode(event.target.value)} /></label><button className="v2-primary-button" type="submit">Create draft</button></form></details> : null}</div>
      <div className="v2-data-table-wrap" tabIndex={0}><table className="v2-data-table"><thead><tr><th scope="col">Material</th><th scope="col">CAS</th><th scope="col">Olfactive family</th><th scope="col">Source</th><th scope="col">Availability</th><th scope="col">Compliance</th><th scope="col">Cost</th></tr></thead><tbody>{visibleMaterials.length ? visibleMaterials.map((material) => <tr key={material.id}><td><button type="button" className="v2-table-primary" aria-pressed={selectedMaterial?.id === material.id} onClick={() => { setSelectedMaterial(material); setNotice(`${material.name} is selected in the tenant material library.`) }}>{material.name}<small className="v2-mono">{material.internalCode || 'No internal code'}</small></button></td><td>Not captured</td><td>Not captured</td><td><span className="v2-scope-chip is-active">Tenant</span></td><td><span className={`v2-status-chip status-${material.status.toLowerCase()}`}>{material.status.replaceAll('_', ' ')}</span></td><td>Not captured</td><td>Not captured</td></tr>) : <tr><td colSpan={7}><div className="v2-table-empty">{materials.length ? 'No material record matches the current filters.' : 'No tenant materials have been created yet.'}</div></td></tr>}</tbody></table></div>
      {capabilities['scientific_ai.predict'] ? <OlfactoryResearchPanel key={selectedMaterial?.id ?? 'no-material'} material={selectedMaterial} /> : null}
      {notice ? <div className="v2-alert" role="status">{notice}</div> : null}
    </div>
  }
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
    } catch (error) { setNotice(workspaceErrorMessage(error, 'load formula research data')) }
  }, [active])
  useEffect(() => { void refresh() }, [refresh])

  const createFormula = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    try {
      await formulaRequest('/projects', { method: 'POST', body: JSON.stringify(formula) })
      setFormula({ name: '', formulaType: 'FINE_FRAGRANCE' }); await refresh(); setNotice('Formula project created. Add an explicit material composition before submitting review.')
    } catch (error) { setNotice(workspaceErrorMessage(error, 'create this formula project')) }
  }
  const openDraft = async (draftId: string) => {
    try { setDraftDetail((await formulaRequest<{ draft: FormulaDraftDetail }>(`/drafts/${draftId}`)).draft) }
    catch (error) { setNotice(workspaceErrorMessage(error, 'load this draft detail')) }
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
    } catch (error) { setNotice(workspaceErrorMessage(error, 'save this draft')) }
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
    } catch (error) { setNotice(workspaceErrorMessage(error, 'complete this formula action')) }
  }
  const createDesign = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    try {
      const result = await formulaRequest<{ project: { id: string } }>('/design-projects', { method: 'POST', body: JSON.stringify(design) })
      setReview((current) => ({ ...current, projectId: result.project.id })); setDesign({ name: '', rawBrief: '' }); await refresh(); setNotice('Brief saved. Review its structured constraints before selecting an authorized material universe.')
    } catch (error) { setNotice(workspaceErrorMessage(error, 'save this research brief')) }
  }
  const reviewBrief = async (event: FormEvent) => {
    event.preventDefault(); setNotice(null)
    try {
      await formulaRequest(`/design-projects/${review.projectId}/review-brief`, { method: 'POST', body: JSON.stringify({ structuredBrief: { product: { type: review.productType }, creativeDirection: review.creativeDirection, performance: [], audience: [], markets: [], availabilityFirst: review.availabilityFirst, requiredMaterialIds: [], prohibitedMaterialIds: [], unresolvedQuestions: [] } }) })
      setNotice('Structured brief reviewed. You can now create an immutable material universe for this research project.'); await refresh()
    } catch (error) { setNotice(workspaceErrorMessage(error, 'review this structured brief')) }
  }
  const buildUniverse = async () => {
    if (!review.projectId) return
    setNotice(null)
    try {
      const response = await formulaRequest<{ universe: { materialIds: string[] } }>(`/design-projects/${review.projectId}/material-universe`, { method: 'POST' })
      setNotice(`Material universe pinned with ${response.universe.materialIds.length} eligible workspace materials. Candidate generation remains deterministic and provider-free until an approved research provider is configured.`)
    } catch (error) { setNotice(workspaceErrorMessage(error, 'build this material universe')) }
  }

  if (active === 'formulas') return <div className="v2-panel v2-formula-workbench" data-testid="v2-formulas"><div className="v2-panel-heading"><div><span className="v2-section-kicker">Perfumers workbench</span><h2>Composition with reviewable math</h2><p>Formula identity, composition and approval are server-authoritative. Saving a draft never reserves or consumes inventory.</p></div><div className="v2-workbench-legend"><span>Target mass</span><span>Composition total</span><span>Review state</span></div></div><form className="v2-inline-form" onSubmit={createFormula}><label>Formula name<input required value={formula.name} onChange={(event) => setFormula({ ...formula, name: event.target.value })} /></label><label>Formula type<select value={formula.formulaType} onChange={(event) => setFormula({ ...formula, formulaType: event.target.value as 'ACCORD' | 'FINE_FRAGRANCE' })}><option value="ACCORD">Accord</option><option value="FINE_FRAGRANCE">Fine fragrance</option></select></label><button className="v2-primary-button" type="submit">Create formula project</button></form><div className="v2-member-list">{formulaProjects.length ? formulaProjects.map((project) => <div className="v2-member-row" key={project.id}><strong>{project.name}</strong><span>{project.formulaType === 'ACCORD' ? 'Accord' : 'Fine fragrance'}</span><span>{project.status}</span><span className="v2-mono">{project.latestVersion ? `V${project.latestVersion}` : 'No approved version'}</span><button type="button" className="v2-text-button" onClick={() => { setSelectedProjectId(project.id); setDraftDetail(null); setNotice(`Selected ${project.name}.`) }}>Open composition</button></div>) : <p className="v2-muted">No formula project exists yet. Create one to build a manual composition.</p>}</div>{selectedProjectId || draftDetail ? <form className="v2-inline-form v2-composition-editor" onSubmit={saveDraft}><label>Target mass (g)<input type="number" min="0.001" step="0.001" required value={targetMassGrams} onChange={(event) => setTargetMassGrams(event.target.value)} /></label>{componentRows.map((row, index) => <div className="v2-component-row" key={`${index}-${row.materialId}`}><label>Material<select required value={row.materialId} onChange={(event) => setComponentRows(componentRows.map((item, itemIndex) => itemIndex === index ? { ...item, materialId: event.target.value } : item))}><option value="">Choose active material</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label><label>Percentage<input type="number" min="0.000001" max="100" step="0.000001" required value={row.percentage} onChange={(event) => setComponentRows(componentRows.map((item, itemIndex) => itemIndex === index ? { ...item, percentage: event.target.value } : item))} /></label><label>Note<input value={row.note} onChange={(event) => setComponentRows(componentRows.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value } : item))} /></label>{componentRows.length > 1 ? <button type="button" className="v2-text-button" onClick={() => setComponentRows(componentRows.filter((_, itemIndex) => itemIndex !== index))}>Remove</button> : null}</div>)}<button type="button" className="v2-text-button" onClick={() => setComponentRows([...componentRows, { materialId: '', percentage: '', note: '' }])}>Add component</button><button className="v2-secondary-button" type="submit">{draftDetail ? 'Save composition' : 'Create draft'}</button></form> : null}{draftDetail ? <div className="v2-member-list v2-draft-summary"><div className="v2-member-row"><strong>Draft {draftDetail.draft.status}</strong><span className="v2-mono">{draftDetail.math.totalPercentage.toFixed(3)}%</span><span>{draftDetail.math.valid ? 'Math valid' : 'Math invalid'}</span><span className="v2-mono">{draftDetail.draft.targetGrams.toFixed(3)} g</span></div>{draftDetail.components.map((component) => <div className="v2-member-row" key={component.materialId}><strong>{materials.find((material) => material.id === component.materialId)?.name || component.materialId}</strong><span className="v2-mono">{component.percentage.toFixed(3)}%</span><span className="v2-mono">{draftDetail.math.components.find((item) => item.materialId === component.materialId)?.grams.toFixed(3)} g</span></div>)}<label>Review rationale<input value={rationale} onChange={(event) => setRationale(event.target.value)} /></label><div><button type="button" className="v2-secondary-button" onClick={() => void draftAction('validation')}>Validate</button><button type="button" className="v2-secondary-button" onClick={() => void draftAction('submit-review')}>Submit review</button><button type="button" className="v2-secondary-button" onClick={() => void draftAction('approve')}>Approve</button><button type="button" className="v2-text-button" onClick={() => void draftAction('reject')}>Reject</button></div>{draftDetail.reviews.map((item) => <div className="v2-member-row" key={`${item.decision}-${item.createdAt}`}><strong>{item.decision}</strong><span>{item.rationale || 'No rationale'}</span><span>{new Date(item.createdAt).toLocaleString()}</span></div>)}</div> : null}{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>

  return <div className="v2-panel v2-design-studio" data-testid="v2-design-studio"><div className="v2-panel-heading"><div><span className="v2-section-kicker">Creative research</span><h2>From creative direction to a governed material universe</h2><p>Create a research brief, review its structured constraints, then pin a private material universe. This released workflow does not claim provider-backed generation or hidden formula recommendations.</p></div></div><ol className="v2-design-stage-rail" aria-label="Design studio workflow"><li className="is-current"><span>01</span>Brief</li><li><span>02</span>Structure</li><li><span>03</span>Universe</li><li><span>04</span>Explore</li><li><span>05</span>Review</li><li><span>06</span>Decision</li></ol><form className="v2-inline-form" onSubmit={createDesign}><label>Project name<input required value={design.name} onChange={(event) => setDesign({ ...design, name: event.target.value })} /></label><label>Creative brief<textarea required maxLength={5000} value={design.rawBrief} onChange={(event) => setDesign({ ...design, rawBrief: event.target.value })} /></label><button className="v2-primary-button" type="submit">Save research brief</button></form><div className="v2-member-list">{designProjects.length ? designProjects.map((project) => <div className="v2-member-row" key={project.id}><strong>{project.name}</strong><span>Brief: {project.briefStatus.replaceAll('_', ' ')}</span><span>{project.candidateCount} recorded candidate{project.candidateCount === 1 ? '' : 's'}</span><button type="button" className="v2-text-button" onClick={() => setReview((current) => ({ ...current, projectId: project.id }))}>Review brief</button></div>) : <p className="v2-muted">No research brief exists yet. Start with the creative question, then make its constraints explicit.</p>}</div>{review.projectId ? <form className="v2-inline-form v2-design-review-form" onSubmit={reviewBrief}><label>Creative direction<input required value={review.creativeDirection} onChange={(event) => setReview({ ...review, creativeDirection: event.target.value })} /></label><label>Outcome<select value={review.productType} onChange={(event) => setReview({ ...review, productType: event.target.value as 'ACCORD' | 'FINE_FRAGRANCE' })}><option value="ACCORD">Accord</option><option value="FINE_FRAGRANCE">Fine fragrance</option></select></label><label className="v2-checkbox"><input type="checkbox" checked={review.availabilityFirst} onChange={(event) => setReview({ ...review, availabilityFirst: event.target.checked })} /> Prefer available materials</label><button className="v2-secondary-button" type="submit">Approve structured brief</button><button className="v2-text-button" type="button" onClick={() => void buildUniverse()}>Build material universe</button></form> : null}{notice ? <div className="v2-alert" role="status">{notice}</div> : null}</div>
}

function ObservabilityPanel({ text }: { text: PlatformCopy }) {
  const [status, setStatus] = useState<Record<string, string> | null>(null)
  useEffect(() => { void request<{ observability: Record<string, string> }>('/workspace/observability').then((payload) => setStatus(payload.observability)).catch(() => setStatus(null)) }, [])
  return <div className="v2-panel"><h2>{text.observability}</h2>{status ? <div className="v2-member-list">{Object.entries(status).filter(([key]) => key !== 'capturedAt' && key !== 'degradedCount').map(([key, value]) => <div className="v2-member-row" key={key}><strong>{key}</strong><span>{value}</span></div>)}</div> : <p>{text.noAccess}</p>}</div>
}
