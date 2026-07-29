import { AlertCircle, CheckCircle2, FlaskConical, MessageSquare, Play, Save, Share2, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentFormulaProposal, FormulaOptimizerIntent } from '../../data/agentRuntime'
import type { Formula, Material } from '../../data/northStar'

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>

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
}

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
  artifacts: Array<{ id: string; type: string; data: unknown }>
}

type FormulaVersionResponse = {
  formula: Formula
  versions: Array<{ version: string; createdAt: string; lines: Formula['lines'] }>
}

type PendingConfirmation = { runId: string; confirmationId: string; label: string }

function mutationHeaders() {
  return { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }
}

function csv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function statusTone(status: string) {
  if (status === 'PASS' || status === 'AVAILABLE' || status === 'SAVED') return 'green'
  if (status === 'BLOCKED' || status === 'UNAVAILABLE') return 'red'
  return 'amber'
}

async function waitForRun(requestApi: ApiRequest, runId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const detail = await requestApi<RunDetail>(`/agent/runs/${encodeURIComponent(runId)}`)
    if (detail.run.status === 'COMPLETED' || detail.run.status === 'FAILED' || detail.run.status === 'CANCELLED') return detail
    await new Promise((resolve) => window.setTimeout(resolve, 350))
  }
  return requestApi<RunDetail>(`/agent/runs/${encodeURIComponent(runId)}`)
}

function ProposalLines({ proposal, materialNames }: { proposal: AgentFormulaProposal; materialNames: Map<string, string> }) {
  return (
    <div className="formula-intelligence-lines">
      {proposal.ingredients.map((line) => (
        <div key={line.materialId}>
          <span>{materialNames.get(line.materialId) ?? line.materialId}</span>
          <strong>{line.percentage.toFixed(2)}%</strong>
        </div>
      ))}
    </div>
  )
}

