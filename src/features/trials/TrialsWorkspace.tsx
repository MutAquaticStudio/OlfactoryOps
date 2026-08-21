import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, FlaskConical, Link2, Play, RefreshCw, ShieldCheck } from 'lucide-react'
import type { Formula, FragranceTrialRecord, SensorySessionRecord, SensoryStabilityStatus, SensoryTimepoint, TrialComparableEvidence, TrialDecisionOutcome, TrialPublicLinkRecord } from '../../data/northStar'
import { AnimatedContent, AnimatedList, AnimatedListItem, Stepper } from '../../ui/motion/MotionPrimitives'

type TrialDetail = {
  trial: FragranceTrialRecord
  sensorySessions: SensorySessionRecord[]
  publicLinks?: Array<Pick<TrialPublicLinkRecord, 'id' | 'presentationMode' | 'expiresAt' | 'revokedAt' | 'lastSubmittedAt'>>
  comparableEvidence: TrialComparableEvidence
}

type TrialsResponse = { trials: FragranceTrialRecord[] }

type MutationResponse = { trial?: FragranceTrialRecord; session?: SensorySessionRecord; link?: { url?: string; token?: string; expiresAt?: string } }

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>

function mutationInit(body?: Record<string, unknown>) {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body ?? {}),
  }
}

