import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Archive, Check, ClipboardCheck, DatabaseZap, FileUp, RefreshCw, ShieldCheck, WandSparkles, X } from 'lucide-react'
import { advancedRequest, base64FromFile, defaultAdvancedApiBase, defaultFormulaApiBase, formulaRequest } from './api'
import type { CapabilityMap, DataOpsRun, FormulaProject, FormulaProjectDetail, ImportDetail, ImportJob, OptimizerDetail, OptimizerRun } from './types'
import './advancedWorkspace.css'

type Locale = 'en-US' | 'vi-VN'
type Tab = 'optimizer' | 'imports' | 'dataops' | 'bulk'

const copy = {
  'en-US': {
    eyebrow: 'Governed advanced operations', heading: 'Optimizer & DataOps', intro: 'Candidate reformulations are deterministic advisory evidence. Formula, inventory and compliance remain domain authorities.',
    optimizer: 'Optimizer', imports: 'Imports', dataops: 'DataOps', bulk: 'Bulk changes', refresh: 'Refresh', noAccess: 'This workspace role has no advanced-operation capability.',
    parent: 'Approved Formula Version', replace: 'Replace material IDs', required: 'Required material IDs', prohibited: 'Prohibited material IDs', availability: 'Require available inventory', strict: 'Approved compliance evidence only', candidates: 'Candidates', run: 'Run optimizer',
    advisory: 'Advisory only', saveDraft: 'Save as Formula draft', reject: 'Reject', archive: 'Archive', evidence: 'Evidence snapshot', noRuns: 'No optimizer run is available.',
    importTitle: 'Governed spreadsheet import', file: 'Source file', kind: 'Record kind', dryRun: 'Dry run only', mapping: 'Column mapping JSON', preview: 'Validate preview', commit: 'Confirm create-only import', noImports: 'No import job is available.',
    rows: 'Rows', valid: 'Valid', invalid: 'Invalid', duplicates: 'Duplicates', committed: 'Committed', dataOpsTitle: 'DataOps quality boundary', localCheck: 'Run local quality gate', vexo: 'Run Vexo adapter', vexoNotice: 'Vexo is explicitly not configured. No provider call was made.',
    bulkTitle: 'Controlled bulk status change', targetIds: 'Target IDs', status: 'Target status', rationale: 'Rationale', previewBulk: 'Preview change', confirmBulk: 'Confirm change', noBulk: 'Create a preview before confirming a bulk change.',
    loading: 'Loading governed records...', done: 'Operation completed.', retry: 'Retry', formulaSensitive: 'Component details require Formula sensitive-view permission.',
  },
  'vi-VN': {
    eyebrow: 'Tác vụ nâng cao có kiểm soát', heading: 'Optimizer & DataOps', intro: 'Candidate reformulation là bằng chứng tư vấn xác định. Formula, inventory và compliance vẫn là domain authority.',
    optimizer: 'Optimizer', imports: 'Import', dataops: 'DataOps', bulk: 'Thay đổi hàng loạt', refresh: 'Tải lại', noAccess: 'Vai trò workspace này không có quyền tác vụ nâng cao.',
    parent: 'Formula Version đã duyệt', replace: 'Material ID cần thay thế', required: 'Material ID bắt buộc', prohibited: 'Material ID bị loại trừ', availability: 'Yêu cầu tồn kho khả dụng', strict: 'Chỉ dùng bằng chứng compliance đã duyệt', candidates: 'Phương án', run: 'Chạy optimizer',
    advisory: 'Chỉ tư vấn', saveDraft: 'Lưu thành Formula draft', reject: 'Từ chối', archive: 'Lưu trữ', evidence: 'Snapshot bằng chứng', noRuns: 'Chưa có optimizer run.',
    importTitle: 'Import spreadsheet có kiểm soát', file: 'Tệp nguồn', kind: 'Loại bản ghi', dryRun: 'Chỉ dry run', mapping: 'JSON ánh xạ cột', preview: 'Xác thực preview', commit: 'Xác nhận import create-only', noImports: 'Chưa có import job.',
    rows: 'Dòng', valid: 'Hợp lệ', invalid: 'Không hợp lệ', duplicates: 'Trùng lặp', committed: 'Đã ghi', dataOpsTitle: 'Ranh giới chất lượng DataOps', localCheck: 'Chạy local quality gate', vexo: 'Chạy Vexo adapter', vexoNotice: 'Vexo chưa được cấu hình rõ ràng. Không có provider call nào được thực hiện.',
    bulkTitle: 'Đổi trạng thái hàng loạt có kiểm soát', targetIds: 'Target ID', status: 'Trạng thái đích', rationale: 'Lý do', previewBulk: 'Xem trước thay đổi', confirmBulk: 'Xác nhận thay đổi', noBulk: 'Tạo preview trước khi xác nhận bulk change.',
    loading: 'Đang tải governed records...', done: 'Tác vụ đã hoàn thành.', retry: 'Thử lại', formulaSensitive: 'Chi tiết thành phần cần quyền Formula sensitive-view.',
  },
} as const

