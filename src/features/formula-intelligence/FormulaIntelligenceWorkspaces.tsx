import { AlertCircle, CheckCircle2, ChevronRight, FlaskConical, MessageSquare, Play, Save, Share2, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createAgentEventReconciliation,
  reconcileAgentRuntimeEvent,
  type AgentFormulaProposal,
  type AgentRuntimeEvent,
  type FormulaOptimizerIntent,
} from '../../data/agentRuntime'
import type { Formula, Material, TrialComparableEvidence } from '../../data/northStar'
import { TrialEvidenceSummary } from '../trials/TrialEvidenceSummary'
import { WorkspaceDialog as AppWorkspaceDialog } from '../../ui/WorkspaceDialog'
import { AnimatedContent, AnimatedList, AnimatedListItem, MotionCardButton, Stepper, type StepperStep } from '../../ui/motion/MotionPrimitives'

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>

export type FormulaIntelligenceCapabilities = {
  canCreateBrief: boolean
  canReviewBrief: boolean
  canGenerateDirections: boolean
  canRunOptimizer: boolean
  canViewSensitiveComposition: boolean
  canViewCostEvidence: boolean
  canViewInventoryEvidence: boolean
  canViewMaterialEvidence: boolean
  canSaveDraft: boolean
  canPlanTrial: boolean
  canViewTrialEvidence: boolean
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
  historicalEvidence?: {
    state: 'READY' | 'NOT_ENOUGH_EVIDENCE' | 'DISABLED' | 'NOT_EVALUATED'
    profileVersion?: number
    evidenceCount: number
    adjustment: number
    explanation: string
  }
  status: string
  sharedAt?: string | null
  savedFormulaId?: string | null
  trialId?: string | null
  runId?: string
  proposal?: AgentFormulaProposal
  evaluation?: {
    rank: number
    composition: { state: 'VALID'; totalPercentage: number }
    constraints: { state: 'PASS' | 'REVIEW_REQUIRED' | 'BLOCKED'; requiredMaterialsSatisfied: boolean }
    availability: 'AVAILABLE' | 'MIXED' | 'UNKNOWN'
    cost: { state: 'EVALUATED' | 'NOT_EVALUATED'; totalCost?: number }
  }
  shares?: Array<{ recipientUserId: string; allowMaterialNames: boolean; sharedAt: string }>
}

type ShareRecipient = { userId: string; name: string; email: string }
type Feedback = { id: string; directionId: string; userId: string; rating?: number | null; comment: string; selected: boolean; createdAt: string }
type DesignMaterialCatalog = { materials: Material[]; reviewedOnly: true }
type DesignMaterialCatalogState = 'loading' | 'ready' | 'unavailable'
type BriefVersion = {
  id: string
  versionNumber: number
  state: 'RAW' | 'REVIEW_REQUIRED' | 'REVIEWED' | 'LEGACY_UNSTRUCTURED'
  schemaVersion: number
  rawBrief: string
  structuredBrief?: {
    schemaVersion: 1
    product: { productType?: string; formulaType?: 'ACCORD' | 'FINE_FRAGRANCE'; format?: string; concentrationLabel?: string; targetConcentrationPercent?: number; targetGrams?: number }
    creative: { families: string[]; descriptors: string[]; emotionalIntent?: string; references: string[]; desiredNotes: string[]; avoidedNotes: string[]; specialEffects: string[] }
    performance: { diffusion?: string; targetLongevityHours?: number; opening?: string; drydown?: string }
    audience: { target?: string; positioning?: string; occasion?: string; markets: string[] }
    constraints: { workspaceMaterialsOnly: boolean; reviewedMaterialsOnly: boolean; ifraCategory?: string; targetMarkets: string[]; inventoryPreference: 'IGNORE' | 'PREFER_AVAILABLE' | 'AVAILABLE_ONLY'; prohibitedMaterialIds: string[]; requiredMaterialIds: string[]; prohibitedDescriptors: string[] }
    unresolvedQuestions: Array<{ field: string; reason: string; importance: 'LOW' | 'MEDIUM' | 'HIGH' }>
  }
  unresolvedQuestions: Array<{ field: string; reason: string; importance: 'LOW' | 'MEDIUM' | 'HIGH' }>
  compilerMode: 'MANUAL' | 'NOT_CONFIGURED' | 'LEGACY'
  checksum: string
  createdAt: string
}
type DesignProject = {
  id: string
  name: string
  status: string
  createdByUserId: string
  selectedDirectionId?: string | null
  brief?: {
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
  currentBriefVersionId?: string | null
  briefVersion?: BriefVersion
  briefStatus: BriefVersion['state']
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
  pareto?: {
    state: 'PARETO' | 'DOMINATED' | 'NOT_EVALUATED'
    tradeoff: string
  }
}

type RunDetail = {
  run: RunRow
  nodes?: Array<{ id: string; node_type: string; status: string; attempt: number }>
  artifacts: Array<{ id: string; type: string; data: unknown }>
  confirmation?: { id: string; status: string; summary: string }
}

type EvidenceCitation = {
  citationId: string
  sourceKind: 'material' | 'document'
  title: string
  version: string
  page?: number
  section?: string
  excerpt: string
  score: number
}

type EvidenceArtifact = { state: 'READY' | 'NOT_INDEXED' | 'NOT_CONFIGURED' | 'NOT_EVALUATED'; citations: EvidenceCitation[] }

type FormulaVersionResponse = { formula: Formula; versions: Array<{ version: string; createdAt: string; lines: Formula['lines'] }> }
type FormulaTrialEvidenceResponse = { formulaId: string; formulaVersion: string; evidence: TrialComparableEvidence; invariant: string }
type PendingConfirmation = { runId: string; confirmationId: string; label: string }
type ConnectionState = 'idle' | 'restoring' | 'live' | 'reconnecting' | 'restored'

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

type BriefReviewDraft = {
  productType: string; formulaType: string; format: string; concentrationLabel: string; concentration: string; targetGrams: string
  descriptors: string; desiredNotes: string; avoidedNotes: string; emotionalIntent: string; diffusion: string; longevity: string
  ifraCategory: string; markets: string; inventoryPreference: 'IGNORE' | 'PREFER_AVAILABLE' | 'AVAILABLE_ONLY'
  workspaceMaterialsOnly: boolean; reviewedMaterialsOnly: boolean; lockedMaterialIds: string[]
}

function emptyBriefReviewDraft(): BriefReviewDraft {
  return {
    productType: '', formulaType: '', format: '', concentrationLabel: '', concentration: '', targetGrams: '',
    descriptors: '', desiredNotes: '', avoidedNotes: '', emotionalIntent: '', diffusion: '', longevity: '',
    ifraCategory: '', markets: '', inventoryPreference: 'PREFER_AVAILABLE', workspaceMaterialsOnly: true, reviewedMaterialsOnly: true, lockedMaterialIds: [],
  }
}

function reviewDraftFromVersion(version?: BriefVersion): BriefReviewDraft {
  const structured = version?.structuredBrief
  if (!structured) return emptyBriefReviewDraft()
  return {
    productType: structured.product.productType ?? '', formulaType: structured.product.formulaType ?? '', format: structured.product.format ?? '',
    concentrationLabel: structured.product.concentrationLabel ?? '', concentration: structured.product.targetConcentrationPercent?.toString() ?? '', targetGrams: structured.product.targetGrams?.toString() ?? '',
    descriptors: structured.creative.descriptors.join(', '), desiredNotes: structured.creative.desiredNotes.join(', '), avoidedNotes: structured.creative.avoidedNotes.join(', '),
    emotionalIntent: structured.creative.emotionalIntent ?? '', diffusion: structured.performance.diffusion ?? '', longevity: structured.performance.targetLongevityHours?.toString() ?? '',
    ifraCategory: structured.constraints.ifraCategory ?? '', markets: structured.constraints.targetMarkets.join(', '),
    inventoryPreference: structured.constraints.inventoryPreference, workspaceMaterialsOnly: structured.constraints.workspaceMaterialsOnly,
    reviewedMaterialsOnly: structured.constraints.reviewedMaterialsOnly, lockedMaterialIds: structured.constraints.requiredMaterialIds,
  }
}

function statusTone(status: string) {
  if (status === 'PASS' || status === 'AVAILABLE' || status === 'SAVED' || status === 'COMPLETED') return 'green'
  if (status === 'BLOCKED' || status === 'UNAVAILABLE' || status === 'FAILED' || status === 'CANCELLED') return 'red'
  return 'amber'
}

function formulaIntelligenceError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('FORMULA_INTELLIGENCE_PROJECT_ALREADY_GENERATED')) {
    return 'This brief already has directions. Select one to review, share, or save a new brief to explore another route.'
  }
  if (message.includes('FORMULA_INTELLIGENCE_REVIEWED_BRIEF_REQUIRED')) {
    return 'Complete the structured brief review before creating directions.'
  }
  if (message.includes('FORMULA_INTELLIGENCE_FEATURE_DISABLED')) {
    return 'Formula Intelligence is currently paused for this workspace.'
  }
  if (message.includes('FORMULA_INTELLIGENCE_QUOTA')) {
    return 'This research workspace has reached its current run limit. Please wait before starting another run.'
  }
  if (/^[A-Z0-9_]+$/.test(message)) return fallback
  return message || fallback
}

