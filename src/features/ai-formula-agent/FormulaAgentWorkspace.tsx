import { AlertCircle, CheckCircle2, FlaskConical, LoaderCircle, PauseCircle, Play, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createAgentRunSnapshot,
  reduceAgentRuntimeEvent,
  type AgentArtifact,
  type AgentRunSnapshot,
  type AgentRuntimeEvent,
} from '../../data/agentRuntime'
import type { Formula } from '../../data/northStar'

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>

type RunRow = {
  id: string
  status: 'QUEUED' | 'RUNNING' | 'WAITING_FOR_CONFIRMATION' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  input_brief: string
  progress: number
  provider: string
  model_name?: string | null
  error_summary?: string | null
  created_at: string
  updated_at: string
}

type RunDetail = {
  run: RunRow
  nodes: Array<{ id: string; node_type: string; status: string; attempt: number; output_json?: string | null; validation_error?: string | null }>
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; status: string; created_at: string; completed_at?: string | null }>
  toolCalls: Array<{ id: string; node_id: string; tool_name: string; status: string; started_at?: string | null; completed_at?: string | null; error_summary?: string | null }>
  artifacts: Array<{ id: string; type: string; version: number; data: AgentArtifact; status: string }>
  confirmation?: { id: string; status: string; summary: string; payload: unknown }
}

type FormulaAgentWorkspaceProps = {
  apiBaseUrl: string
  requestApi: ApiRequest
  onFormulaSaved: (formula: Formula) => void
}

function idempotencyHeaders() {
  return { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }
}

function runStatusLabel(status: RunRow['status']) {
  return status.replaceAll('_', ' ').toLowerCase()
}

