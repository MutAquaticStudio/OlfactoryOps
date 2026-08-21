import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { ScorecardPayload, SensoryDimension, SensoryFormSchema } from './types'

type SensoryScorecardProps = {
  form: SensoryFormSchema
  sampleLabel: string
  allowDraft?: boolean
  submitLabel?: string
  onSubmit: (payload: ScorecardPayload) => Promise<void>
  onComplete?: () => void
}

function responseIsComplete(dimension: SensoryDimension, ratings: Record<string, number>, responses: Record<string, string | string[]>) {
  if (dimension.kind === 'RATING') return ratings[dimension.key] !== undefined
  const value = responses[dimension.key]
  if (dimension.kind === 'DESCRIPTOR') return Array.isArray(value) && value.length > 0
  return typeof value === 'string' && value.trim().length > 0
}

function optionalNumber(value: string) {
  const parsed = Number(value)
  return value.trim() === '' || !Number.isInteger(parsed) ? undefined : parsed
}

export function SensoryScorecard({ form, sampleLabel, allowDraft = false, submitLabel = 'Submit scorecard', onSubmit, onComplete }: SensoryScorecardProps) {
  const formId = useId()
  const [timepoint, setTimepoint] = useState(form.timepoints[0] ?? '')
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [controlledResponses, setControlledResponses] = useState<Record<string, string | string[]>>({})
  const [descriptors, setDescriptors] = useState<string[]>([])
  const [observation, setObservation] = useState('')
  const [comparison, setComparison] = useState('')
  const [preferenceRank, setPreferenceRank] = useState('')
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setRating = (key: string, rawValue: string) => {
    setRatings((current) => {
      const next = { ...current }
      if (rawValue === '') delete next[key]
      else next[key] = Number(rawValue)
      return next
    })
  }

  const setResponse = (key: string, value: string | string[]) => {
    setControlledResponses((current) => ({ ...current, [key]: value }))
  }

  const toggleResponseOption = (key: string, option: string) => {
    const current = controlledResponses[key]
    const selected = Array.isArray(current) ? current : []
    setResponse(key, selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option])
  }

  const toggleDescriptor = (descriptor: string) => {
    setDescriptors((current) => current.includes(descriptor) ? current.filter((item) => item !== descriptor) : [...current, descriptor])
  }

  const submit = async (final: boolean) => {
    setError(null)
    if (!timepoint) {
      setError('Choose a timepoint before saving this scorecard.')
      return
    }
    if (final) {
      const missing = form.dimensions.filter((dimension) => dimension.required !== false && !responseIsComplete(dimension, ratings, controlledResponses))
      if (missing.length) {
        setError(`Complete the required fields: ${missing.map((dimension) => dimension.label).join(', ')}.`)
        return
      }
    }
    const rank = optionalNumber(preferenceRank)
    if (preferenceRank.trim() && rank === undefined) {
      setError('Preference rank must be a whole number.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        timepoint,
        ratings,
        controlledResponses,
        descriptors,
        ...(observation.trim() ? { observation: observation.trim() } : {}),
        ...(comparison.trim() ? { comparison: comparison.trim() } : {}),
        ...(rank === undefined ? {} : { preferenceRank: rank }),
        final,
      })
      if (final) {
        setComplete(true)
        onComplete?.()
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The scorecard could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submit(true)
  }

  return (
    <form className="v2-sensory-scorecard" onSubmit={handleSubmit} aria-label={`Sensory scorecard for ${sampleLabel}`}>
      <div className="v2-sensory-scorecard-header">
        <div>
          <span className="v2-eyebrow">Assigned sample</span>
          <h3>{sampleLabel}</h3>
        </div>
        <label className="v2-sensory-timepoint">
          <span>Timepoint</span>
          <select value={timepoint} onChange={(event) => setTimepoint(event.target.value)} disabled={busy || complete} required>
            {form.timepoints.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="v2-sensory-dimensions">
        {form.dimensions.map((dimension) => {
          const minimum = dimension.minimum ?? 1
          const maximum = dimension.maximum ?? 10
          const required = dimension.required !== false
          const fieldId = `${formId}-${dimension.key}`
          if (dimension.kind === 'RATING') return (
            <label className="v2-sensory-field" key={dimension.key} htmlFor={fieldId}>
              <span><strong>{dimension.label}</strong>{required ? <em>Required</em> : null}</span>
              <input
                id={fieldId}
                type="number"
                min={minimum}
                max={maximum}
                step="1"
                value={ratings[dimension.key] ?? ''}
                onChange={(event) => setRating(dimension.key, event.target.value)}
                disabled={busy || complete}
                required={required}
              />
              <small>{minimum} to {maximum}</small>
            </label>
          )
          if (dimension.kind === 'ORDINAL') return (
            <fieldset className="v2-sensory-field" key={dimension.key} disabled={busy || complete}>
              <legend><strong>{dimension.label}</strong>{required ? <em>Required</em> : null}</legend>
              <div className="v2-sensory-option-list">
                {(dimension.options ?? []).map((option) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name={fieldId}
                      value={option}
                      checked={controlledResponses[dimension.key] === option}
                      onChange={() => setResponse(dimension.key, option)}
                      required={required}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )
          if (dimension.kind === 'DESCRIPTOR') {
            const selected = controlledResponses[dimension.key]
            const selectedOptions = Array.isArray(selected) ? selected : []
            return (
              <fieldset className="v2-sensory-field" key={dimension.key} disabled={busy || complete}>
                <legend><strong>{dimension.label}</strong>{required ? <em>Required</em> : null}</legend>
                <div className="v2-sensory-option-list">
                  {(dimension.options ?? []).map((option) => (
                    <label key={option}>
                      <input type="checkbox" checked={selectedOptions.includes(option)} onChange={() => toggleResponseOption(dimension.key, option)} />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          }
          return (
            <label className="v2-sensory-field" key={dimension.key} htmlFor={fieldId}>
              <span><strong>{dimension.label}</strong>{required ? <em>Required</em> : null}</span>
              <textarea
                id={fieldId}
                maxLength={80}
                value={typeof controlledResponses[dimension.key] === 'string' ? controlledResponses[dimension.key] : ''}
                onChange={(event) => setResponse(dimension.key, event.target.value)}
                disabled={busy || complete}
                required={required}
              />
            </label>
          )
        })}
      </div>

      {form.descriptorVocabulary.length ? (
        <fieldset className="v2-sensory-field" disabled={busy || complete}>
          <legend><strong>Descriptors</strong><em>Optional</em></legend>
          <div className="v2-sensory-chip-list">
            {form.descriptorVocabulary.map((descriptor) => (
              <label key={descriptor} className={descriptors.includes(descriptor) ? 'is-selected' : ''}>
                <input type="checkbox" checked={descriptors.includes(descriptor)} onChange={() => toggleDescriptor(descriptor)} />
                <span>{descriptor}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="v2-sensory-notes">
        <label htmlFor={`${formId}-observation`}>Observation<textarea id={`${formId}-observation`} maxLength={2000} value={observation} onChange={(event) => setObservation(event.target.value)} disabled={busy || complete} /></label>
        <label htmlFor={`${formId}-comparison`}>Comparison<textarea id={`${formId}-comparison`} maxLength={1000} value={comparison} onChange={(event) => setComparison(event.target.value)} disabled={busy || complete} /></label>
        <label htmlFor={`${formId}-rank`}>Preference rank<input id={`${formId}-rank`} type="number" min="1" max="100" step="1" value={preferenceRank} onChange={(event) => setPreferenceRank(event.target.value)} disabled={busy || complete} /></label>
      </div>

      {error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}
      {complete ? <div className="v2-alert is-success" role="status">Your final scorecard has been recorded.</div> : null}
      {!complete ? (
        <div className="v2-sensory-actions">
          {allowDraft ? <button type="button" className="v2-secondary-button" onClick={() => void submit(false)} disabled={busy}>Save draft</button> : null}
          <button type="submit" className="v2-primary-button" disabled={busy}>{busy ? 'Saving scorecard' : submitLabel}</button>
        </div>
      ) : null}
    </form>
  )
}