export function TrialsWorkspace({
  requestApi,
  formulaRecords,
  initialFormulaId,
  canCreate,
  canRelease,
  canEvaluate,
  canManagePublic,
  onStartWeighing,
}: {
  requestApi: ApiRequest
  formulaRecords: Formula[]
  initialFormulaId?: string
  canCreate: boolean
  canRelease: boolean
  canEvaluate: boolean
  canManagePublic: boolean
  onStartWeighing: (trial: FragranceTrialRecord) => void
}) {
  const [trials, setTrials] = useState<FragranceTrialRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<TrialDetail | null>(null)
  const [formulaId, setFormulaId] = useState('')
  const [title, setTitle] = useState('')
  const [sampleCode, setSampleCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [timepoint, setTimepoint] = useState<SensoryTimepoint>('OVERALL')
  const [scores, setScores] = useState<Record<SensoryTimepoint, number>>({ OPENING: 7, HEART: 7, DRYDOWN: 7, LONGEVITY: 7, OVERALL: 7 })
  const [descriptors, setDescriptors] = useState('')
  const [observation, setObservation] = useState('')
  const [stability, setStability] = useState<SensoryStabilityStatus>('STABLE')
  const [decisionOutcome, setDecisionOutcome] = useState<TrialDecisionOutcome>('REVISE')
  const [decisionRationale, setDecisionRationale] = useState('')
  const [publicPresentationMode, setPublicPresentationMode] = useState<'BLIND' | 'BRAND_REVIEW'>('BLIND')

  const approvedFormulas = useMemo(
    () => formulaRecords.filter((formula) => formula.workflowStatus === 'APPROVED'),
    [formulaRecords],
  )
  const selectedTrial = useMemo(() => trials.find((trial) => trial.id === selectedId) ?? trials[0], [selectedId, trials])

  useEffect(() => {
    if (initialFormulaId && approvedFormulas.some((formula) => formula.id === initialFormulaId)) {
      setFormulaId(initialFormulaId)
    }
  }, [approvedFormulas, initialFormulaId])

  const load = useCallback(async (focusId?: string) => {
    try {
      const payload = await requestApi<TrialsResponse>('/trials')
      setTrials(payload.trials)
      const nextId = focusId ?? ''
      const current = payload.trials.find((trial) => trial.id === nextId) ?? payload.trials[0]
      setSelectedId(current?.id ?? '')
      if (current) setDetail(await requestApi<TrialDetail>(`/trials/${encodeURIComponent(current.id)}`))
      else setDetail(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Trial history could not be loaded')
    }
  }, [requestApi])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!selectedTrial || selectedTrial.id === detail?.trial.id) return
    void requestApi<TrialDetail>(`/trials/${encodeURIComponent(selectedTrial.id)}`).then(setDetail).catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : 'Trial detail could not be loaded')
    })
  }, [detail?.trial.id, requestApi, selectedTrial])

  async function mutate(action: () => Promise<MutationResponse>, focusId?: string) {
    setBusy(true)
    try {
      const payload = await action()
      const trialId = focusId ?? payload.trial?.id ?? selectedTrial?.id
      await load(trialId)
      return payload
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The trial workflow could not be updated')
      return undefined
    } finally {
      setBusy(false)
    }
  }

  async function createTrial() {
    const formula = approvedFormulas.find((item) => item.id === formulaId) ?? approvedFormulas[0]
    if (!formula) {
      setNotice('An approved formula version is required before a trial can be planned.')
      return
    }
    const result = await mutate(
      () => requestApi<MutationResponse>('/trials', mutationInit({ formulaId: formula.id, formulaVersion: formula.version, title, sampleCode })),
    )
    if (result?.trial) {
      setTitle('')
      setSampleCode('')
      setNotice(`Planned ${result.trial.sampleCode}. Release it when the formula gate is ready.`)
    }
  }

  async function issuePublicLink() {
    if (!selectedTrial) return
    const result = await mutate(() => requestApi<MutationResponse>(`/trials/${encodeURIComponent(selectedTrial.id)}/public-links`, mutationInit({ presentationMode: publicPresentationMode })))
    if (result?.link?.url) {
      const absolute = new URL(result.link.url, window.location.origin).toString()
      await navigator.clipboard?.writeText(absolute).catch(() => undefined)
      setNotice(`${publicPresentationMode === 'BRAND_REVIEW' ? 'Brand review' : 'Blind'} feedback link created and copied. It expires ${result.link.expiresAt ? new Date(result.link.expiresAt).toLocaleDateString() : 'automatically'}.`)
    }
  }

  async function submitInternalScorecard() {
    const session = detail?.sensorySessions.find((item) => item.status === 'OPEN')
    if (!selectedTrial || !session) {
      setNotice('Open a sensory session before submitting a scorecard.')
      return
    }
    const result = await mutate(() => requestApi<MutationResponse>(
      `/trials/${encodeURIComponent(selectedTrial.id)}/sensory-sessions/${encodeURIComponent(session.id)}/observations`,
      mutationInit({ timepoint, scores, descriptors: descriptors.split(',').map((item) => item.trim()).filter(Boolean), observation, stability }),
    ))
    if (result) {
      setNotice(`${timepoint.charAt(0)}${timepoint.slice(1).toLowerCase()} sensory scorecard saved.`)
    }
  }

  async function closeTrialDecision() {
    if (!selectedTrial || !decisionRationale.trim()) {
      setNotice('A decision rationale is required before closing the trial.')
      return
    }
    const result = await mutate(() => requestApi<MutationResponse>(
      `/trials/${encodeURIComponent(selectedTrial.id)}/decision`,
      mutationInit({ outcome: decisionOutcome, rationale: decisionRationale }),
    ))
    if (result) {
      setDecisionRationale('')
      setNotice(`Trial decision recorded: ${decisionOutcome.toLowerCase()}.`)
    }
  }

  async function revokePublicLink(linkId: string) {
    if (!selectedTrial) return
    const result = await mutate(() => requestApi<MutationResponse>(`/trials/public-links/${encodeURIComponent(linkId)}/revoke`, mutationInit()), selectedTrial.id)
    if (result) setNotice('Public feedback link revoked.')
  }

  const stages = ['PLANNED', 'RELEASED_FOR_TRIAL', 'MIXED', 'CONDITIONING', 'EVALUATING', 'DECIDED'] as const
  const currentStage = selectedTrial ? stages.indexOf(selectedTrial.lifecycle as typeof stages[number]) : -1

  return (
    <section className="trials-workspace" aria-label="Trials and sensory">
      <AnimatedContent>
        <header className="trials-hero">
          <div>
            <span className="eyebrow"><FlaskConical size={14} /> Trials and sensory</span>
            <h2>Learn from each formula release</h2>
            <p>Release a version, record actual weighing, gather structured sensory feedback, then decide with comparable evidence.</p>
          </div>
          <button className="ghost-button small" type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={15} /> Refresh</button>
        </header>
      </AnimatedContent>

      {notice ? <div className="agent-notice" role="status">{notice}</div> : null}

      <div className="trials-layout">
        <section className="panel trials-create-panel">
          <div className="section-heading"><span className="section-icon"><FlaskConical size={17} /></span><h3>Plan a trial</h3></div>
          <p className="field-hint">A trial starts from an approved immutable formula version. Planning it does not reserve or consume material.</p>
          <label>Formula
            <select value={formulaId} onChange={(event) => setFormulaId(event.target.value)} disabled={!canCreate || busy}>
              <option value="">Select approved formula</option>
              {approvedFormulas.map((formula) => <option key={formula.id} value={formula.id}>{formula.code} / {formula.name} / {formula.version}</option>)}
            </select>
          </label>
          <label>Trial name
            <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Summer citrus wear test" disabled={!canCreate || busy} />
          </label>
          <label>Sample code (optional)
            <input value={sampleCode} maxLength={80} onChange={(event) => setSampleCode(event.target.value)} placeholder="Generated if blank" disabled={!canCreate || busy} />
          </label>
          <button className="primary-button" type="button" onClick={() => void createTrial()} disabled={!canCreate || busy || approvedFormulas.length === 0}><Play size={16} /> Plan trial</button>
        </section>

        <section className="panel trials-list-panel">
          <div className="section-heading"><span className="section-icon"><ClipboardCheck size={17} /></span><h3>Trial workbench</h3></div>
          {trials.length === 0 ? <div className="empty-state">No trials yet. Start with an approved formula version.</div> : (
            <AnimatedList className="trials-list" role="list">
              {trials.map((trial) => (
                <AnimatedListItem key={trial.id}>
                  <button type="button" className={`trial-row ${trial.id === selectedTrial?.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(trial.id)}>
                    <span className="trial-row-copy"><strong>{trial.sampleCode}</strong><span>{trial.title}</span></span>
                    <span className="status-chip">{trial.lifecycle.replaceAll('_', ' ')}</span>
                  </button>
                </AnimatedListItem>
              ))}
            </AnimatedList>
          )}
        </section>
      </div>

      {selectedTrial ? (
        <AnimatedContent key={selectedTrial.id}>
        <section className="panel trial-detail-panel">
          <div className="trial-detail-heading">
            <div><span className="eyebrow">{selectedTrial.sampleCode}</span><h3>{selectedTrial.title}</h3><p>{selectedTrial.formulaSnapshot?.formulaName ?? 'Blind formula presentation'} {selectedTrial.formulaSnapshot?.formulaVersion ? `/${selectedTrial.formulaSnapshot.formulaVersion}` : ''}</p></div>
            <span className="status-chip">{selectedTrial.lifecycle.replaceAll('_', ' ')}</span>
          </div>
          <Stepper
            label="Trial lifecycle"
            steps={stages.map((stage, index) => ({
              id: stage,
              label: stage.replaceAll('_', ' '),
              status: selectedTrial.lifecycle === 'CANCELLED' ? (index === 0 ? 'blocked' : 'upcoming') : index < currentStage ? 'complete' : index === currentStage ? 'active' : 'upcoming',
            }))}
          />
          <div className="trial-actions">
            {selectedTrial.lifecycle === 'PLANNED' ? <button className="primary-button" type="button" disabled={!canRelease || busy} onClick={() => void mutate(() => requestApi<MutationResponse>(`/trials/${encodeURIComponent(selectedTrial.id)}/release`, mutationInit()))}><ShieldCheck size={16} /> Release for trial</button> : null}
            {selectedTrial.lifecycle === 'PLANNED' && canCreate ? <button className="ghost-button small" type="button" disabled={busy} onClick={() => void mutate(() => requestApi<MutationResponse>(`/trials/${encodeURIComponent(selectedTrial.id)}/cancel`, mutationInit()))}>Cancel trial</button> : null}
            {selectedTrial.lifecycle === 'RELEASED_FOR_TRIAL' ? <button className="primary-button" type="button" disabled={busy} onClick={() => onStartWeighing(selectedTrial)}><Play size={16} /> Start weighing</button> : null}
            {selectedTrial.lifecycle === 'MIXED' ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void mutate(() => requestApi<MutationResponse>(`/trials/${encodeURIComponent(selectedTrial.id)}/stage`, mutationInit({ lifecycle: 'CONDITIONING' })))}><CheckCircle2 size={16} /> Start conditioning</button> : null}
            {['MIXED', 'CONDITIONING'].includes(selectedTrial.lifecycle) ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void mutate(() => requestApi<MutationResponse>(`/trials/${encodeURIComponent(selectedTrial.id)}/sensory-sessions`, mutationInit({ presentationMode: 'BLIND' })))}><ClipboardCheck size={16} /> Open sensory session</button> : null}
            {canManagePublic && detail?.sensorySessions.some((item) => item.status === 'OPEN') ? <label className="trial-public-mode">Public view<select value={publicPresentationMode} onChange={(event) => setPublicPresentationMode(event.target.value as 'BLIND' | 'BRAND_REVIEW')} disabled={busy}><option value="BLIND">Blind sample</option><option value="BRAND_REVIEW">Brand review</option></select></label> : null}
            {canManagePublic && detail?.sensorySessions.some((item) => item.status === 'OPEN') ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void issuePublicLink()}><Link2 size={16} /> Copy feedback link</button> : null}
          </div>
          <AnimatedList className="trial-evidence-grid">
            <AnimatedListItem><article><span>Formula release</span><strong>{selectedTrial.release ? `Released ${new Date(selectedTrial.release.releasedAt).toLocaleDateString()}` : 'Awaiting release gate'}</strong></article></AnimatedListItem>
            <AnimatedListItem><article><span>Actual lab usage</span><strong>{selectedTrial.usageLink ? `${selectedTrial.usageLink.actualWeights.length} weighed lines linked` : 'No inventory movement'}</strong></article></AnimatedListItem>
            <AnimatedListItem><article><span>Comparable evidence</span><strong>{detail?.comparableEvidence.status === 'READY' ? `${detail.comparableEvidence.sampleCount} scorecards / ${detail.comparableEvidence.confidence.toLowerCase()} confidence` : detail?.comparableEvidence.status === 'NOT_AVAILABLE' ? 'Not available for this role' : 'Not enough evidence'}</strong></article></AnimatedListItem>
          </AnimatedList>
          {canEvaluate && detail?.sensorySessions.some((item) => item.status === 'OPEN') ? (
            <section className="trial-scorecard" aria-label="Internal sensory scorecard">
              <div className="section-heading"><span className="section-icon"><ClipboardCheck size={17} /></span><h4>Internal sensory scorecard</h4></div>
              <p className="field-hint">Panelists evaluate the current sample without composition, lot, or cost information.</p>
              <div className="trial-score-grid">
                {(['OPENING', 'HEART', 'DRYDOWN', 'LONGEVITY', 'OVERALL'] as SensoryTimepoint[]).map((item) => (
                  <label key={item} className={item === timepoint ? 'is-active' : ''}>{item.toLowerCase()}<input type="number" min="1" max="10" step="0.5" value={scores[item]} onFocus={() => setTimepoint(item)} onChange={(event) => setScores((current) => ({ ...current, [item]: Number(event.target.value) }))} /></label>
                ))}
              </div>
              <div className="trial-scorecard-fields">
                <label>Descriptors<input value={descriptors} maxLength={432} onChange={(event) => setDescriptors(event.target.value)} placeholder="bright, mineral, soft" /></label>
                <label>Stability<select value={stability} onChange={(event) => setStability(event.target.value as SensoryStabilityStatus)}><option value="STABLE">Stable</option><option value="WATCH">Watch</option><option value="UNSTABLE">Unstable</option></select></label>
                <label className="wide-field">Observation<textarea value={observation} maxLength={2000} rows={3} onChange={(event) => setObservation(event.target.value)} placeholder="What stands out at this stage?" /></label>
              </div>
              <button className="primary-button" type="button" disabled={busy} onClick={() => void submitInternalScorecard()}><CheckCircle2 size={16} /> Save scorecard</button>
            </section>
          ) : null}
          {canManagePublic && detail?.publicLinks?.length ? (
            <section className="trial-public-links" aria-label="Public feedback links">
              <div className="section-heading"><span className="section-icon"><Link2 size={17} /></span><h4>Feedback links</h4></div>
              {detail.publicLinks.map((link) => <div className="trial-public-link" key={link.id}><span>{link.presentationMode === 'BRAND_REVIEW' ? 'Brand review' : 'Blind'} / expires {new Date(link.expiresAt).toLocaleDateString()}</span>{link.revokedAt ? <span className="status-chip">Revoked</span> : <button className="ghost-button small" type="button" disabled={busy} onClick={() => void revokePublicLink(link.id)}>Revoke</button>}</div>)}
            </section>
          ) : null}
          {canRelease && selectedTrial.lifecycle === 'EVALUATING' ? (
            <section className="trial-decision" aria-label="Trial decision">
              <div className="section-heading"><span className="section-icon"><ShieldCheck size={17} /></span><h4>Close with a decision</h4></div>
              <div className="trial-decision-fields"><label>Decision<select value={decisionOutcome} onChange={(event) => setDecisionOutcome(event.target.value as TrialDecisionOutcome)}><option value="ACCEPT">Accept</option><option value="REVISE">Revise</option><option value="REJECT">Reject</option></select></label><label className="wide-field">Rationale<textarea value={decisionRationale} maxLength={2000} rows={3} onChange={(event) => setDecisionRationale(event.target.value)} placeholder="Required decision rationale" /></label></div>
              <button className="primary-button" type="button" disabled={busy || !decisionRationale.trim()} onClick={() => void closeTrialDecision()}><CheckCircle2 size={16} /> Record decision</button>
            </section>
          ) : null}
        </section>
        </AnimatedContent>
      ) : null}
    </section>
  )
}
