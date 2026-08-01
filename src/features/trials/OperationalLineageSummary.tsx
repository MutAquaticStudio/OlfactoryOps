import type { OperationalLineageProjection } from '../../data/northStar'

export function OperationalLineageSummary({
  lineage,
  loading = false,
  unavailableMessage,
}: {
  lineage?: OperationalLineageProjection | null
  loading?: boolean
  unavailableMessage?: string
}) {
  const metrics = lineage?.impact
  return <section className="trial-memory-summary" data-testid="operational-lineage-summary" aria-live="polite">
    <div className="trial-memory-heading"><div><span>Operational trace</span><strong>{loading ? 'Loading linked records' : lineage ? 'Current formula impact' : 'Trace unavailable'}</strong></div></div>
    {loading ? <p>Retrieving tenant-scoped relationships.</p> : unavailableMessage ? <p>{unavailableMessage}</p> : metrics ? <>
      <div className="trial-memory-metrics"><span>{metrics.trials} trials</span><span>{metrics.lots} lots</span><span>{metrics.batches} batches</span><span>{metrics.orders} orders</span></div>
      <p>{lineage?.invariant}</p>
    </> : <p>Traceability will appear as this formula is used in trials and operations.</p>}
  </section>
}
