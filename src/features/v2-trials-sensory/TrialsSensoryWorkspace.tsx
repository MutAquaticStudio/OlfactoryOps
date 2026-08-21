import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { authenticatedRequest, defaultTrialsApiBase } from './api'
import { SensoryScorecard } from './SensoryScorecard'
import { DecisionEvidenceSummary, EvidenceAttachmentPanel, SensoryManagementOperations, TrialPreparationOperations } from './TrialOperations'
import type {
  ApprovedFormulaVersion,
  CapabilityMap,
  InternalSensoryAssignments,
  ScorecardPayload,
  SensoryFormSummary,
  SensorySessionStatus,
  TrialDetail as TrialDetailData,
  TrialDecisionEvidence,
  TrialStatus,
  TrialSummary,
} from './types'
import './trialsSensory.css'

type WorkspaceScreen =
  | { kind: 'dashboard' }
  | { kind: 'detail'; trialId: string }
  | { kind: 'evaluation'; trialId: string; sessionId: string }

type TrialsSensoryWorkspaceProps = {
  apiBase?: string
  capabilities?: CapabilityMap
  initialTrialId?: string
  onNavigate?: (path: string) => void
}

type TrialDashboardProps = {
  apiBase: string
  capabilities: CapabilityMap
  onOpenTrial: (trialId: string) => void
}

type TrialDetailProps = {
  apiBase: string
  capabilities: CapabilityMap
  trialId: string
  onBack: () => void
  onOpenEvaluation: (sessionId: string) => void
}

type InternalSensoryEvaluationProps = {
  apiBase: string
  capabilities: CapabilityMap
  sessionId: string
  onBack: () => void
}

const trialStatuses: TrialStatus[] = ['DRAFT', 'PLANNED', 'READY', 'IN_PROGRESS', 'PREPARED', 'EVALUATION_READY', 'EVALUATED', 'CLOSED', 'CANCELLED']

const decisionOptions = [
  'ACCEPT_DIRECTION',
  'REVISE_FORMULA',
  'RETEST',
  'REJECT_DIRECTION',
  'PROMOTE_FOR_PRODUCTION_REVIEW',
]

