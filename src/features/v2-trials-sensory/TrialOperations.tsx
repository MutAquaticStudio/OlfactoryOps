import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { authenticatedRequest } from './api'
import type {
  CapabilityMap,
  InventoryLot,
  LabMaterial,
  SensoryAssignment,
  SensoryPanelist,
  SensoryPublicLink,
  TrialDecisionEvidence,
  TrialDetail as TrialDetailData,
  TrialPreparationDetail,
  WorkspaceMember,
} from './types'

export type TrialMutation = <T>(
  action: string,
  path: string,
  body: unknown,
  success: string,
  method?: 'POST' | 'DELETE',
) => Promise<T | null>

type PreparationOperationsProps = {
  apiBase: string
  capabilities: CapabilityMap
  detail: TrialDetailData
  mutate: TrialMutation
}

type SensoryManagementProps = {
  apiBase: string
  capabilities: CapabilityMap
  detail: TrialDetailData
  mutate: TrialMutation
}

type EvidenceAttachmentProps = {
  capabilities: CapabilityMap
  detail: TrialDetailData
  mutate: TrialMutation
}

type PreparationLineDraft = {
  materialId: string
  materialName: string
  requestedGrams: string
  lotId: string
  reservationId: string
  toleranceGrams: string
}

type ConfirmationValue = { lotId: string; actualGrams: string }

type SensoryDimensionDraft = {
  key: string
  label: string
  kind: 'RATING' | 'ORDINAL' | 'DESCRIPTOR' | 'TEXT'
  minimum: string
  maximum: string
  required: boolean
  options: string
}

type ManagerAssignment = SensoryAssignment & { panelAssignmentId?: string | null; panelistUserId?: string | null }

