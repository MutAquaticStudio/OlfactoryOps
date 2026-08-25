import { useEffect, useState } from 'react'
import { Activity, FlaskConical } from 'lucide-react'
import { trainingModeLabel } from './olfactory-research-labels'

type ResearchModel = { id: string; name: string; version: string; stage: 'RESEARCH'; trainingMode: string; datasetVersion: string }
type Prediction = {
  id: string
  status: 'SUCCESS'
  modelName: string
  modelVersionId: string
  modelStage: 'RESEARCH'
  trainingMode: string
  datasetVersion: string
  canonicalSmiles: string
  inputStructureHash: string
  predictions: Array<{ descriptor: string; targetKey: string; score: number; scale: string; uncertainty: number; uncertaintyMethod: string }>
  provenance: { upstreamCommit: string; checkpointSha256: string; evaluationHash: string }
  evidenceStatus: 'EVALUATED_RESEARCH'
  runtimeVersion: string
}

export type ResearchPanelState = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'NOT_EVALUATED' | 'NOT_CONFIGURED' | 'ERROR'

class ApiFailure extends Error {
  readonly code: string
  constructor(code: string) { super(code); this.code = code }
}

function scientificBase(suffix: string) {
  return (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/api\/v1\/?$/, `/api/v1/v2/${suffix}`)
}

async function scientificRequest<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const csrf = document.cookie.match(/(?:^|;\s*)oo_v2_csrf=([^;]+)/)?.[1] || window.localStorage.getItem('oo_v2_csrf') || undefined
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}),
      ...(init?.method && init.method !== 'GET' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
      ...(init?.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({})) as { error?: { code?: string } }
  if (!response.ok) throw new ApiFailure(payload.error?.code || 'REQUEST_FAILED')
  return payload as T
}

function researchStateForError(error: unknown): ResearchPanelState {
  const code = error instanceof ApiFailure ? error.code : ''
  if (['ODOR_MODEL_NOT_EVALUATED', 'MODEL_EVIDENCE_MISMATCH', 'MOLECULAR_IDENTITY_NOT_EVALUATED'].includes(code)) return 'NOT_EVALUATED'
  if (['MODEL_RUNTIME_NOT_CONFIGURED', 'NOT_CONFIGURED'].includes(code)) return 'NOT_CONFIGURED'
  return 'ERROR'
}

export function OlfactoryResearchPanel({ material, predictionAllowed = true, predictionBlockReason }: { material?: { id: string; name: string }; predictionAllowed?: boolean; predictionBlockReason?: string }) {
  const [models, setModels] = useState<ResearchModel[]>([])
  const [modelVersionId, setModelVersionId] = useState('')
  const [state, setState] = useState<ResearchPanelState>('IDLE')
  const [prediction, setPrediction] = useState<Prediction | null>(null)

  useEffect(() => {
    let active = true
    void scientificRequest<{ models: ResearchModel[] }>(scientificBase('model-dataset'), '/models/research-ready')
      .then((payload) => {
        if (!active) return
        setModels(payload.models)
        setModelVersionId(payload.models[0]?.id ?? '')
      })
      .catch((error) => { if (active) setState(researchStateForError(error)) })
    return () => { active = false }
  }, [])

  const run = async () => {
    if (!material || !modelVersionId || !predictionAllowed) { setState('NOT_EVALUATED'); return }
    setState('RUNNING'); setPrediction(null)
    try {
      const payload = await scientificRequest<{ prediction: Prediction }>(scientificBase('olfactory-intelligence'), `/materials/${encodeURIComponent(material.id)}/odor-predictions`, {
        method: 'POST',
        body: JSON.stringify({ modelVersionId, requestedTask: 'odor-descriptor' }),
      })
      setPrediction(payload.prediction)
      setState('SUCCESS')
    } catch (error) { setState(researchStateForError(error)) }
  }

  const topPredictions = [...(prediction?.predictions ?? [])].sort((left, right) => right.score - left.score).slice(0, 8)
  return <section className="v2-olfactory-research" aria-labelledby="olfactory-research-title" data-state={state}>
    <div className="v2-olfactory-research-heading">
      <div><span className="v2-section-kicker">Scientific / Olfactory Intelligence</span><h3 id="olfactory-research-title">Research odor profile</h3><p>{material ? `Selected material: ${material.name}` : 'Select a tenant material to inspect its verified molecular evidence.'}</p></div>
      <FlaskConical size={22} aria-hidden="true" />
    </div>
    <div className="v2-olfactory-research-controls">
      <label>Evaluated research model<select value={modelVersionId} onChange={(event) => setModelVersionId(event.target.value)} disabled={!models.length || state === 'RUNNING'}><option value="">No eligible model registered</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} / {model.version}</option>)}</select></label>
      <button className="v2-primary-button" type="button" disabled={!material || !modelVersionId || !predictionAllowed || state === 'RUNNING'} onClick={() => void run()}>{state === 'RUNNING' ? 'Running bounded inference' : 'Run Research Prediction'}</button>
    </div>
    {!predictionAllowed && predictionBlockReason ? <div className="v2-alert" role="status">{predictionBlockReason}</div> : null}
    {state === 'IDLE' ? <p className="v2-muted">No inference has been requested.</p> : null}
    {state === 'RUNNING' ? <p className="v2-olfactory-runtime-state" role="status"><Activity size={16} aria-hidden="true" /> Verifying model and molecular evidence</p> : null}
    {state === 'NOT_EVALUATED' ? <div className="v2-alert" role="status">A verified molecular identity and evaluated research checkpoint are required.</div> : null}
    {state === 'NOT_CONFIGURED' ? <div className="v2-alert" role="status">The private research model runtime is not configured in this environment.</div> : null}
    {state === 'ERROR' ? <div className="v2-alert is-error" role="alert">Research inference could not be completed. No fallback result was generated.</div> : null}
    {state === 'SUCCESS' && prediction ? <div className="v2-olfactory-result">
      <div className="v2-olfactory-evidence"><div><span>Model</span><strong>{prediction.modelName}</strong><small>{prediction.modelStage} / {trainingModeLabel(prediction.trainingMode)}</small></div><div><span>Molecular identity</span><strong className="v2-mono">{prediction.canonicalSmiles}</strong><small>Structure {prediction.inputStructureHash.slice(0, 12)}</small></div><div><span>Evidence</span><strong>Evaluated research</strong><small>Dataset {prediction.datasetVersion}</small></div></div>
      <div className="v2-odor-score-grid">{topPredictions.map((item) => <article key={item.targetKey}><div><strong>{item.descriptor}</strong><span>{item.score.toFixed(3)}</span></div><progress max="1" value={Math.max(0, Math.min(1, item.score))} aria-label={`${item.descriptor} score ${item.score.toFixed(3)}`} /><small>Score on source 0-1 response scale, not probability. Estimated uncertainty ±{item.uncertainty.toFixed(3)}.</small></article>)}</div>
    </div> : null}
    <p className="v2-olfactory-disclaimer">Research model. Not a safety, regulatory, IFRA, supplier, or formula-approval decision.</p>
  </section>
}