function allowed(capabilities: CapabilityMap, permission: string) {
  return capabilities[permission] === true
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function compactId(value: string) {
  return value.length > 15 ? `${value.slice(0, 12)}...` : value
}

function sessionAction(status: SensorySessionStatus): { target: 'SCHEDULED' | 'OPEN' | 'CLOSED'; label: string } | null {
  if (status === 'DRAFT') return { target: 'SCHEDULED', label: 'Schedule session' }
  if (status === 'SCHEDULED') return { target: 'OPEN', label: 'Open session' }
  if (status === 'OPEN' || status === 'IN_PROGRESS') return { target: 'CLOSED', label: 'Close session' }
  return null
}

export function TrialsSensoryWorkspace({ apiBase = defaultTrialsApiBase, capabilities = {}, initialTrialId, onNavigate }: TrialsSensoryWorkspaceProps) {
  const [screen, setScreen] = useState<WorkspaceScreen>(initialTrialId ? { kind: 'detail', trialId: initialTrialId } : { kind: 'dashboard' })

  useEffect(() => {
    if (initialTrialId) setScreen({ kind: 'detail', trialId: initialTrialId })
  }, [initialTrialId])

  const openTrial = (trialId: string) => {
    setScreen({ kind: 'detail', trialId })
    onNavigate?.(`/v2/workspace/trials/${encodeURIComponent(trialId)}`)
  }

  if (screen.kind === 'detail') {
    return (
      <TrialDetail
        apiBase={apiBase}
        capabilities={capabilities}
        trialId={screen.trialId}
        onBack={() => { setScreen({ kind: 'dashboard' }); onNavigate?.('/v2/workspace/trials') }}
        onOpenEvaluation={(sessionId) => {
          setScreen({ kind: 'evaluation', trialId: screen.trialId, sessionId })
          onNavigate?.(`/v2/workspace/trials/${encodeURIComponent(screen.trialId)}/sessions/${encodeURIComponent(sessionId)}`)
        }}
      />
    )
  }

  if (screen.kind === 'evaluation') {
    return (
      <InternalSensoryEvaluation
        apiBase={apiBase}
        capabilities={capabilities}
        sessionId={screen.sessionId}
        onBack={() => { setScreen({ kind: 'detail', trialId: screen.trialId }); onNavigate?.(`/v2/workspace/trials/${encodeURIComponent(screen.trialId)}`) }}
      />
    )
  }

  return <TrialsDashboard apiBase={apiBase} capabilities={capabilities} onOpenTrial={openTrial} />
}

export function TrialsDashboard({ apiBase, capabilities, onOpenTrial }: TrialDashboardProps) {
  const [trials, setTrials] = useState<TrialSummary[]>([])
  const [formulaVersions, setFormulaVersions] = useState<ApprovedFormulaVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | TrialStatus>('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', sourceKind: 'FORMULA_VERSION' as 'FORMULA_VERSION' | 'MANUAL_EXPERIMENT', formulaVersionId: '', manualSource: '', plannedMassGrams: '100' })
  const canViewAll = allowed(capabilities, 'trials.viewAll')
  const canViewAssigned = allowed(capabilities, 'trials.viewAssigned')
  const canReadTrials = canViewAll || canViewAssigned

  const refresh = useCallback(async () => {
    if (!canReadTrials) {
      setTrials([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const payload = await authenticatedRequest<{ trials: TrialSummary[] }>(apiBase, '')
      setTrials(payload.trials)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Trials could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [apiBase, canReadTrials])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!canViewAll || !createOpen || form.sourceKind !== 'FORMULA_VERSION' || formulaVersions.length) return
    void authenticatedRequest<{ versions: ApprovedFormulaVersion[] }>(apiBase, '/formula-versions')
      .then((payload) => setFormulaVersions(payload.versions))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Approved Formula Versions could not be loaded.'))
  }, [apiBase, canViewAll, createOpen, form.sourceKind, formulaVersions.length])

  const filtered = useMemo(() => filter === 'ALL' ? trials : trials.filter((trial) => trial.status === filter), [filter, trials])
  const openCount = useMemo(() => trials.filter((trial) => !['CLOSED', 'CANCELLED'].includes(trial.status)).length, [trials])
  const evaluationCount = useMemo(() => trials.filter((trial) => ['EVALUATION_READY', 'EVALUATED'].includes(trial.status)).length, [trials])

  const createTrial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    const plannedMassGrams = Number(form.plannedMassGrams)
    if (!Number.isFinite(plannedMassGrams) || plannedMassGrams <= 0) {
      setError('Planned mass must be greater than zero.')
      return
    }
    if (form.sourceKind === 'FORMULA_VERSION' && !form.formulaVersionId) {
      setError('Select an approved Formula Version for this Trial.')
      return
    }
    if (form.sourceKind === 'MANUAL_EXPERIMENT' && !form.manualSource.trim()) {
      setError('Document the experimental source before creating the Trial.')
      return
    }
    setCreating(true)
    try {
      const payload = await authenticatedRequest<{ trial: { id: string } }>(apiBase, '', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          sourceKind: form.sourceKind,
          plannedMassGrams,
          ...(form.sourceKind === 'FORMULA_VERSION' ? { formulaVersionId: form.formulaVersionId } : { manualSource: form.manualSource.trim() }),
        }),
      })
      setNotice('Trial draft created from its selected immutable source.')
      onOpenTrial(payload.trial.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The Trial could not be created.')
    } finally {
      setCreating(false)
    }
  }

  if (!canReadTrials) {
    return (
      <section className="v2-trials-workspace" data-testid="v2-trials-dashboard-assigned">
        <header className="v2-trials-heading"><div><span className="v2-eyebrow">Trials and sensory</span><h2>Assigned sensory work</h2><p>Assigned panelists receive only their server-authorized blind scorecards.</p></div></header>
        <section className="v2-trials-panel">
          <div className="v2-alert is-error" role="alert">Your workspace role cannot access Trials or assigned sensory scorecards.</div>
        </section>
      </section>
    )
  }

  return (
    <section className="v2-trials-workspace" data-testid="v2-trials-dashboard">
      <header className="v2-trials-heading">
        <div>
          <span className="v2-eyebrow">Trials and sensory</span>
          <h2>{canViewAll ? 'Evidence-led evaluation' : 'Assigned sensory work'}</h2>
          <p>{canViewAll ? 'Trial state, preparation evidence, and sensory decisions remain private to this workspace.' : 'Only server-authorized blind presentations are available to this panelist account.'}</p>
        </div>
        <div className="v2-trials-heading-actions">
          <button className="v2-secondary-button" type="button" onClick={() => void refresh()} disabled={loading}>Refresh</button>
          {allowed(capabilities, 'trials.create') ? <button className="v2-primary-button" type="button" onClick={() => setCreateOpen((open) => !open)}>{createOpen ? 'Close composer' : 'New trial'}</button> : null}
        </div>
      </header>

       <div className="v2-trials-summary-grid" aria-label="Trial summary">
         {canViewAll ? <><div><span>All trials</span><strong>{trials.length}</strong></div><div><span>In progress</span><strong>{openCount}</strong></div><div><span>Evaluation queue</span><strong>{evaluationCount}</strong></div></> : <div><span>Assigned trials</span><strong>{trials.length}</strong></div>}
       </div>

       {canViewAll && createOpen ? (
        <form className="v2-trials-panel v2-trials-create-form" onSubmit={createTrial}>
          <div className="v2-trials-panel-heading"><div><h3>New controlled Trial</h3><p>Formula Version trials inherit an immutable snapshot. Manual experiments require a documented source.</p></div></div>
          <div className="v2-trials-form-grid">
            <label>Trial title<input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Source kind<select value={form.sourceKind} onChange={(event) => setForm({ ...form, sourceKind: event.target.value as 'FORMULA_VERSION' | 'MANUAL_EXPERIMENT', formulaVersionId: '', manualSource: '' })}><option value="FORMULA_VERSION">Approved Formula Version</option><option value="MANUAL_EXPERIMENT">Manual experiment</option></select></label>
            {form.sourceKind === 'FORMULA_VERSION' ? <label>Formula Version<select required value={form.formulaVersionId} onChange={(event) => setForm({ ...form, formulaVersionId: event.target.value })}><option value="">Choose approved version</option>{formulaVersions.map((version) => <option value={version.id} key={version.id}>{version.name} v{version.versionNumber}</option>)}</select></label> : <label>Experimental source<textarea required maxLength={2000} value={form.manualSource} onChange={(event) => setForm({ ...form, manualSource: event.target.value })} /></label>}
            <label>Planned mass (g)<input type="number" min="0.001" step="0.001" required value={form.plannedMassGrams} onChange={(event) => setForm({ ...form, plannedMassGrams: event.target.value })} /></label>
          </div>
          <div className="v2-trials-actions"><button className="v2-primary-button" type="submit" disabled={creating}>{creating ? 'Creating trial' : 'Create draft trial'}</button></div>
        </form>
      ) : null}

      {error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}
      {notice ? <div className="v2-alert is-success" role="status">{notice}</div> : null}

      <section className="v2-trials-panel">
        <div className="v2-trials-list-toolbar">
          <div><h3>{canViewAll ? 'Trial register' : 'Assigned scorecards'}</h3><p>{loading ? 'Loading authorized assignments.' : `${filtered.length} visible ${filtered.length === 1 ? 'trial' : 'trials'}`}</p></div>
          {canViewAll ? <label>Filter status<select value={filter} onChange={(event) => setFilter(event.target.value as 'ALL' | TrialStatus)}><option value="ALL">All statuses</option>{trialStatuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></label> : null}
        </div>
        {!loading && !filtered.length ? <p className="v2-muted">No Trial matches this view.</p> : null}
        <div className="v2-trials-list" aria-live="polite">
          {filtered.map((trial) => (
            <button className="v2-trial-row" type="button" key={trial.id} onClick={() => onOpenTrial(trial.id)}>
              {canViewAll ? <><span className="v2-trial-row-title"><strong>{trial.title}</strong><small>{trial.sourceKind === 'FORMULA_VERSION' ? 'Formula Version' : 'Manual experiment'} / Revision {trial.revision}</small></span><span>{trial.plannedMassGrams.toFixed(3)} g</span><span className={`v2-trial-status is-${trial.status.toLowerCase()}`}>{humanize(trial.status)}</span><span>{trial.decision ? humanize(trial.decision) : formatDate(trial.createdAt)}</span></> : <><span className="v2-trial-row-title"><strong>Assigned sensory evaluation</strong><small>Blind presentation only</small></span><span>Open assigned session</span></>}
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}

export function TrialDetail({ apiBase, capabilities, trialId, onBack, onOpenEvaluation }: TrialDetailProps) {
  const [detail, setDetail] = useState<TrialDetailData | null>(null)
  const [forms, setForms] = useState<SensoryFormSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showPlan, setShowPlan] = useState(false)
  const [showRelease, setShowRelease] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showSessionComposer, setShowSessionComposer] = useState(false)
  const [showDecision, setShowDecision] = useState(false)
  const [plan, setPlan] = useState({ plannedAt: '', targetConcentrationPercent: '', carrier: '', storageLocation: '', notes: '' })
  const [releaseRationale, setReleaseRationale] = useState('')
  const [cancelRationale, setCancelRationale] = useState('')
  const [sessionForm, setSessionForm] = useState({ formVersionId: '', title: '', blindMode: true, allowPeerResultsAfterClose: false, scheduledAt: '', instructions: '' })
  const [decision, setDecision] = useState({ decision: 'RETEST', rationale: '' })
  const [decisionEvidence, setDecisionEvidence] = useState<TrialDecisionEvidence | null>(null)
  const canViewAll = allowed(capabilities, 'trials.viewAll')
  const canViewAssigned = allowed(capabilities, 'trials.viewAssigned')
  const canReadTrials = canViewAll || canViewAssigned

  const refresh = useCallback(async () => {
    if (!canReadTrials) {
      setDetail(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const payload = await authenticatedRequest<TrialDetailData>(apiBase, `/${encodeURIComponent(trialId)}`)
      setDetail(payload)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Trial detail could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [apiBase, canReadTrials, trialId])

  useEffect(() => { void refresh() }, [refresh])

  const loadForms = async () => {
    if (forms.length) return
    try {
      const payload = await authenticatedRequest<{ forms: SensoryFormSummary[] }>(apiBase, '/forms')
      setForms(payload.forms)
      setSessionForm((current) => current.formVersionId ? current : { ...current, formVersionId: payload.forms[0]?.id ?? '' })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sensory forms could not be loaded.')
    }
  }

  const mutate = async <T,>(action: string, path: string, body: unknown, success: string, method: 'POST' | 'DELETE' = 'POST'): Promise<T | null> => {
    setBusyAction(action)
    setError(null)
    setNotice(null)
    try {
      const payload = await authenticatedRequest<T>(apiBase, path, { method, ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }) })
      setNotice(success)
      await refresh()
      return payload
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This Trial action could not be completed.')
      return null
    } finally {
      setBusyAction(null)
    }
  }

  const submitPlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const concentration = plan.targetConcentrationPercent.trim() ? Number(plan.targetConcentrationPercent) : undefined
    if (concentration !== undefined && (!Number.isFinite(concentration) || concentration <= 0 || concentration > 100)) {
      setError('Target concentration must be between 0 and 100 percent.')
      return
    }
    const plannedAt = plan.plannedAt ? new Date(plan.plannedAt).toISOString() : undefined
    void mutate('plan', `/${encodeURIComponent(trialId)}/plan`, {
      ...(plannedAt ? { plannedAt } : {}),
      ...(concentration === undefined ? {} : { targetConcentrationPercent: concentration }),
      ...(plan.carrier.trim() ? { carrier: plan.carrier.trim() } : {}),
      ...(plan.storageLocation.trim() ? { storageLocation: plan.storageLocation.trim() } : {}),
      ...(plan.notes.trim() ? { notes: plan.notes.trim() } : {}),
    }, 'Trial plan recorded. Release remains a separate controlled gate.')
  }

  const submitSession = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!sessionForm.formVersionId) {
      setError('Choose an active sensory form before creating a session.')
      return
    }
    const scheduledAt = sessionForm.scheduledAt ? new Date(sessionForm.scheduledAt).toISOString() : undefined
    void mutate('session', `/${encodeURIComponent(trialId)}/sessions`, {
      formVersionId: sessionForm.formVersionId,
      title: sessionForm.title.trim(),
      blindMode: sessionForm.blindMode,
      allowPeerResultsAfterClose: sessionForm.allowPeerResultsAfterClose,
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(sessionForm.instructions.trim() ? { instructions: sessionForm.instructions.trim() } : {}),
    }, 'Sensory session created. Assign panelists and samples before opening it.')
  }

  const submitDecision = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void mutate<{ decision: { evidence: TrialDecisionEvidence } }>('decision', `/${encodeURIComponent(trialId)}/decision`, decision, 'Human decision recorded with its immutable evidence snapshot.')
      .then((result) => { if (result?.decision.evidence) setDecisionEvidence(result.decision.evidence) })
  }

  if (loading && !detail) return <section className="v2-trials-workspace"><div className="v2-trials-loading">Loading Trial detail</div></section>
  if (!detail) return <section className="v2-trials-workspace"><button className="v2-text-button" type="button" onClick={onBack}>Back to trials</button>{error ? <div className="v2-alert is-error" role="alert">{error}</div> : !canReadTrials ? <div className="v2-alert is-error" role="alert">Your workspace role cannot view Trial detail.</div> : null}</section>

  if (!canViewAll) {
    return (
      <section className="v2-trials-workspace" data-testid="v2-assigned-trial-detail">
        <button className="v2-text-button v2-trials-back" type="button" onClick={onBack}>Back to trials</button>
        <header className="v2-trials-heading"><div><span className="v2-eyebrow">Assigned sensory work</span><h2>Blind scorecards</h2><p>Only your server-authorized session presentations are available.</p></div></header>
        {error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}
        <section className="v2-trials-panel">
          <div className="v2-trials-panel-heading"><div><h3>My assigned sessions</h3><p>Trial composition, preparation, inventory, and evidence are not shown to panelists.</p></div></div>
          <div className="v2-trials-session-list">
            {detail.sessions.length ? detail.sessions.map((session) => <article className="v2-trials-session" key={session.id}><div><span className="v2-eyebrow">Blind presentation</span><h4>Assigned sensory session</h4><p>{humanize(session.status)}</p></div><div className="v2-trials-session-actions">{allowed(capabilities, 'sensory.evaluate') && (session.status === 'OPEN' || session.status === 'IN_PROGRESS') ? <button className="v2-primary-button" type="button" onClick={() => onOpenEvaluation(session.id)}>Open my scorecard</button> : <span className={`v2-trial-status is-${session.status.toLowerCase()}`}>{humanize(session.status)}</span>}</div></article>) : <p className="v2-muted">No active sensory session is assigned to you.</p>}
          </div>
        </section>
      </section>
    )
  }

  const trial = detail.trial
  const canCreate = allowed(capabilities, 'trials.create')
  const canManageSensory = allowed(capabilities, 'sensory.manage')
  const canEvaluate = allowed(capabilities, 'sensory.evaluate')
  const canDecide = allowed(capabilities, 'trials.decide')
  const canRelease = allowed(capabilities, 'trials.release')
  const canCancel = canCreate && ['DRAFT', 'PLANNED', 'READY'].includes(trial.status)

  return (
    <section className="v2-trials-workspace" data-testid="v2-trial-detail">
      <button className="v2-text-button v2-trials-back" type="button" onClick={onBack}>Back to trials</button>
      <header className="v2-trials-heading">
        <div>
          <span className="v2-eyebrow">Controlled Trial</span>
          <h2>{trial.title}</h2>
          <p>{trial.sourceKind === 'FORMULA_VERSION' ? 'Formula Version source remains immutable for this Trial.' : 'Manual experimental source is captured in the controlled Trial record.'}</p>
        </div>
        <span className={`v2-trial-status is-${trial.status.toLowerCase()}`}>{humanize(trial.status)}</span>
      </header>

      <div className="v2-trials-summary-grid" aria-label="Trial details">
        <div><span>Planned mass</span><strong>{trial.plannedMassGrams.toFixed(3)} g</strong></div>
        <div><span>Revision</span><strong>{trial.revision}</strong></div>
        <div><span>Updated</span><strong>{formatDate(trial.updatedAt)}</strong></div>
      </div>

      {error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}
      {notice ? <div className="v2-alert is-success" role="status">{notice}</div> : null}

      <section className="v2-trials-panel">
        <div className="v2-trials-panel-heading"><div><h3>Lifecycle</h3><p>Planning does not consume stock. Actual preparation moves through the Lab Weighing workflow.</p></div></div>
        <div className="v2-trials-actions">
          {trial.status === 'DRAFT' && canCreate ? <button className="v2-secondary-button" type="button" onClick={() => setShowPlan((open) => !open)}>Plan Trial</button> : null}
          {trial.status === 'PLANNED' && canRelease ? <button className="v2-primary-button" type="button" onClick={() => setShowRelease((open) => !open)}>Release Trial</button> : null}
          {canCancel ? <button className="v2-text-button" type="button" onClick={() => setShowCancel((open) => !open)}>Cancel Trial</button> : null}
        </div>
        {showPlan ? <form className="v2-trials-form-grid" onSubmit={submitPlan}><label>Planned at<input type="datetime-local" value={plan.plannedAt} onChange={(event) => setPlan({ ...plan, plannedAt: event.target.value })} /></label><label>Target concentration (%)<input type="number" min="0.001" max="100" step="0.001" value={plan.targetConcentrationPercent} onChange={(event) => setPlan({ ...plan, targetConcentrationPercent: event.target.value })} /></label><label>Carrier<input maxLength={160} value={plan.carrier} onChange={(event) => setPlan({ ...plan, carrier: event.target.value })} /></label><label>Storage location<input maxLength={160} value={plan.storageLocation} onChange={(event) => setPlan({ ...plan, storageLocation: event.target.value })} /></label><label className="v2-trials-span-all">Planning note<textarea maxLength={2000} value={plan.notes} onChange={(event) => setPlan({ ...plan, notes: event.target.value })} /></label><div className="v2-trials-actions"><button className="v2-primary-button" type="submit" disabled={busyAction === 'plan'}>{busyAction === 'plan' ? 'Saving plan' : 'Save plan'}</button></div></form> : null}
        {showRelease ? <form className="v2-trials-inline-form" onSubmit={(event) => { event.preventDefault(); void mutate('release', `/${encodeURIComponent(trialId)}/release`, { rationale: releaseRationale.trim() }, 'Trial released for controlled preparation.') }}><label>Release rationale<input required minLength={1} maxLength={2000} value={releaseRationale} onChange={(event) => setReleaseRationale(event.target.value)} /></label><button className="v2-primary-button" type="submit" disabled={busyAction === 'release'}>{busyAction === 'release' ? 'Releasing Trial' : 'Confirm release'}</button></form> : null}
        {showCancel ? <form className="v2-trials-inline-form" onSubmit={(event) => { event.preventDefault(); void mutate('cancel', `/${encodeURIComponent(trialId)}/cancel`, { rationale: cancelRationale.trim() }, 'Trial cancelled with its rationale preserved.') }}><label>Cancellation rationale<input required minLength={1} maxLength={2000} value={cancelRationale} onChange={(event) => setCancelRationale(event.target.value)} /></label><button className="v2-secondary-button" type="submit" disabled={busyAction === 'cancel'}>{busyAction === 'cancel' ? 'Cancelling Trial' : 'Confirm cancellation'}</button></form> : null}
      </section>

      <TrialPreparationOperations apiBase={apiBase} capabilities={capabilities} detail={detail} mutate={mutate} />

      <section className="v2-trials-panel">
        <div className="v2-trials-panel-heading"><div><h3>Preparation and samples</h3><p>Only confirmed Lab Weighing sessions create controlled Trial preparation evidence.</p></div></div>
        <div className="v2-trials-record-grid">
          <div><h4>Preparations</h4>{detail.preparations.length ? detail.preparations.map((preparation) => <div className="v2-trials-record" key={preparation.id}><strong>{humanize(preparation.status)}</strong><span>Weighing {compactId(preparation.weighingSessionId)}</span><span>{formatDate(preparation.confirmedAt)}</span></div>) : <p className="v2-muted">No preparation session has started.</p>}</div>
          <div><h4>Samples</h4>{detail.samples.length ? detail.samples.map((sample) => <div className="v2-trials-record" key={sample.id}><strong>{sample.sampleCode}</strong><span>{humanize(sample.status)}</span><span>{sample.concentrationPercent === null ? 'Concentration not recorded' : `${sample.concentrationPercent}%`}</span><span>{sample.expiresAt ? `Expires ${formatDate(sample.expiresAt)}` : 'No expiry recorded'}</span></div>) : <p className="v2-muted">Samples appear after confirmed preparation.</p>}</div>
        </div>
        {detail.usages.length ? <div className="v2-trials-usage-list"><h4>Authorized material usage</h4>{detail.usages.map((usage) => <div className="v2-trials-record" key={`${usage.materialId}-${usage.lotId}`}><strong>{compactId(usage.materialId)}</strong><span>Lot {compactId(usage.lotId)}</span><span>{usage.actualGrams.toFixed(3)} g</span>{usage.landedUnitCost !== undefined && usage.landedUnitCost !== null ? <span>{usage.currency ?? ''} {usage.landedUnitCost.toFixed(4)}/g</span> : null}</div>)}</div> : null}
      </section>

      <section className="v2-trials-panel">
        <div className="v2-trials-panel-heading"><div><h3>Sensory sessions</h3><p>Panelists see only assignments authorized for their own active panel role. Blind labels remain controlled by the server.</p></div>{canManageSensory ? <button className="v2-secondary-button" type="button" onClick={() => { setShowSessionComposer((open) => !open); void loadForms() }}>{showSessionComposer ? 'Close setup' : 'Create session'}</button> : null}</div>
        {showSessionComposer ? <form className="v2-trials-form-grid" onSubmit={submitSession}><label>Session title<input required maxLength={200} value={sessionForm.title} onChange={(event) => setSessionForm({ ...sessionForm, title: event.target.value })} /></label><label>Active sensory form<select required value={sessionForm.formVersionId} onChange={(event) => setSessionForm({ ...sessionForm, formVersionId: event.target.value })}><option value="">Choose sensory form</option>{forms.map((form) => <option value={form.id} key={form.id}>{form.name} {form.versionLabel}</option>)}</select></label><label>Scheduled at<input type="datetime-local" value={sessionForm.scheduledAt} onChange={(event) => setSessionForm({ ...sessionForm, scheduledAt: event.target.value })} /></label><label className="v2-trials-checkbox"><input type="checkbox" checked={sessionForm.blindMode} onChange={(event) => setSessionForm({ ...sessionForm, blindMode: event.target.checked })} /> Use blind presentation</label><label className="v2-trials-checkbox"><input type="checkbox" checked={sessionForm.allowPeerResultsAfterClose} onChange={(event) => setSessionForm({ ...sessionForm, allowPeerResultsAfterClose: event.target.checked })} /> Allow peer results after close</label><label className="v2-trials-span-all">Panel instructions<textarea maxLength={2000} value={sessionForm.instructions} onChange={(event) => setSessionForm({ ...sessionForm, instructions: event.target.value })} /></label><div className="v2-trials-actions"><button className="v2-primary-button" type="submit" disabled={busyAction === 'session'}>{busyAction === 'session' ? 'Creating session' : 'Create sensory session'}</button></div></form> : null}
        {!detail.sessions.length ? <p className="v2-muted">No sensory session is attached to this Trial.</p> : null}
        <div className="v2-trials-session-list">
          {detail.sessions.map((session) => {
            const nextAction = sessionAction(session.status)
            return <article className="v2-trials-session" key={session.id}><div><span className="v2-eyebrow">{session.blindMode ? 'Blind session' : 'Named session'}</span><h4>{session.title}</h4><p>Form {compactId(session.formVersionId)} / {session.allowPeerResultsAfterClose ? 'Peer results available after close' : 'Peer results remain restricted'}</p></div><div className="v2-trials-session-actions"><span className={`v2-trial-status is-${session.status.toLowerCase()}`}>{humanize(session.status)}</span>{canEvaluate && (session.status === 'OPEN' || session.status === 'IN_PROGRESS') ? <button className="v2-primary-button" type="button" onClick={() => onOpenEvaluation(session.id)}>Open my scorecard</button> : null}{canManageSensory && nextAction ? <button className="v2-secondary-button" type="button" disabled={busyAction === `transition-${session.id}`} onClick={() => void mutate(`transition-${session.id}`, `/sessions/${encodeURIComponent(session.id)}/transition/${nextAction.target}`, {}, `${nextAction.label} recorded.`)}>{busyAction === `transition-${session.id}` ? 'Saving' : nextAction.label}</button> : null}</div></article>
          })}
        </div>
      </section>

      <SensoryManagementOperations apiBase={apiBase} capabilities={capabilities} detail={detail} mutate={mutate} />

      <section className="v2-trials-panel">
        <div className="v2-trials-panel-heading"><div><h3>Evidence and decision</h3><p>Final decisions require closed sensory sessions, confirmed preparation, and a human rationale.</p></div>{trial.status === 'EVALUATED' && canDecide ? <button className="v2-secondary-button" type="button" onClick={() => setShowDecision((open) => !open)}>{showDecision ? 'Close decision' : 'Record decision'}</button> : null}</div>
        <EvidenceAttachmentPanel capabilities={capabilities} detail={detail} mutate={mutate} />
        {showDecision ? <form className="v2-trials-inline-form" onSubmit={submitDecision}><label>Decision<select value={decision.decision} onChange={(event) => setDecision({ ...decision, decision: event.target.value })}>{decisionOptions.map((item) => <option value={item} key={item}>{humanize(item)}</option>)}</select></label><label>Rationale<input required minLength={1} maxLength={2000} value={decision.rationale} onChange={(event) => setDecision({ ...decision, rationale: event.target.value })} /></label><button className="v2-primary-button" type="submit" disabled={busyAction === 'decision'}>{busyAction === 'decision' ? 'Recording decision' : 'Record decision'}</button></form> : null}
        <DecisionEvidenceSummary evidence={decisionEvidence} />
        <div className="v2-trials-record-grid">
          <div><h4>Evidence</h4>{detail.evidence.length ? detail.evidence.map((evidence) => <div className="v2-trials-record" key={evidence.id}><strong>{humanize(evidence.evidenceKind)}</strong><span>{compactId(evidence.contentHash)}</span><span>{formatDate(evidence.createdAt)}</span></div>) : <p className="v2-muted">No linked evidence is visible to this role.</p>}</div>
          <div><h4>Decisions</h4>{detail.decisions.length ? detail.decisions.map((item) => <div className="v2-trials-record" key={item.id}><strong>{humanize(item.decision)}</strong><span>{item.rationale}</span><span>{formatDate(item.decidedAt)}</span></div>) : <p className="v2-muted">No decision has been recorded.</p>}</div>
        </div>
      </section>
    </section>
  )
}