function allowed(capabilities: CapabilityMap, permission: string) {
  return capabilities[permission] === true
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function compactId(value: string) {
  return value.length > 15 ? `${value.slice(0, 12)}...` : value
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function siblingApiBase(apiBase: string, target: 'lab' | 'platform') {
  return apiBase.replace(/\/trials\/?$/, `/${target}`)
}

function futureDateTimeLocal(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function parseDelimited(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function safeIsoFromLocal(value: string) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function emptyPreparationLine(): PreparationLineDraft {
  return { materialId: '', materialName: '', requestedGrams: '', lotId: '', reservationId: '', toleranceGrams: '0' }
}

export function TrialPreparationOperations({ apiBase, capabilities, detail, mutate }: PreparationOperationsProps) {
  const [startOpen, setStartOpen] = useState(false)
  const [sampleOpen, setSampleOpen] = useState(false)
  const [lines, setLines] = useState<PreparationLineDraft[]>([])
  const [materials, setMaterials] = useState<LabMaterial[]>([])
  const [lots, setLots] = useState<InventoryLot[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [preparationDetail, setPreparationDetail] = useState<TrialPreparationDetail | null>(null)
  const [confirmationValues, setConfirmationValues] = useState<Record<string, ConfirmationValue>>({})
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sample, setSample] = useState({ sampleCode: '', concentrationPercent: '', carrier: '', storageLocation: '', expiresAt: '', notes: '' })

  const trial = detail.trial
  const canViewAll = allowed(capabilities, 'trials.viewAll')
  const canCreate = canViewAll && allowed(capabilities, 'trials.create')
  const canConsume = allowed(capabilities, 'inventory.consume')
  const canViewInventory = allowed(capabilities, 'inventory.view')
  const canViewMaterials = allowed(capabilities, 'materials.view')
  const canViewFormula = allowed(capabilities, 'formula.viewSensitive')
  const formulaWeightsHidden = trial.sourceKind === 'FORMULA_VERSION' && !canViewFormula
  const labApiBase = siblingApiBase(apiBase, 'lab')
  const formulaLines = useMemo(() => (canViewFormula ? trial.formula?.components ?? [] : []).map((component) => ({
    materialId: component.materialId,
    materialName: component.name ?? compactId(component.materialId),
    requestedGrams: (trial.plannedMassGrams * component.percentage / 100).toFixed(6),
    lotId: '',
    reservationId: '',
    toleranceGrams: '0',
  })), [canViewFormula, trial.formula?.components, trial.plannedMassGrams])

  const loadSupportData = async () => {
    const requests: Array<Promise<void>> = []
    if (canViewMaterials && !materials.length) {
      requests.push(authenticatedRequest<{ materials: LabMaterial[] }>(labApiBase, '/materials')
        .then((payload) => setMaterials(payload.materials.filter((material) => material.status === 'ACTIVE'))))
    }
    if (canViewInventory && !lots.length) {
      requests.push(authenticatedRequest<{ lots: InventoryLot[] }>(labApiBase, '/inventory/lots')
        .then((payload) => setLots(payload.lots)))
    }
    try {
      await Promise.all(requests)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Preparation support data could not be loaded.')
    }
  }

  const openPreparation = () => {
    setError(null)
    setStartOpen((open) => !open)
    if (!startOpen) {
      if (formulaWeightsHidden) setLines([])
      else if (formulaLines.length) setLines(formulaLines)
      else if (!lines.length) setLines([emptyPreparationLine()])
      void loadSupportData()
    }
  }

  const openPreparationDetail = async (sessionId: string) => {
    setSelectedSessionId(sessionId)
    setPreparationDetail(null)
    setError(null)
    if (!canViewInventory) {
      setError('Inventory view permission is required to load preparation lines for confirmation.')
      return
    }
    setLoadingDetail(true)
    try {
      const payload = await authenticatedRequest<TrialPreparationDetail>(apiBase, `/${encodeURIComponent(trial.id)}/preparation/${encodeURIComponent(sessionId)}`)
      setPreparationDetail(payload)
      setConfirmationValues(Object.fromEntries(payload.lines.map((line) => [line.id, {
        lotId: line.lotId ?? '',
        actualGrams: line.actualGrams === null ? line.requestedGrams.toString() : line.actualGrams.toString(),
      }])))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Preparation detail could not be loaded.')
    } finally {
      setLoadingDetail(false)
    }
  }

  const updateLine = (index: number, patch: Partial<PreparationLineDraft>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
  }

  const submitPreparation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    if (!lines.length) {
      setError('Add at least one material to the Trial weighing plan.')
      return
    }
    const parsedLines = lines.map((line) => ({
      materialId: line.materialId.trim(),
      requestedGrams: Number(line.requestedGrams),
      lotId: line.lotId.trim() || undefined,
      reservationId: line.reservationId.trim() || undefined,
      toleranceGrams: Number(line.toleranceGrams || '0'),
    }))
    if (parsedLines.some((line) => !line.materialId || !Number.isFinite(line.requestedGrams) || line.requestedGrams <= 0 || !Number.isFinite(line.toleranceGrams) || line.toleranceGrams < 0)) {
      setError('Every preparation line needs an active material, positive requested grams, and a non-negative tolerance.')
      return
    }
    if (new Set(parsedLines.map((line) => line.materialId)).size !== parsedLines.length) {
      setError('A material can appear only once in a Trial weighing plan.')
      return
    }
    const result = await mutate<{ preparation: { id: string } }>('preparation-start', `/${encodeURIComponent(trial.id)}/preparation`, { lines: parsedLines }, 'Trial preparation started. Confirm actual weighing before creating samples.')
    const sessionId = result?.preparation.id
    if (sessionId) {
      setStartOpen(false)
      await openPreparationDetail(sessionId)
    }
  }

  const submitConfirmation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!preparationDetail || !selectedSessionId) return
    setError(null)
    const confirmationLines = preparationDetail.lines.map((line) => ({
      lineId: line.id,
      lotId: confirmationValues[line.id]?.lotId.trim() ?? '',
      actualGrams: Number(confirmationValues[line.id]?.actualGrams),
    }))
    if (confirmationLines.some((line) => !line.lotId || !Number.isFinite(line.actualGrams) || line.actualGrams <= 0)) {
      setError('Choose a lot and enter a positive actual weight for every preparation line.')
      return
    }
    const result = await mutate<{ preparation: { status: string } }>('preparation-confirm', `/${encodeURIComponent(trial.id)}/preparation/${encodeURIComponent(selectedSessionId)}/confirm`, { lines: confirmationLines }, 'Actual weighing confirmed. Immutable consumption evidence is now linked to this Trial.')
    if (result) await openPreparationDetail(selectedSessionId)
  }

  const submitSample = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const code = sample.sampleCode.trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(code)) {
      setError('Sample code must use 3 to 64 uppercase letters, numbers, underscores, or hyphens.')
      return
    }
    const concentrationPercent = sample.concentrationPercent.trim() ? Number(sample.concentrationPercent) : undefined
    if (concentrationPercent !== undefined && (!Number.isFinite(concentrationPercent) || concentrationPercent <= 0 || concentrationPercent > 100)) {
      setError('Sample concentration must be between 0 and 100 percent.')
      return
    }
    setError(null)
    const expiresAt = safeIsoFromLocal(sample.expiresAt)
    const result = await mutate<{ sample: { id: string } }>('sample-create', `/${encodeURIComponent(trial.id)}/samples`, {
      sampleCode: code,
      ...(concentrationPercent === undefined ? {} : { concentrationPercent }),
      ...(sample.carrier.trim() ? { carrier: sample.carrier.trim() } : {}),
      ...(sample.storageLocation.trim() ? { storageLocation: sample.storageLocation.trim() } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(sample.notes.trim() ? { notes: sample.notes.trim() } : {}),
    }, 'Controlled sample created. Its blind code remains server-managed.')
    if (result) {
      setSample({ sampleCode: '', concentrationPercent: '', carrier: '', storageLocation: '', expiresAt: '', notes: '' })
      setSampleOpen(false)
    }
  }

  if (!canViewAll) return null

  return (
    <section className="v2-trials-panel" data-testid="v2-trial-preparation-operations">
      <div className="v2-trials-panel-heading">
        <div>
          <h3>Preparation operations</h3>
          <p>Start and confirm Trial weighing through the server-authoritative Lab Weighing workflow.</p>
        </div>
        <div className="v2-trials-actions">
          {trial.status === 'READY' && canCreate && canConsume ? <button className="v2-primary-button" type="button" onClick={openPreparation}>{startOpen ? 'Close preparation' : 'Start preparation'}</button> : null}
          {['PREPARED', 'EVALUATION_READY'].includes(trial.status) && canCreate ? <button className="v2-secondary-button" type="button" onClick={() => setSampleOpen((open) => !open)}>{sampleOpen ? 'Close sample form' : 'Create sample'}</button> : null}
        </div>
      </div>

      {trial.status === 'READY' && canCreate && !canConsume ? <p className="v2-muted">Inventory consumption permission is required to start controlled preparation.</p> : null}
      {trial.status === 'READY' && canCreate && canConsume && formulaWeightsHidden ? <div className="v2-alert" role="status">Formula component weights are intentionally hidden for this role. Request formula-sensitive access before preparing this Formula Trial.</div> : null}

      {startOpen && formulaWeightsHidden ? <div className="v2-alert" role="status">Preparation cannot be started without the approved Formula component projection. This screen does not substitute guessed material rows.</div> : null}
      {startOpen && !formulaWeightsHidden ? (
        <form className="v2-trials-preparation-form" onSubmit={submitPreparation}>
          <div className="v2-trials-operations-note">{formulaLines.length ? 'Formula component weights are derived from the immutable projected snapshot.' : 'Manual experiments require an explicit material and target weight for each row.'}</div>
          <div className="v2-trials-preparation-lines">
            {lines.map((line, index) => {
              const materialLots = lots.filter((lot) => lot.materialId === line.materialId && lot.status === 'AVAILABLE' && lot.qualityStatus !== 'FAILED' && lot.qualityStatus !== 'PENDING')
              return (
                <div className="v2-trials-preparation-line" key={`${index}-${line.materialId}`}>
                  <label>Material
                    {canViewMaterials ? <select value={line.materialId} onChange={(event) => {
                      const material = materials.find((item) => item.id === event.target.value)
                      updateLine(index, { materialId: event.target.value, materialName: material?.name ?? '' })
                    }} required><option value="">Choose active material</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select> : <input required value={line.materialId} onChange={(event) => updateLine(index, { materialId: event.target.value })} placeholder="Authorized material ID" />}
                  </label>
                  <label>Requested grams<input required type="number" min="0.000001" step="0.000001" value={line.requestedGrams} onChange={(event) => updateLine(index, { requestedGrams: event.target.value })} /></label>
                  <label>Tolerance grams<input required type="number" min="0" step="0.000001" value={line.toleranceGrams} onChange={(event) => updateLine(index, { toleranceGrams: event.target.value })} /></label>
                  <label>Preferred lot
                    {canViewInventory ? <select value={line.lotId} onChange={(event) => updateLine(index, { lotId: event.target.value })}><option value="">Select at confirmation</option>{materialLots.map((lot) => <option key={lot.id} value={lot.id}>{compactId(lot.id)} {lot.location ? `at ${lot.location}` : ''}</option>)}</select> : <input value={line.lotId} onChange={(event) => updateLine(index, { lotId: event.target.value })} placeholder="Optional lot ID" />}
                  </label>
                  <label>Reservation ID<input value={line.reservationId} onChange={(event) => updateLine(index, { reservationId: event.target.value })} placeholder="Optional reservation" /></label>
                  {!formulaLines.length ? <button className="v2-text-button" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={lines.length === 1}>Remove row</button> : null}
                </div>
              )
            })}
          </div>
          {!formulaLines.length ? <button className="v2-text-button" type="button" onClick={() => setLines((current) => [...current, emptyPreparationLine()])}>Add material row</button> : null}
          <div className="v2-trials-actions"><button className="v2-primary-button" type="submit">Start controlled weighing</button></div>
        </form>
      ) : null}

      {sampleOpen ? <form className="v2-trials-form-grid" onSubmit={submitSample}><label>Sample code<input required value={sample.sampleCode} onChange={(event) => setSample({ ...sample, sampleCode: event.target.value.toUpperCase() })} placeholder="TRIAL_001" /></label><label>Concentration (%)<input type="number" min="0.001" max="100" step="0.001" value={sample.concentrationPercent} onChange={(event) => setSample({ ...sample, concentrationPercent: event.target.value })} /></label><label>Carrier<input maxLength={160} value={sample.carrier} onChange={(event) => setSample({ ...sample, carrier: event.target.value })} /></label><label>Storage location<input maxLength={160} value={sample.storageLocation} onChange={(event) => setSample({ ...sample, storageLocation: event.target.value })} /></label><label>Expiry<input type="datetime-local" value={sample.expiresAt} onChange={(event) => setSample({ ...sample, expiresAt: event.target.value })} /></label><label className="v2-trials-span-all">Sample note<textarea maxLength={1000} value={sample.notes} onChange={(event) => setSample({ ...sample, notes: event.target.value })} /></label><div className="v2-trials-actions"><button className="v2-primary-button" type="submit">Create controlled sample</button></div></form> : null}

      {detail.preparations.length ? <div className="v2-trials-preparation-history"><h4>Weighing sessions</h4>{detail.preparations.map((preparation) => <div className="v2-trials-record" key={preparation.id}><strong>{humanize(preparation.status)}</strong><span>{compactId(preparation.weighingSessionId)}</span><span>{formatDate(preparation.confirmedAt)}</span>{canViewInventory ? <button className="v2-text-button" type="button" onClick={() => void openPreparationDetail(preparation.weighingSessionId)}>Inspect lines</button> : null}</div>)}</div> : <p className="v2-muted">No Trial weighing session has started.</p>}

      {loadingDetail ? <div className="v2-trials-loading">Loading preparation lines</div> : null}
      {preparationDetail ? (
        <form className="v2-trials-confirmation" onSubmit={submitConfirmation}>
          <div className="v2-trials-panel-heading"><div><h4>Confirm actual weighing</h4><p>Session {compactId(selectedSessionId)} is {humanize(preparationDetail.preparation.status)}. Confirmation creates immutable consumption movements.</p></div></div>
          <div className="v2-trials-confirmation-lines">
            {preparationDetail.lines.map((line) => {
              const lineLots = lots.filter((lot) => lot.materialId === line.materialId && lot.status === 'AVAILABLE' && lot.qualityStatus !== 'FAILED' && lot.qualityStatus !== 'PENDING')
              const value = confirmationValues[line.id] ?? { lotId: line.lotId ?? '', actualGrams: line.requestedGrams.toString() }
              return <div className="v2-trials-preparation-line" key={line.id}><div><strong>{line.materialName}</strong><small>Requested {line.requestedGrams.toFixed(6)} g; tolerance {line.toleranceGrams.toFixed(6)} g</small></div><label>Actual lot{canViewInventory ? <select value={value.lotId} onChange={(event) => setConfirmationValues((current) => ({ ...current, [line.id]: { ...value, lotId: event.target.value } }))} required><option value="">Choose available lot</option>{lineLots.map((lot) => <option key={lot.id} value={lot.id}>{compactId(lot.id)} {lot.location ? `at ${lot.location}` : ''}</option>)}</select> : <input required value={value.lotId} onChange={(event) => setConfirmationValues((current) => ({ ...current, [line.id]: { ...value, lotId: event.target.value } }))} />}</label><label>Actual grams<input required type="number" min="0.000001" step="0.000001" value={value.actualGrams} onChange={(event) => setConfirmationValues((current) => ({ ...current, [line.id]: { ...value, actualGrams: event.target.value } }))} /></label></div>
            })}
          </div>
          {preparationDetail.preparation.status === 'WEIGHING' && canCreate && canConsume ? <div className="v2-trials-actions"><button className="v2-primary-button" type="submit">Confirm actual weighing</button></div> : <div className="v2-alert" role="status">This preparation is already {humanize(preparationDetail.preparation.status)}.</div>}
        </form>
      ) : null}
      {error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}
    </section>
  )
}

