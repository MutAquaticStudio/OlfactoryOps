import { AlertCircle, CheckCircle2, FlaskConical, MessageSquare, Play, Save, Share2, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentFormulaProposal, FormulaOptimizerIntent } from '../../data/agentRuntime'
import type { Formula, Material } from '../../data/northStar'
import { WorkspaceDialog as AppWorkspaceDialog } from '../../ui/WorkspaceDialog'

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>

export type FormulaIntelligenceCapabilities = {
  canCreateBrief: boolean
  canGenerateDirections: boolean
  canRunOptimizer: boolean
  canViewSensitiveComposition: boolean
  canViewCostEvidence: boolean
  canViewInventoryEvidence: boolean
  canSaveDraft: boolean
}

type RunRow = {
  id: string
  status: 'QUEUED' | 'RUNNING' | 'WAITING_FOR_CONFIRMATION' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  progress: number
  error_summary?: string | null
}

type Direction = {
  directionId: string
  title: string
  narrative: string
  pyramidSummary: string
  availability: 'AVAILABLE' | 'MIXED' | 'UNKNOWN'
  complianceStatus: 'PASS' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'INSUFFICIENT_DATA'
  warnings: string[]
  status: string
  sharedAt?: string | null
  savedFormulaId?: string | null
  runId?: string
  proposal?: AgentFormulaProposal
  shares?: Array<{ recipientUserId: string; allowMaterialNames: boolean; sharedAt: string }>
}

type ShareRecipient = { userId: string; name: string; email: string }
type Feedback = { id: string; directionId: string; userId: string; rating?: number | null; comment: string; selected: boolean; createdAt: string }
type DesignProject = {
  id: string
  name: string
  status: string
  createdByUserId: string
  selectedDirectionId?: string | null
  brief: {
    name: string
    formulaType: 'ACCORD' | 'FINE_FRAGRANCE'
    concentrationType: string
    finalProductConcentrationPercent: number
    ifraCategory: string
    targetMarkets: string[]
    creativeBrief: string
    desiredNotes: string[]
    avoidedNotes: string[]
    lockedMaterialIds: string[]
    availabilityFirst: boolean
    targetGrams: number
  }
  directions: Direction[]
  feedback: Feedback[]
  createdAt: string
  updatedAt: string
}

type OptimizerCandidate = {
  candidateId: string
  title: string
  proposal: AgentFormulaProposal
  complianceStatus: Direction['complianceStatus']
  availability: Direction['availability']
  costDelta?: number
  compositionChangePercent: number
  score: number
  summary: string[]
}

type RunDetail = {
  run: RunRow
  nodes?: Array<{ id: string; node_type: string; status: string; attempt: number }>
  artifacts: Array<{ id: string; type: string; data: unknown }>
  confirmation?: { id: string; status: string; summary: string }
}

type FormulaVersionResponse = { formula: Formula; versions: Array<{ version: string; createdAt: string; lines: Formula['lines'] }> }
type PendingConfirmation = { runId: string; confirmationId: string; label: string }
type ConnectionState = 'idle' | 'live' | 'reconnecting' | 'restored'

const mutationStoragePrefix = 'olfactoryops.formula-intelligence.mutation.'

function mutationHeaders(scope: string) {
  const storageKey = `${mutationStoragePrefix}${scope}`
  const existing = window.sessionStorage.getItem(storageKey)
  const key = existing || crypto.randomUUID()
  if (!existing) window.sessionStorage.setItem(storageKey, key)
  return { 'Content-Type': 'application/json', 'Idempotency-Key': key }
}

function completeMutation(scope: string) {
  window.sessionStorage.removeItem(`${mutationStoragePrefix}${scope}`)
}

function csv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function statusTone(status: string) {
  if (status === 'PASS' || status === 'AVAILABLE' || status === 'SAVED' || status === 'COMPLETED') return 'green'
  if (status === 'BLOCKED' || status === 'UNAVAILABLE' || status === 'FAILED' || status === 'CANCELLED') return 'red'
  return 'amber'
}

function runLabel(status: RunRow['status']) {
  return status.replaceAll('_', ' ').toLowerCase()
}

function usePersistedRunId(storageKey: string) {
  const [runId, setRunId] = useState<string | undefined>(() => window.sessionStorage.getItem(storageKey) || undefined)
  useEffect(() => {
    if (runId) window.sessionStorage.setItem(storageKey, runId)
    else window.sessionStorage.removeItem(storageKey)
  }, [runId, storageKey])
  return [runId, setRunId] as const
}