function artifactTitle(type: string) {
  return type.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function FormulaArtifact({ artifact }: { artifact: AgentArtifact }) {
  if (artifact.type === 'formula_table') {
    return (
      <div className="agent-artifact-body">
        <div className="agent-kpi-grid">
          <span><small>Target</small><strong>{artifact.data.targetGrams.toFixed(2)} g</strong></span>
          <span><small>Final concentration</small><strong>{artifact.data.finalProductConcentrationPercent.toFixed(2)}%</strong></span>
          <span><small>Estimated cost</small><strong>{artifact.data.currency ?? 'USD'} {artifact.data.totalEstimatedCost?.toFixed(2) ?? 'n/a'}</strong></span>
        </div>
        <div className="agent-formula-table">
          {artifact.data.ingredients.map((line) => (
            <div key={line.materialId} className="agent-formula-row">
              <div><strong>{line.materialName}</strong><small>{line.materialId}</small></div>
              <span>{line.percentage.toFixed(2)}%</span>
              <span>{line.weightGrams.toFixed(3)} g</span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (artifact.type === 'inventory_report') {
    return <div className="agent-artifact-list">{artifact.data.eligible.map((line) => <div key={line.materialId}><strong>{line.materialName}</strong><span>{line.status} / {line.availableGrams.toFixed(2)}g available / {line.requiredGrams.toFixed(2)}g required</span></div>)}</div>
  }
  if (artifact.type === 'cost_summary') {
    return <div className="agent-kpi-grid"><span><small>Total cost</small><strong>{artifact.data.currency} {artifact.data.totalCost.toFixed(2)}</strong></span><span><small>Cost / g</small><strong>{artifact.data.currency} {artifact.data.costPerGram.toFixed(4)}</strong></span><span><small>Cost driver</small><strong>{artifact.data.mostExpensiveMaterial}</strong></span></div>
  }
  if (artifact.type === 'compliance_report') {
    return <div className="agent-artifact-list"><div><strong>{artifact.data.status}</strong><span>IFRA category {artifact.data.ifraCategory}</span></div><p>{artifact.data.sourceLabel}</p>{artifact.data.warnings.map((warning) => <small key={warning}>{warning}</small>)}</div>
  }
  if (artifact.type === 'material_substitutions') {
    return <div className="agent-artifact-list">{artifact.data.suggestions.map((suggestion) => <div key={suggestion.sourceMaterialId}><strong>{suggestion.sourceMaterialName}</strong><span>{suggestion.alternatives.map((item) => `${item.materialName}: ${item.rationale}`).join(' | ')}</span></div>)}</div>
  }
  if (artifact.type === 'formula_revision_comparison') {
    return <div className="agent-artifact-list">{artifact.data.summary.map((line) => <p key={line}>{line}</p>)}</div>
  }
  if (artifact.type === 'design_directions') {
    return <div className="agent-artifact-list">{artifact.data.directions.map((direction) => <div key={direction.directionId}><strong>{direction.title}</strong><span>{direction.pyramidSummary} / {direction.availability} / {direction.complianceStatus}</span></div>)}</div>
  }
  if (artifact.type === 'optimizer_candidates') {
    return <div className="agent-artifact-list">{artifact.data.candidates.map((candidate) => <div key={candidate.candidateId}><strong>{candidate.title}</strong><span>Score {candidate.score.toFixed(1)} / {candidate.complianceStatus} / {candidate.availability}</span></div>)}</div>
  }
  if (artifact.type === 'evidence_citations') {
    if (artifact.data.state !== 'READY' || artifact.data.citations.length === 0) {
      return <div className="agent-artifact-list"><p>{artifact.data.state === 'NOT_CONFIGURED' ? 'Evidence retrieval is not configured.' : artifact.data.state === 'NOT_EVALUATED' ? 'Evidence is not available to this role.' : 'No approved evidence matched this research.'}</p></div>
    }
    return <div className="agent-artifact-list">{artifact.data.citations.map((citation) => <div key={citation.citationId}><strong>{citation.title}</strong><span>{citation.sourceKind === 'document' ? 'Reviewed document' : 'Material profile'} / {citation.version}{citation.page ? ` / p. ${citation.page}` : ''}{citation.section ? ` / ${citation.section}` : ''}</span><small>{citation.excerpt}</small></div>)}</div>
  }
  return <div className="agent-artifact-list">{artifact.data.assumptions.map((line) => <p key={line}>{line}</p>)}{artifact.data.warnings.map((line) => <small key={line}>{line}</small>)}</div>
}

export function FormulaAgentWorkspace({ apiBaseUrl, requestApi, onFormulaSaved }: FormulaAgentWorkspaceProps) {
  const [brief, setBrief] = useState('Marine woody fine fragrance with a bright citrus opening, smooth jasmine heart, and long-lasting amber base.')
  const [runs, setRuns] = useState<RunRow[]>([])
  const [activeRunId, setActiveRunId] = useState<string>()
  const [detail, setDetail] = useState<RunDetail>()
  const [snapshot, setSnapshot] = useState<AgentRunSnapshot>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [connectionState, setConnectionState] = useState<'idle' | 'live' | 'reconnecting'>('idle')
  const buffer = useRef(new Map<number, AgentRuntimeEvent>())
  const eventSource = useRef<EventSource | null>(null)

  const refreshRuns = useCallback(async () => {
    const data = await requestApi<RunRow[]>('/agent/runs')
    setRuns(data)
    setActiveRunId((current) => current && data.some((run) => run.id === current) ? current : data[0]?.id)
  }, [requestApi])

  const loadRun = useCallback(async (runId: string) => {
    const [nextDetail, events] = await Promise.all([
      requestApi<RunDetail>(`/agent/runs/${encodeURIComponent(runId)}`),
      requestApi<AgentRuntimeEvent[]>(`/agent/runs/${encodeURIComponent(runId)}/events?afterSequence=0`),
    ])
    buffer.current.clear()
    let nextSnapshot = createAgentRunSnapshot(runId)
    for (const event of events.sort((left, right) => left.sequence - right.sequence)) nextSnapshot = reduceAgentRuntimeEvent(nextSnapshot, event)
    setDetail(nextDetail)
    setSnapshot(nextSnapshot)
  }, [requestApi])

  const applyEvent = useCallback((event: AgentRuntimeEvent) => {
    buffer.current.set(event.sequence, event)
    setSnapshot((current) => {
      let next = current?.runId === event.runId ? current : createAgentRunSnapshot(event.runId)
      while (buffer.current.has(next.lastSequence + 1)) {
        const contiguous = buffer.current.get(next.lastSequence + 1)!
        buffer.current.delete(next.lastSequence + 1)
        next = reduceAgentRuntimeEvent(next, contiguous)
      }
      return next
    })
  }, [])

  useEffect(() => { void refreshRuns().catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load formula research runs')) }, [refreshRuns])
  useEffect(() => { if (activeRunId) void loadRun(activeRunId).catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to restore run')) }, [activeRunId, loadRun])
  useEffect(() => {
    eventSource.current?.close()
    if (!activeRunId) { setConnectionState('idle'); return }
    const source = new EventSource(`${apiBaseUrl}/agent/runs/${encodeURIComponent(activeRunId)}/stream`, { withCredentials: true })
    eventSource.current = source
    source.onopen = () => setConnectionState('live')
    const receive = (message: MessageEvent) => {
      try {
        const event = JSON.parse(message.data) as AgentRuntimeEvent
        applyEvent(event)
        if (event.type === 'artifact.created' || event.type === 'artifact.updated' || event.type.startsWith('tool.') || event.type.startsWith('confirmation.') || event.type === 'run.completed' || event.type === 'run.failed') {
          void loadRun(event.runId).catch(() => undefined)
        }
      } catch { /* Unknown future event is ignored. */ }
    }
    source.onmessage = receive
    ;[
      'run.created', 'run.queued', 'run.started', 'run.paused', 'run.resumed', 'run.cancelled', 'run.completed', 'run.failed',
      'message.started', 'message.delta', 'message.completed',
      'node.queued', 'node.started', 'node.progress', 'node.completed', 'node.failed', 'node.retrying',
      'tool.requested', 'tool.started', 'tool.completed', 'tool.failed', 'confirmation.requested', 'confirmation.accepted',
      'confirmation.rejected', 'artifact.created', 'artifact.updated',
    ].forEach((type) => source.addEventListener(type, receive))
    source.onerror = () => setConnectionState('reconnecting')
    return () => { source.close(); setConnectionState('idle') }
  }, [activeRunId, apiBaseUrl, applyEvent, loadRun])
  useEffect(() => () => eventSource.current?.close(), [])

  const activeRun = useMemo(() => runs.find((run) => run.id === activeRunId) ?? detail?.run, [activeRunId, detail?.run, runs])
  const artifacts = detail?.artifacts ?? []
  const confirmation = detail?.confirmation
  const messages = useMemo(() => {
    const visible = new Map<string, { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; complete: boolean }>()
    for (const message of detail?.messages ?? []) visible.set(message.id, { id: message.id, role: message.role, content: message.content, createdAt: message.created_at, complete: message.status === 'COMPLETED' })
    for (const message of snapshot?.messages ?? []) visible.set(message.id, message)
    return [...visible.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }, [detail?.messages, snapshot?.messages])
  const failedNodes = useMemo(() => Object.values(snapshot?.nodes ?? {}).filter((node) => node.status === 'FAILED'), [snapshot?.nodes])

  async function startRun() {
    setBusy(true); setNotice(undefined)
    try {
      const result = await requestApi<RunDetail>('/agent/runs', { method: 'POST', headers: idempotencyHeaders(), body: JSON.stringify({ brief }) })
      setRuns((current) => [result.run, ...current.filter((run) => run.id !== result.run.id)])
      setActiveRunId(result.run.id)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to start formula research') } finally { setBusy(false) }
  }

  async function changeRun(action: 'cancel' | 'resume' | 'restart') {
    if (!activeRunId) return
    setBusy(true); setNotice(undefined)
    try {
      const response = await requestApi<{ run?: RunRow; previousRunId?: string }>(`/agent/runs/${encodeURIComponent(activeRunId)}/${action}`, { method: 'POST', headers: idempotencyHeaders(), body: '{}' })
      await refreshRuns()
      if (response.run?.id) setActiveRunId(response.run.id)
      else await loadRun(activeRunId)
    } catch (error) { setNotice(error instanceof Error ? error.message : `Unable to ${action} run`) } finally { setBusy(false) }
  }

  async function confirmSave(decision: 'accept' | 'reject') {
    if (!activeRunId || !confirmation || confirmation.status !== 'PENDING') return
    setBusy(true); setNotice(undefined)
    try {
      const result = await requestApi<{ formula?: Formula }>(`/agent/runs/${encodeURIComponent(activeRunId)}/confirmations/${encodeURIComponent(confirmation.id)}`, {
        method: 'POST', headers: idempotencyHeaders(), body: JSON.stringify({ decision }),
      })
      if (result.formula) onFormulaSaved(result.formula)
      await refreshRuns(); await loadRun(activeRunId)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to resolve formula confirmation') } finally { setBusy(false) }
  }

  async function retryNode(nodeId: string) {
    if (!activeRunId) return
    setBusy(true); setNotice(undefined)
    try {
      await requestApi<RunDetail>(`/agent/runs/${encodeURIComponent(activeRunId)}/nodes/${encodeURIComponent(nodeId)}/retry`, { method: 'POST', headers: idempotencyHeaders(), body: '{}' })
      await refreshRuns(); await loadRun(activeRunId)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to retry workflow node') } finally { setBusy(false) }
  }

  return (
    <div className="domain-page formula-agent-page">
      <section className="panel glass formula-agent-hero">
        <div><span className="mono-small">Formula Research Agent</span><h2>Structured formula research</h2><p>Use workspace materials and live inventory evidence. The agent cannot consume stock and cannot save a formula without your confirmation.</p></div>
        <span className="status-chip green"><Sparkles size={14} /> {activeRun?.provider === 'openai' ? 'OpenAI configured' : 'Deterministic mock mode'}</span>
      </section>
      <div className="formula-agent-grid">
        <section className="panel glass formula-agent-compose">
          <div className="panel-title-row"><div><Sparkles size={18} /><h3>Research brief</h3></div><span>Tenant-scoped</span></div>
          <textarea value={brief} maxLength={6000} onChange={(event) => setBrief(event.target.value)} aria-label="Formula research brief" />
          <div className="formula-agent-actions"><button className="primary-button" type="button" disabled={busy || brief.trim().length < 8} onClick={() => void startRun()}><Play size={16} /> Start research</button><small>Results are structured artifacts, never model HTML.</small></div>
          {notice ? <div className="agent-notice"><AlertCircle size={15} /> {notice}</div> : null}
          <div className="agent-run-list">
            {runs.length === 0 ? <p className="empty-state compact">No research runs yet.</p> : runs.map((run) => <button type="button" className={`agent-run-row ${run.id === activeRunId ? 'is-active' : ''}`} onClick={() => setActiveRunId(run.id)} key={run.id}><span><strong>{run.input_brief}</strong><small>{new Date(run.updated_at).toLocaleString()}</small></span><em>{runStatusLabel(run.status)}</em></button>)}
          </div>
        </section>
        <section className="panel glass formula-agent-workflow">
          <div className="panel-title-row"><div><FlaskConical size={18} /><h3>Workflow</h3></div>{activeRun ? <span className="status-chip blue">{activeRun.progress}%</span> : null}</div>
          {activeRun ? <><div className="agent-progress"><span style={{ width: `${snapshot?.status === 'COMPLETED' ? 100 : activeRun.progress}%` }} /></div><div className="agent-workflow-list">{Object.values(snapshot?.nodes ?? {}).map((node) => <div key={node.id} className={`agent-node is-${node.status.toLowerCase()}`}><span>{node.status === 'COMPLETED' ? <CheckCircle2 size={16} /> : node.status === 'FAILED' ? <XCircle size={16} /> : <LoaderCircle size={16} />}</span><div><strong>{node.type.replaceAll('_', ' ')}</strong><small>{node.status.toLowerCase().replaceAll('_', ' ')}</small></div></div>)}</div><div className="formula-agent-actions"><button className="ghost-button small" type="button" disabled={busy || activeRun.status !== 'RUNNING'} onClick={() => void changeRun('cancel')}><PauseCircle size={14} /> Cancel</button><button className="ghost-button small" type="button" disabled={busy || !['FAILED', 'PAUSED'].includes(activeRun.status)} onClick={() => void changeRun('resume')}><Play size={14} /> Resume</button><button className="ghost-button small" type="button" disabled={busy} onClick={() => void changeRun('restart')}><RotateCcw size={14} /> Restart</button></div></> : <p className="empty-state compact">Start a research run to stream node progress.</p>}
        </section>
      </div>
      {activeRun ? <section className="panel glass agent-conversation">
        <div className="panel-title-row"><div><Sparkles size={18} /><h3>Research activity</h3></div><span className={`status-chip ${connectionState === 'live' ? 'green' : 'blue'}`}>{connectionState === 'live' ? 'Live' : connectionState === 'reconnecting' ? 'Reconnecting' : 'Restored'}</span></div>
        <div className="agent-message-list">{messages.map((message) => <article className={`agent-message is-${message.role}`} key={message.id}><strong>{message.role === 'user' ? 'You' : 'Formula agent'}</strong><p>{message.content || 'Preparing structured evidence...'}</p><small>{new Date(message.createdAt).toLocaleTimeString()} {message.complete ? '' : 'streaming'}</small></article>)}</div>
        {detail?.toolCalls?.length ? <div className="agent-tool-strip">{detail.toolCalls.map((tool) => <span key={tool.id} className={tool.status === 'FAILED' ? 'is-failed' : ''}>{tool.tool_name.replaceAll('_', ' ')}: {tool.status.toLowerCase()}</span>)}</div> : null}
        {failedNodes.length ? <div className="agent-retry-list">{failedNodes.map((node) => <button className="ghost-button small" type="button" disabled={busy} onClick={() => void retryNode(node.id)} key={node.id}><RotateCcw size={14} /> Retry {node.type.replaceAll('_', ' ')}</button>)}</div> : null}
      </section> : null}
      {confirmation?.status === 'PENDING' ? <section className="panel glass agent-confirmation"><div><span className="mono-small">Confirmation required</span><h3>{confirmation.summary}</h3><p>This creates one editable, non-consuming formula draft. It does not reserve or consume any lot.</p></div><div className="formula-agent-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void confirmSave('accept')}><CheckCircle2 size={16} /> Save formula draft</button><button className="ghost-button" type="button" disabled={busy} onClick={() => void confirmSave('reject')}>Discard proposal</button></div></section> : null}
      <section className="formula-agent-artifacts">
        {artifacts.length === 0 ? <section className="panel glass empty-state"><p>Structured research artifacts will appear here as workflow nodes complete.</p></section> : artifacts.map((artifact) => <section className="panel glass agent-artifact" key={artifact.id}><div className="panel-title-row"><div><FlaskConical size={17} /><h3>{artifactTitle(artifact.type)}</h3></div><span className="status-chip green">validated</span></div><FormulaArtifact artifact={artifact.data} /></section>)}
      </section>
    </div>
  )
}