export function EvidenceAttachmentPanel({ capabilities, detail, mutate }: EvidenceAttachmentProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ evidenceKind: 'DOCUMENT', objectRef: '', contentHash: '', preparationId: '', sampleId: '' })
  const canAttach = allowed(capabilities, 'trials.viewAll') && allowed(capabilities, 'trials.create') && allowed(capabilities, 'documents.manage')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const contentHash = form.contentHash.trim().toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(contentHash)) {
      setError('Evidence checksum must be a lowercase SHA-256 hash of 64 hexadecimal characters.')
      return
    }
    setError(null)
    const result = await mutate<{ evidence: { id: string } }>('evidence-attach', `/${encodeURIComponent(detail.trial.id)}/evidence`, {
      evidenceKind: form.evidenceKind,
      objectRef: form.objectRef.trim(),
      contentHash,
      ...(form.preparationId ? { preparationId: form.preparationId } : {}),
      ...(form.sampleId ? { sampleId: form.sampleId } : {}),
    }, 'Evidence reference attached. Document content remains outside the Trial payload.')
    if (result) {
      setForm({ evidenceKind: 'DOCUMENT', objectRef: '', contentHash: '', preparationId: '', sampleId: '' })
      setOpen(false)
    }
  }

  if (!canAttach) return null
  return (
    <div className="v2-trials-evidence-actions">
      <button className="v2-secondary-button" type="button" onClick={() => setOpen((value) => !value)}>{open ? 'Close evidence form' : 'Attach evidence'}</button>
      {open ? <form className="v2-trials-form-grid" onSubmit={submit}><label>Evidence kind<select value={form.evidenceKind} onChange={(event) => setForm({ ...form, evidenceKind: event.target.value })}>{['PREPARATION', 'STABILITY', 'QC', 'EXTERNAL_LAB', 'PHOTO', 'DOCUMENT', 'OTHER'].map((kind) => <option value={kind} key={kind}>{humanize(kind)}</option>)}</select></label><label>Object reference<input required maxLength={1000} value={form.objectRef} onChange={(event) => setForm({ ...form, objectRef: event.target.value })} placeholder="Private document or object reference" /></label><label className="v2-trials-span-all">SHA-256 content hash<input required pattern="[a-f0-9]{64}" value={form.contentHash} onChange={(event) => setForm({ ...form, contentHash: event.target.value.toLowerCase() })} /></label><label>Preparation (optional)<select value={form.preparationId} onChange={(event) => setForm({ ...form, preparationId: event.target.value })}><option value="">No preparation link</option>{detail.preparations.map((preparation) => <option key={preparation.id} value={preparation.id}>{humanize(preparation.status)} {compactId(preparation.weighingSessionId)}</option>)}</select></label><label>Sample (optional)<select value={form.sampleId} onChange={(event) => setForm({ ...form, sampleId: event.target.value })}><option value="">No sample link</option>{detail.samples.map((sample) => <option key={sample.id} value={sample.id}>{sample.sampleCode}</option>)}</select></label><div className="v2-trials-actions"><button className="v2-primary-button" type="submit">Attach evidence</button></div></form> : null}
      {error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}
    </div>
  )
}

