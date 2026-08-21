import { Activity, AlertTriangle, Check, Eye, FileText, Play, RefreshCw, ShieldCheck, Wrench, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createAgentRuntimeState,
  reduceAgentReplay,
  reduceAgentRuntimeEvent,
  reduceAgentStreamControl,
} from '../../data/agentRuntime.js'
import type { AgentRuntimeEvent, AgentRuntimeState } from '../../data/agentRuntime.js'
import {
  AgentRuntimeRequestError,
  cancelAgentRun,
  confirmAgentRun,
  createAgentEvaluation,
  createAgentOperationKeyCache,
  createAgentRunEventStream,
  defaultAgentRuntimeApiBase,
  executeAgentRun,
  listAgentDefinitionVersions,
  listAgentDefinitions,
  listAgentEvaluations,
  loadAgentConfirmationPreview,
  listAgentRuns,
  loadAgentDefinition,
  loadAgentDefinitionPolicy,
  loadAgentEvidence,
  loadAgentObservability,
  loadAgentRun,
  retryAgentRun,
  startAgentRun,
} from './api.js'
import type {
  AgentCapabilities,
  AgentConfirmationPreview,
  AgentDefinition,
  AgentDefinitionDetail,
  AgentEvaluation,
  AgentObservability,
  AgentRunEvidence,
  AgentRun,
  AgentRunDetail,
} from './types.js'
import './agentRuntime.css'

type AgentRuntimeWorkspaceProps = {
  apiBase?: string
  capabilities: AgentCapabilities
}

type ConsoleNotice = { kind: 'error' | 'success' | 'info'; message: string } | null

const emptyObjectJson = '{}'

function can(capabilities: AgentCapabilities, capability: string) {
  return capabilities[capability] === true
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function parseObjectJson(value: string, label: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${label} must be valid JSON.`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object.`)
  return parsed as Record<string, unknown>
}

function formatWhen(value?: string | null) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function shortId(value?: string | null) {
  if (!value) return 'Not recorded'
  return value.length > 20 ? `${value.slice(0, 12)}...${value.slice(-6)}` : value
}

function printable(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return 'Unserializable persisted metadata.'
  }
}