export function InternalSensoryEvaluation({ apiBase, capabilities, sessionId, onBack }: InternalSensoryEvaluationProps) {
  const [data, setData] = useState<InternalSensoryAssignments | null>(null)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canReadAssignedTrial = allowed(capabilities, 'trials.viewAll') || allowed(capabilities, 'trials.viewAssigned')
  const canEvaluate = allowed(capabilities, 'sensory.evaluate')

  const refresh = useCallback(async () => {
    if (!canReadAssignedTrial || !canEvaluate) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const payload = await authenticatedRequest<InternalSensoryAssignments>(apiBase, `/sessions/${encodeURIComponent(sessionId)}/assignments/me`)
      setData(payload)
      setSelectedAssignmentId((current) => payload.assignments.some((assignment) => assignment.id === current) ? current : payload.assignments[0]?.id ?? '')
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your sensory assignments could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [apiBase, canEvaluate, canReadAssignedTrial, sessionId])

  useEffect(() => { void refresh() }, [refresh])

  if (!canReadAssignedTrial || !canEvaluate) {
    return <section className="v2-trials-workspace"><button className="v2-text-button" type="button" onClick={onBack}>Back to Trial</button><div className="v2-alert is-error" role="alert">Your workspace role cannot access assigned sensory evaluations.</div></section>
  }

  const selected = data?.assignments.find((assignment) => assignment.id === selectedAssignmentId)
  const form = data?.form ?? data?.session.form
  const sampleLabel = data?.session.blindMode ? (selected?.blindCode || 'Assigned blind sample') : (selected?.sampleCode || 'Assigned sample')

  const submit = async (payload: ScorecardPayload) => {
    if (!selected) throw new Error('Choose an assigned sample before submitting a scorecard.')
    await authenticatedRequest(apiBase, `/sessions/${encodeURIComponent(sessionId)}/evaluations`, {
      method: 'POST',
      body: JSON.stringify({ ...payload, sampleAssignmentId: selected.id }),
    })
  }

  return (
    <section className="v2-trials-workspace" data-testid="v2-internal-sensory-evaluation">
      <button className="v2-text-button v2-trials-back" type="button" onClick={onBack}>Back to Trial</button>
      <header className="v2-trials-heading"><div><span className="v2-eyebrow">Internal sensory evaluation</span><h2>{data?.session.blindMode ? 'My blind scorecard' : data?.session.title ?? 'My sensory scorecard'}</h2><p>Only your currently assigned samples are available here. Do not disclose blind identifiers outside the session.</p></div><button className="v2-secondary-button" type="button" onClick={() => void refresh()} disabled={loading}>Refresh</button></header>
      {loading ? <div className="v2-trials-loading" aria-live="polite">Loading assigned scorecard</div> : null}
      {!loading && error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}
      {!loading && data && !data.assignments.length ? <div className="v2-trials-panel"><p className="v2-muted">No active sample assignment is available for this sensory session.</p></div> : null}
      {!loading && data && selected && form ? (
        <section className="v2-trials-panel">
          {data.assignments.length > 1 ? <label className="v2-trials-assignment-picker">Assigned sample<select value={selectedAssignmentId} onChange={(event) => setSelectedAssignmentId(event.target.value)}>{data.assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{data.session.blindMode ? assignment.blindCode || compactId(assignment.id) : assignment.sampleCode || compactId(assignment.id)}</option>)}</select></label> : null}
          {selected.final ? <div className="v2-alert is-success" role="status">A final scorecard is already recorded for this assigned sample.</div> : <SensoryScorecard form={form} sampleLabel={sampleLabel} allowDraft onSubmit={submit} onComplete={() => void refresh()} />}
        </section>
      ) : null}
    </section>
  )
}