export function DecisionEvidenceSummary({ evidence }: { evidence: TrialDecisionEvidence | null }) {
  if (!evidence) return null
  const notEnough = evidence.confidence === 'NOT_ENOUGH_EVIDENCE' || evidence.evidenceCount < evidence.minimumEvidenceCount
  return (
    <div className={`v2-trials-evidence-threshold ${notEnough ? 'is-insufficient' : 'is-ready'}`} role="status">
      <strong>{notEnough ? 'Not enough evidence' : humanize(evidence.confidence)}</strong>
      <span>{evidence.evidenceCount} independent scorecards out of {evidence.minimumEvidenceCount} required.</span>
      {evidence.conclusion ? <span>{evidence.conclusion}</span> : null}
    </div>
  )
}

export function SensoryManagementOperations({ apiBase, capabilities, detail, mutate }: SensoryManagementProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const [formDraft, setFormDraft] = useState({ name: '', versionLabel: '', timepoints: 'Initial', descriptorVocabulary: '', minimumEvidenceCount: '3' })
  const [dimensions, setDimensions] = useState<SensoryDimensionDraft[]>([{ key: 'overall', label: 'Overall impression', kind: 'RATING', minimum: '1', maximum: '10', required: true, options: '' }])
  const canManage = allowed(capabilities, 'trials.viewAll') && allowed(capabilities, 'sensory.manage')

  const addDimension = () => {
    setDimensions((current) => [...current, { key: '', label: '', kind: 'RATING', minimum: '1', maximum: '10', required: true, options: '' }])
  }

  const updateDimension = (index: number, patch: Partial<SensoryDimensionDraft>) => {
    setDimensions((current) => current.map((dimension, dimensionIndex) => dimensionIndex === index ? { ...dimension, ...patch } : dimension))
  }

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setFormNotice(null)
    const timepoints = parseDelimited(formDraft.timepoints)
    const descriptorVocabulary = parseDelimited(formDraft.descriptorVocabulary)
    const minimumEvidenceCount = Number(formDraft.minimumEvidenceCount)
    if (!timepoints.length || !Number.isInteger(minimumEvidenceCount) || minimumEvidenceCount < 1 || minimumEvidenceCount > 100) {
      setFormError('Provide at least one timepoint and a whole evidence threshold between 1 and 100.')
      return
    }
    const parsedDimensions = dimensions.map((dimension) => ({
      key: dimension.key.trim(),
      label: dimension.label.trim(),
      kind: dimension.kind,
      minimum: Number(dimension.minimum),
      maximum: Number(dimension.maximum),
      required: dimension.required,
      options: parseDelimited(dimension.options),
    }))
    if (parsedDimensions.some((dimension) => !/^[a-z][a-z0-9_]{1,63}$/.test(dimension.key) || !dimension.label || !Number.isInteger(dimension.minimum) || !Number.isInteger(dimension.maximum) || dimension.minimum > dimension.maximum)) {
      setFormError('Each dimension needs a lowercase key, a label, and a valid whole-number range.')
      return
    }
    if (new Set(parsedDimensions.map((dimension) => dimension.key)).size !== parsedDimensions.length) {
      setFormError('Sensory dimension keys must be unique.')
      return
    }
    if (parsedDimensions.some((dimension) => (dimension.kind === 'ORDINAL' || dimension.kind === 'DESCRIPTOR') && !dimension.options.length)) {
      setFormError('Ordinal and descriptor dimensions need at least one controlled option.')
      return
    }
    const result = await mutate<{ form: { id: string } }>('sensory-form', '/forms', {
      name: formDraft.name.trim(),
      versionLabel: formDraft.versionLabel.trim(),
      timepoints,
      dimensions: parsedDimensions,
      descriptorVocabulary,
      minimumEvidenceCount,
    }, 'Versioned sensory form created. Existing sessions keep their own immutable form version.')
    if (result) {
      setFormNotice('Sensory form created. Select it when creating a new sensory session.')
      setFormOpen(false)
      setFormDraft({ name: '', versionLabel: '', timepoints: 'Initial', descriptorVocabulary: '', minimumEvidenceCount: '3' })
      setDimensions([{ key: 'overall', label: 'Overall impression', kind: 'RATING', minimum: '1', maximum: '10', required: true, options: '' }])
    }
  }

  if (!canManage) return null
  return (
    <section className="v2-trials-panel" data-testid="v2-sensory-management">
      <div className="v2-trials-panel-heading">
        <div>
          <h3>Sensory management</h3>
          <p>Create versioned scorecards, assign active panelists and controlled samples, and issue token-scoped public feedback links.</p>
        </div>
        <button className="v2-secondary-button" type="button" onClick={() => setFormOpen((open) => !open)}>{formOpen ? 'Close form composer' : 'Create sensory form'}</button>
      </div>

      {formOpen ? (
        <form className="v2-trials-sensory-form" onSubmit={submitForm}>
          <div className="v2-trials-form-grid">
            <label>Form name<input required maxLength={160} value={formDraft.name} onChange={(event) => setFormDraft({ ...formDraft, name: event.target.value })} /></label>
            <label>Version label<input required maxLength={80} value={formDraft.versionLabel} onChange={(event) => setFormDraft({ ...formDraft, versionLabel: event.target.value })} placeholder="v1" /></label>
            <label>Timepoints<input required value={formDraft.timepoints} onChange={(event) => setFormDraft({ ...formDraft, timepoints: event.target.value })} placeholder="Initial, 30 min, Dry down" /></label>
            <label>Minimum independent scorecards<input required type="number" min="1" max="100" step="1" value={formDraft.minimumEvidenceCount} onChange={(event) => setFormDraft({ ...formDraft, minimumEvidenceCount: event.target.value })} /></label>
            <label className="v2-trials-span-all">Descriptor vocabulary (comma separated)<input value={formDraft.descriptorVocabulary} onChange={(event) => setFormDraft({ ...formDraft, descriptorVocabulary: event.target.value })} placeholder="Floral, Woody, Clean" /></label>
          </div>
          <div className="v2-trials-dimension-list">
            <h4>Scorecard dimensions</h4>
            {dimensions.map((dimension, index) => (
              <div className="v2-trials-dimension-row" key={`${index}-${dimension.key}`}>
                <label>Key<input required value={dimension.key} onChange={(event) => updateDimension(index, { key: event.target.value.toLowerCase() })} placeholder="overall" /></label>
                <label>Label<input required value={dimension.label} onChange={(event) => updateDimension(index, { label: event.target.value })} /></label>
                <label>Response type<select value={dimension.kind} onChange={(event) => updateDimension(index, { kind: event.target.value as SensoryDimensionDraft['kind'] })}><option value="RATING">Rating</option><option value="ORDINAL">Ordinal</option><option value="DESCRIPTOR">Descriptor</option><option value="TEXT">Text</option></select></label>
                <label>Minimum<input required type="number" min="0" max="10" step="1" value={dimension.minimum} onChange={(event) => updateDimension(index, { minimum: event.target.value })} /></label>
                <label>Maximum<input required type="number" min="1" max="10" step="1" value={dimension.maximum} onChange={(event) => updateDimension(index, { maximum: event.target.value })} /></label>
                <label>Options<input value={dimension.options} onChange={(event) => updateDimension(index, { options: event.target.value })} disabled={dimension.kind === 'RATING' || dimension.kind === 'TEXT'} placeholder="Low, Medium, High" /></label>
                <label className="v2-trials-checkbox"><input type="checkbox" checked={dimension.required} onChange={(event) => updateDimension(index, { required: event.target.checked })} /> Required</label>
                <button className="v2-text-button" type="button" onClick={() => setDimensions((current) => current.filter((_, dimensionIndex) => dimensionIndex !== index))} disabled={dimensions.length === 1}>Remove</button>
              </div>
            ))}
            <button className="v2-text-button" type="button" onClick={addDimension}>Add dimension</button>
          </div>
          <div className="v2-trials-actions"><button className="v2-primary-button" type="submit">Create versioned form</button></div>
        </form>
      ) : null}
      {formError ? <div className="v2-alert is-error" role="alert">{formError}</div> : null}
      {formNotice ? <div className="v2-alert is-success" role="status">{formNotice}</div> : null}

      <div className="v2-trials-manager-session-list">
        {detail.sessions.length ? detail.sessions.map((session) => <ManagerSessionControls apiBase={apiBase} capabilities={capabilities} session={session} samples={detail.samples} mutate={mutate} key={session.id} />) : <p className="v2-muted">Create a sensory session after at least one controlled Trial sample is available.</p>}
      </div>
    </section>
  )
}