function directionDecisionLabel(direction: Direction) {
  if (direction.complianceStatus === 'PASS') return 'Ready to review'
  if (direction.complianceStatus === 'BLOCKED') return 'Not available'
  if (direction.complianceStatus === 'INSUFFICIENT_DATA') return 'Evidence needed'
  return 'Needs material review'
}

function projectProgress(project: DesignProject): StepperStep[] {
  const hasReviewedBrief = project.briefStatus === 'REVIEWED' || project.briefStatus === 'LEGACY_UNSTRUCTURED'
  const hasDirections = project.directions.length > 0
  const hasDraft = project.directions.some((direction) => Boolean(direction.savedFormulaId))
  return [
    { id: 'brief', label: 'Brief', status: hasReviewedBrief ? 'complete' : 'active' },
    { id: 'directions', label: 'Directions', status: hasDraft || hasDirections ? 'complete' : hasReviewedBrief ? 'active' : 'upcoming' },
    { id: 'draft', label: 'Draft', status: hasDraft ? 'complete' : hasDirections ? 'active' : 'upcoming' },
  ]
}

function projectStageLabel(project: DesignProject) {
  if (project.directions.length > 0) return 'Directions ready'
  if (project.briefStatus === 'REVIEW_REQUIRED') return 'Brief needs review'
  if (project.briefStatus === 'REVIEWED' || project.briefStatus === 'LEGACY_UNSTRUCTURED') return 'Ready to explore'
  return 'Brief saved'
}

function noticeTone(message: string) {
  if (/already has directions|saved|available|planned|created/i.test(message)) return 'success'
  if (/unable|stopped|failed|not available|paused|reached/i.test(message)) return 'error'
  return 'info'
}

function FormulaIntelligenceNotice({ message }: { message: string }) {
  return <div className={`formula-intelligence-notice is-${noticeTone(message)}`} role="status"><AlertCircle size={15} /> <span>{message}</span></div>
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
  const reconciliation = useRef<ReturnType<typeof createAgentEventReconciliation> | undefined>(undefined)
  const refreshDetail = useCallback(async (runId: string) => {
    const next = await requestApi<RunDetail>(`/agent/runs/${encodeURIComponent(runId)}`)
    setDetail(next)
    return next
  }, [requestApi])
  const loadRun = useCallback(async (runId: string) => {
    const [next, events] = await Promise.all([
      requestApi<RunDetail>(`/agent/runs/${encodeURIComponent(runId)}`),
      requestApi<AgentRuntimeEvent[]>(`/agent/runs/${encodeURIComponent(runId)}/events?afterSequence=0`),
    ])
    let restored = createAgentEventReconciliation(runId)
    for (const event of events.sort((left, right) => left.sequence - right.sequence)) {
      const result = reconcileAgentRuntimeEvent(restored, event)
      restored = result.state
      if (result.disposition === 'resync_required') break
    }
    reconciliation.current = restored
    setDetail(next)
    return next
  }, [requestApi])

  useEffect(() => {
    eventSource.current?.close()
    eventSource.current = null
    if (!activeRunId) {
      setDetail(undefined)
      setConnectionState('idle')
      return
    }
    let disposed = false
    let terminal = false
    let refreshTimer: number | undefined
    const refresh = async () => {
      const next = await refreshDetail(activeRunId)
      terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(next.run.status)
      if (terminal && !disposed) setConnectionState('restored')
      return next
    }
    const scheduleRefresh = (delay = 160) => {
      if (refreshTimer !== undefined) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        void refresh().then((next) => {
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(next.run.status)) eventSource.current?.close()
        }).catch(() => { if (!disposed) setConnectionState('reconnecting') })
      }, delay)
    }
    const connect = async () => {
      if (!disposed) setConnectionState('restoring')
      try {
        const restored = await loadRun(activeRunId)
        terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(restored.run.status)
        if (terminal && !disposed) {
          setConnectionState('restored')
          return
        }
        if (disposed || terminal) return
        const afterSequence = reconciliation.current?.snapshot.lastSequence ?? 0
        const source = new EventSource(`${apiBaseUrl}/agent/runs/${encodeURIComponent(activeRunId)}/stream?afterSequence=${afterSequence}`, { withCredentials: true })
        eventSource.current = source
        source.onopen = () => { if (!terminal && !disposed) setConnectionState('live') }
        const receive = (message: MessageEvent) => {
          try {
            const event = JSON.parse(message.data) as AgentRuntimeEvent
            const current = reconciliation.current?.snapshot.runId === event.runId
              ? reconciliation.current
              : createAgentEventReconciliation(event.runId)
            const result = reconcileAgentRuntimeEvent(current, event)
            reconciliation.current = result.state
            if (result.disposition === 'resync_required') {
              source.close()
              if (!disposed) void connect()
              return
            }
            if (result.disposition === 'applied') {
              const isTerminal = ['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)
              scheduleRefresh(isTerminal ? 0 : 160)
            }
          } catch {
            // Unknown future events are intentionally ignored; persisted replay remains authoritative.
          }
        }
        source.onmessage = receive
        ;[
          'run.created', 'run.queued', 'run.started', 'run.paused', 'run.resumed', 'run.cancelled', 'run.completed', 'run.failed',
          'message.started', 'message.delta', 'message.completed',
          'node.queued', 'node.started', 'node.progress', 'node.completed', 'node.failed', 'node.retrying',
          'tool.requested', 'tool.started', 'tool.completed', 'tool.failed',
          'confirmation.requested', 'confirmation.accepted', 'confirmation.rejected', 'artifact.created', 'artifact.updated',
          'job.queued', 'job.leased', 'job.retrying', 'job.completed', 'job.cancelled', 'connection.snapshot', 'connection.resync_required',
        ].forEach((type) => source.addEventListener(type, receive))
        source.onerror = () => { if (!terminal && !disposed) setConnectionState('reconnecting') }
      } catch {
        if (!disposed) setConnectionState('reconnecting')
      }
    }
    void connect()
    return () => {
      disposed = true
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      eventSource.current?.close()
    }
  }, [activeRunId, apiBaseUrl, loadRun, refreshDetail])

  return { detail, connectionState, loadRun }
}

function ProposalLines({ proposal, materialNames }: { proposal: AgentFormulaProposal; materialNames: Map<string, string> }) {
  return <div className="formula-intelligence-lines">{proposal.ingredients.map((line) => <div key={line.materialId}><span>{materialNames.get(line.materialId) ?? 'Restricted material'}</span><strong>{line.percentage.toFixed(2)}%</strong></div>)}</div>
}

function evidenceFromRun(detail?: RunDetail) {
  const artifact = detail?.artifacts.find((item) => item.type === 'evidence_citations')?.data as EvidenceArtifact | undefined
  return artifact?.citations ? artifact : undefined
}

function EvidenceCitations({ evidence }: { evidence?: EvidenceArtifact }) {
  if (!evidence) return null
  if (evidence.state !== 'READY' || evidence.citations.length === 0) {
    const label = evidence.state === 'NOT_CONFIGURED' ? 'Evidence retrieval is not configured.' : evidence.state === 'NOT_EVALUATED' ? 'Evidence is not available to this role.' : 'No approved evidence matched this research.'
    return <section className="formula-intelligence-evidence"><span>Evidence</span><small>{label}</small></section>
  }
  return <section className="formula-intelligence-evidence formula-intelligence-citations"><span>Evidence</span>{evidence.citations.map((citation) => <article key={citation.citationId}><strong>{citation.title}</strong><small>{citation.sourceKind === 'document' ? 'Reviewed document' : 'Material profile'} / {citation.version}{citation.page ? ` / p. ${citation.page}` : ''}{citation.section ? ` / ${citation.section}` : ''}</small><p>{citation.excerpt}</p></article>)}</section>
}