export function FormulaDesignStudioWorkspace({
  requestApi,
  materialRecords,
  canEditFormula,
  onFormulaSaved,
}: {
  requestApi: ApiRequest
  materialRecords: Material[]
  canEditFormula: boolean
  onFormulaSaved: (formula: Formula) => void
}) {
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
  const materialNames = useMemo(() => new Map(materialRecords.map((material) => [material.id, material.name])), [materialRecords])

  const refresh = useCallback(async () => {
    const data = await requestApi<DesignProject[]>('/formula-intelligence/design-projects')
    setProjects(data)
  }, [requestApi])

  useEffect(() => { void refresh().catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load design projects')) }, [refresh])

  async function createProject() {
    setBusy(true); setNotice(undefined)
    try {
      const payload = await requestApi<{ project: DesignProject }>('/formula-intelligence/design-projects', {
        method: 'POST', headers: mutationHeaders(), body: JSON.stringify({
          name, formulaType, concentrationType: formulaType === 'ACCORD' ? 'OTHER' : 'EDP', finalProductConcentrationPercent: formulaType === 'ACCORD' ? 100 : concentration,
          ifraCategory, targetMarkets: csv(markets), creativeBrief, desiredNotes: csv(desiredNotes), avoidedNotes: csv(avoidedNotes), lockedMaterialIds, availabilityFirst, targetGrams,
        }),
      })
      await refresh()
      if (canEditFormula) await generate(payload.project.id)
      else setNotice('Brief saved. A perfumer can generate and share directions for review.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to create design project') } finally { setBusy(false) }
  }

  async function generate(projectId: string) {
    setBusy(true); setNotice(undefined)
    try {
      const result = await requestApi<{ run: RunRow }>(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/generate`, { method: 'POST', headers: mutationHeaders(), body: '{}' })
      const completed = await waitForRun(requestApi, result.run.id)
      if (completed.run.status === 'FAILED') throw new Error(completed.run.error_summary ?? 'Direction generation failed')
      await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to generate directions') } finally { setBusy(false) }
  }

  async function share(projectId: string, directionId: string) {
    setBusy(true); setNotice(undefined)
    try {
      await requestApi(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/directions/${encodeURIComponent(directionId)}/share`, { method: 'POST', headers: mutationHeaders(), body: '{}' })
      await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to share direction') } finally { setBusy(false) }
  }

  async function submitFeedback(projectId: string, directionId: string, selected = false) {
    const draft = feedbackDrafts[directionId] ?? { comment: '', rating: 0 }
    setBusy(true); setNotice(undefined)
    try {
      await requestApi(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/directions/${encodeURIComponent(directionId)}/feedback`, {
        method: 'POST', headers: mutationHeaders(), body: JSON.stringify({ comment: draft.comment, rating: draft.rating || undefined, selected }),
      })
      await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to send feedback') } finally { setBusy(false) }
  }

  async function requestSave(projectId: string, direction: Direction) {
    if (!direction.runId) return
    setBusy(true); setNotice(undefined)
    try {
      const data = await requestApi<{ confirmationId: string }>(`/formula-intelligence/design-projects/${encodeURIComponent(projectId)}/directions/${encodeURIComponent(direction.directionId)}/save`, { method: 'POST', headers: mutationHeaders(), body: '{}' })
      setPending({ runId: direction.runId, confirmationId: data.confirmationId, label: direction.title })
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to prepare draft confirmation') } finally { setBusy(false) }
  }

  async function confirmSave() {
    if (!pending) return
    setBusy(true); setNotice(undefined)
    try {
      const result = await requestApi<{ formula?: Formula }>(`/agent/runs/${encodeURIComponent(pending.runId)}/confirmations/${encodeURIComponent(pending.confirmationId)}`, { method: 'POST', headers: mutationHeaders(), body: JSON.stringify({ decision: 'accept' }) })
      if (result.formula) onFormulaSaved(result.formula)
      setPending(undefined); await refresh(); setNotice('Editable draft created. Inventory remains advisory and unchanged.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save formula draft') } finally { setBusy(false) }
  }

  return (
    <div className="domain-page formula-intelligence-page">
      <section className="panel glass formula-intelligence-hero">
        <div><span className="mono-small">Formula Design Studio</span><h2>Briefs to reviewable fragrance directions</h2><p>Brand teams shape the brief; perfumers generate, share, and explicitly save the selected direction. Deterministic mock mode is active.</p></div>
        <span className="status-chip blue"><Sparkles size={14} /> Deterministic mock mode</span>
      </section>
      <div className="formula-intelligence-grid design-studio-grid">
        <section className="panel glass formula-intelligence-brief">
          <div className="panel-title-row"><div><FlaskConical size={18} /><h3>Brand brief</h3></div><span>Tenant-scoped</span></div>
          <label>Project name<input value={name} maxLength={240} onChange={(event) => setName(event.target.value)} /></label>
          <label>Creative direction<textarea value={creativeBrief} maxLength={6000} onChange={(event) => setCreativeBrief(event.target.value)} /></label>
          <div className="form-grid-two">
            <label>Formula type<select value={formulaType} onChange={(event) => setFormulaType(event.target.value as typeof formulaType)}><option value="FINE_FRAGRANCE">Fine fragrance</option><option value="ACCORD">Accord</option></select></label>
            <label>IFRA category<input value={ifraCategory} maxLength={32} onChange={(event) => setIfraCategory(event.target.value)} /></label>
            <label>Final concentration %<input type="number" min="0.01" max="100" value={formulaType === 'ACCORD' ? 100 : concentration} disabled={formulaType === 'ACCORD'} onChange={(event) => setConcentration(Number(event.target.value))} /></label>
            <label>Target grams<input type="number" min="0.01" value={targetGrams} onChange={(event) => setTargetGrams(Number(event.target.value))} /></label>
          </div>
          <label>Markets<input value={markets} onChange={(event) => setMarkets(event.target.value)} placeholder="EU, US" /></label>
          <label>Desired notes<input value={desiredNotes} onChange={(event) => setDesiredNotes(event.target.value)} placeholder="citrus, amber" /></label>
          <label>Avoided notes<input value={avoidedNotes} onChange={(event) => setAvoidedNotes(event.target.value)} placeholder="powdery" /></label>
          <label>Locked approved materials<select multiple value={lockedMaterialIds} onChange={(event) => setLockedMaterialIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>{materialRecords.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
          <label className="checkbox-row"><input type="checkbox" checked={availabilityFirst} onChange={(event) => setAvailabilityFirst(event.target.checked)} /> Prefer eligible available materials</label>
          <button className="primary-button" type="button" disabled={busy || name.trim().length < 2 || creativeBrief.trim().length < 8} onClick={() => void createProject()}><Play size={16} /> {canEditFormula ? 'Create and generate' : 'Create brief'}</button>
          {notice ? <div className="agent-notice"><AlertCircle size={15} /> {notice}</div> : null}
          {pending ? <div className="formula-intelligence-confirm"><strong>Ready to save: {pending.label}</strong><span>Creates one normal editable draft. No lot is reserved or consumed.</span><button className="primary-button small" type="button" disabled={busy} onClick={() => void confirmSave()}><CheckCircle2 size={15} /> Confirm draft</button></div> : null}
        </section>
        <section className="formula-intelligence-projects">
          {projects.length === 0 ? <section className="panel glass"><p className="empty-state">No design briefs yet.</p></section> : projects.map((project) => (
            <section className="panel glass formula-intelligence-project" key={project.id}>
              <div className="panel-title-row"><div><Sparkles size={18} /><h3>{project.name}</h3></div><span className={`status-chip ${statusTone(project.status)}`}>{project.status.replaceAll('_', ' ')}</span></div>
              <p className="formula-intelligence-copy">{project.brief.creativeBrief}</p>
              <div className="formula-intelligence-project-meta"><span>{project.brief.formulaType === 'ACCORD' ? 'Accord' : 'Fine fragrance'}</span><span>IFRA {project.brief.ifraCategory}</span><span>{project.brief.targetGrams}g</span></div>
              {canEditFormula && project.directions.length === 0 ? <button className="secondary-button small" type="button" disabled={busy} onClick={() => void generate(project.id)}><Play size={15} /> Generate directions</button> : null}
              <div className="formula-intelligence-direction-grid">
                {project.directions.map((direction) => {
                  const feedback = project.feedback.filter((item) => item.directionId === direction.directionId)
                  const draft = feedbackDrafts[direction.directionId] ?? { comment: '', rating: 0 }
                  return <article className="formula-intelligence-direction" key={direction.directionId}>
                    <div><h4>{direction.title}</h4><span className={`status-chip ${statusTone(direction.complianceStatus)}`}>{direction.complianceStatus}</span></div>
                    <p>{direction.narrative}</p><small>{direction.pyramidSummary}</small>
                    <div className="formula-intelligence-project-meta"><span>Availability: {direction.availability}</span><span>Status: {direction.status}</span></div>
                    {direction.warnings.length ? <ul>{direction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
                    {canEditFormula && direction.proposal ? <ProposalLines proposal={direction.proposal} materialNames={materialNames} /> : null}
                    {canEditFormula ? <div className="formula-intelligence-actions"><button className="secondary-button small" type="button" disabled={busy || Boolean(direction.sharedAt)} onClick={() => void share(project.id, direction.directionId)}><Share2 size={14} /> {direction.sharedAt ? 'Shared' : 'Share'}</button><button className="primary-button small" type="button" disabled={busy || Boolean(direction.savedFormulaId) || !direction.proposal} onClick={() => void requestSave(project.id, direction)}><Save size={14} /> {direction.savedFormulaId ? 'Draft saved' : 'Save as draft'}</button></div> : <div className="formula-intelligence-feedback"><label>Rating<select value={draft.rating} onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [direction.directionId]: { ...draft, rating: Number(event.target.value) } }))}><option value="0">Optional</option>{[1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating}</option>)}</select></label><textarea value={draft.comment} maxLength={1200} placeholder="Feedback for the perfumer" onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [direction.directionId]: { ...draft, comment: event.target.value } }))} /><div className="formula-intelligence-actions"><button className="secondary-button small" type="button" disabled={busy} onClick={() => void submitFeedback(project.id, direction.directionId)}><MessageSquare size={14} /> Send feedback</button><button className="primary-button small" type="button" disabled={busy} onClick={() => void submitFeedback(project.id, direction.directionId, true)}><CheckCircle2 size={14} /> Select</button></div></div>}
                    {feedback.length ? <small>{feedback.length} feedback item{feedback.length === 1 ? '' : 's'}</small> : null}
                  </article>
                })}
              </div>
            </section>
          ))}
        </section>
      </div>
    </div>
  )
}

export function ReformulationOptimizerWorkspace({
  requestApi,
  formulaRecords,
  materialRecords,
  canEditFormula,
  onFormulaSaved,
}: {
  requestApi: ApiRequest
  formulaRecords: Formula[]
  materialRecords: Material[]
  canEditFormula: boolean
  onFormulaSaved: (formula: Formula) => void
}) {
  const [formulaId, setFormulaId] = useState('')
  const [versions, setVersions] = useState<FormulaVersionResponse['versions']>([])
  const [version, setVersion] = useState('')
  const [intent, setIntent] = useState<FormulaOptimizerIntent>('COMBINED')
  const [lockedMaterialIds, setLockedMaterialIds] = useState<string[]>([])
  const [requireEligibleInventory, setRequireEligibleInventory] = useState(false)
  const [candidates, setCandidates] = useState<OptimizerCandidate[]>([])
  const [activeRunId, setActiveRunId] = useState<string>()
  const [pending, setPending] = useState<PendingConfirmation>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const materialNames = useMemo(() => new Map(materialRecords.map((material) => [material.id, material.name])), [materialRecords])

  useEffect(() => { setFormulaId((current) => formulaRecords.some((formula) => formula.id === current) ? current : (formulaRecords[0]?.id ?? '')) }, [formulaRecords])
  useEffect(() => {
    if (!formulaId) { setVersions([]); setVersion(''); return }
    void requestApi<FormulaVersionResponse>(`/formulas/${encodeURIComponent(formulaId)}/versions`).then((data) => {
      setVersions(data.versions); setVersion((current) => data.versions.some((item) => item.version === current) ? current : (data.versions[0]?.version ?? ''))
    }).catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load immutable formula versions'))
  }, [formulaId, requestApi])

  async function startOptimizer() {
    if (!formulaId || !version) return
    setBusy(true); setNotice(undefined); setCandidates([])
    try {
      const result = await requestApi<{ run: RunRow }>('/formula-intelligence/optimizer/runs', { method: 'POST', headers: mutationHeaders(), body: JSON.stringify({ baselineFormulaId: formulaId, baselineVersion: version, intent, lockedMaterialIds, requireEligibleInventory }) })
      setActiveRunId(result.run.id)
      const detail = await waitForRun(requestApi, result.run.id)
      if (detail.run.status === 'FAILED') throw new Error(detail.run.error_summary ?? 'Optimization failed')
      const artifact = detail.artifacts.find((item) => item.type === 'optimizer_candidates')?.data as { candidates?: OptimizerCandidate[] } | undefined
      setCandidates(artifact?.candidates ?? [])
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to optimize formula') } finally { setBusy(false) }
  }

  async function requestSave(candidate: OptimizerCandidate) {
    if (!activeRunId) return
    setBusy(true); setNotice(undefined)
    try {
      const data = await requestApi<{ confirmationId: string }>(`/formula-intelligence/optimizer/runs/${encodeURIComponent(activeRunId)}/candidates/${encodeURIComponent(candidate.candidateId)}/save`, { method: 'POST', headers: mutationHeaders(), body: '{}' })
      setPending({ runId: activeRunId, confirmationId: data.confirmationId, label: candidate.title })
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to prepare candidate draft') } finally { setBusy(false) }
  }

  async function confirmSave() {
    if (!pending) return
    setBusy(true); setNotice(undefined)
    try {
      const result = await requestApi<{ formula?: Formula }>(`/agent/runs/${encodeURIComponent(pending.runId)}/confirmations/${encodeURIComponent(pending.confirmationId)}`, { method: 'POST', headers: mutationHeaders(), body: JSON.stringify({ decision: 'accept' }) })
      if (result.formula) onFormulaSaved(result.formula)
      setPending(undefined); setNotice('Editable reformulation draft created. No inventory reservation or consumption was made.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save candidate draft') } finally { setBusy(false) }
  }

  const baseline = formulaRecords.find((formula) => formula.id === formulaId)
  const baselineLines = versions.find((item) => item.version === version)?.lines ?? baseline?.lines ?? []

  return (
    <div className="domain-page formula-intelligence-page">
      <section className="panel glass formula-intelligence-hero"><div><span className="mono-small">Reformulation Optimizer</span><h2>Compliance, feasibility, and cost-aware alternatives</h2><p>Each candidate is measured against an immutable formula version. Commercial and lot evidence appears only when your role can access it.</p></div><span className="status-chip blue"><SlidersHorizontal size={14} /> Deterministic mock mode</span></section>
      <div className="formula-intelligence-grid optimizer-grid">
        <section className="panel glass formula-intelligence-brief">
          <div className="panel-title-row"><div><SlidersHorizontal size={18} /><h3>Optimization baseline</h3></div><span>Immutable version required</span></div>
          <label>Formula<select value={formulaId} onChange={(event) => setFormulaId(event.target.value)}>{formulaRecords.map((formula) => <option value={formula.id} key={formula.id}>{formula.code} / {formula.name}</option>)}</select></label>
          <label>Baseline version<select value={version} onChange={(event) => setVersion(event.target.value)}>{versions.map((item) => <option value={item.version} key={item.version}>{item.version} / {new Date(item.createdAt).toLocaleDateString()}</option>)}</select></label>
          <label>Intent<select value={intent} onChange={(event) => setIntent(event.target.value as FormulaOptimizerIntent)}><option value="COMBINED">Combined optimization</option><option value="COMPLIANCE">Resolve compliance</option><option value="INVENTORY">Recover feasibility</option><option value="COST">Reduce cost</option></select></label>
          <label>Locked baseline materials<select multiple value={lockedMaterialIds} onChange={(event) => setLockedMaterialIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>{baselineLines.filter((line) => line.materialId).map((line) => <option value={line.materialId} key={line.id}>{materialNames.get(line.materialId ?? '') ?? line.label}</option>)}</select></label>
          <label className="checkbox-row"><input type="checkbox" checked={requireEligibleInventory} onChange={(event) => setRequireEligibleInventory(event.target.checked)} /> Require eligible inventory evidence</label>
          <button className="primary-button" type="button" disabled={busy || !formulaId || !version} onClick={() => void startOptimizer()}><Play size={16} /> Run optimization</button>
          {notice ? <div className="agent-notice"><AlertCircle size={15} /> {notice}</div> : null}
          {pending ? <div className="formula-intelligence-confirm"><strong>Ready to save: {pending.label}</strong><span>Confirmation creates one normal draft; stock remains unchanged.</span><button className="primary-button small" type="button" disabled={busy} onClick={() => void confirmSave()}><CheckCircle2 size={15} /> Confirm draft</button></div> : null}
        </section>
        <section className="formula-intelligence-projects">
          {candidates.length === 0 ? <section className="panel glass"><p className="empty-state">Run an optimization to compare structured candidates against the selected version.</p></section> : <section className="panel glass"><div className="panel-title-row"><div><FlaskConical size={18} /><h3>Ranked candidates</h3></div><span>{candidates.length} candidates</span></div><div className="formula-intelligence-direction-grid">{candidates.map((candidate) => <article className="formula-intelligence-direction" key={candidate.candidateId}><div><h4>{candidate.title}</h4><strong className="formula-intelligence-score">{candidate.score.toFixed(1)}</strong></div><div className="formula-intelligence-project-meta"><span className={`status-chip ${statusTone(candidate.complianceStatus)}`}>{candidate.complianceStatus}</span><span>Availability: {candidate.availability}</span><span>Change: {candidate.compositionChangePercent.toFixed(2)}%</span>{candidate.costDelta === undefined ? null : <span>Cost delta: {candidate.costDelta.toFixed(2)}</span>}</div><ProposalLines proposal={candidate.proposal} materialNames={materialNames} /><ul>{candidate.summary.map((line) => <li key={line}>{line}</li>)}</ul>{canEditFormula ? <button className="primary-button small" type="button" disabled={busy} onClick={() => void requestSave(candidate)}><Save size={14} /> Save accepted candidate</button> : null}</article>)}</div></section>}
        </section>
      </div>
    </div>
  )
}