function ManagerSessionControls({
  apiBase,
  capabilities,
  session,
  samples,
  mutate,
}: {
  apiBase: string
  capabilities: CapabilityMap
  session: TrialDetailData['sessions'][number]
  samples: TrialDetailData['samples']
  mutate: TrialMutation
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<ManagerAssignment[]>([])
  const [panelists, setPanelists] = useState<SensoryPanelist[]>([])
  const [links, setLinks] = useState<SensoryPublicLink[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [panelistUserId, setPanelistUserId] = useState('')
  const [sampleAssignment, setSampleAssignment] = useState({ sampleId: '', blindCode: '' })
  const [publicLink, setPublicLink] = useState({ sampleAssignmentId: '', presentationMode: 'BLIND', expiresAt: futureDateTimeLocal(7), maxSubmissions: '24' })
  const [issued, setIssued] = useState<{ id: string; token: string; expiresAt: string; presentationMode: string } | null>(null)
  const platformApiBase = siblingApiBase(apiBase, 'platform')
  const canViewAssignments = allowed(capabilities, 'sensory.view')
  const canViewMembers = allowed(capabilities, 'members.view')

  const refresh = async () => {
    if (!canViewAssignments) {
      setError('Sensory view permission is required to inspect assignment records.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const memberRequest = canViewMembers
        ? authenticatedRequest<{ members: WorkspaceMember[] }>(platformApiBase, '/workspace/members')
        : Promise.resolve<{ members: WorkspaceMember[] }>({ members: [] })
      const [assignmentPayload, panelistPayload, linkPayload, memberPayload] = await Promise.all([
        authenticatedRequest<{ assignments: ManagerAssignment[] }>(apiBase, `/sessions/${encodeURIComponent(session.id)}/assignments`),
        authenticatedRequest<{ panelists: SensoryPanelist[] }>(apiBase, `/sessions/${encodeURIComponent(session.id)}/panelists`),
        authenticatedRequest<{ links: SensoryPublicLink[] }>(apiBase, `/sessions/${encodeURIComponent(session.id)}/public-links`),
        memberRequest,
      ])
      setAssignments(assignmentPayload.assignments)
      setPanelists(panelistPayload.panelists)
      setLinks(linkPayload.links)
      setMembers(memberPayload.members.filter((member) => member.status === 'ACTIVE'))
      setPanelistUserId((current) => current || memberPayload.members.find((member) => member.status === 'ACTIVE')?.userId || '')
      setSampleAssignment((current) => current.sampleId ? current : { ...current, sampleId: samples.find((sample) => !['EXPIRED', 'DISPOSED'].includes(sample.status))?.id ?? '' })
      setPublicLink((current) => current.sampleAssignmentId ? current : { ...current, sampleAssignmentId: assignmentPayload.assignments.find((assignment) => assignment.panelAssignmentId === null)?.id ?? '' })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Session management data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  const toggle = () => {
    setOpen((current) => !current)
    if (!open) void refresh()
  }

  const submitPanelist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!panelistUserId.trim()) {
      setError('Choose or enter an active workspace user ID.')
      return
    }
    const result = await mutate<{ assignment: { id: string } }>('panelist-assign', `/sessions/${encodeURIComponent(session.id)}/panelists`, { userId: panelistUserId.trim() }, 'Panelist assignment recorded.')
    if (result) void refresh()
  }

  const submitSample = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const blindCode = sampleAssignment.blindCode.trim().toUpperCase()
    if (!sampleAssignment.sampleId || !/^[A-Z0-9]{4,16}$/.test(blindCode)) {
      setError('Choose a Trial sample and enter a blind code of 4 to 16 uppercase letters or numbers.')
      return
    }
    const result = await mutate<{ assignment: { id: string } }>('sample-assign', `/sessions/${encodeURIComponent(session.id)}/samples`, { sampleId: sampleAssignment.sampleId, blindCode }, 'Sample assigned to active panelists and public presentation.')
    if (result) {
      setSampleAssignment((current) => ({ ...current, blindCode: '' }))
      void refresh()
    }
  }

  const submitPublicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const expiresAt = safeIsoFromLocal(publicLink.expiresAt)
    const maxSubmissions = Number(publicLink.maxSubmissions)
    if (!publicLink.sampleAssignmentId || !expiresAt || new Date(expiresAt).getTime() <= Date.now() || !Number.isInteger(maxSubmissions) || maxSubmissions < 1 || maxSubmissions > 100) {
      setError('Choose a public sample assignment, a future expiry, and 1 to 100 allowed submissions.')
      return
    }
    const result = await mutate<{ link: { id: string; token: string; expiresAt: string; presentationMode: string } }>('public-link-create', `/sessions/${encodeURIComponent(session.id)}/public-links`, {
      sampleAssignmentId: publicLink.sampleAssignmentId,
      presentationMode: publicLink.presentationMode,
      expiresAt,
      maxSubmissions,
    }, 'Public scorecard link issued. Copy the token-scoped URL now; it is not shown again.')
    if (result?.link) {
      setIssued(result.link)
      void refresh()
    }
  }

  const revoke = async (linkId: string) => {
    const result = await mutate<{ link: { status: string } }>('public-link-revoke', `/public-links/${encodeURIComponent(linkId)}`, {}, 'Public scorecard link revoked.', 'DELETE')
    if (result) void refresh()
  }

  const copyIssuedUrl = async () => {
    if (!issued) return
    const href = `${window.location.origin}/v2/public/sensory/${encodeURIComponent(issued.token)}`
    try {
      await navigator.clipboard.writeText(href)
      setNotice('Public scorecard URL copied.')
    } catch {
      setNotice('Copy the displayed public scorecard URL manually.')
    }
  }

  const publicAssignments = assignments.filter((assignment) => assignment.panelAssignmentId === null)

  return (
    <article className="v2-trials-manager-session">
      <div className="v2-trials-panel-heading"><div><span className="v2-eyebrow">Session controls</span><h4>{session.title}</h4><p>{humanize(session.status)}; {session.blindMode ? 'blind presentation' : 'named presentation'}.</p></div><button className="v2-secondary-button" type="button" onClick={toggle}>{open ? 'Close controls' : 'Manage assignments'}</button></div>
      {open ? <div className="v2-trials-manager-body">
        {loading ? <div className="v2-trials-loading">Loading session controls</div> : null}
        {!loading ? <>
          <form className="v2-trials-inline-form" onSubmit={submitPanelist}><label>Active panelist{members.length ? <select value={panelistUserId} onChange={(event) => setPanelistUserId(event.target.value)}><option value="">Choose active member</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName} ({member.role})</option>)}</select> : <input required value={panelistUserId} onChange={(event) => setPanelistUserId(event.target.value)} placeholder="Active workspace user ID" />}</label><button className="v2-secondary-button" type="submit">Assign panelist</button></form>
          <div className="v2-trials-manager-records"><h5>Panelists</h5>{panelists.length ? panelists.map((panelist) => <div className="v2-trials-record" key={panelist.id}><strong>{members.find((member) => member.userId === panelist.userId)?.displayName ?? compactId(panelist.userId)}</strong><span>{humanize(panelist.status)}</span><span>{formatDate(panelist.invitedAt)}</span></div>) : <p className="v2-muted">No panelist is assigned.</p>}</div>
          <form className="v2-trials-inline-form" onSubmit={submitSample}><label>Trial sample<select required value={sampleAssignment.sampleId} onChange={(event) => setSampleAssignment({ ...sampleAssignment, sampleId: event.target.value })}><option value="">Choose sample</option>{samples.filter((sample) => !['EXPIRED', 'DISPOSED'].includes(sample.status)).map((sample) => <option value={sample.id} key={sample.id}>{sample.sampleCode} ({humanize(sample.status)})</option>)}</select></label><label>Blind code<input required maxLength={16} value={sampleAssignment.blindCode} onChange={(event) => setSampleAssignment({ ...sampleAssignment, blindCode: event.target.value.toUpperCase() })} placeholder="A1B2C3" /></label><button className="v2-secondary-button" type="submit">Assign sample</button></form>
          <div className="v2-trials-manager-records"><h5>Sample assignments</h5>{assignments.length ? assignments.map((assignment) => <div className="v2-trials-record" key={assignment.id}><strong>{assignment.blindCode}</strong><span>{humanize(assignment.blindingStatus)}</span><span>{humanize(assignment.sampleStatus)}</span><span>{assignment.panelistUserId ? members.find((member) => member.userId === assignment.panelistUserId)?.displayName ?? compactId(assignment.panelistUserId) : 'Public presentation slot'}</span></div>) : <p className="v2-muted">Assign a Trial sample to create controlled assignments.</p>}</div>
          <form className="v2-trials-public-link-form" onSubmit={submitPublicLink}><h5>Public scorecard link</h5><div className="v2-trials-form-grid"><label>Public sample assignment<select required value={publicLink.sampleAssignmentId} onChange={(event) => setPublicLink({ ...publicLink, sampleAssignmentId: event.target.value })}><option value="">Choose public presentation slot</option>{publicAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.blindCode}</option>)}</select></label><label>Presentation mode<select value={publicLink.presentationMode} onChange={(event) => setPublicLink({ ...publicLink, presentationMode: event.target.value })}><option value="BLIND">Blind</option><option value="BRAND_REVIEW">Brand review</option></select></label><label>Expires at<input required type="datetime-local" value={publicLink.expiresAt} onChange={(event) => setPublicLink({ ...publicLink, expiresAt: event.target.value })} /></label><label>Maximum submissions<input required type="number" min="1" max="100" step="1" value={publicLink.maxSubmissions} onChange={(event) => setPublicLink({ ...publicLink, maxSubmissions: event.target.value })} /></label></div><div className="v2-trials-actions"><button className="v2-primary-button" type="submit" disabled={!publicAssignments.length}>Issue public link</button></div></form>
          {issued ? <div className="v2-trials-issued-link"><strong>Copy this URL now</strong><div><input readOnly value={`${window.location.origin}/v2/public/sensory/${issued.token}`} aria-label="Issued public scorecard URL" /><button className="v2-secondary-button" type="button" onClick={() => void copyIssuedUrl()}>Copy URL</button></div><small>The raw token is shown only in this browser state. Link ID: {compactId(issued.id)}.</small></div> : null}
          <div className="v2-trials-manager-records"><h5>Public link status</h5>{links.length ? links.map((link) => <div className="v2-trials-record" key={link.id}><strong>{humanize(link.presentationMode)}</strong><span>{link.revokedAt ? `Revoked ${formatDate(link.revokedAt)}` : new Date(link.expiresAt).getTime() <= Date.now() ? 'Expired' : `${link.submissionCount}/${link.maxSubmissions} submissions`}</span><span>Expires {formatDate(link.expiresAt)}</span>{!link.revokedAt ? <button className="v2-text-button" type="button" onClick={() => void revoke(link.id)}>Revoke</button> : null}</div>) : <p className="v2-muted">No public scorecard link is active or recorded for this session.</p>}</div>
          {notice ? <div className="v2-alert is-success" role="status">{notice}</div> : null}
        </> : null}
        {error ? <div className="v2-alert is-error" role="alert">{error}</div> : null}
      </div> : null}
    </article>
  )
}