type Text = { [Key in keyof typeof copy['en-US']]: string }
type ImportKind = 'MATERIALS' | 'SUPPLIERS' | 'SUPPLIER_OFFERS' | 'OPENING_INVENTORY'
type BulkKind = 'MATERIAL_STATUS' | 'SUPPLIER_STATUS' | 'SUPPLIER_OFFER_STATUS'

function humanize(value: string) { return value.replaceAll('_', ' ').toLocaleLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function has(capabilities: CapabilityMap, key: string) { return capabilities[key] === true }
function ids(value: string) { return [...new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))] }
function smallHash(value: string | null | undefined) { return value ? `${value.slice(0, 12)}...` : 'Not recorded' }

export function AdvancedWorkspace({ apiBase = defaultAdvancedApiBase, formulaApiBase = defaultFormulaApiBase, capabilities = {}, locale = 'en-US' }: { apiBase?: string; formulaApiBase?: string; capabilities?: CapabilityMap; locale?: Locale }) {
  const text = copy[locale]
  const canOptimizerView = has(capabilities, 'optimizer.view')
  const canOptimizerRun = has(capabilities, 'optimizer.run') && has(capabilities, 'formula.viewSensitive') && has(capabilities, 'materials.view')
  const canReview = has(capabilities, 'optimizer.review')
  const canImportView = has(capabilities, 'imports.view')
  const canImportPreview = has(capabilities, 'imports.preview')
  const canImportCommit = has(capabilities, 'imports.commit')
  const canDataOpsView = has(capabilities, 'dataops.view')
  const canDataOpsRun = has(capabilities, 'dataops.run') && has(capabilities, 'imports.view')
  const canBulkPreview = has(capabilities, 'bulk.preview')
  const canBulkExecute = has(capabilities, 'bulk.execute')
  const availableTabs = useMemo(() => [
    ...(canOptimizerView ? ['optimizer' as const] : []),
    ...(canImportView ? ['imports' as const] : []),
    ...(canDataOpsView ? ['dataops' as const] : []),
    ...(canBulkPreview ? ['bulk' as const] : []),
  ], [canBulkPreview, canDataOpsView, canImportView, canOptimizerView])
  const [tab, setTab] = useState<Tab>(availableTabs[0] ?? 'optimizer')
  const [runs, setRuns] = useState<OptimizerRun[]>([])
  const [imports, setImports] = useState<ImportJob[]>([])
  const [dataOpsRuns, setDataOpsRuns] = useState<DataOpsRun[]>([])
  const [versions, setVersions] = useState<Array<{ id: string; projectId: string; projectName: string; versionNumber: number }>>([])
  const [selectedRun, setSelectedRun] = useState<OptimizerDetail | null>(null)
  const [selectedImport, setSelectedImport] = useState<ImportDetail | null>(null)
  const [pendingImportTokens, setPendingImportTokens] = useState<Record<string, string>>({})
  const [pendingBulk, setPendingBulk] = useState<{ id: string; token: string; report: Record<string, unknown> } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [optimizerForm, setOptimizerForm] = useState({ parentFormulaVersionId: '', replace: '', required: '', prohibited: '', requireAvailableInventory: false, strict: false, candidateLimit: '3', randomSeed: '0' })
  const [importForm, setImportForm] = useState<{ kind: ImportKind; file: File | null; dryRun: boolean; mapping: string }>({ kind: 'MATERIALS', file: null, dryRun: true, mapping: '{}' })
  const [bulkForm, setBulkForm] = useState<{ kind: BulkKind; targetIds: string; status: string; rationale: string }>({ kind: 'MATERIAL_STATUS', targetIds: '', status: 'REVIEW_REQUIRED', rationale: '' })

  useEffect(() => { if (!availableTabs.includes(tab)) setTab(availableTabs[0] ?? 'optimizer') }, [availableTabs, tab])

  const loadRun = useCallback(async (runId: string) => {
    const detail = await advancedRequest<OptimizerDetail>(apiBase, `optimizer/runs/${encodeURIComponent(runId)}`)
    setSelectedRun(detail)
  }, [apiBase])
  const loadImport = useCallback(async (jobId: string) => {
    const detail = await advancedRequest<ImportDetail>(apiBase, `imports/${encodeURIComponent(jobId)}`)
    setSelectedImport(detail)
  }, [apiBase])
  const refresh = useCallback(async () => {
    setError(null)
    try {
      const loaders: Promise<void>[] = []
      if (canOptimizerView) loaders.push(advancedRequest<{ runs: OptimizerRun[] }>(apiBase, 'optimizer/runs').then((payload) => setRuns(payload.runs)))
      if (canImportView) loaders.push(advancedRequest<{ imports: ImportJob[] }>(apiBase, 'imports').then((payload) => setImports(payload.imports)))
      if (canDataOpsView) loaders.push(advancedRequest<{ runs: DataOpsRun[] }>(apiBase, 'dataops/runs').then((payload) => setDataOpsRuns(payload.runs)))
      if (canOptimizerRun) loaders.push(formulaRequest<{ projects: FormulaProject[] }>(formulaApiBase, 'projects').then(async (payload) => {
        const details = await Promise.all(payload.projects.map(async (project) => formulaRequest<{ project: FormulaProjectDetail }>(formulaApiBase, `projects/${encodeURIComponent(project.id)}`).catch(() => null)))
        const approved = details.flatMap((entry) => entry?.project.versions.filter((version) => version.approvalStatus === 'APPROVED').map((version) => ({ id: version.id, projectId: entry.project.project.id, projectName: entry.project.project.name, versionNumber: version.versionNumber })) ?? [])
        setVersions(approved)
        setOptimizerForm((current) => current.parentFormulaVersionId || !approved[0] ? current : { ...current, parentFormulaVersionId: approved[0].id })
      }))
      await Promise.all(loaders)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load governed records.') }
  }, [apiBase, canDataOpsView, canImportView, canOptimizerRun, canOptimizerView, formulaApiBase])
  useEffect(() => { void refresh() }, [refresh])

  const execute = async (operation: string, action: () => Promise<void>, success: string = text.done) => {
    setBusy(operation); setError(null); setNotice(null)
    try { await action(); setNotice(success) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to complete this operation.') } finally { setBusy(null) }
  }

  const startOptimizer = async (event: FormEvent) => {
    event.preventDefault()
    await execute('optimizer-run', async () => {
      const payload = await advancedRequest<{ run: { id: string } }>(apiBase, 'optimizer/runs', {
        method: 'POST', body: JSON.stringify({
          parentFormulaVersionId: optimizerForm.parentFormulaVersionId,
          constraints: {
            requiredMaterialIds: ids(optimizerForm.required), prohibitedMaterialIds: ids(optimizerForm.prohibited), replaceMaterialIds: ids(optimizerForm.replace),
            minComponentCount: 1, maxComponentCount: 32, complianceMode: optimizerForm.strict ? 'APPROVED_EVIDENCE_ONLY' : 'REPORT_ONLY', requireAvailableInventory: optimizerForm.requireAvailableInventory,
          },
          objectives: { odorSimilarity: 0.55, briefAlignment: 0.2, availability: 0.15, cost: 0, sensoryEvidence: 0.05, consumerEvidence: 0.05 },
          solverConfig: { algorithmVersion: 'reformulation/1', candidateLimit: Number(optimizerForm.candidateLimit), randomSeed: Number(optimizerForm.randomSeed) },
        }),
      }, `advanced-optimizer-${optimizerForm.parentFormulaVersionId}-${optimizerForm.replace}-${optimizerForm.randomSeed}`)
      await refresh(); await loadRun(payload.run.id)
    }, 'Optimizer candidate set created as advisory evidence.')
  }

  const reviewCandidate = async (candidateId: string, decision: 'SAVE_AS_DRAFT' | 'REJECT' | 'ARCHIVE') => {
    const sourceProjectId = selectedRun ? versions.find((version) => version.id === selectedRun.run.parentFormulaVersionId)?.projectId : undefined
    if (decision === 'SAVE_AS_DRAFT' && (!sourceProjectId || !has(capabilities, 'formula.edit'))) { setError('The parent Formula Project is unavailable or this role cannot create a Formula draft.'); return }
    await execute(`optimizer-review-${candidateId}-${decision}`, async () => {
      await advancedRequest(apiBase, `optimizer/candidates/${encodeURIComponent(candidateId)}/review`, {
        method: 'POST', body: JSON.stringify({ decision, ...(decision === 'SAVE_AS_DRAFT' ? { formulaProjectId: sourceProjectId } : {}), rationale: decision === 'SAVE_AS_DRAFT' ? 'Human perfumer review accepted this advisory candidate as a draft.' : `Human optimizer review marked this candidate ${decision.toLowerCase()}.` }),
      }, `advanced-candidate-${candidateId}-${decision}`)
      if (selectedRun) await loadRun(selectedRun.run.id)
      await refresh()
    }, decision === 'SAVE_AS_DRAFT' ? 'Formula draft created through the Formula authority.' : 'Candidate decision recorded.')
  }

  const createImport = async (event: FormEvent) => {
    event.preventDefault()
    if (!importForm.file) { setError('Choose a CSV or XLSX source file.'); return }
    await execute('import-preview', async () => {
      if (importForm.file!.size > 5_000_000) throw new Error('The import source exceeds the 5 MB limit.')
      let mapping: Record<string, string>
      try { mapping = JSON.parse(importForm.mapping || '{}') as Record<string, string> } catch { throw new Error('Column mapping must be a JSON object.') }
      if (!mapping || Array.isArray(mapping) || typeof mapping !== 'object') throw new Error('Column mapping must be a JSON object.')
      const extension = importForm.file!.name.split('.').pop()?.toLowerCase()
      if (extension !== 'csv' && extension !== 'xlsx') throw new Error('Use a CSV or XLSX source file.')
      const payload = await advancedRequest<{ importJob: { id: string; confirmationToken?: string } }>(apiBase, 'imports', {
        method: 'POST', body: JSON.stringify({ kind: importForm.kind, format: extension.toUpperCase(), fileName: importForm.file!.name, contentBase64: await base64FromFile(importForm.file!), mapping, dryRun: importForm.dryRun }),
      }, `advanced-import-preview-${importForm.kind}-${importForm.file!.name}-${importForm.file!.size}-${importForm.dryRun}`)
      if (payload.importJob.confirmationToken) setPendingImportTokens((current) => ({ ...current, [payload.importJob.id]: payload.importJob.confirmationToken! }))
      await refresh(); await loadImport(payload.importJob.id)
    }, importForm.dryRun ? 'Dry-run validation completed. No business record was created.' : 'Import preview is ready for explicit confirmation.')
  }

  const commitImport = async () => {
    const job = selectedImport?.job; const token = job ? pendingImportTokens[job.id] : undefined
    if (!job || !token) { setError('This browser session no longer holds a valid import confirmation. Create a fresh confirmed preview.'); return }
    await execute(`import-commit-${job.id}`, async () => {
      await advancedRequest(apiBase, `imports/${encodeURIComponent(job.id)}/commit`, { method: 'POST', body: JSON.stringify({ confirmationToken: token, mode: 'CREATE_ONLY' }) }, `advanced-import-commit-${job.id}`)
      setPendingImportTokens((current) => { const next = { ...current }; delete next[job.id]; return next })
      await refresh(); await loadImport(job.id)
    }, 'Create-only import committed through the owning domain services.')
  }

  const runDataOps = async (adapter: 'LOCAL_QUALITY_GATE' | 'VEXO') => {
    if (!selectedImport) { setError('Select an import job first.'); return }
    await execute(`dataops-${adapter}-${selectedImport.job.id}`, async () => {
      const payload = await advancedRequest<{ run: { status: string } }>(apiBase, 'dataops/runs', { method: 'POST', body: JSON.stringify({ importJobId: selectedImport.job.id, adapter }) }, `advanced-dataops-${adapter}-${selectedImport.job.id}`)
      if (payload.run.status === 'NOT_CONFIGURED') setNotice(text.vexoNotice)
    }, adapter === 'VEXO' ? text.vexoNotice : 'Local quality result recorded with bounded import evidence.')
  }

  const previewBulk = async (event: FormEvent) => {
    event.preventDefault()
    await execute('bulk-preview', async () => {
      const payload = await advancedRequest<{ operation: { id: string; confirmationToken: string; report: Record<string, unknown> } }>(apiBase, 'bulk/preview', {
        method: 'POST', body: JSON.stringify({ kind: bulkForm.kind, targetIds: ids(bulkForm.targetIds), payload: { status: bulkForm.status }, rationale: bulkForm.rationale }),
      }, `advanced-bulk-preview-${bulkForm.kind}-${bulkForm.targetIds}-${bulkForm.status}-${bulkForm.rationale}`)
      setPendingBulk({ id: payload.operation.id, token: payload.operation.confirmationToken, report: payload.operation.report })
    }, 'Bulk preview is ready for explicit confirmation.')
  }

  const commitBulk = async () => {
    if (!pendingBulk) return
    await execute(`bulk-commit-${pendingBulk.id}`, async () => {
      await advancedRequest(apiBase, `bulk/${encodeURIComponent(pendingBulk.id)}/commit`, { method: 'POST', body: JSON.stringify({ confirmationToken: pendingBulk.token }) }, `advanced-bulk-commit-${pendingBulk.id}`)
      setPendingBulk(null)
    }, 'Bulk change was committed and audited.')
  }

  if (!availableTabs.length) return <section className="v2-advanced-workspace" data-testid="v2-advanced-restricted"><div className="v2-advanced-panel"><h2>{text.heading}</h2><p>{text.noAccess}</p></div></section>

  return <section className="v2-advanced-workspace" data-testid="v2-advanced-workspace">
    <header className="v2-advanced-heading"><div><span className="v2-eyebrow">{text.eyebrow}</span><h2>{text.heading}</h2><p>{text.intro}</p></div><button type="button" className="v2-advanced-icon-button" title={text.refresh} aria-label={text.refresh} onClick={() => void refresh()} disabled={busy !== null}><RefreshCw size={17} /></button></header>
    <nav className="v2-advanced-tabs" aria-label={text.heading}>{availableTabs.map((item) => <button type="button" key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item === 'optimizer' ? text.optimizer : item === 'imports' ? text.imports : item === 'dataops' ? text.dataops : text.bulk}</button>)}</nav>
    {error ? <div className="v2-advanced-alert is-error" role="alert">{error}<button type="button" aria-label={text.retry} onClick={() => { setError(null); void refresh() }}><RefreshCw size={14} /></button></div> : null}
    {notice ? <div className="v2-advanced-alert" role="status">{notice}</div> : null}
    {tab === 'optimizer' ? <OptimizerPanel text={text} capabilities={capabilities} runs={runs} detail={selectedRun} versions={versions} busy={busy} canRun={canOptimizerRun} canReview={canReview} onRun={startOptimizer} onLoad={(id) => void execute(`load-run-${id}`, () => loadRun(id), '')} onReview={reviewCandidate} form={optimizerForm} setForm={setOptimizerForm} /> : null}
    {tab === 'imports' ? <ImportsPanel text={text} imports={imports} detail={selectedImport} form={importForm} setForm={setImportForm} busy={busy} canPreview={canImportPreview} canCommit={canImportCommit} onCreate={createImport} onLoad={(id) => void execute(`load-import-${id}`, () => loadImport(id), '')} onCommit={commitImport} /> : null}
    {tab === 'dataops' ? <DataOpsPanel text={text} detail={selectedImport} runs={dataOpsRuns} canRun={canDataOpsRun} busy={busy} onRun={runDataOps} /> : null}
    {tab === 'bulk' ? <BulkPanel text={text} form={bulkForm} setForm={setBulkForm} pending={pendingBulk} busy={busy} canExecute={canBulkExecute} onPreview={previewBulk} onCommit={commitBulk} /> : null}
  </section>
}

function OptimizerPanel({ text, capabilities, runs, detail, versions, busy, canRun, canReview, onRun, onLoad, onReview, form, setForm }: { text: Text; capabilities: CapabilityMap; runs: OptimizerRun[]; detail: OptimizerDetail | null; versions: Array<{ id: string; projectId: string; projectName: string; versionNumber: number }>; busy: string | null; canRun: boolean; canReview: boolean; onRun: (event: FormEvent) => Promise<void>; onLoad: (id: string) => void; onReview: (candidateId: string, decision: 'SAVE_AS_DRAFT' | 'REJECT' | 'ARCHIVE') => void; form: { parentFormulaVersionId: string; replace: string; required: string; prohibited: string; requireAvailableInventory: boolean; strict: boolean; candidateLimit: string; randomSeed: string }; setForm: (value: typeof form) => void }) {
  return <div className="v2-advanced-stack">
    {canRun ? <section className="v2-advanced-panel"><div className="v2-advanced-panel-heading"><div><h3>{text.optimizer}</h3><p>{text.advisory}. The solver pins its Formula Version, material universe, constraints, objective weights and seed.</p></div><WandSparkles size={20} /></div><form className="v2-advanced-form" onSubmit={(event) => void onRun(event)}><label>{text.parent}<select required value={form.parentFormulaVersionId} onChange={(event) => setForm({ ...form, parentFormulaVersionId: event.target.value })}><option value="">Select an approved Formula Version</option>{versions.map((version) => <option value={version.id} key={version.id}>{version.projectName} v{version.versionNumber}</option>)}</select></label><label>{text.replace}<input value={form.replace} onChange={(event) => setForm({ ...form, replace: event.target.value })} placeholder="mat_..." /></label><label>{text.required}<input value={form.required} onChange={(event) => setForm({ ...form, required: event.target.value })} placeholder="mat_..." /></label><label>{text.prohibited}<input value={form.prohibited} onChange={(event) => setForm({ ...form, prohibited: event.target.value })} placeholder="mat_..." /></label><label>{text.candidates}<input required type="number" min="1" max="12" value={form.candidateLimit} onChange={(event) => setForm({ ...form, candidateLimit: event.target.value })} /></label><label>Seed<input required type="number" min="0" value={form.randomSeed} onChange={(event) => setForm({ ...form, randomSeed: event.target.value })} /></label><label className="v2-advanced-check"><input type="checkbox" checked={form.requireAvailableInventory} onChange={(event) => setForm({ ...form, requireAvailableInventory: event.target.checked })} />{text.availability}</label><label className="v2-advanced-check"><input type="checkbox" checked={form.strict} onChange={(event) => setForm({ ...form, strict: event.target.checked })} />{text.strict}</label><button className="v2-primary-button" type="submit" disabled={busy === 'optimizer-run' || !versions.length}>{busy === 'optimizer-run' ? '...' : <><WandSparkles size={16} />{text.run}</>}</button></form></section> : null}
    <section className="v2-advanced-panel"><div className="v2-advanced-panel-heading"><div><h3>Runs</h3><p>{text.advisory}. No candidate is an approved Formula.</p></div></div>{runs.length ? <div className="v2-advanced-list">{runs.map((run) => <button type="button" className={`v2-advanced-row ${detail?.run.id === run.id ? 'is-selected' : ''}`} key={run.id} onClick={() => onLoad(run.id)}><span><strong>{run.id.slice(0, 18)}</strong><small>{run.candidateCount} candidate{run.candidateCount === 1 ? '' : 's'} · {run.solverVersion}</small></span><span>{humanize(run.status)}</span><time>{new Date(run.createdAt).toLocaleString()}</time></button>)}</div> : <p className="v2-advanced-empty">{text.noRuns}</p>}</section>
    {detail ? <section className="v2-advanced-panel" data-testid="v2-advanced-optimizer-detail"><div className="v2-advanced-panel-heading"><div><h3>{text.candidates}</h3><p>{text.evidence}: {smallHash(detail.run.inputHash)} / {smallHash(detail.run.resultHash)}</p></div><ShieldCheck size={20} /></div><div className="v2-advanced-evidence"><span>Solver {String(detail.run.solverConfig?.algorithmVersion ?? 'reformulation/1')}</span><span>Seed {String(detail.run.solverConfig?.randomSeed ?? 'not recorded')}</span><span>{text.advisory}</span></div>{detail.candidates.map((candidate) => <article className="v2-advanced-candidate" key={candidate.id}><div className="v2-advanced-candidate-heading"><div><strong>#{candidate.candidateNumber}</strong><span>{humanize(candidate.status)}</span></div><span>Score {Number(candidate.scorecard.total ?? 0).toFixed(3)}</span></div>{has(capabilities, 'formula.viewSensitive') ? <div className="v2-advanced-components">{candidate.componentProposal?.map((component) => <div key={`${candidate.id}-${component.materialId}`}><code>{component.materialId}</code><span>{component.percentage.toFixed(4)}%</span><small>{component.note || ''}</small></div>)}</div> : <p className="v2-advanced-muted">{text.formulaSensitive}</p>}<div className="v2-advanced-evidence"><span>Compliance {String((candidate.scorecard.compliance as { status?: string } | undefined)?.status ?? 'NOT_EVALUATED')}</span><span>Cost {String((candidate.scorecard.cost as { status?: string } | undefined)?.status ?? 'NOT_EVALUATED')}</span></div>{candidate.status === 'ADVISORY' && canReview ? <div className="v2-advanced-actions">{has(capabilities, 'formula.edit') ? <button className="v2-primary-button" type="button" disabled={busy !== null} onClick={() => onReview(candidate.id, 'SAVE_AS_DRAFT')}><Check size={15} />{text.saveDraft}</button> : null}<button className="v2-secondary-button" type="button" disabled={busy !== null} onClick={() => onReview(candidate.id, 'REJECT')}><X size={15} />{text.reject}</button><button className="v2-text-button" type="button" disabled={busy !== null} onClick={() => onReview(candidate.id, 'ARCHIVE')}><Archive size={15} />{text.archive}</button></div> : null}</article>)}</section> : null}
  </div>
}

function ImportsPanel({ text, imports, detail, form, setForm, busy, canPreview, canCommit, onCreate, onLoad, onCommit }: { text: Text; imports: ImportJob[]; detail: ImportDetail | null; form: { kind: ImportKind; file: File | null; dryRun: boolean; mapping: string }; setForm: (value: typeof form) => void; busy: string | null; canPreview: boolean; canCommit: boolean; onCreate: (event: FormEvent) => Promise<void>; onLoad: (id: string) => void; onCommit: () => void }) {
  return <div className="v2-advanced-stack">
    {canPreview ? <section className="v2-advanced-panel"><div className="v2-advanced-panel-heading"><div><h3>{text.importTitle}</h3><p>CSV and XLSX are parsed as untrusted data. Formula cells, duplicate overwrite and cross-tenant references are rejected.</p></div><FileUp size={20} /></div><form className="v2-advanced-form" onSubmit={(event) => void onCreate(event)}><label>{text.file}<input required type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] ?? null })} /></label><label>{text.kind}<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as ImportKind })}><option value="MATERIALS">Materials</option><option value="SUPPLIERS">Suppliers</option><option value="SUPPLIER_OFFERS">Supplier offers</option><option value="OPENING_INVENTORY">Opening inventory</option></select></label><label className="v2-advanced-check"><input type="checkbox" checked={form.dryRun} onChange={(event) => setForm({ ...form, dryRun: event.target.checked })} />{text.dryRun}</label><label className="v2-advanced-span-two">{text.mapping}<textarea value={form.mapping} onChange={(event) => setForm({ ...form, mapping: event.target.value })} spellCheck={false} /></label><button className="v2-primary-button" type="submit" disabled={busy === 'import-preview'}>{busy === 'import-preview' ? '...' : <><ClipboardCheck size={16} />{text.preview}</>}</button></form></section> : null}
    <section className="v2-advanced-panel"><h3>Import jobs</h3>{imports.length ? <div className="v2-advanced-list">{imports.map((job) => <button type="button" key={job.id} className={`v2-advanced-row ${detail?.job.id === job.id ? 'is-selected' : ''}`} onClick={() => onLoad(job.id)}><span><strong>{job.sourceName}</strong><small>{humanize(job.importKind)} · {job.dryRun ? 'Dry run' : 'Confirmed preview'}</small></span><span>{humanize(job.status)}</span><span>{job.validRowCount} valid / {job.invalidRowCount} invalid</span></button>)}</div> : <p className="v2-advanced-empty">{text.noImports}</p>}</section>
    {detail ? <section className="v2-advanced-panel" data-testid="v2-advanced-import-detail"><div className="v2-advanced-panel-heading"><div><h3>{detail.job.sourceName}</h3><p>{humanize(detail.job.importKind)} · {detail.job.dryRun ? 'Dry run' : 'Confirmed preview'}</p></div>{detail.job.status === 'VALIDATED' && !detail.job.dryRun && canCommit ? <button className="v2-primary-button" type="button" disabled={busy !== null} onClick={onCommit}><Check size={16} />{text.commit}</button> : null}</div><div className="v2-advanced-summary"><span>{text.rows}<strong>{detail.job.parsedRowCount}</strong></span><span>{text.valid}<strong>{detail.job.validRowCount}</strong></span><span>{text.invalid}<strong>{detail.job.invalidRowCount}</strong></span><span>{text.duplicates}<strong>{detail.job.duplicateRowCount}</strong></span><span>{text.committed}<strong>{detail.job.committedRowCount}</strong></span></div><div className="v2-advanced-list">{detail.rows.map((row) => <div className="v2-advanced-row is-static" key={row.sourceRowNumber}><span><strong>#{row.sourceRowNumber}</strong><small>{row.validationErrors.join(' ') || row.targetType || 'Validated row'}</small></span><span>{humanize(row.status)}</span><code>{row.targetId ? row.targetId.slice(0, 18) : ''}</code></div>)}</div></section> : null}
  </div>
}

function DataOpsPanel({ text, detail, runs, canRun, busy, onRun }: { text: Text; detail: ImportDetail | null; runs: DataOpsRun[]; canRun: boolean; busy: string | null; onRun: (adapter: 'LOCAL_QUALITY_GATE' | 'VEXO') => void }) {
  return <div className="v2-advanced-stack"><section className="v2-advanced-panel"><div className="v2-advanced-panel-heading"><div><h3>{text.dataOpsTitle}</h3><p>DataOps can validate import evidence. It does not become authority for inventory, Formula approval or compliance.</p></div><DatabaseZap size={20} /></div>{detail ? <div className="v2-advanced-actions"><button className="v2-primary-button" type="button" disabled={!canRun || busy !== null} onClick={() => onRun('LOCAL_QUALITY_GATE')}><ClipboardCheck size={16} />{text.localCheck}</button><button className="v2-secondary-button" type="button" disabled={!canRun || busy !== null} onClick={() => onRun('VEXO')}><DatabaseZap size={16} />{text.vexo}</button></div> : <p className="v2-advanced-empty">{text.noImports}</p>}{!canRun ? <p className="v2-advanced-muted">This role may view DataOps status but cannot run a job.</p> : null}{runs.length ? <div className="v2-advanced-list" data-testid="v2-advanced-dataops-runs">{runs.map((run) => <div className="v2-advanced-row is-static" key={run.id}><span><strong>{humanize(run.adapter)}</strong><small>{new Date(run.createdAt).toLocaleString()}</small></span><span>{humanize(run.status)}</span><code>{run.failureCode || run.importJobId.slice(0, 18)}</code></div>)}</div> : <p className="v2-advanced-empty">No DataOps run has been recorded.</p>}</section></div>
}

function BulkPanel({ text, form, setForm, pending, busy, canExecute, onPreview, onCommit }: { text: Text; form: { kind: BulkKind; targetIds: string; status: string; rationale: string }; setForm: (value: typeof form) => void; pending: { id: string; token: string; report: Record<string, unknown> } | null; busy: string | null; canExecute: boolean; onPreview: (event: FormEvent) => Promise<void>; onCommit: () => void }) {
  return <div className="v2-advanced-stack"><section className="v2-advanced-panel"><div className="v2-advanced-panel-heading"><div><h3>{text.bulkTitle}</h3><p>A preview freezes target IDs and proposed status before a separate confirmation commits the domain change.</p></div><ShieldCheck size={20} /></div><form className="v2-advanced-form" onSubmit={(event) => void onPreview(event)}><label>Kind<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as BulkKind })}><option value="MATERIAL_STATUS">Material status</option><option value="SUPPLIER_STATUS">Supplier status</option><option value="SUPPLIER_OFFER_STATUS">Supplier offer status</option></select></label><label>{text.status}<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="DRAFT">Draft</option><option value="REVIEW_REQUIRED">Review required</option><option value="ACTIVE">Active</option><option value="BLOCKED">Blocked</option><option value="SUSPENDED">Suspended</option><option value="ARCHIVED">Archived</option></select></label><label className="v2-advanced-span-two">{text.targetIds}<textarea required value={form.targetIds} onChange={(event) => setForm({ ...form, targetIds: event.target.value })} placeholder="id-1, id-2" /></label><label className="v2-advanced-span-two">{text.rationale}<textarea required maxLength={1000} value={form.rationale} onChange={(event) => setForm({ ...form, rationale: event.target.value })} /></label><button className="v2-primary-button" type="submit" disabled={busy === 'bulk-preview'}>{busy === 'bulk-preview' ? '...' : <><ClipboardCheck size={16} />{text.previewBulk}</>}</button></form></section>{pending ? <section className="v2-advanced-panel" data-testid="v2-advanced-bulk-confirmation"><div className="v2-advanced-panel-heading"><div><h3>Previewed change</h3><p>{JSON.stringify(pending.report)}</p></div>{canExecute ? <button className="v2-primary-button" type="button" disabled={busy !== null} onClick={onCommit}><Check size={16} />{text.confirmBulk}</button> : null}</div></section> : <p className="v2-advanced-empty">{text.noBulk}</p>}</div>
}