function useAgentRunMonitor(apiBaseUrl: string, requestApi: ApiRequest, activeRunId?: string) {
  const [detail, setDetail] = useState<RunDetail>()
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const eventSource = useRef<EventSource | null>(null)
  const loadRun = useCallback(async (runId: string) => {
    const next = await requestApi<RunDetail>(`/agent/runs/${encodeURIComponent(runId)}`)
    setDetail(next)
    return next
  }, [requestApi])

  useEffect(() => {
    eventSource.current?.close()
    if (!activeRunId) {
      setDetail(undefined)
      setConnectionState('idle')
      return
    }
    let disposed = false
    let terminal = false
    const refresh = async () => {
      const next = await loadRun(activeRunId)
      terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(next.run.status)
      if (terminal && !disposed) setConnectionState('restored')
      return next
    }
    void refresh().catch(() => { if (!disposed) setConnectionState('reconnecting') })
    const source = new EventSource(`${apiBaseUrl}/agent/runs/${encodeURIComponent(activeRunId)}/stream`, { withCredentials: true })
    eventSource.current = source
    source.onopen = () => { if (!terminal && !disposed) setConnectionState('live') }
    const receive = () => {
      void refresh().then((next) => {
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(next.run.status)) source.close()
      }).catch(() => { if (!disposed) setConnectionState('reconnecting') })
    }
    source.onmessage = receive
    ;[
      'run.created', 'run.queued', 'run.started', 'run.paused', 'run.resumed', 'run.cancelled', 'run.completed', 'run.failed',
      'node.queued', 'node.started', 'node.progress', 'node.completed', 'node.failed', 'node.retrying',
      'artifact.created', 'artifact.updated', 'confirmation.requested', 'confirmation.accepted', 'confirmation.rejected',
    ].forEach((type) => source.addEventListener(type, receive))
    source.onerror = () => { if (!terminal && !disposed) setConnectionState('reconnecting') }
    return () => {
      disposed = true
      source.close()
    }
  }, [activeRunId, apiBaseUrl, loadRun])

  return { detail, connectionState, loadRun }
}

function ProposalLines({ proposal, materialNames }: { proposal: AgentFormulaProposal; materialNames: Map<string, string> }) {
  return <div className="formula-intelligence-lines">{proposal.ingredients.map((line) => <div key={line.materialId}><span>{materialNames.get(line.materialId) ?? 'Restricted material'}</span><strong>{line.percentage.toFixed(2)}%</strong></div>)}</div>
}

function MaterialPicker({ label, materials, selected, onChange }: { label: string; materials: Array<{ id: string; name: string }>; selected: string[]; onChange: (value: string[]) => void }) {
  const [filter, setFilter] = useState('')
  const visible = materials.filter((material) => material.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const selectedMaterials = materials.filter((material) => selected.includes(material.id))
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])
  return <div className="formula-intelligence-picker"><label>{label}<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search approved materials" /></label>{selectedMaterials.length ? <div className="formula-intelligence-picker-chips">{selectedMaterials.map((material) => <button type="button" key={material.id} onClick={() => toggle(material.id)}>{material.name}<X size={13} /></button>)}</div> : <small>No locked materials.</small>}<div className="formula-intelligence-picker-list">{visible.slice(0, 16).map((material) => <label key={material.id}><input type="checkbox" checked={selected.includes(material.id)} onChange={() => toggle(material.id)} /> <span>{material.name}</span></label>)}</div></div>
}

function FormulaIntelligenceDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <AppWorkspaceDialog open title={title} onClose={onClose} className="formula-intelligence-modal">
      {children}
    </AppWorkspaceDialog>
  )
}

function RunStatus({ detail, connectionState, busy, onCancel }: { detail?: RunDetail; connectionState: ConnectionState; busy: boolean; onCancel: () => void }) {
  if (!detail) return null
  return <section className="formula-intelligence-run-status" data-testid="formula-intelligence-run-status" aria-live="polite"><div><strong>{runLabel(detail.run.status)}</strong><span>{connectionState === 'live' ? 'Live updates' : connectionState === 'reconnecting' ? 'Reconnecting to durable run' : 'Restored from durable run'}</span></div><div className="agent-progress"><span style={{ width: `${detail.run.progress}%` }} /></div>{detail.nodes?.length ? <div className="formula-intelligence-node-list">{detail.nodes.map((node) => <span key={node.id} className={`is-${node.status.toLowerCase()}`}>{node.node_type.replaceAll('_', ' ')}: {node.status.toLowerCase()}</span>)}</div> : null}{detail.run.status === 'RUNNING' || detail.run.status === 'QUEUED' ? <button className="ghost-button small" type="button" disabled={busy} onClick={onCancel}>Cancel run</button> : null}</section>
}

