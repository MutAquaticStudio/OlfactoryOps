import { useEffect, useState } from 'react'
import { CheckCircle2, FlaskConical } from 'lucide-react'
import type { SensoryStabilityStatus, SensoryTimepoint } from '../../data/northStar'

type PublicPresentation = {
  sampleCode: string
  title: string
  presentationMode: 'BLIND' | 'BRAND_REVIEW'
  narrative?: string
  pyramid?: string
  timepoints: SensoryTimepoint[]
  closesAt?: string
}

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>

const timepoints: SensoryTimepoint[] = ['OPENING', 'HEART', 'DRYDOWN', 'LONGEVITY', 'OVERALL']

export function PublicTrialFeedback({ token, requestApi }: { token: string; requestApi: ApiRequest }) {
  const [presentation, setPresentation] = useState<PublicPresentation | null>(null)
  const [timepoint, setTimepoint] = useState<SensoryTimepoint>('OPENING')
  const [scores, setScores] = useState<Record<SensoryTimepoint, number>>({ OPENING: 7, HEART: 7, DRYDOWN: 7, LONGEVITY: 7, OVERALL: 7 })
  const [descriptors, setDescriptors] = useState('')
  const [observation, setObservation] = useState('')
  const [stability, setStability] = useState<SensoryStabilityStatus>('STABLE')
  const [status, setStatus] = useState('Loading feedback session...')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void requestApi<PublicPresentation>(`/trials/public/${encodeURIComponent(token)}`)
      .then((result) => { setPresentation(result); setStatus('') })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : 'This feedback link is unavailable.'))
  }, [requestApi, token])

  async function submit() {
    setBusy(true)
    try {
      await requestApi(`/trials/public/${encodeURIComponent(token)}/observations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timepoint, scores, descriptors: descriptors.split(',').map((item) => item.trim()).filter(Boolean), observation, stability, idempotencyKey: crypto.randomUUID() }),
      })
      setStatus(`${timepoint.charAt(0)}${timepoint.slice(1).toLowerCase()} feedback saved.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Feedback could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="public-trial-feedback">
      <section className="public-trial-card">
        <span className="eyebrow"><FlaskConical size={14} /> Sensory feedback</span>
        <h1>{presentation?.title ?? 'Trial feedback'}</h1>
        <p className="public-trial-code">Sample {presentation?.sampleCode ?? '...'}</p>
        {presentation?.presentationMode === 'BRAND_REVIEW' ? <div className="public-trial-narrative"><p>{presentation.narrative}</p>{presentation.pyramid ? <p>{presentation.pyramid}</p> : null}</div> : <p className="field-hint">This is a blind session. Please evaluate the sample as presented.</p>}
        {presentation ? (
          <>
            <div className="public-timepoints" role="tablist" aria-label="Evaluation timepoint">
              {timepoints.map((item) => <button key={item} type="button" className={item === timepoint ? 'is-active' : ''} onClick={() => setTimepoint(item)}>{item.toLowerCase()}</button>)}
            </div>
            <label className="public-score">{timepoint.toLowerCase()} score <output>{scores[timepoint]}/10</output><input type="range" min="1" max="10" step="0.5" value={scores[timepoint]} onChange={(event) => setScores((current) => ({ ...current, [timepoint]: Number(event.target.value) }))} /></label>
            <div className="public-score-grid">
              {timepoints.filter((item) => item !== timepoint).map((item) => <label key={item}>{item.toLowerCase()}<input type="number" min="1" max="10" step="0.5" value={scores[item]} onChange={(event) => setScores((current) => ({ ...current, [item]: Number(event.target.value) }))} /></label>)}
            </div>
            <label>Descriptors (comma separated)<input value={descriptors} maxLength={432} onChange={(event) => setDescriptors(event.target.value)} placeholder="bright, mineral, soft" /></label>
            <label>Stability<select value={stability} onChange={(event) => setStability(event.target.value as SensoryStabilityStatus)}><option value="STABLE">Stable</option><option value="WATCH">Watch</option><option value="UNSTABLE">Unstable</option></select></label>
            <label>Observation<textarea value={observation} maxLength={2000} onChange={(event) => setObservation(event.target.value)} rows={4} placeholder="What stands out at this stage?" /></label>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void submit()}><CheckCircle2 size={16} /> Save feedback</button>
          </>
        ) : null}
        {status ? <p className="agent-notice" role="status">{status}</p> : null}
      </section>
    </main>
  )
}