function titleFromEvent(type: string) {
  return type.replaceAll('.', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isPendingConfirmation(status?: string | null) {
  return !status || status === 'PENDING' || status === 'REQUESTED'
}

function noticeFrom(error: unknown) {
  if (error instanceof AgentRuntimeRequestError && error.code === 'AGENT_RUNTIME_NOT_CONFIGURED') {
    return 'The governed Phase 9 runtime adapter is not configured in this environment. No provider work was started.'
  }
  return 'The Agent Console could not complete this request. Try again or review the governed run evidence.'
}

function statusClass(status?: string | null) {
  return `agent-runtime-status status-${(status || 'unknown').toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`
}

function JsonBlock({ value, emptyLabel }: { value: unknown; emptyLabel: string }) {
  const content = value && (Array.isArray(value) ? value.length : Object.keys(record(value)).length) ? printable(value) : emptyLabel
  return <pre className="agent-runtime-json">{content}</pre>
}

function EmptyState({ children }: { children: string }) {
  return <p className="agent-runtime-empty">{children}</p>
}

export function AgentRuntimeWorkspace({ apiBase = defaultAgentRuntimeApiBase, capabilities }: AgentRuntimeWorkspaceProps) {
  const canView = can(capabilities, 'agent.view')
  const canExecute = can(capabilities, 'agent.execute')
  const canManageTools = can(capabilities, 'agent.manageTools')
  const canConfirm = can(capabilities, 'agent.confirmWrite')
  const canViewSensitiveFormula = can(capabilities, 'formula.viewSensitive')
  const canInspectConfirmation = canConfirm && canViewSensitiveFormula
  const canEvaluate = can(capabilities, 'agent.evaluate')
  const canObserve = can(capabilities, 'agent.observe')
  const keyCache = useRef(createAgentOperationKeyCache())
  const timelineRef = useRef<AgentRuntimeState>(createAgentRuntimeState())
  const selectedLoadRef = useRef(0)
  const [definitions, setDefinitions] = useState<AgentDefinition[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [evaluations, setEvaluations] = useState<AgentEvaluation[]>([])
  const [observability, setObservability] = useState<AgentObservability | null>(null)
  const [selectedDefinitionKey, setSelectedDefinitionKey] = useState('')
  const [definitionDetail, setDefinitionDetail] = useState<AgentDefinitionDetail | null>(null)
  const [definitionVersions, setDefinitionVersions] = useState<Record<string, unknown>[]>([])
  const [definitionPolicy, setDefinitionPolicy] = useState<Record<string, unknown> | null>(null)
  const [selectedRun, setSelectedRun] = useState<AgentRunDetail | null>(null)
  const [confirmationPreviews, setConfirmationPreviews] = useState<Record<string, AgentConfirmationPreview>>({})
  const [timeline, setTimeline] = useState<AgentRuntimeState>(createAgentRuntimeState)
  const [notice, setNotice] = useState<ConsoleNotice>(null)
  const [busy, setBusy] = useState(false)
  const [runInput, setRunInput] = useState(emptyObjectJson)
  const [evaluationInput, setEvaluationInput] = useState('')

  const updateTimeline = useCallback((update: (state: AgentRuntimeState) => AgentRuntimeState) => {
    setTimeline((current) => {
      const next = update(current)
      timelineRef.current = next
      return next
    })
  }, [])

  const loadSelectedRun = useCallback(async (runId: string) => {
    if (!canView) return
    const requestId = selectedLoadRef.current + 1
    selectedLoadRef.current = requestId
    try {
      const detail = await loadAgentRun(apiBase, runId)
      const evidence = await loadAgentEvidence(apiBase, runId).catch(() => detail.evidence ?? { lineage: [], providerUsage: [] })
      if (selectedLoadRef.current !== requestId) return
      const nextDetail = { ...detail, evidence }
      setSelectedRun(nextDetail)
      const nextTimeline = reduceAgentReplay(createAgentRuntimeState(), { events: nextDetail.events })
      timelineRef.current = nextTimeline
      setTimeline(nextTimeline)
    } catch (error) {
      if (selectedLoadRef.current === requestId) setNotice({ kind: 'error', message: noticeFrom(error) })
    }
  }, [apiBase, canView])

  const refreshRuns = useCallback(async () => {
    if (!canView) return
    const nextRuns = await listAgentRuns(apiBase, { limit: 50 })
    setRuns(nextRuns)
  }, [apiBase, canView])

  const refreshDefinitions = useCallback(async () => {
    if (!canView) return
    const nextDefinitions = await listAgentDefinitions(apiBase)
    setDefinitions(nextDefinitions)
    setSelectedDefinitionKey((current) => current || nextDefinitions[0]?.key || '')
  }, [apiBase, canView])

  const refreshEvaluations = useCallback(async () => {
    if (!canEvaluate) return
    setEvaluations(await listAgentEvaluations(apiBase, { limit: 25 }))
  }, [apiBase, canEvaluate])

  const refreshObservability = useCallback(async () => {
    if (!canObserve) return
    setObservability(await loadAgentObservability(apiBase))
  }, [apiBase, canObserve])

  const refreshConsole = useCallback(async () => {
    setNotice(null)
    setBusy(true)
    try {
      await Promise.all([refreshDefinitions(), refreshRuns(), refreshEvaluations(), refreshObservability()])
    } catch (error) {
      setNotice({ kind: 'error', message: noticeFrom(error) })
    } finally {
      setBusy(false)
    }
  }, [refreshDefinitions, refreshEvaluations, refreshObservability, refreshRuns])

  useEffect(() => { void refreshConsole() }, [refreshConsole])

  useEffect(() => {
    if (!canView || !selectedDefinitionKey) {
      setDefinitionDetail(null)
      setDefinitionVersions([])
      setDefinitionPolicy(null)
      return
    }
    let active = true
    void Promise.all([
      loadAgentDefinition(apiBase, selectedDefinitionKey),
      listAgentDefinitionVersions(apiBase, selectedDefinitionKey),
      loadAgentDefinitionPolicy(apiBase, selectedDefinitionKey),
    ]).then(([detail, versions, policy]) => {
      if (!active) return
      setDefinitionDetail(detail)
      setDefinitionVersions(versions)
      setDefinitionPolicy(policy)
    }).catch((error) => {
      if (active) setNotice({ kind: 'error', message: noticeFrom(error) })
    })
    return () => { active = false }
  }, [apiBase, canView, selectedDefinitionKey])

  useEffect(() => {
    const runId = selectedRun?.run.id
    const pendingConfirmations = selectedRun?.confirmations?.filter((confirmation) => isPendingConfirmation(confirmation.status)) ?? []
    if (!canInspectConfirmation || !runId || !pendingConfirmations.length) {
      setConfirmationPreviews({})
      return
    }
    let active = true
    void Promise.all(pendingConfirmations.map(async (confirmation) => {
      try {
        return [confirmation.id, await loadAgentConfirmationPreview(apiBase, runId, confirmation.id)] as const
      } catch (error) {
        if (active) setNotice({ kind: 'error', message: noticeFrom(error) })
        return null
      }
    })).then((entries) => {
      if (!active) return
      setConfirmationPreviews(Object.fromEntries(entries.filter((entry): entry is readonly [string, AgentConfirmationPreview] => entry !== null)))
    })
    return () => { active = false }
  }, [apiBase, canInspectConfirmation, selectedRun])

  useEffect(() => {
    const runId = selectedRun?.run.id
    if (!canView || !runId) return
    let connection = createAgentRunEventStream({
      apiBase,
      runId,
      afterSequence: timelineRef.current.lastSequence,
      onEvent: (event) => updateTimeline((current) => reduceAgentRuntimeEvent(current, event)),
      onControl: (event, payload) => {
        updateTimeline((current) => reduceAgentStreamControl(current, event, payload))
        if (event === 'connection.resync_required') {
          connection.close()
          void loadSelectedRun(runId)
        }
      },
      onError: (error) => setNotice({ kind: 'error', message: noticeFrom(error) }),
    })
    return () => connection.close()
  }, [apiBase, canView, loadSelectedRun, selectedRun?.run.id, updateTimeline])

  const selectRun = (run: AgentRun) => {
    setNotice(null)
    void loadSelectedRun(run.id)
  }

  const performMutation = async <Result,>(operationId: string, input: unknown, action: (key: string) => Promise<Result>, success: string): Promise<Result | undefined> => {
    const fingerprint = printable(input)
    const key = keyCache.current.acquire(operationId, fingerprint)
    setBusy(true)
    setNotice(null)
    try {
      const result = await action(key)
      keyCache.current.settle(operationId, fingerprint)
      setNotice({ kind: 'success', message: success })
      await refreshRuns()
      if (selectedRun) await loadSelectedRun(selectedRun.run.id)
      return result
    } catch (error) {
      setNotice({ kind: 'error', message: noticeFrom(error) })
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const submitRun = async (event: FormEvent) => {
    event.preventDefault()
    if (!canExecute) return
    try {
      const input = parseObjectJson(runInput, 'Run input')
      const definitionKey = selectedDefinitionKey || undefined
      const started = await performMutation('run.start', { definitionKey, input }, (key) => startAgentRun(apiBase, { definitionKey, input }, key), 'Run request recorded. Execution remains server-authoritative.')
      if (started) await loadSelectedRun(started.id)
    } catch (error) {
      setNotice({ kind: 'error', message: noticeFrom(error) })
    }
  }

  const submitEvaluation = async (event: FormEvent) => {
    event.preventDefault()
    if (!canEvaluate) return
    try {
      const input = parseObjectJson(evaluationInput, 'Evaluation payload')
      await performMutation('evaluation.create', input, (key) => createAgentEvaluation(apiBase, input, key), 'Evaluation request recorded.')
      setEvaluationInput('')
      await refreshEvaluations()
    } catch (error) {
      setNotice({ kind: 'error', message: noticeFrom(error) })
    }
  }

  const persistedEvents = timeline.events
  const renderedRunStatus = persistedEvents.at(-1)?.payload.status
  const runStatus = typeof renderedRunStatus === 'string' ? renderedRunStatus : selectedRun?.run.status
  const hasConsoleAccess = canView || canExecute || canManageTools || canEvaluate || canObserve || canConfirm

  if (!hasConsoleAccess) {
    return <section className="agent-runtime-workspace" data-testid="v2-agent-runtime"><div className="agent-runtime-unavailable"><ShieldCheck size={22} aria-hidden="true" /><div><h2>Agent Console</h2><p>This workspace role does not have an agent-runtime capability.</p></div></div></section>
  }

  return <section className="agent-runtime-workspace" data-testid="v2-agent-runtime">
    <header className="agent-runtime-header">
      <div>
        <span className="v2-eyebrow">Agent runtime</span>
        <h2>Governed runtime</h2>
        <p>Persisted runs, approvals, and evidence are shown here. This console does not make direct provider calls.</p>
      </div>
      <button type="button" className="agent-runtime-icon-button" title="Refresh persisted agent runtime data" aria-label="Refresh persisted agent runtime data" onClick={() => void refreshConsole()} disabled={busy}>
        <RefreshCw size={17} aria-hidden="true" />
      </button>
    </header>

    {notice ? <div className={`agent-runtime-notice ${notice.kind === 'error' ? 'is-error' : notice.kind === 'success' ? 'is-success' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.kind === 'error' ? <AlertTriangle size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{notice.message}</div> : null}

    <div className="agent-runtime-grid">
      <section className="agent-runtime-panel agent-runtime-definitions" aria-labelledby="agent-definitions-heading">
        <div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Definitions</span><h3 id="agent-definitions-heading">Governed agents</h3></div><FileText size={19} aria-hidden="true" /></div>
        {canView ? <div className="agent-runtime-list" role="list">{definitions.length ? definitions.map((definition) => <button type="button" role="listitem" className={`agent-runtime-list-row ${selectedDefinitionKey === definition.key ? 'is-selected' : ''}`} key={definition.key} onClick={() => setSelectedDefinitionKey(definition.key)}><span><strong>{definition.name}</strong><small>{definition.key}</small></span><span className={statusClass(definition.status)}>{definition.status || 'Unknown'}</span></button>) : <EmptyState>No persisted agent definitions are available.</EmptyState>}</div> : <EmptyState>`agent.view` is required to inspect definitions.</EmptyState>}
      </section>

      <section className="agent-runtime-panel agent-runtime-run-start" aria-labelledby="agent-run-start-heading">
        <div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Execution</span><h3 id="agent-run-start-heading">Start a run</h3></div><Play size={19} aria-hidden="true" /></div>
        {canExecute ? <form className="agent-runtime-form" onSubmit={submitRun}><label htmlFor="agent-run-definition">Definition{canView ? <select id="agent-run-definition" value={selectedDefinitionKey} onChange={(event) => setSelectedDefinitionKey(event.target.value)}><option value="">Choose a definition</option>{definitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select> : <input id="agent-run-definition" value={selectedDefinitionKey} onChange={(event) => setSelectedDefinitionKey(event.target.value)} placeholder="Authorized definition key" autoComplete="off" />}</label><label htmlFor="agent-run-input">Run input JSON<textarea id="agent-run-input" value={runInput} onChange={(event) => setRunInput(event.target.value)} /></label><button type="submit" className="v2-primary-button" disabled={busy || !selectedDefinitionKey}>Start governed run</button></form> : <EmptyState>`agent.execute` is required to start or operate runs.</EmptyState>}
      </section>

      <section className="agent-runtime-panel agent-runtime-runs" aria-labelledby="agent-runs-heading">
        <div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Runs</span><h3 id="agent-runs-heading">Persisted activity</h3></div><Activity size={19} aria-hidden="true" /></div>
        {canView ? <div className="agent-runtime-list" role="list">{runs.length ? runs.map((run) => <button type="button" role="listitem" className={`agent-runtime-list-row ${selectedRun?.run.id === run.id ? 'is-selected' : ''}`} key={run.id} onClick={() => selectRun(run)}><span><strong>{run.definitionKey || run.workflowKey || 'Agent run'}</strong><small>{shortId(run.id)} · {formatWhen(run.updatedAt || run.createdAt)}</small></span><span className={statusClass(run.status)}>{run.status}</span></button>) : <EmptyState>No persisted agent runs are available.</EmptyState>}</div> : <EmptyState>`agent.view` is required to inspect the run timeline.</EmptyState>}
      </section>
    </div>

    {selectedRun ? <section className="agent-runtime-run-detail" aria-labelledby="agent-run-detail-heading">
      <div className="agent-runtime-run-heading"><div><span className="agent-runtime-kicker">Run detail</span><h3 id="agent-run-detail-heading">{selectedRun.run.definitionKey || selectedRun.run.workflowKey || 'Governed run'}</h3><p>{shortId(selectedRun.run.id)} · {selectedRun.run.correlationId ? `Correlation ${shortId(selectedRun.run.correlationId)}` : 'No correlation id recorded'}</p></div><span className={statusClass(runStatus)}>{runStatus || 'Unknown'}</span></div>
      <div className="agent-runtime-run-actions">
        {canExecute ? <button type="button" className="v2-secondary-button" disabled={busy} onClick={() => void performMutation(`run.execute.${selectedRun.run.id}`, { runId: selectedRun.run.id }, (key) => executeAgentRun(apiBase, selectedRun.run.id, key), 'Run execution request recorded.')}><Play size={15} aria-hidden="true" /> Execute</button> : null}
        {canExecute ? <button type="button" className="v2-secondary-button" disabled={busy} onClick={() => void performMutation(`run.retry.${selectedRun.run.id}`, { runId: selectedRun.run.id }, (key) => retryAgentRun(apiBase, selectedRun.run.id, key), 'Retry request recorded.')}><RefreshCw size={15} aria-hidden="true" /> Retry</button> : null}
        {canExecute ? <button type="button" className="agent-runtime-danger-button" disabled={busy} onClick={() => void performMutation(`run.cancel.${selectedRun.run.id}`, { runId: selectedRun.run.id }, (key) => cancelAgentRun(apiBase, selectedRun.run.id, key), 'Cancellation request recorded.')}><X size={15} aria-hidden="true" /> Cancel</button> : null}
      </div>
      {timeline.resyncRequired ? <div className="agent-runtime-resync" role="status">Replay window advanced. Persisted state is being reloaded from sequence {timeline.resyncAfterSequence ?? timeline.lastSequence}.</div> : null}
      <div className="agent-runtime-detail-grid">
        <TimelinePanel events={persistedEvents} />
        <ToolCallsPanel toolCalls={selectedRun.toolCalls ?? []} />
        <ArtifactsPanel artifacts={selectedRun.artifacts ?? []} />
        <EvidencePanel evidence={selectedRun.evidence} />
        <ErrorsPanel errors={selectedRun.errors ?? []} />
         <ConfirmationsPanel
           confirmations={selectedRun.confirmations ?? []}
           canConfirm={canConfirm}
           canInspectConfirmation={canInspectConfirmation}
           previews={confirmationPreviews}
           busy={busy}
          onDecision={(confirmationId, decision) => void performMutation(`run.confirm.${selectedRun.run.id}.${confirmationId}`, { runId: selectedRun.run.id, confirmationId, decision }, (key) => confirmAgentRun(apiBase, selectedRun.run.id, confirmationId, decision, key), `Confirmation ${decision.toLowerCase()}ed.`)}
        />
      </div>
    </section> : null}

    {canView && selectedDefinitionKey ? <section className="agent-runtime-definition-detail" aria-labelledby="agent-definition-detail-heading">
      <div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Definition detail</span><h3 id="agent-definition-detail-heading">{definitionDetail?.name || selectedDefinitionKey}</h3></div><Eye size={19} aria-hidden="true" /></div>
      <div className="agent-runtime-definition-columns"><div><h4>Definition</h4><JsonBlock value={definitionDetail} emptyLabel="No persisted definition detail is available." /></div><div><h4>Versions</h4>{definitionVersions.length ? <JsonBlock value={definitionVersions} emptyLabel="" /> : <EmptyState>No persisted versions are available.</EmptyState>}</div><div><h4>Policy</h4><JsonBlock value={definitionPolicy} emptyLabel="No persisted policy is available." /></div></div>
      {canManageTools ? <p className="agent-runtime-empty">Tenant definition, version, and policy editing is unavailable here because this runtime executes only server-published workflows.</p> : null}
    </section> : null}

    {(canEvaluate || canObserve) ? <div className="agent-runtime-lower-grid">
      {canEvaluate ? <section className="agent-runtime-panel" aria-labelledby="agent-evaluations-heading"><div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Evaluation</span><h3 id="agent-evaluations-heading">Runs and suites</h3></div><Check size={19} aria-hidden="true" /></div>{evaluations.length ? <div className="agent-runtime-list">{evaluations.map((evaluation) => <div className="agent-runtime-list-row is-static" key={evaluation.id}><span><strong>{evaluation.definitionKey || 'Evaluation'}</strong><small>{shortId(evaluation.id)} · {formatWhen(evaluation.updatedAt || evaluation.createdAt)}</small></span><span className={statusClass(evaluation.status)}>{evaluation.status || 'Unknown'}</span></div>)}</div> : <EmptyState>No persisted evaluations are available.</EmptyState>}<form className="agent-runtime-form" onSubmit={submitEvaluation}><label htmlFor="agent-evaluation-json">Evaluation JSON<textarea id="agent-evaluation-json" value={evaluationInput} placeholder="{}" onChange={(event) => setEvaluationInput(event.target.value)} /></label><button type="submit" className="v2-secondary-button" disabled={busy || !evaluationInput.trim()}>Run evaluation</button></form></section> : null}
      {canObserve ? <section className="agent-runtime-panel" aria-labelledby="agent-observability-heading"><div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Observability</span><h3 id="agent-observability-heading">Persisted metrics</h3></div><Activity size={19} aria-hidden="true" /></div><JsonBlock value={observability} emptyLabel="No persisted observability data is available." /></section> : null}
    </div> : null}
  </section>
}

function TimelinePanel({ events }: { events: AgentRuntimeEvent[] }) {
  return <section className="agent-runtime-detail-panel" aria-labelledby="agent-timeline-heading"><div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Replay</span><h4 id="agent-timeline-heading">Timeline</h4></div><Activity size={18} aria-hidden="true" /></div>{events.length ? <ol className="agent-runtime-timeline">{events.map((event) => <li key={event.id}><span className="agent-runtime-sequence">{event.sequence}</span><div><strong>{titleFromEvent(event.type)}</strong><small>{formatWhen(event.occurredAt)}</small><JsonBlock value={event.payload} emptyLabel="No persisted event payload." /></div></li>)}</ol> : <EmptyState>No persisted events have been replayed for this run.</EmptyState>}</section>
}

function ToolCallsPanel({ toolCalls }: { toolCalls: AgentRunDetail['toolCalls'] }) {
  return <section className="agent-runtime-detail-panel" aria-labelledby="agent-tool-calls-heading"><div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Tools</span><h4 id="agent-tool-calls-heading">Tool calls</h4></div><Wrench size={18} aria-hidden="true" /></div>{toolCalls?.length ? <div className="agent-runtime-record-list">{toolCalls.map((call, index) => <div key={`${call.id}-${index}`}><strong>{call.toolKey || call.tool || 'Registered tool'}</strong><span className={statusClass(call.status)}>{call.status || 'Unknown'}</span><small>Input {shortId(call.inputHash)} · Output {shortId(call.outputHash)}</small>{call.error ? <p className="agent-runtime-error-text">A governed tool error was recorded. Raw provider details are not displayed here.</p> : null}</div>)}</div> : <EmptyState>No persisted tool-call record is available.</EmptyState>}</section>
}

function ArtifactsPanel({ artifacts }: { artifacts: AgentRunDetail['artifacts'] }) {
  return <section className="agent-runtime-detail-panel" aria-labelledby="agent-artifacts-heading"><div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Output</span><h4 id="agent-artifacts-heading">Artifacts</h4></div><FileText size={18} aria-hidden="true" /></div>{artifacts?.length ? <div className="agent-runtime-record-list">{artifacts.map((artifact, index) => <div key={`${artifact.id}-${index}`}><strong>{artifact.name || artifact.artifactType || artifact.type || 'Persisted artifact'}</strong><span className={statusClass(artifact.status)}>{artifact.status || 'Recorded'}</span><JsonBlock value={artifact} emptyLabel="" /></div>)}</div> : <EmptyState>No persisted artifact is available.</EmptyState>}</section>
}

function EvidencePanel({ evidence }: { evidence: AgentRunEvidence | undefined }) {
  const lineage = evidence?.lineage ?? []
  const providerUsage = evidence?.providerUsage ?? []
  return <section className="agent-runtime-detail-panel" aria-labelledby="agent-evidence-heading"><div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Evidence</span><h4 id="agent-evidence-heading">Execution evidence</h4></div><Eye size={18} aria-hidden="true" /></div>{lineage.length || providerUsage.length ? <div className="agent-runtime-record-list">{lineage.map((item, index) => <div key={`lineage-${item.id}-${index}`}><strong>{item.relationType || 'Recorded lineage'}</strong><small>{item.sourceKind || 'Source'} {shortId(item.sourceRef)} to {item.targetKind || 'Target'} {shortId(item.targetRef)}</small>{item.sourceContentHash || item.targetContentHash ? <small>Hashes {shortId(item.sourceContentHash)} / {shortId(item.targetContentHash)}</small> : null}<small>{formatWhen(item.createdAt)}</small></div>)}{providerUsage.map((item, index) => <div key={`provider-${item.id}-${index}`}><strong>{item.providerKey || 'Provider usage'}{item.modelIdentifier ? ` / ${item.modelIdentifier}` : ''}</strong><span className={statusClass(item.usageStatus)}>{item.usageStatus || 'Recorded'}</span><small>Input {item.inputTokens ?? 0} tokens · Output {item.outputTokens ?? 0} tokens</small>{item.totalCostMicros ? <small>Recorded cost {item.totalCostMicros} micros</small> : null}<small>{formatWhen(item.createdAt)}</small></div>)}</div> : <EmptyState>No persisted lineage or provider-usage evidence is available.</EmptyState>}</section>
}

function ErrorsPanel({ errors }: { errors: AgentRunDetail['errors'] }) {
  return <section className="agent-runtime-detail-panel" aria-labelledby="agent-errors-heading"><div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Failures</span><h4 id="agent-errors-heading">Errors</h4></div><AlertTriangle size={18} aria-hidden="true" /></div>{errors?.length ? <div className="agent-runtime-record-list">{errors.map((error, index) => <div key={`${error.id || error.code || 'error'}-${index}`}><strong>{error.code || 'Agent runtime error'}</strong><p className="agent-runtime-error-text">A bounded failure record is available to authorized operational review. Raw exceptions are not displayed here.</p><small>{error.retryable ? 'Retryable by the service policy.' : 'Not marked retryable.'}</small></div>)}</div> : <EmptyState>No persisted errors are available.</EmptyState>}</section>
}

function ConfirmationPreview({ preview }: { preview: AgentConfirmationPreview }) {
  return <div className="agent-runtime-confirmation-preview" data-testid={`agent-confirmation-preview-${preview.confirmationId}`}>
    <small>Candidate {shortId(preview.candidateId)} / Formula project {shortId(preview.formulaProjectId)}</small>
    <small>Action hash {shortId(preview.actionHash)} / Initiator {shortId(preview.initiatorUserId)}</small>
    {preview.evidenceHashes.length ? <small>Evidence {preview.evidenceHashes.map((item) => `${item.kind}: ${shortId(item.hash)}`).join(' / ')}</small> : <small>No additional evidence hashes were recorded.</small>}
  </div>
}

function ConfirmationsPanel({ confirmations, previews, canConfirm, canInspectConfirmation, busy, onDecision }: { confirmations: AgentRunDetail['confirmations']; previews: Record<string, AgentConfirmationPreview>; canConfirm: boolean; canInspectConfirmation: boolean; busy: boolean; onDecision: (confirmationId: string, decision: 'APPROVE' | 'REJECT') => void }) {
  return <section className="agent-runtime-detail-panel" aria-labelledby="agent-confirmations-heading"><div className="agent-runtime-panel-heading"><div><span className="agent-runtime-kicker">Approval</span><h4 id="agent-confirmations-heading">Confirmations</h4></div><ShieldCheck size={18} aria-hidden="true" /></div>{confirmations?.length ? <div className="agent-runtime-record-list">{confirmations.map((confirmation, index) => {
    const pending = isPendingConfirmation(confirmation.status)
    const preview = previews[confirmation.id]
    return <div key={`${confirmation.id}-${index}`}><strong>{confirmation.actionKey || confirmation.action || 'Governed action'}</strong><span className={statusClass(confirmation.status)}>{confirmation.status || 'Unknown'}</span><small>Expires {formatWhen(confirmation.expiresAt)}</small>{canInspectConfirmation && pending ? (preview ? <ConfirmationPreview preview={preview} /> : <small>Loading bounded confirmation context.</small>) : null}{canConfirm && !canInspectConfirmation && pending ? <small>Formula-sensitive confirmation access is required before a decision can be made.</small> : null}{canInspectConfirmation && pending && preview ? <div className="agent-runtime-confirm-actions"><button type="button" className="v2-secondary-button" disabled={busy} onClick={() => onDecision(confirmation.id, 'APPROVE')}><Check size={15} aria-hidden="true" /> Approve</button><button type="button" className="agent-runtime-danger-button" disabled={busy} onClick={() => onDecision(confirmation.id, 'REJECT')}><X size={15} aria-hidden="true" /> Reject</button></div> : null}</div>
  })}</div> : <EmptyState>No persisted confirmation is awaiting review.</EmptyState>}</section>
}