export function FormulaDesignStudioWorkspace({ apiBaseUrl, requestApi, materialRecords, capabilities, onFormulaSaved }: { apiBaseUrl: string; requestApi: ApiRequest; materialRecords: Material[]; capabilities: FormulaIntelligenceCapabilities; onFormulaSaved: (formula: Formula) => void }) {
  const [projects, setProjects] = useState<DesignProject[]>([])
  const [name, setName] = useState('New fragrance direction')
  const [creativeBrief, setCreativeBrief] = useState('Marine woody fine fragrance with a bright citrus opening, a smooth floral heart, and a long amber trail.')
  const [formulaType, setFormulaType] = useState<'ACCORD' | 'FINE_FRAGRANCE'>('FINE_FRAGRANCE')
  const [concentration, setConcentration] = useState(20)
  const [ifraCategory, setIfraCategory] = useState('4')
  const [markets, setMarkets] = useState('EU, US')
  const [desiredNotes, setDesiredNotes] = useState('citrus, marine, amber')
  const [avoidedNotes, setAvoidedNotes] = useState('powdery')
  const [lockedMaterialIds, setLockedMaterialIds] = useState<string[]>([])
  const [targetGrams, setTargetGrams] = useState(100)
  const [availabilityFirst, setAvailabilityFirst] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [pending, setPending] = useState<PendingConfirmation>()
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, { comment: string; rating: number }>>({})
  const [shareTarget, setShareTarget] = useState<{ projectId: string; direction: Direction }>()
  const [shareRecipients, setShareRecipients] = useState<ShareRecipient[]>([])
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([])
  const [allowMaterialNames, setAllowMaterialNames] = useState(false)
  const [activeRunId, setActiveRunId] = usePersistedRunId('olfactoryops.formula-intelligence.design-run')
  const { detail: activeRun, connectionState, loadRun } = useAgentRunMonitor(apiBaseUrl, requestApi, activeRunId)
  const materialNames = useMemo(() => new Map(materialRecords.map((material) => [material.id, material.name])), [materialRecords])

  const refresh = useCallback(async () => setProjects(await requestApi<DesignProject[]>('/formula-intelligence/design-projects')), [requestApi])
  useEffect(() => { void refresh().catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load design projects')) }, [refresh])
  useEffect(() => {
    if (!activeRun) return
    if (activeRun.confirmation?.status === 'PENDING') setPending({ runId: activeRun.run.id, confirmationId: activeRun.confirmation.id, label: activeRun.confirmation.summary })
    if (activeRun.run.status === 'COMPLETED') void refresh()
    if (activeRun.run.status === 'FAILED') setNotice(activeRun.run.error_summary ?? 'Direction generation failed')
  }, [activeRun, refresh])

  async function createProject() {
    if (!capabilities.canCreateBrief) return
    const scope = `design-project:${name}:${creativeBrief}`
    setBusy(true); setNotice(undefined)
    try {
      const payload = await requestApi<{ project: DesignProject }>('/formula-intelligence/design-projects', { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ name, formulaType, concentrationType: formulaType === 'ACCORD' ? 'OTHER' : 'EDP', finalProductConcentrationPercent: formulaType === 'ACCORD' ? 100 : concentration, ifraCategory, targetMarkets: csv(markets), creativeBrief, desiredNotes: csv(desiredNotes), avoidedNotes: csv(avoidedNotes), lockedMaterialIds, availabilityFirst, targetGrams }) })
      completeMutation(scope)
      await refresh()
      if (capabilities.canGenerateDirections) await generate(payload.project.id)
      else setNotice('Brief saved. A perfumer with formula access can generate directions for review.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to create design project') } finally { setBusy(false) }
  }

  async function generate(projectId: string) {
    const scope = `design-generate:${projectId}`
    setBusy(true); setNotice(undefined)
    try {
      const result = await requestApi<{ run: RunRow }>(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/generate`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' })
      completeMutation(scope); setActiveRunId(result.run.id)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to generate directions') } finally { setBusy(false) }
  }

  async function cancelRun() {
    if (!activeRunId) return
    const scope = `design-cancel:${activeRunId}`
    setBusy(true)
    try { await requestApi(`/agent/runs/${encodeURIComponent(activeRunId)}/cancel`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' }); completeMutation(scope); await loadRun(activeRunId) } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to cancel direction generation') } finally { setBusy(false) }
  }

  async function openShare(projectId: string, direction: Direction) {
    setBusy(true); setNotice(undefined)
    try {
      const recipients = await requestApi<ShareRecipient[]>(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/recipients`)
      setShareRecipients(recipients)
      setSelectedRecipientIds(direction.shares?.map((share) => share.recipientUserId).filter((id) => recipients.some((recipient) => recipient.userId === id)) ?? [])
      setAllowMaterialNames(direction.shares?.some((share) => share.allowMaterialNames) ?? false)
      setShareTarget({ projectId, direction })
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load eligible recipients') } finally { setBusy(false) }
  }

  async function share() {
    if (!shareTarget || selectedRecipientIds.length === 0) return
    const scope = `design-share:${shareTarget.projectId}:${shareTarget.direction.directionId}:${selectedRecipientIds.sort().join(',')}:${allowMaterialNames}`
    setBusy(true); setNotice(undefined)
    try {
      await requestApi(`/formula-intelligence/design-projects/${encodeURIComponent(shareTarget.projectId)}/directions/${encodeURIComponent(shareTarget.direction.directionId)}/share`, { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ recipientUserIds: selectedRecipientIds, allowMaterialNames }) })
      completeMutation(scope); setShareTarget(undefined); await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to share direction') } finally { setBusy(false) }
  }

  async function revokeShare(projectId: string, directionId: string, recipientUserId: string) {
    const scope = `design-revoke:${projectId}:${directionId}:${recipientUserId}`
    setBusy(true); setNotice(undefined)
    try {
      await requestApi(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/directions/${encodeURIComponent(directionId)}/shares/${encodeURIComponent(recipientUserId)}/revoke`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' })
      completeMutation(scope); setSelectedRecipientIds((current) => current.filter((id) => id !== recipientUserId)); setShareTarget((current) => current ? { ...current, direction: { ...current.direction, shares: current.direction.shares?.filter((share) => share.recipientUserId !== recipientUserId) } } : current); await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to revoke share') } finally { setBusy(false) }
  }

  async function submitFeedback(projectId: string, directionId: string, selected = false) {
    const draft = feedbackDrafts[directionId] ?? { comment: '', rating: 0 }
    const scope = `design-feedback:${projectId}:${directionId}:${draft.comment}:${draft.rating}:${selected}`
    setBusy(true); setNotice(undefined)
    try { await requestApi(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/directions/${encodeURIComponent(directionId)}/feedback`, { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ comment: draft.comment, rating: draft.rating || undefined, selected }) }); completeMutation(scope); await refresh() } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to send feedback') } finally { setBusy(false) }
  }

  async function requestSave(projectId: string, direction: Direction) {
    if (!direction.runId || !capabilities.canSaveDraft) return
    const scope = `design-save:${projectId}:${direction.directionId}`
    setBusy(true); setNotice(undefined)
    try { const data = await requestApi<{ confirmationId: string }>(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/directions/${encodeURIComponent(direction.directionId)}/save`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' }); completeMutation(scope); setPending({ runId: direction.runId, confirmationId: data.confirmationId, label: direction.title }) } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to prepare draft confirmation') } finally { setBusy(false) }
  }

  async function confirmSave() {
    if (!pending) return
    const scope = `design-confirm:${pending.runId}:${pending.confirmationId}`
    setBusy(true); setNotice(undefined)
    try { const result = await requestApi<{ formula?: Formula }>(`/agent/runs/${encodeURIComponent(pending.runId)}/confirmations/${encodeURIComponent(pending.confirmationId)}`, { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ decision: 'accept' }) }); completeMutation(scope); if (result.formula) onFormulaSaved(result.formula); setPending(undefined); await refresh(); setNotice('Editable draft created. Inventory remains advisory and unchanged.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save formula draft') } finally { setBusy(false) }
  }

  return <div className="domain-page formula-intelligence-page">
    <section className="panel glass formula-intelligence-hero"><div><span className="mono-small">Formula Design Studio</span><h2>Briefs to reviewable fragrance directions</h2><p>Brand teams shape the brief; perfumers generate, share, and explicitly save a selected direction. Deterministic mock mode is active.</p></div><span className="status-chip blue"><Sparkles size={14} /> Deterministic mock mode</span></section>
    <div className="formula-intelligence-grid design-studio-grid">
      <section className="panel glass formula-intelligence-brief"><div className="panel-title-row"><div><FlaskConical size={18} /><h3>Brand brief</h3></div><span>Tenant-scoped</span></div>
        <label>Project name<input value={name} maxLength={240} onChange={(event) => setName(event.target.value)} /></label><label>Creative direction<textarea value={creativeBrief} maxLength={6000} onChange={(event) => setCreativeBrief(event.target.value)} /></label>
        <div className="form-grid-two"><label>Formula type<select value={formulaType} onChange={(event) => setFormulaType(event.target.value as typeof formulaType)}><option value="FINE_FRAGRANCE">Fine fragrance</option><option value="ACCORD">Accord</option></select></label><label>IFRA category<input value={ifraCategory} maxLength={32} onChange={(event) => setIfraCategory(event.target.value)} /></label><label>Final concentration %<input type="number" min="0.01" max="100" value={formulaType === 'ACCORD' ? 100 : concentration} disabled={formulaType === 'ACCORD'} onChange={(event) => setConcentration(Number(event.target.value))} /></label><label>Target grams<input type="number" min="0.01" value={targetGrams} onChange={(event) => setTargetGrams(Number(event.target.value))} /></label></div>
        <label>Markets<input value={markets} onChange={(event) => setMarkets(event.target.value)} placeholder="EU, US" /></label><label>Desired notes<input value={desiredNotes} onChange={(event) => setDesiredNotes(event.target.value)} placeholder="citrus, amber" /></label><label>Avoided notes<input value={avoidedNotes} onChange={(event) => setAvoidedNotes(event.target.value)} placeholder="powdery" /></label>
        <MaterialPicker label="Locked approved materials" materials={materialRecords} selected={lockedMaterialIds} onChange={setLockedMaterialIds} /><label className="checkbox-row"><input type="checkbox" checked={availabilityFirst} onChange={(event) => setAvailabilityFirst(event.target.checked)} /> Prefer eligible available materials</label>
        <button className="primary-button" data-testid="formula-design-primary-action" type="button" disabled={busy || !capabilities.canCreateBrief || name.trim().length < 2 || creativeBrief.trim().length < 8} onClick={() => void createProject()}><Play size={16} /> {capabilities.canGenerateDirections ? 'Create and generate' : 'Create brief'}</button>{!capabilities.canGenerateDirections && capabilities.canCreateBrief ? <small>Generation requires formula edit, sensitive formula, and materials access.</small> : null}{notice ? <div className="agent-notice"><AlertCircle size={15} /> {notice}</div> : null}<RunStatus detail={activeRun} connectionState={connectionState} busy={busy} onCancel={() => void cancelRun()} />
      </section>
      <section className="formula-intelligence-projects">{projects.length === 0 ? <section className="panel glass"><p className="empty-state">Create a tenant-scoped brief to begin a reviewable fragrance direction.</p></section> : projects.map((project) => <section className="panel glass formula-intelligence-project" key={project.id}><div className="panel-title-row"><div><FlaskConical size={18} /><h3>{project.name}</h3></div><span className={`status-chip ${statusTone(project.status)}`}>{project.status}</span></div><p className="formula-intelligence-copy">{project.brief.creativeBrief}</p><div className="formula-intelligence-project-meta"><span>{project.brief.formulaType === 'ACCORD' ? 'Accord' : 'Fine fragrance'}</span><span>IFRA {project.brief.ifraCategory}</span><span>{project.brief.targetGrams}g</span></div>{capabilities.canGenerateDirections && project.directions.length === 0 ? <button className="secondary-button small" type="button" disabled={busy} onClick={() => void generate(project.id)}><Play size={15} /> Generate directions</button> : null}<div className="formula-intelligence-direction-grid">{project.directions.map((direction) => { const feedback = project.feedback.filter((item) => item.directionId === direction.directionId); const draft = feedbackDrafts[direction.directionId] ?? { comment: '', rating: 0 }; return <article className="formula-intelligence-direction" key={direction.directionId}><div><h4>{direction.title}</h4><span className={`status-chip ${statusTone(direction.complianceStatus)}`}>{direction.complianceStatus}</span></div><p>{direction.narrative}</p><small>{direction.pyramidSummary}</small><div className="formula-intelligence-project-meta"><span>Availability: {direction.availability === 'UNKNOWN' ? 'Not evaluated' : direction.availability}</span><span>Status: {direction.status}</span></div>{direction.warnings.length ? <ul>{direction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}{capabilities.canViewSensitiveComposition && direction.proposal ? <ProposalLines proposal={direction.proposal} materialNames={materialNames} /> : null}{capabilities.canSaveDraft ? <div className="formula-intelligence-actions"><button className="secondary-button small" type="button" disabled={busy} onClick={() => void openShare(project.id, direction)}><Share2 size={14} /> {direction.shares?.length ? `Manage shares (${direction.shares.length})` : 'Share'}</button><button className="primary-button small" type="button" disabled={busy || Boolean(direction.savedFormulaId) || !direction.proposal} onClick={() => void requestSave(project.id, direction)}><Save size={14} /> {direction.savedFormulaId ? 'Draft saved' : 'Save as draft'}</button></div> : <div className="formula-intelligence-feedback"><label>Rating<select value={draft.rating} onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [direction.directionId]: { ...draft, rating: Number(event.target.value) } }))}><option value="0">Optional</option>{[1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating}</option>)}</select></label><textarea value={draft.comment} maxLength={1200} placeholder="Feedback for the perfumer" onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [direction.directionId]: { ...draft, comment: event.target.value } }))} /><div className="formula-intelligence-actions"><button className="secondary-button small" type="button" disabled={busy} onClick={() => void submitFeedback(project.id, direction.directionId)}><MessageSquare size={14} /> Send feedback</button><button className="primary-button small" type="button" disabled={busy} onClick={() => void submitFeedback(project.id, direction.directionId, true)}><CheckCircle2 size={14} /> Select</button></div></div>}{feedback.length ? <small>{feedback.length} feedback item{feedback.length === 1 ? '' : 's'}</small> : null}</article> } )}</div></section>)}</section>
    </div>
    {shareTarget ? <FormulaIntelligenceDialog title="Share direction" onClose={() => setShareTarget(undefined)}><p className="formula-intelligence-copy">Only active members of this brand can receive this direction. Material names stay hidden unless you opt in.</p>{shareTarget.direction.shares?.length ? <div className="formula-intelligence-share-list">{shareTarget.direction.shares.map((share) => <div key={share.recipientUserId}><span>{shareRecipients.find((recipient) => recipient.userId === share.recipientUserId)?.name ?? 'Active recipient'}{share.allowMaterialNames ? ' / material names visible' : ''}</span><button className="ghost-button small" type="button" disabled={busy} onClick={() => void revokeShare(shareTarget.projectId, shareTarget.direction.directionId, share.recipientUserId)}>Revoke</button></div>)}</div> : null}<div className="formula-intelligence-recipient-list">{shareRecipients.map((recipient) => <label key={recipient.userId}><input type="checkbox" checked={selectedRecipientIds.includes(recipient.userId)} onChange={() => setSelectedRecipientIds((current) => current.includes(recipient.userId) ? current.filter((id) => id !== recipient.userId) : [...current, recipient.userId])} /><span><strong>{recipient.name}</strong><small>{recipient.email}</small></span></label>)}</div><label className="checkbox-row"><input type="checkbox" checked={allowMaterialNames} onChange={(event) => setAllowMaterialNames(event.target.checked)} /> Disclose material names</label><div className="formula-intelligence-actions"><button className="primary-button small" type="button" disabled={busy || selectedRecipientIds.length === 0} onClick={() => void share()}><Share2 size={14} /> Save sharing</button><button className="secondary-button small" type="button" disabled={busy} onClick={() => setShareTarget(undefined)}>Cancel</button></div></FormulaIntelligenceDialog> : null}
    {pending ? <FormulaIntelligenceDialog title="Confirm formula draft" onClose={() => setPending(undefined)}><p className="formula-intelligence-copy">{pending.label}</p><p className="formula-intelligence-copy">This creates one editable draft. It does not reserve or consume inventory.</p><div className="formula-intelligence-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void confirmSave()}><CheckCircle2 size={16} /> Confirm draft</button><button className="secondary-button" type="button" disabled={busy} onClick={() => setPending(undefined)}>Not now</button></div></FormulaIntelligenceDialog> : null}
  </div>
}

export function ReformulationOptimizerWorkspace({ apiBaseUrl, requestApi, formulaRecords, materialRecords, capabilities, onFormulaSaved }: { apiBaseUrl: string; requestApi: ApiRequest; formulaRecords: Formula[]; materialRecords: Material[]; capabilities: FormulaIntelligenceCapabilities; onFormulaSaved: (formula: Formula) => void }) {
  const [formulaId, setFormulaId] = useState('')
  const [versions, setVersions] = useState<FormulaVersionResponse['versions']>([])
  const [version, setVersion] = useState('')
  const [intent, setIntent] = useState<FormulaOptimizerIntent>('COMBINED')
  const [lockedMaterialIds, setLockedMaterialIds] = useState<string[]>([])
  const [requireEligibleInventory, setRequireEligibleInventory] = useState(false)
  const [candidates, setCandidates] = useState<OptimizerCandidate[]>([])
  const [activeRunId, setActiveRunId] = usePersistedRunId('olfactoryops.formula-intelligence.optimizer-run')
  const [pending, setPending] = useState<PendingConfirmation>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const { detail: activeRun, connectionState, loadRun } = useAgentRunMonitor(apiBaseUrl, requestApi, activeRunId)
  const materialNames = useMemo(() => new Map(materialRecords.map((material) => [material.id, material.name])), [materialRecords])
  useEffect(() => { setFormulaId((current) => formulaRecords.some((formula) => formula.id === current) ? current : (formulaRecords[0]?.id ?? '')) }, [formulaRecords])
  useEffect(() => { if (!formulaId) { setVersions([]); setVersion(''); return } void requestApi<FormulaVersionResponse>(`/formulas/${encodeURIComponent(formulaId)}/versions`).then((data) => { setVersions(data.versions); setVersion((current) => data.versions.some((item) => item.version === current) ? current : (data.versions[0]?.version ?? '')) }).catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load immutable formula versions')) }, [formulaId, requestApi])
  useEffect(() => { if (!activeRun) return; const artifact = activeRun.artifacts.find((item) => item.type === 'optimizer_candidates')?.data as { candidates?: OptimizerCandidate[] } | undefined; if (artifact?.candidates) setCandidates(artifact.candidates); if (activeRun.confirmation?.status === 'PENDING') setPending({ runId: activeRun.run.id, confirmationId: activeRun.confirmation.id, label: activeRun.confirmation.summary }); if (activeRun.run.status === 'FAILED') setNotice(activeRun.run.error_summary ?? 'Optimization failed') }, [activeRun])

  async function startOptimizer() { if (!formulaId || !version || !capabilities.canRunOptimizer) return; const scope = `optimizer:${formulaId}:${version}:${intent}:${lockedMaterialIds.sort().join(',')}:${requireEligibleInventory}`; setBusy(true); setNotice(undefined); setCandidates([]); try { const result = await requestApi<{ run: RunRow }>('/formula-intelligence/optimizer/runs', { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ baselineFormulaId: formulaId, baselineVersion: version, intent, lockedMaterialIds, requireEligibleInventory }) }); completeMutation(scope); setActiveRunId(result.run.id) } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to optimize formula') } finally { setBusy(false) } }
  async function cancelRun() { if (!activeRunId) return; const scope = `optimizer-cancel:${activeRunId}`; setBusy(true); try { await requestApi(`/agent/runs/${encodeURIComponent(activeRunId)}/cancel`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' }); completeMutation(scope); await loadRun(activeRunId) } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to cancel optimization') } finally { setBusy(false) } }
  async function requestSave(candidate: OptimizerCandidate) { if (!activeRunId || !capabilities.canSaveDraft) return; const scope = `optimizer-save:${activeRunId}:${candidate.candidateId}`; setBusy(true); setNotice(undefined); try { const data = await requestApi<{ confirmationId: string }>(`/formula-intelligence/optimizer/runs/${encodeURIComponent(activeRunId)}/candidates/${encodeURIComponent(candidate.candidateId)}/save`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' }); completeMutation(scope); setPending({ runId: activeRunId, confirmationId: data.confirmationId, label: candidate.title }) } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to prepare candidate draft') } finally { setBusy(false) } }
  async function confirmSave() { if (!pending) return; const scope = `optimizer-confirm:${pending.runId}:${pending.confirmationId}`; setBusy(true); setNotice(undefined); try { const result = await requestApi<{ formula?: Formula }>(`/agent/runs/${encodeURIComponent(pending.runId)}/confirmations/${encodeURIComponent(pending.confirmationId)}`, { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ decision: 'accept' }) }); completeMutation(scope); if (result.formula) onFormulaSaved(result.formula); setPending(undefined); setNotice('Editable reformulation draft created. No inventory reservation or consumption was made.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save candidate draft') } finally { setBusy(false) } }

  const baseline = formulaRecords.find((formula) => formula.id === formulaId)
  const baselineLines = versions.find((item) => item.version === version)?.lines ?? baseline?.lines ?? []
  const baselineMaterials = baselineLines.filter((line) => line.materialId).map((line) => ({ id: line.materialId!, name: materialNames.get(line.materialId!) ?? line.label }))
  return <div className="domain-page formula-intelligence-page"><section className="panel glass formula-intelligence-hero"><div><span className="mono-small">Reformulation Optimizer</span><h2>Compliance, feasibility, and cost-aware alternatives</h2><p>Each candidate is measured against an immutable formula version. Evidence remains capability-scoped and unknown evidence is never ranked as favorable.</p></div><span className="status-chip blue"><SlidersHorizontal size={14} /> Deterministic mock mode</span></section><div className="formula-intelligence-grid optimizer-grid"><section className="panel glass formula-intelligence-brief"><div className="panel-title-row"><div><SlidersHorizontal size={18} /><h3>Optimization baseline</h3></div><span>Immutable version required</span></div><label>Formula<select value={formulaId} onChange={(event) => setFormulaId(event.target.value)}>{formulaRecords.map((formula) => <option value={formula.id} key={formula.id}>{formula.code} / {formula.name}</option>)}</select></label><label>Baseline version<select value={version} onChange={(event) => setVersion(event.target.value)}>{versions.map((item) => <option value={item.version} key={item.version}>{item.version} / {new Date(item.createdAt).toLocaleDateString()}</option>)}</select></label><label>Intent<select value={intent} onChange={(event) => setIntent(event.target.value as FormulaOptimizerIntent)}><option value="COMBINED">Combined optimization</option><option value="COMPLIANCE">Resolve compliance</option><option value="INVENTORY">Recover feasibility</option><option value="COST">Reduce cost</option></select></label><MaterialPicker label="Locked baseline materials" materials={baselineMaterials} selected={lockedMaterialIds} onChange={setLockedMaterialIds} /><label className="checkbox-row"><input type="checkbox" checked={requireEligibleInventory} disabled={!capabilities.canViewInventoryEvidence} onChange={(event) => setRequireEligibleInventory(event.target.checked)} /> Require eligible inventory evidence</label>{!capabilities.canViewInventoryEvidence ? <small>Inventory evidence is not available to your role.</small> : null}<button className="primary-button" data-testid="formula-optimizer-primary-action" type="button" disabled={busy || !capabilities.canRunOptimizer || !formulaId || !version} onClick={() => void startOptimizer()}><Play size={16} /> Run optimization</button>{!capabilities.canRunOptimizer ? <small>Optimization requires sensitive formula and materials access.</small> : null}{notice ? <div className="agent-notice"><AlertCircle size={15} /> {notice}</div> : null}<RunStatus detail={activeRun} connectionState={connectionState} busy={busy} onCancel={() => void cancelRun()} /></section><section className="formula-intelligence-projects">{candidates.length === 0 ? <section className="panel glass"><p className="empty-state">Run an optimization to compare structured candidates against the selected version.</p></section> : <section className="panel glass"><div className="panel-title-row"><div><FlaskConical size={18} /><h3>Ranked candidates</h3></div><span>{candidates.length} candidates</span></div><div className="formula-intelligence-direction-grid">{candidates.map((candidate) => <article className="formula-intelligence-direction" key={candidate.candidateId}><div><h4>{candidate.title}</h4><strong className="formula-intelligence-score">{candidate.score.toFixed(1)}</strong></div><div className="formula-intelligence-project-meta"><span className={`status-chip ${statusTone(candidate.complianceStatus)}`}>{candidate.complianceStatus}</span><span>Availability: {candidate.availability === 'UNKNOWN' ? 'Not evaluated' : candidate.availability}</span><span>Change: {candidate.compositionChangePercent.toFixed(2)}%</span>{candidate.costDelta === undefined || !capabilities.canViewCostEvidence ? <span>Cost: Not evaluated</span> : <span>Cost delta: {candidate.costDelta.toFixed(2)}</span>}</div>{capabilities.canViewSensitiveComposition ? <ProposalLines proposal={candidate.proposal} materialNames={materialNames} /> : null}<ul>{candidate.summary.map((line) => <li key={line}>{line}</li>)}</ul>{capabilities.canSaveDraft ? <button className="primary-button small" type="button" disabled={busy} onClick={() => void requestSave(candidate)}><Save size={14} /> Save accepted candidate</button> : null}</article>)}</div></section>}</section></div>{pending ? <FormulaIntelligenceDialog title="Confirm reformulation draft" onClose={() => setPending(undefined)}><p className="formula-intelligence-copy">{pending.label}</p><p className="formula-intelligence-copy">Confirmation creates one normal draft. Stock remains unchanged.</p><div className="formula-intelligence-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void confirmSave()}><CheckCircle2 size={16} /> Confirm draft</button><button className="secondary-button" type="button" disabled={busy} onClick={() => setPending(undefined)}>Not now</button></div></FormulaIntelligenceDialog> : null}</div>
}