function MaterialPicker({ label, materials, selected, onChange, disabled = false, emptyMessage = 'No materials are available.' }: { label: string; materials: Array<{ id: string; name: string }>; selected: string[]; onChange: (value: string[]) => void; disabled?: boolean; emptyMessage?: string }) {
  const [filter, setFilter] = useState('')
  const visible = materials.filter((material) => material.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const selectedMaterials = materials.filter((material) => selected.includes(material.id))
  const toggle = (id: string) => {
    if (!disabled) onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])
  }
  return <div className="formula-intelligence-picker"><label>{label}<input value={filter} disabled={disabled} onChange={(event) => setFilter(event.target.value)} placeholder="Search reviewed materials" /></label>{selectedMaterials.length ? <div className="formula-intelligence-picker-chips">{selectedMaterials.map((material) => <button type="button" key={material.id} disabled={disabled} onClick={() => toggle(material.id)}>{material.name}<X size={13} /></button>)}</div> : <small>{emptyMessage}</small>}<div className="formula-intelligence-picker-list">{visible.length ? visible.slice(0, 16).map((material) => <label key={material.id}><input type="checkbox" disabled={disabled} checked={selected.includes(material.id)} onChange={() => toggle(material.id)} /> <span>{material.name}</span></label>) : <small>{emptyMessage}</small>}</div></div>
}

function FormulaIntelligenceDialog({ title, description, children, footer, onClose, className = '' }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void; className?: string }) {
  return (
    <AppWorkspaceDialog open title={title} description={description} onClose={onClose} footer={footer} className={`formula-intelligence-modal ${className}`.trim()}>
      {children}
    </AppWorkspaceDialog>
  )
}

function RunStatus({ detail, connectionState, busy, onCancel }: { detail?: RunDetail; connectionState: ConnectionState; busy: boolean; onCancel: () => void }) {
  if (!detail) return null
  const nodes = detail.nodes ?? []
  const isFinished = detail.run.status === 'COMPLETED' || detail.run.status === 'WAITING_FOR_CONFIRMATION'
  const isBlocked = detail.run.status === 'FAILED' || detail.run.status === 'CANCELLED' || nodes.some((node) => node.status === 'FAILED')
  const isExploring = !isFinished && !isBlocked && (detail.run.status === 'RUNNING' || detail.run.status === 'QUEUED' || nodes.length > 0)
  const steps: StepperStep[] = [
    { id: 'brief', label: 'Brief understood', status: nodes.length > 0 || isFinished || isBlocked ? 'complete' : 'active' },
    { id: 'materials', label: 'Materials explored', status: isFinished ? 'complete' : isBlocked ? 'blocked' : isExploring ? 'active' : 'upcoming' },
    { id: 'direction', label: 'Directions ready', status: isFinished ? 'complete' : isBlocked ? 'blocked' : 'upcoming' },
  ]
  const statusCopy = detail.run.status === 'WAITING_FOR_CONFIRMATION'
    ? 'A draft is ready for your confirmation.'
    : detail.run.status === 'COMPLETED'
      ? 'Directions are ready to review.'
      : detail.run.status === 'FAILED'
        ? 'Generation stopped. You can retry this brief.'
        : detail.run.status === 'CANCELLED'
          ? 'Research was cancelled before directions were created.'
          : connectionState === 'reconnecting'
            ? 'Reconnecting to the latest research progress.'
            : connectionState === 'restoring'
              ? 'Loading saved research progress.'
              : 'Research is exploring the approved material set.'
  return <AnimatedContent><section className="formula-intelligence-run-status" data-testid="formula-intelligence-run-status" aria-live="polite"><div className="formula-intelligence-run-heading"><div><span className="formula-intelligence-eyebrow">Research progress</span><strong>{statusCopy}</strong></div><span className={`formula-intelligence-run-percent ${isBlocked ? 'is-blocked' : ''}`}>{Math.round(detail.run.progress)}%</span></div><div className="agent-progress"><span style={{ width: `${detail.run.progress}%` }} /></div><Stepper steps={steps} label="Direction research progress" />{detail.run.status === 'RUNNING' || detail.run.status === 'QUEUED' ? <button className="ghost-button small" type="button" disabled={busy} onClick={onCancel}>Cancel research</button> : null}</section></AnimatedContent>
}

