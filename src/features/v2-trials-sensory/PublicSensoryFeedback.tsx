import { useEffect, useState } from 'react'
import { defaultPublicSensoryApiBase, idempotencyKey, publicSensoryRequest } from './api'
import { SensoryScorecard } from './SensoryScorecard'
import type { PublicSensoryPresentation, ScorecardPayload } from './types'
import './trialsSensory.css'

type PublicSensoryFeedbackProps = {
  token?: string
  apiBase?: string
  onComplete?: () => void
}

function tokenFromLocation() {
  const queryToken = new URLSearchParams(window.location.search).get('token')
  if (queryToken) return queryToken
  const segments = window.location.pathname.split('/').filter(Boolean)
  const sensoryIndex = segments.lastIndexOf('sensory')
  return sensoryIndex >= 0 ? decodeURIComponent(segments[sensoryIndex + 1] ?? '') : ''
}

export function PublicSensoryFeedback({ token: suppliedToken, apiBase = defaultPublicSensoryApiBase, onComplete }: PublicSensoryFeedbackProps) {
  const token = suppliedToken ?? tokenFromLocation()
  const [presentation, setPresentation] = useState<PublicSensoryPresentation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submissionKey, setSubmissionKey] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!token) {
      setError('This scorecard link is incomplete.')
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    setError(null)
    void publicSensoryRequest<{ presentation: PublicSensoryPresentation }>(apiBase, `/${encodeURIComponent(token)}`)
      .then((payload) => { if (active) setPresentation(payload.presentation) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'This scorecard is unavailable.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [apiBase, token])

  const submit = async (payload: ScorecardPayload) => {
    const { final, ...body } = payload
    const key = submissionKey ?? idempotencyKey()
    setSubmissionKey(key)
    await publicSensoryRequest(apiBase, `/${encodeURIComponent(token)}/evaluations`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify({ ...body, final }),
    })
    setSubmissionKey(null)
  }

  return (
    <main className="v2-public-sensory-page" data-testid="v2-public-sensory-feedback">
      <div className="v2-public-sensory-shell">
        <header className="v2-public-sensory-header">
          <span className="v2-eyebrow">OlfactoryOps sensory feedback</span>
          <h1>{presentation?.title ?? 'Sensory scorecard'}</h1>
          {presentation ? <p>{presentation.instructions}</p> : null}
        </header>
        {loading ? <div className="v2-public-sensory-state" aria-live="polite">Loading scorecard</div> : null}
        {!loading && error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}
        {!loading && presentation ? (
          <SensoryScorecard
            form={presentation.form}
            sampleLabel={presentation.sampleCode}
            submitLabel="Submit feedback"
            onSubmit={submit}
            onComplete={onComplete}
          />
        ) : null}
      </div>
    </main>
  )
}
