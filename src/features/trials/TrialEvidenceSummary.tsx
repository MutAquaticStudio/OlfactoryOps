import type { TrialComparableEvidence } from '../../data/northStar'

const scoreLabels = {
  OPENING: 'Opening',
  HEART: 'Heart',
  DRYDOWN: 'Drydown',
  LONGEVITY: 'Longevity',
  OVERALL: 'Overall',
} as const

export function TrialEvidenceSummary({
  evidence,
  formulaVersion,
  loading = false,
  unavailableMessage,
}: {
  evidence?: TrialComparableEvidence | null
  formulaVersion?: string
  loading?: boolean
  unavailableMessage?: string
}) {
  const unavailable = evidence?.status === 'NOT_AVAILABLE' || Boolean(unavailableMessage)
  const ready = evidence?.status === 'READY'
  const headline = loading
    ? 'Loading completed trial evidence'
    : unavailable
      ? 'Comparable evidence unavailable'
      : ready
        ? `${evidence.sampleCount} completed scorecards`
        : 'Not enough comparable evidence'

  return <section className="trial-memory-summary" data-testid="trial-evidence-summary" aria-live="polite">
    <div className="trial-memory-heading">
      <div><span>Trial history</span><strong>{headline}</strong></div>
      {formulaVersion ? <small>Immutable {formulaVersion}</small> : null}
    </div>
    {loading ? <p>Retrieving tenant-private sensory history.</p> : unavailable ? <p>{unavailableMessage ?? evidence?.summary ?? 'Your role cannot view comparable sensory history.'}</p> : ready ? <>
      <div className="trial-memory-metrics"><span>{evidence.confidence.toLowerCase()} confidence</span><span>{evidence.sampleCount} overall scorecards</span></div>
      <div className="trial-memory-scores">
        {Object.entries(scoreLabels).map(([timepoint, label]) => {
          const score = evidence.averages[timepoint as keyof typeof evidence.averages]
          return <div key={timepoint}><span>{label}</span><strong>{score === undefined ? 'Not evaluated' : `${score.toFixed(1)} / 10`}</strong></div>
        })}
      </div>
      <p>{evidence.summary}</p>
    </> : <p>{evidence?.summary ?? 'Create, release, evaluate, and decide at least three comparable trials before this history becomes descriptive evidence.'}</p>}
  </section>
}