function DirectionDetail({
  direction,
  project,
  capabilities,
  materialNames,
  feedback,
  feedbackDraft,
  evidence,
  busy,
  onShare,
  onSave,
  onPlanTrial,
  onFeedbackDraftChange,
  onSubmitFeedback,
}: {
  direction: Direction
  project: DesignProject
  capabilities: FormulaIntelligenceCapabilities
  materialNames: Map<string, string>
  feedback: Feedback[]
  feedbackDraft: { comment: string; rating: number }
  evidence?: EvidenceArtifact
  busy: boolean
  onShare: () => void
  onSave: () => void
  onPlanTrial: () => void
  onFeedbackDraftChange: (draft: { comment: string; rating: number }) => void
  onSubmitFeedback: (selected?: boolean) => void
}) {
  const availability = direction.availability === 'UNKNOWN' ? 'Not evaluated' : direction.availability.toLowerCase()
  const evaluation = direction.evaluation
  return <aside className="panel glass formula-intelligence-detail" aria-label={`${direction.title} detail`}>
    <div className="formula-intelligence-detail-heading">
      <div><span className="formula-intelligence-eyebrow">Direction review</span><h3>{direction.title}</h3></div>
      <span className={`formula-intelligence-decision-status is-${statusTone(direction.complianceStatus)}`}>{directionDecisionLabel(direction)}</span>
    </div>
    <p className="formula-intelligence-narrative">{direction.narrative}</p>
    <div className="formula-intelligence-decision-grid"><div><span>Creative pyramid</span><strong>{direction.pyramidSummary}</strong></div><div><span>Material availability</span><strong>{availability}</strong></div></div>
    {direction.historicalEvidence ? <section className="formula-intelligence-evidence"><span>Private trial evidence</span><p className="formula-intelligence-copy">{direction.historicalEvidence.explanation}</p><small>{direction.historicalEvidence.state === 'READY' ? `${direction.historicalEvidence.evidenceCount} completed scorecards, profile v${direction.historicalEvidence.profileVersion ?? 1}, bounded adjustment ${direction.historicalEvidence.adjustment > 0 ? '+' : ''}${direction.historicalEvidence.adjustment}.` : direction.historicalEvidence.state === 'NOT_ENOUGH_EVIDENCE' ? 'Not enough completed scorecards for a ranking adjustment.' : direction.historicalEvidence.state === 'DISABLED' ? 'Learning is disabled for this workspace.' : 'Evidence is not available to your role.'}</small></section> : null}
    {evaluation ? <section className="formula-intelligence-evidence"><span>Candidate evaluation</span><div className="formula-intelligence-decision-grid"><div><span>Priority</span><strong>#{evaluation.rank} of 3</strong></div><div><span>Composition</span><strong>{evaluation.composition.totalPercentage.toFixed(2)}% verified</strong></div><div><span>Constraints</span><strong>{evaluation.constraints.state.replaceAll('_', ' ').toLowerCase()}</strong></div><div><span>Cost</span><strong>{!capabilities.canViewCostEvidence || evaluation.cost.state === 'NOT_EVALUATED' ? 'Not evaluated' : evaluation.cost.totalCost?.toFixed(2) ?? 'Not evaluated'}</strong></div></div></section> : null}
    {direction.warnings.length ? <div className="formula-intelligence-action-note"><strong>Review before moving forward</strong><ul>{direction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
    {capabilities.canViewSensitiveComposition && direction.proposal ? <section className="formula-intelligence-evidence"><span>Private composition</span><ProposalLines proposal={direction.proposal} materialNames={materialNames} /></section> : null}
    {capabilities.canViewMaterialEvidence ? <EvidenceCitations evidence={evidence} /> : null}
    {capabilities.canSaveDraft ? <>
      <div className="formula-intelligence-actions">
        <button className="secondary-button small" type="button" disabled={busy} onClick={onShare}><Share2 size={14} /> {direction.shares?.length ? `Sharing (${direction.shares.length})` : 'Share for review'}</button>
        <button className="primary-button small" type="button" disabled={busy || Boolean(direction.savedFormulaId) || !direction.proposal} onClick={onSave}><Save size={14} /> {direction.savedFormulaId ? 'Draft saved' : 'Save as draft'}</button>
        {capabilities.canPlanTrial && direction.savedFormulaId ? <button className="secondary-button small" type="button" disabled={busy || Boolean(direction.trialId)} onClick={onPlanTrial}><FlaskConical size={14} /> {direction.trialId ? 'Trial planned' : 'Plan trial'}</button> : null}
      </div>
      {direction.savedFormulaId && !direction.trialId ? <small className="formula-intelligence-action-hint">An approved immutable formula version is required before this draft can be planned as a trial.</small> : null}
    </> : <section className="formula-intelligence-feedback"><label>Rating<select value={feedbackDraft.rating} onChange={(event) => onFeedbackDraftChange({ ...feedbackDraft, rating: Number(event.target.value) })}><option value="0">Optional</option>{[1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating}</option>)}</select></label><textarea value={feedbackDraft.comment} maxLength={1200} placeholder="Feedback for the perfumer" onChange={(event) => onFeedbackDraftChange({ ...feedbackDraft, comment: event.target.value })} /><div className="formula-intelligence-actions"><button className="secondary-button small" type="button" disabled={busy} onClick={() => onSubmitFeedback()}><MessageSquare size={14} /> Send feedback</button><button className="primary-button small" type="button" disabled={busy} onClick={() => onSubmitFeedback(true)}><CheckCircle2 size={14} /> Select direction</button></div></section>}
    {feedback.length ? <small className="formula-intelligence-feedback-count">{feedback.length} feedback item{feedback.length === 1 ? '' : 's'}</small> : null}
    {project.selectedDirectionId === direction.directionId ? <small className="formula-intelligence-selected">Selected for the project</small> : null}
  </aside>
}

function DesignProjectCard({
  project,
  capabilities,
  materialCatalogState,
  hasEligibleMaterials,
  selectedDirectionId,
  busy,
  onReview,
  onGenerate,
  onSelectDirection,
}: {
  project: DesignProject
  capabilities: FormulaIntelligenceCapabilities
  materialCatalogState: DesignMaterialCatalogState
  hasEligibleMaterials: boolean
  selectedDirectionId?: string
  busy: boolean
  onReview: () => void
  onGenerate: () => void
  onSelectDirection: (directionId: string) => void
}) {
  const hasDirections = project.directions.length > 0
  const brief = project.brief?.creativeBrief ?? project.briefVersion?.rawBrief ?? 'Brief details are available to the project owner.'
  const canGenerate = capabilities.canGenerateDirections
    && project.status === 'BRIEFED'
    && (project.briefStatus === 'REVIEWED' || project.briefStatus === 'LEGACY_UNSTRUCTURED')
    && !hasDirections
  const materialSourceReady = materialCatalogState === 'ready' && hasEligibleMaterials

  return <section className="panel glass formula-intelligence-project design-project-card">
    <header className="design-project-card-heading">
      <div>
        <span className="formula-intelligence-eyebrow">Creative brief</span>
        <h3>{project.name}</h3>
        <p className="formula-intelligence-copy">{brief}</p>
      </div>
      <span className={`formula-intelligence-project-stage is-${statusTone(project.briefStatus)}`}>{projectStageLabel(project)}</span>
    </header>
    <div className="formula-intelligence-project-meta design-project-card-meta">
      <span>{project.brief?.formulaType === 'ACCORD' ? 'Accord' : project.brief ? 'Fine fragrance' : 'Research brief'}</span>
      <span>{project.brief?.ifraCategory ? `IFRA ${project.brief.ifraCategory}` : 'Constraints pending'}</span>
      <span>{project.brief?.targetGrams ? `${project.brief.targetGrams}g target` : 'No batch target'}</span>
    </div>
    <Stepper steps={projectProgress(project)} label={`${project.name} progress`} />
    <div className="design-project-card-actions">
      {capabilities.canReviewBrief && project.status === 'BRIEFED' ? <button className="secondary-button small" type="button" disabled={busy} onClick={onReview}><SlidersHorizontal size={15} /> Review brief</button> : null}
      {canGenerate ? <button className="primary-button small" type="button" disabled={busy || !materialSourceReady} onClick={onGenerate}><Play size={15} /> Create directions</button> : null}
      {project.briefStatus === 'REVIEW_REQUIRED' ? <small>Resolve the brief details before directions can be created.</small> : null}
      {canGenerate && materialCatalogState === 'loading' ? <small>Loading reviewed Materials.</small> : null}
      {canGenerate && materialCatalogState === 'unavailable' ? <small>Reviewed Materials are unavailable. Reopen the brief after Materials are restored.</small> : null}
      {canGenerate && materialCatalogState === 'ready' && !hasEligibleMaterials ? <small>Review and approve at least one Material before creating directions.</small> : null}
    </div>
    {hasDirections ? <div className="formula-intelligence-direction-grid design-direction-list">
      {project.directions.map((direction, index) => <MotionCardButton
        type="button"
        className={`formula-intelligence-direction formula-intelligence-direction-choice ${selectedDirectionId === direction.directionId ? 'is-selected' : ''}`}
        key={direction.directionId}
        aria-pressed={selectedDirectionId === direction.directionId}
        onClick={() => onSelectDirection(direction.directionId)}
      >
        <span className="design-direction-card-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="design-direction-card-copy">
          <strong>{direction.title}</strong>
          <small>{directionDecisionLabel(direction)}</small>
          <span className="design-direction-card-narrative">{direction.narrative}</span>
          <span className="design-direction-card-pyramid">{direction.pyramidSummary}</span>
        </span>
        <ChevronRight className="design-direction-card-arrow" size={18} aria-hidden="true" />
      </MotionCardButton>)}
    </div> : null}
  </section>
}

function StructuredBriefReviewDialog({
  project,
  draft,
  materials,
  materialCatalogState,
  busy,
  canReview,
  onDraftChange,
  onSave,
  onClose,
}: {
  project: DesignProject
  draft: BriefReviewDraft
  materials: Material[]
  materialCatalogState: DesignMaterialCatalogState
  busy: boolean
  canReview: boolean
  onDraftChange: (next: BriefReviewDraft) => void
  onSave: () => void
  onClose: () => void
}) {
  const rawBrief = project.briefVersion?.rawBrief ?? project.brief?.creativeBrief ?? 'No raw brief was saved for this project.'
  const footer = <div className="formula-intelligence-actions brief-review-footer-actions">
    <button className="primary-button" type="button" disabled={busy || !canReview} onClick={onSave}><CheckCircle2 size={16} /> Save reviewed brief</button>
    <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancel</button>
  </div>

  return <FormulaIntelligenceDialog title="Review structured brief" description="Set the product and material boundaries that guide direction creation." onClose={onClose} footer={footer} className="brief-review-dialog">
    <div className="structured-brief-review">
      <section className="brief-review-original">
        <span className="formula-intelligence-eyebrow">Original request</span>
        <p>{rawBrief}</p>
      </section>
      <section className="brief-review-section">
        <div className="brief-review-section-heading"><div><h3>Product setup</h3><p>Define what is being made and the intended concentration.</p></div></div>
        <div className="form-grid-two brief-review-grid">
          <label>Product type<select data-autofocus value={draft.productType} onChange={(event) => onDraftChange({ ...draft, productType: event.target.value })}><option value="">Select</option><option value="FINE_FRAGRANCE">Fine fragrance</option><option value="HOME_FRAGRANCE">Home fragrance</option><option value="PERSONAL_CARE">Personal care</option><option value="FUNCTIONAL">Functional</option><option value="OTHER">Other</option></select></label>
          <label>Formula type<select value={draft.formulaType} onChange={(event) => onDraftChange({ ...draft, formulaType: event.target.value })}><option value="">Select</option><option value="FINE_FRAGRANCE">Fine fragrance</option><option value="ACCORD">Accord</option></select></label>
          <label>Format<input value={draft.format} maxLength={160} placeholder="Spray, candle, soap" onChange={(event) => onDraftChange({ ...draft, format: event.target.value })} /></label>
          <label>Concentration<select value={draft.concentrationLabel} onChange={(event) => onDraftChange({ ...draft, concentrationLabel: event.target.value })}><option value="">Select</option><option value="PARFUM">Parfum</option><option value="EDP">EDP</option><option value="EDT">EDT</option><option value="EDC">EDC</option><option value="COLOGNE">Cologne</option><option value="OTHER">Other</option></select></label>
          <label>Final concentration %<input type="number" min="0.01" max="100" value={draft.concentration} onChange={(event) => onDraftChange({ ...draft, concentration: event.target.value })} /></label>
          <label>Target grams<input type="number" min="0.01" value={draft.targetGrams} onChange={(event) => onDraftChange({ ...draft, targetGrams: event.target.value })} /></label>
        </div>
      </section>
      <section className="brief-review-section">
        <div className="brief-review-section-heading"><div><h3>Creative direction</h3><p>Capture the signals a perfumer should preserve or avoid.</p></div></div>
        <div className="brief-review-fields">
          <label>Creative descriptors<input value={draft.descriptors} placeholder="Marine, citrus, amber" onChange={(event) => onDraftChange({ ...draft, descriptors: event.target.value })} /></label>
          <div className="form-grid-two brief-review-grid"><label>Desired notes<input value={draft.desiredNotes} placeholder="Bergamot, cedar" onChange={(event) => onDraftChange({ ...draft, desiredNotes: event.target.value })} /></label><label>Avoided notes<input value={draft.avoidedNotes} placeholder="Powdery" onChange={(event) => onDraftChange({ ...draft, avoidedNotes: event.target.value })} /></label></div>
          <label>Creative intent<textarea value={draft.emotionalIntent} maxLength={600} placeholder="Describe the emotional effect or context for the fragrance." onChange={(event) => onDraftChange({ ...draft, emotionalIntent: event.target.value })} /></label>
        </div>
      </section>
      <section className="brief-review-section">
        <div className="brief-review-section-heading"><div><h3>Market and material boundaries</h3><p>These constraints are checked before a direction can move forward.</p></div></div>
        <div className="form-grid-two brief-review-grid"><label>IFRA category<input value={draft.ifraCategory} maxLength={32} placeholder="4" onChange={(event) => onDraftChange({ ...draft, ifraCategory: event.target.value })} /></label><label>Markets<input value={draft.markets} placeholder="EU, US" onChange={(event) => onDraftChange({ ...draft, markets: event.target.value })} /></label><label>Inventory preference<select value={draft.inventoryPreference} onChange={(event) => onDraftChange({ ...draft, inventoryPreference: event.target.value as BriefReviewDraft['inventoryPreference'] })}><option value="PREFER_AVAILABLE">Prefer available</option><option value="AVAILABLE_ONLY">Available only</option><option value="IGNORE">Ignore availability</option></select></label><label>Diffusion<select value={draft.diffusion} onChange={(event) => onDraftChange({ ...draft, diffusion: event.target.value })}><option value="">Not specified</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label></div>
        <div className="brief-review-material-picker"><div className="brief-review-material-source"><strong>Material source</strong><p>{materialCatalogState === 'loading' ? 'Loading reviewed Materials from this workspace.' : materialCatalogState === 'unavailable' ? 'Reviewed Materials are unavailable right now. Save the brief and retry after Materials can be loaded.' : materials.length ? `${materials.length} reviewed Materials from this workspace are eligible. Inventory availability is checked when directions are created and never reserves stock.` : 'No reviewed Materials are ready. Complete material review in Materials before creating directions.'}</p></div><MaterialPicker label="Required materials" materials={materials} selected={draft.lockedMaterialIds} disabled={materialCatalogState !== 'ready'} emptyMessage={materialCatalogState === 'loading' ? 'Loading reviewed Materials...' : 'No reviewed Materials are available.'} onChange={(lockedMaterialIds) => onDraftChange({ ...draft, lockedMaterialIds })} /></div>
      </section>
      {project.briefVersion?.unresolvedQuestions.length ? <FormulaIntelligenceNotice message={project.briefVersion.unresolvedQuestions.map((question) => question.reason).join(' ')} /> : null}
    </div>
  </FormulaIntelligenceDialog>
}

export function FormulaDesignStudioWorkspace({ apiBaseUrl, requestApi, materialRecords, capabilities, onFormulaSaved, onTrialPlanned }: { apiBaseUrl: string; requestApi: ApiRequest; materialRecords: Material[]; capabilities: FormulaIntelligenceCapabilities; onFormulaSaved: (formula: Formula) => void; onTrialPlanned?: () => void }) {
  const [projects, setProjects] = useState<DesignProject[]>([])
  const [name, setName] = useState('New fragrance brief')
  const [creativeBrief, setCreativeBrief] = useState('')
  const [reviewProjectId, setReviewProjectId] = useState<string>()
  const [reviewDraft, setReviewDraft] = useState<BriefReviewDraft>(() => emptyBriefReviewDraft())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [pending, setPending] = useState<PendingConfirmation>()
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, { comment: string; rating: number }>>({})
  const [shareTarget, setShareTarget] = useState<{ projectId: string; direction: Direction }>()
  const [shareRecipients, setShareRecipients] = useState<ShareRecipient[]>([])
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([])
  const [allowMaterialNames, setAllowMaterialNames] = useState(false)
  const [selectedDirectionId, setSelectedDirectionId] = useState<string>()
  const [designMaterials, setDesignMaterials] = useState<Material[]>([])
  const [designMaterialCatalogState, setDesignMaterialCatalogState] = useState<DesignMaterialCatalogState>('loading')
  const [activeRunId, setActiveRunId] = usePersistedRunId('olfactoryops.formula-intelligence.design-run')
  const { detail: activeRun, connectionState, loadRun } = useAgentRunMonitor(apiBaseUrl, requestApi, activeRunId)
  const materialNames = useMemo(() => new Map([...materialRecords, ...designMaterials].map((material) => [material.id, material.name])), [designMaterials, materialRecords])
  const activeEvidence = useMemo(() => evidenceFromRun(activeRun), [activeRun])
  const selectedDirectionContext = useMemo(() => {
    for (const project of projects) {
      const direction = project.directions.find((item) => item.directionId === selectedDirectionId)
      if (direction) return { project, direction }
    }
    return undefined
  }, [projects, selectedDirectionId])
  const reviewProject = useMemo(() => projects.find((project) => project.id === reviewProjectId), [projects, reviewProjectId])

  const refresh = useCallback(async () => setProjects(await requestApi<DesignProject[]>('/formula-intelligence/design-projects')), [requestApi])
  useEffect(() => { void refresh().catch((error) => setNotice(formulaIntelligenceError(error, 'Unable to load saved briefs. Please refresh and try again.'))) }, [refresh])
  useEffect(() => {
    let active = true
    if (!capabilities.canGenerateDirections) {
      setDesignMaterials([])
      setDesignMaterialCatalogState('unavailable')
      return () => { active = false }
    }
    setDesignMaterialCatalogState('loading')
    void requestApi<DesignMaterialCatalog>('/formula-intelligence/materials')
      .then((catalog) => {
        if (!active) return
        setDesignMaterials(catalog.materials)
        setDesignMaterialCatalogState('ready')
      })
      .catch(() => {
        if (!active) return
        setDesignMaterials([])
        setDesignMaterialCatalogState('unavailable')
      })
    return () => { active = false }
  }, [capabilities.canGenerateDirections, requestApi])
  useEffect(() => {
    if (!activeRun) return
    if (activeRun.confirmation?.status === 'PENDING') setPending({ runId: activeRun.run.id, confirmationId: activeRun.confirmation.id, label: activeRun.confirmation.summary })
    if (activeRun.run.status === 'COMPLETED') void refresh()
    if (activeRun.run.status === 'FAILED') {
      setNotice('Direction generation stopped. The brief is ready to retry.')
      void refresh()
    }
  }, [activeRun, refresh])
  useEffect(() => {
    if (selectedDirectionContext) return
    const fallbackDirectionId = projects.flatMap((project) => project.directions)[0]?.directionId
    if (fallbackDirectionId !== selectedDirectionId) setSelectedDirectionId(fallbackDirectionId)
  }, [projects, selectedDirectionContext, selectedDirectionId])

  async function createProject() {
    if (!capabilities.canCreateBrief) return
    const scope = `design-project:${name}:${creativeBrief}`
    setBusy(true); setNotice(undefined)
    try {
      const payload = await requestApi<{ project: DesignProject }>('/formula-intelligence/design-projects', { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ name, rawBrief: creativeBrief }) })
      completeMutation(scope)
      await refresh()
      setReviewProjectId(payload.project.id)
      setReviewDraft(emptyBriefReviewDraft())
      setNotice('Raw brief saved. Complete the structured review before generating directions.')
    } catch (error) { setNotice(formulaIntelligenceError(error, 'Unable to save this research brief.')) } finally { setBusy(false) }
  }

  function openBriefReview(project: DesignProject) {
    setReviewProjectId(project.id)
    setReviewDraft(reviewDraftFromVersion(project.briefVersion))
  }

  async function saveBriefReview() {
    if (!reviewProject) return
    const scope = `design-brief-version:${reviewProject.id}:${JSON.stringify(reviewDraft)}`
    const concentration = Number(reviewDraft.concentration)
    const targetGrams = Number(reviewDraft.targetGrams)
    const longevity = Number(reviewDraft.longevity)
    setBusy(true); setNotice(undefined)
    try {
      const result = await requestApi<{ version: BriefVersion }>(`/formula-intelligence/design-projects/${encodeURIComponent(reviewProject.id)}/brief-versions`, {
        method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({
          schemaVersion: 1,
          product: {
            productType: reviewDraft.productType || undefined, formulaType: reviewDraft.formulaType || undefined, format: reviewDraft.format || undefined,
            concentrationLabel: reviewDraft.concentrationLabel || undefined, targetConcentrationPercent: Number.isFinite(concentration) && concentration > 0 ? concentration : undefined,
            targetGrams: Number.isFinite(targetGrams) && targetGrams > 0 ? targetGrams : undefined,
          },
          creative: { families: [], descriptors: csv(reviewDraft.descriptors), emotionalIntent: reviewDraft.emotionalIntent || undefined, references: [], desiredNotes: csv(reviewDraft.desiredNotes), avoidedNotes: csv(reviewDraft.avoidedNotes), specialEffects: [] },
          performance: { diffusion: reviewDraft.diffusion || undefined, targetLongevityHours: Number.isFinite(longevity) && longevity >= 0 ? longevity : undefined, opening: undefined, drydown: undefined },
          audience: { target: undefined, positioning: undefined, occasion: undefined, markets: csv(reviewDraft.markets) },
          constraints: { workspaceMaterialsOnly: true, reviewedMaterialsOnly: true, ifraCategory: reviewDraft.ifraCategory || undefined, targetMarkets: csv(reviewDraft.markets), inventoryPreference: reviewDraft.inventoryPreference, prohibitedMaterialIds: [], requiredMaterialIds: reviewDraft.lockedMaterialIds, prohibitedDescriptors: [] },
          unresolvedQuestions: [],
        }),
      })
      completeMutation(scope)
      await refresh()
      setReviewProjectId(undefined)
      setNotice(result.version.state === 'REVIEWED' ? 'Structured brief reviewed. Direction generation is now available.' : 'Structured brief saved with questions that still need review.')
    } catch (error) { setNotice(formulaIntelligenceError(error, 'Unable to save the structured brief review.')) } finally { setBusy(false) }
  }

  async function generate(projectId: string) {
    const scope = `design-generate:${projectId}`
    setBusy(true); setNotice(undefined)
    try {
      const result = await requestApi<{ run: RunRow }>(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/generate`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' })
      completeMutation(scope); setActiveRunId(result.run.id)
    } catch (error) {
      const message = formulaIntelligenceError(error, 'Unable to create directions from this brief.')
      if (message.startsWith('This brief already has directions')) await refresh()
      setNotice(message)
    } finally { setBusy(false) }
  }

  async function cancelRun() {
    if (!activeRunId) return
    const scope = `design-cancel:${activeRunId}`
    setBusy(true)
    try { await requestApi(`/agent/runs/${encodeURIComponent(activeRunId)}/cancel`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' }); completeMutation(scope); await loadRun(activeRunId) } catch (error) { setNotice(formulaIntelligenceError(error, 'Unable to cancel this research run.')) } finally { setBusy(false) }
  }

  async function openShare(projectId: string, direction: Direction) {
    setBusy(true); setNotice(undefined)
    try {
      const recipients = await requestApi<ShareRecipient[]>(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/recipients`)
      setShareRecipients(recipients)
      setSelectedRecipientIds(direction.shares?.map((share) => share.recipientUserId).filter((id) => recipients.some((recipient) => recipient.userId === id)) ?? [])
      setAllowMaterialNames(direction.shares?.some((share) => share.allowMaterialNames) ?? false)
      setShareTarget({ projectId, direction })
    } catch (error) { setNotice(formulaIntelligenceError(error, 'Unable to load eligible reviewers.')) } finally { setBusy(false) }
  }

  async function share() {
    if (!shareTarget || selectedRecipientIds.length === 0) return
    const scope = `design-share:${shareTarget.projectId}:${shareTarget.direction.directionId}:${selectedRecipientIds.sort().join(',')}:${allowMaterialNames}`
    setBusy(true); setNotice(undefined)
    try {
      await requestApi(`/formula-intelligence/design-projects/${encodeURIComponent(shareTarget.projectId)}/directions/${encodeURIComponent(shareTarget.direction.directionId)}/share`, { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ recipientUserIds: selectedRecipientIds, allowMaterialNames }) })
      completeMutation(scope); setShareTarget(undefined); await refresh()
    } catch (error) { setNotice(formulaIntelligenceError(error, 'Unable to update direction sharing.')) } finally { setBusy(false) }
  }

  async function revokeShare(projectId: string, directionId: string, recipientUserId: string) {
    const scope = `design-revoke:${projectId}:${directionId}:${recipientUserId}`
    setBusy(true); setNotice(undefined)
    try {
      await requestApi(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/directions/${encodeURIComponent(directionId)}/shares/${encodeURIComponent(recipientUserId)}/revoke`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' })
      completeMutation(scope); setSelectedRecipientIds((current) => current.filter((id) => id !== recipientUserId)); setShareTarget((current) => current ? { ...current, direction: { ...current.direction, shares: current.direction.shares?.filter((share) => share.recipientUserId !== recipientUserId) } } : current); await refresh()
    } catch (error) { setNotice(formulaIntelligenceError(error, 'Unable to revoke this direction share.')) } finally { setBusy(false) }
  }

  async function submitFeedback(projectId: string, directionId: string, selected = false) {
    const draft = feedbackDrafts[directionId] ?? { comment: '', rating: 0 }
    const scope = `design-feedback:${projectId}:${directionId}:${draft.comment}:${draft.rating}:${selected}`
    setBusy(true); setNotice(undefined)
    try { await requestApi(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/directions/${encodeURIComponent(directionId)}/feedback`, { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ comment: draft.comment, rating: draft.rating || undefined, selected }) }); completeMutation(scope); await refresh() } catch (error) { setNotice(formulaIntelligenceError(error, 'Unable to save feedback for this direction.')) } finally { setBusy(false) }
  }

  async function requestSave(projectId: string, direction: Direction) {
    if (!direction.runId || !capabilities.canSaveDraft) return
    const scope = `design-save:${projectId}:${direction.directionId}`
    setBusy(true); setNotice(undefined)
    try { const data = await requestApi<{ confirmationId: string }>(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/directions/${encodeURIComponent(direction.directionId)}/save`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' }); completeMutation(scope); setPending({ runId: direction.runId, confirmationId: data.confirmationId, label: direction.title }) } catch (error) { setNotice(formulaIntelligenceError(error, 'Unable to prepare this draft for confirmation.')) } finally { setBusy(false) }
  }

  async function planTrial(projectId: string, direction: Direction) {
    if (!direction.savedFormulaId || !capabilities.canPlanTrial) return
    const scope = `design-trial:${projectId}:${direction.directionId}`
    setBusy(true); setNotice(undefined)
    try {
      const result = await requestApi<{ trial: { id: string }; duplicate?: boolean }>(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/directions/${encodeURIComponent(direction.directionId)}/trial`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' })
      completeMutation(scope)
      await refresh()
      setNotice(result.duplicate ? 'This direction already has a planned trial.' : 'Trial planned. Release it only after the approved formula version and release gate are complete.')
      onTrialPlanned?.()
    } catch (error) { setNotice(formulaIntelligenceError(error, 'Unable to plan a trial for this direction.')) } finally { setBusy(false) }
  }

  async function confirmSave() {
    if (!pending) return
    const scope = `design-confirm:${pending.runId}:${pending.confirmationId}`
    setBusy(true); setNotice(undefined)
    try { const result = await requestApi<{ formula?: Formula }>(`/agent/runs/${encodeURIComponent(pending.runId)}/confirmations/${encodeURIComponent(pending.confirmationId)}`, { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ decision: 'accept' }) }); completeMutation(scope); if (result.formula) onFormulaSaved(result.formula); setPending(undefined); await refresh(); setNotice('Editable draft created. Inventory remains advisory and unchanged.') } catch (error) { setNotice(formulaIntelligenceError(error, 'Unable to save the formula draft.')) } finally { setBusy(false) }
  }

  return <div className="domain-page formula-intelligence-page">
    <AnimatedContent><section className="panel glass formula-intelligence-hero"><div><span className="formula-intelligence-eyebrow">Formula intelligence</span><h2>Turn a clear brief into a direction your team can judge</h2><p>Save the creative request, agree the constraints, then compare directions before taking one forward.</p></div><span className="formula-intelligence-hero-note"><Sparkles size={15} /> Guided research</span></section></AnimatedContent>
    <div className={`formula-intelligence-grid design-studio-grid ${selectedDirectionContext ? 'has-selected-direction' : ''}`}>
      <section className="panel glass formula-intelligence-brief design-studio-brief"><div className="panel-title-row"><div><FlaskConical size={18} /><h3>New research brief</h3></div></div><p className="formula-intelligence-copy">Start with the creative request. A perfumer reviews product constraints before directions are created.</p>
        <label>Project name<input value={name} maxLength={240} onChange={(event) => setName(event.target.value)} /></label><label>Creative request<textarea value={creativeBrief} maxLength={6000} placeholder="Describe the scent, audience, context, and what must be avoided." onChange={(event) => setCreativeBrief(event.target.value)} /></label>
        <button className="primary-button" data-testid="formula-design-primary-action" type="button" disabled={busy || !capabilities.canCreateBrief || name.trim().length < 2 || creativeBrief.trim().length < 8} onClick={() => void createProject()}><Play size={16} /> Save brief for review</button>{!capabilities.canReviewBrief && capabilities.canCreateBrief ? <small>A perfumer with formula edit access reviews the product constraints.</small> : null}{notice ? <FormulaIntelligenceNotice message={notice} /> : null}<RunStatus detail={activeRun} connectionState={connectionState} busy={busy} onCancel={() => void cancelRun()} />
      </section>
      <AnimatedList className="formula-intelligence-projects design-studio-projects">
        {projects.length === 0 ? <section className="panel glass"><p className="empty-state">Save a research brief to begin a clear, reviewable creative direction.</p></section> : projects.map((project) => <AnimatedListItem key={project.id}><DesignProjectCard project={project} capabilities={capabilities} materialCatalogState={designMaterialCatalogState} hasEligibleMaterials={designMaterials.length > 0} selectedDirectionId={selectedDirectionId} busy={busy} onReview={() => openBriefReview(project)} onGenerate={() => void generate(project.id)} onSelectDirection={setSelectedDirectionId} /></AnimatedListItem>)}
      </AnimatedList>
      {selectedDirectionContext ? <DirectionDetail direction={selectedDirectionContext.direction} project={selectedDirectionContext.project} capabilities={capabilities} materialNames={materialNames} feedback={selectedDirectionContext.project.feedback.filter((item) => item.directionId === selectedDirectionContext.direction.directionId)} feedbackDraft={feedbackDrafts[selectedDirectionContext.direction.directionId] ?? { comment: '', rating: 0 }} evidence={activeRun?.run.id === selectedDirectionContext.direction.runId ? activeEvidence : undefined} busy={busy} onShare={() => void openShare(selectedDirectionContext.project.id, selectedDirectionContext.direction)} onSave={() => void requestSave(selectedDirectionContext.project.id, selectedDirectionContext.direction)} onPlanTrial={() => void planTrial(selectedDirectionContext.project.id, selectedDirectionContext.direction)} onFeedbackDraftChange={(draft) => setFeedbackDrafts((current) => ({ ...current, [selectedDirectionContext.direction.directionId]: draft }))} onSubmitFeedback={(selected) => void submitFeedback(selectedDirectionContext.project.id, selectedDirectionContext.direction.directionId, selected)} /> : null}
    </div>
    {reviewProject ? <StructuredBriefReviewDialog project={reviewProject} draft={reviewDraft} materials={designMaterials} materialCatalogState={designMaterialCatalogState} busy={busy} canReview={capabilities.canReviewBrief} onDraftChange={setReviewDraft} onSave={() => void saveBriefReview()} onClose={() => setReviewProjectId(undefined)} /> : null}
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
  const [preservedMaterialIds, setPreservedMaterialIds] = useState<string[]>([])
  const [prohibitedMaterialIds, setProhibitedMaterialIds] = useState<string[]>([])
  const [requireEligibleInventory, setRequireEligibleInventory] = useState(false)
  const [maximizeInventoryCoverage, setMaximizeInventoryCoverage] = useState(true)
  const [minimizeNewPurchases, setMinimizeNewPurchases] = useState(true)
  const [maximizeEvidenceCoverage, setMaximizeEvidenceCoverage] = useState(true)
  const [targetCostReductionPercent, setTargetCostReductionPercent] = useState('')
  const [maxTotalCost, setMaxTotalCost] = useState('')
  const [candidates, setCandidates] = useState<OptimizerCandidate[]>([])
  const [activeRunId, setActiveRunId] = usePersistedRunId('olfactoryops.formula-intelligence.optimizer-run')
  const [pending, setPending] = useState<PendingConfirmation>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [trialEvidence, setTrialEvidence] = useState<TrialComparableEvidence | null>(null)
  const [trialEvidenceLoading, setTrialEvidenceLoading] = useState(false)
  const [trialEvidenceUnavailable, setTrialEvidenceUnavailable] = useState<string>()
  const { detail: activeRun, connectionState, loadRun } = useAgentRunMonitor(apiBaseUrl, requestApi, activeRunId)
  const materialNames = useMemo(() => new Map(materialRecords.map((material) => [material.id, material.name])), [materialRecords])
  const activeEvidence = useMemo(() => evidenceFromRun(activeRun), [activeRun])
  useEffect(() => { setFormulaId((current) => formulaRecords.some((formula) => formula.id === current) ? current : (formulaRecords[0]?.id ?? '')) }, [formulaRecords])
  useEffect(() => { if (!formulaId) { setVersions([]); setVersion(''); return } void requestApi<FormulaVersionResponse>(`/formulas/${encodeURIComponent(formulaId)}/versions`).then((data) => { setVersions(data.versions); setVersion((current) => data.versions.some((item) => item.version === current) ? current : (data.versions[0]?.version ?? '')) }).catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load immutable formula versions')) }, [formulaId, requestApi])
  useEffect(() => {
    if (!formulaId || !version || !capabilities.canViewTrialEvidence) {
      setTrialEvidence(null); setTrialEvidenceUnavailable(undefined); setTrialEvidenceLoading(false)
      return
    }
    let active = true
    setTrialEvidenceLoading(true); setTrialEvidenceUnavailable(undefined)
    void requestApi<FormulaTrialEvidenceResponse>(`/formulas/${encodeURIComponent(formulaId)}/trial-evidence?version=${encodeURIComponent(version)}`)
      .then((payload) => { if (active) setTrialEvidence(payload.evidence) })
      .catch(() => { if (active) setTrialEvidenceUnavailable('Completed trial evidence is temporarily unavailable.') })
      .finally(() => { if (active) setTrialEvidenceLoading(false) })
    return () => { active = false }
  }, [capabilities.canViewTrialEvidence, formulaId, requestApi, version])
  useEffect(() => { if (!activeRun) return; const artifact = activeRun.artifacts.find((item) => item.type === 'optimizer_candidates')?.data as { candidates?: OptimizerCandidate[] } | undefined; if (artifact?.candidates) setCandidates(artifact.candidates); if (activeRun.confirmation?.status === 'PENDING') setPending({ runId: activeRun.run.id, confirmationId: activeRun.confirmation.id, label: activeRun.confirmation.summary }); if (activeRun.run.status === 'FAILED') setNotice(activeRun.run.error_summary ?? 'Optimization failed') }, [activeRun])

  async function startOptimizer() {
    if (!formulaId || !version || !capabilities.canRunOptimizer) return
    const asOptionalNumber = (value: string) => value.trim() === '' ? undefined : Number(value)
    const objectives = {
      targetCostReductionPercent: asOptionalNumber(targetCostReductionPercent),
      maxTotalCost: asOptionalNumber(maxTotalCost),
      maximizeInventoryCoverage,
      minimizeNewPurchases,
      maximizeEvidenceCoverage,
      preserveMaterialIds: preservedMaterialIds,
      prohibitedMaterialIds,
      complianceRequired: true,
      requireApprovedSubstitutions: true,
    }
    const scope = `optimizer:${formulaId}:${version}:${intent}:${lockedMaterialIds.slice().sort().join(',')}:${preservedMaterialIds.slice().sort().join(',')}:${prohibitedMaterialIds.slice().sort().join(',')}:${JSON.stringify(objectives)}`
    setBusy(true); setNotice(undefined); setCandidates([])
    try {
      const result = await requestApi<{ run: RunRow }>('/formula-intelligence/optimizer/runs', {
        method: 'POST', headers: mutationHeaders(scope),
        body: JSON.stringify({ baselineFormulaId: formulaId, baselineVersion: version, intent, lockedMaterialIds, requireEligibleInventory, objectives }),
      })
      completeMutation(scope); setActiveRunId(result.run.id)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to optimize formula') } finally { setBusy(false) }
  }
  async function cancelRun() { if (!activeRunId) return; const scope = `optimizer-cancel:${activeRunId}`; setBusy(true); try { await requestApi(`/agent/runs/${encodeURIComponent(activeRunId)}/cancel`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' }); completeMutation(scope); await loadRun(activeRunId) } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to cancel optimization') } finally { setBusy(false) } }
  async function requestSave(candidate: OptimizerCandidate) { if (!activeRunId || !capabilities.canSaveDraft) return; const scope = `optimizer-save:${activeRunId}:${candidate.candidateId}`; setBusy(true); setNotice(undefined); try { const data = await requestApi<{ confirmationId: string }>(`/formula-intelligence/optimizer/runs/${encodeURIComponent(activeRunId)}/candidates/${encodeURIComponent(candidate.candidateId)}/save`, { method: 'POST', headers: mutationHeaders(scope), body: '{}' }); completeMutation(scope); setPending({ runId: activeRunId, confirmationId: data.confirmationId, label: candidate.title }) } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to prepare candidate draft') } finally { setBusy(false) } }
  async function confirmSave() { if (!pending) return; const scope = `optimizer-confirm:${pending.runId}:${pending.confirmationId}`; setBusy(true); setNotice(undefined); try { const result = await requestApi<{ formula?: Formula }>(`/agent/runs/${encodeURIComponent(pending.runId)}/confirmations/${encodeURIComponent(pending.confirmationId)}`, { method: 'POST', headers: mutationHeaders(scope), body: JSON.stringify({ decision: 'accept' }) }); completeMutation(scope); if (result.formula) onFormulaSaved(result.formula); setPending(undefined); setNotice('Editable reformulation draft created. No inventory reservation or consumption was made.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save candidate draft') } finally { setBusy(false) } }

  const baseline = formulaRecords.find((formula) => formula.id === formulaId)
  const baselineLines = versions.find((item) => item.version === version)?.lines ?? baseline?.lines ?? []
  const baselineMaterials = baselineLines.filter((line) => line.materialId).map((line) => ({ id: line.materialId!, name: materialNames.get(line.materialId!) ?? line.label }))
  const objectiveControls = <>
    <MaterialPicker label="Preserve materials" materials={baselineMaterials} selected={preservedMaterialIds} onChange={setPreservedMaterialIds} />
    <MaterialPicker label="Do not use" materials={materialRecords} selected={prohibitedMaterialIds} onChange={setProhibitedMaterialIds} />
    <div className="form-grid-two">
      <label>Target cost reduction %<input type="number" min="0" max="100" step="0.1" value={targetCostReductionPercent} onChange={(event) => setTargetCostReductionPercent(event.target.value)} /></label>
      <label>Maximum total cost<input type="number" min="0" step="0.01" value={maxTotalCost} onChange={(event) => setMaxTotalCost(event.target.value)} /></label>
    </div>
    <label className="checkbox-row"><input type="checkbox" checked={maximizeInventoryCoverage} disabled={!capabilities.canViewInventoryEvidence} onChange={(event) => setMaximizeInventoryCoverage(event.target.checked)} /> Prefer eligible inventory coverage</label>
    <label className="checkbox-row"><input type="checkbox" checked={minimizeNewPurchases} disabled={!capabilities.canViewInventoryEvidence} onChange={(event) => setMinimizeNewPurchases(event.target.checked)} /> Minimize new purchasing</label>
    <label className="checkbox-row"><input type="checkbox" checked={maximizeEvidenceCoverage} onChange={(event) => setMaximizeEvidenceCoverage(event.target.checked)} /> Prefer private trial evidence where available</label>
    <small>Only reviewed substitutions are eligible. Any unavailable cost or inventory signal remains not evaluated.</small>
  </>
  return <div className="domain-page formula-intelligence-page">
    <section className="panel glass formula-intelligence-hero">
      <div><span className="formula-intelligence-eyebrow">Reformulation optimizer</span><h2>Compare feasible changes before you edit</h2><p>Every result uses an immutable formula version. Missing cost or inventory evidence is shown as not evaluated.</p></div>
      <span className="status-chip blue"><SlidersHorizontal size={14} /> Deterministic analysis</span>
    </section>
    <div className="formula-intelligence-grid optimizer-grid">
      <section className="panel glass formula-intelligence-brief">
        <div className="panel-title-row"><div><SlidersHorizontal size={18} /><h3>Set the boundaries</h3></div><span>Immutable baseline</span></div>
        <label>Formula<select value={formulaId} onChange={(event) => setFormulaId(event.target.value)}>{formulaRecords.map((formula) => <option value={formula.id} key={formula.id}>{formula.code} / {formula.name}</option>)}</select></label>
        <label>Baseline version<select value={version} onChange={(event) => setVersion(event.target.value)}>{versions.map((item) => <option value={item.version} key={item.version}>{item.version} / {new Date(item.createdAt).toLocaleDateString()}</option>)}</select></label>
        <label>Intent<select value={intent} onChange={(event) => setIntent(event.target.value as FormulaOptimizerIntent)}><option value="COMBINED">Balance compliance, stock, and cost</option><option value="COMPLIANCE">Resolve compliance</option><option value="INVENTORY">Recover stock feasibility</option><option value="COST">Reduce cost</option></select></label>
        <MaterialPicker label="Keep unchanged" materials={baselineMaterials} selected={lockedMaterialIds} onChange={setLockedMaterialIds} />
        {objectiveControls}
        <label className="checkbox-row"><input type="checkbox" checked={requireEligibleInventory} disabled={!capabilities.canViewInventoryEvidence} onChange={(event) => setRequireEligibleInventory(event.target.checked)} /> Require eligible inventory evidence</label>
        {!capabilities.canViewInventoryEvidence ? <small>Inventory evidence is not available to your role.</small> : null}
        <button className="primary-button" data-testid="formula-optimizer-primary-action" type="button" disabled={busy || !capabilities.canRunOptimizer || !formulaId || !version} onClick={() => void startOptimizer()}><Play size={16} /> Run optimization</button>
        {!capabilities.canRunOptimizer ? <small>Optimization is unavailable for this role or has been paused by your workspace.</small> : null}
        {notice ? <div className="agent-notice"><AlertCircle size={15} /> {notice}</div> : null}
        <RunStatus detail={activeRun} connectionState={connectionState} busy={busy} onCancel={() => void cancelRun()} />
      </section>
      <section className="formula-intelligence-projects">
        {capabilities.canViewTrialEvidence ? <TrialEvidenceSummary evidence={trialEvidence} formulaVersion={version} loading={trialEvidenceLoading} unavailableMessage={trialEvidenceUnavailable} /> : null}
        {candidates.length === 0 ? <section className="panel glass"><p className="empty-state">Choose the boundaries, then run an analysis to compare safe, reviewable candidates.</p></section> : <section className="panel glass">
          <div className="panel-title-row"><div><FlaskConical size={18} /><h3>Candidate trade-offs</h3></div><span>{candidates.length} candidates</span></div>
          <div className="formula-intelligence-direction-grid">{candidates.map((candidate) => <article className="formula-intelligence-direction" key={candidate.candidateId}>
            <div><h4>{candidate.title}</h4><strong className="formula-intelligence-score">{candidate.score.toFixed(1)}</strong></div>
            <div className="formula-intelligence-project-meta">
              <span className={`status-chip ${statusTone(candidate.complianceStatus)}`}>{candidate.complianceStatus}</span>
              <span>Availability: {candidate.availability === 'UNKNOWN' ? 'Not evaluated' : candidate.availability}</span>
              <span>Change: {candidate.compositionChangePercent.toFixed(2)}%</span>
              {candidate.pareto ? <span>Pareto: {candidate.pareto.state === 'NOT_EVALUATED' ? 'Not evaluated' : candidate.pareto.state.toLowerCase()}</span> : null}
              {candidate.costDelta === undefined || !capabilities.canViewCostEvidence ? <span>Cost: Not evaluated</span> : <span>Cost delta: {candidate.costDelta.toFixed(2)}</span>}
            </div>
            {capabilities.canViewSensitiveComposition ? <ProposalLines proposal={candidate.proposal} materialNames={materialNames} /> : null}
            <ul>{candidate.summary.map((line) => <li key={line}>{line}</li>)}</ul>
            {candidate.pareto ? <small>{candidate.pareto.tradeoff}</small> : null}
            {capabilities.canSaveDraft ? <button className="primary-button small" type="button" disabled={busy} onClick={() => void requestSave(candidate)}><Save size={14} /> Save accepted candidate</button> : null}
          </article>)}</div>
          {capabilities.canViewMaterialEvidence ? <EvidenceCitations evidence={activeEvidence} /> : null}
        </section>}
      </section>
    </div>
    {pending ? <FormulaIntelligenceDialog title="Confirm reformulation draft" onClose={() => setPending(undefined)}><p className="formula-intelligence-copy">{pending.label}</p><p className="formula-intelligence-copy">Confirmation creates one normal draft. Stock remains unchanged.</p><div className="formula-intelligence-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void confirmSave()}><CheckCircle2 size={16} /> Confirm draft</button><button className="secondary-button" type="button" disabled={busy} onClick={() => setPending(undefined)}>Not now</button></div></FormulaIntelligenceDialog> : null}
  </div>
}
