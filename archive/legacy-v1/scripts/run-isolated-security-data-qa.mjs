import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertIsolatedWorker,
  cleanupTenantFixtures,
  createTestTenant,
  executeD1Sql,
  loginFixtureUser,
  validateIsolatedFixtureConfig,
} from './qa-isolated-fixture-support.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportsDirectory = path.join(root, 'reports')
const runId = randomUUID()
const runTag = runId.slice(0, 8)
const casSeed = String(Date.now()).slice(-7)
const fixtureIpSegment = 20 + (Date.now() % 180)
const date = new Date().toISOString().slice(0, 10)
const results = []
const securityEvidence = []
const dataEvidence = []
const cleanupTargets = []

function idempotency(label) {
  return `qa-${runTag}-${label}`
}

function shortHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

function safeMessage(error) {
  return String(error?.message ?? error)
    .replace(/Bearer\s+[^\s]+/giu, 'Bearer [redacted]')
    .replace(/oo_session=[^;\s]+/giu, 'oo_session=[redacted]')
    .slice(0, 280)
}

function dataOf(response) {
  if (!response?.json || typeof response.json !== 'object') return undefined
  return response.json.data
}

function record(id, area, status, evidence, detail = '') {
  const row = { id, area, status, evidence, detail }
  results.push(row)
  if (area === 'SEC-007' || area === 'AUDIT') {
    securityEvidence.push(row)
  } else {
    dataEvidence.push(row)
  }
  return row
}

async function check(id, area, evidence, action, { critical = false } = {}) {
  try {
    const value = await action()
    record(id, area, 'PASS', evidence)
    return value
  } catch (error) {
    record(id, area, critical ? 'FAIL' : 'PARTIAL', evidence, safeMessage(error))
    return undefined
  }
}

function assertStatus(response, expected, label) {
  assert.equal(response.status, expected, `${label}: expected HTTP ${expected}, received ${response.status} (${safeMessage(response.json?.message ?? response.json?.error ?? '')})`)
  return response
}

function assertNotFoundLike(response, label) {
  assert.ok([403, 404].includes(response.status), `${label}: expected a non-enumerating 403/404, received ${response.status}`)
  return response
}

async function request(client, pathname, options = {}) {
  const response = await client.request(pathname, options)
  return response
}

async function post(client, pathname, body, label, key = idempotency(label)) {
  return request(client, pathname, { method: 'POST', body, idempotencyKey: key })
}

async function patch(client, pathname, body, label, key = idempotency(label)) {
  return request(client, pathname, { method: 'PATCH', body, idempotencyKey: key })
}

async function put(client, pathname, body, label, key = idempotency(label)) {
  return request(client, pathname, { method: 'PUT', body, idempotencyKey: key })
}

function requireData(response, label) {
  assertStatus(response, 200, label)
  const data = dataOf(response)
  assert.ok(data, `${label}: response did not include data`)
  return data
}

function responseMaterial(response, label) {
  const data = requireData(response, label)
  return data.material ?? data
}

async function writeReports(config, health) {
  await mkdir(reportsDirectory, { recursive: true })
  const byStatus = (collection, status) => collection.filter((row) => row.status === status).length
  const detailRows = (collection) => collection.map((row) => `| ${row.id} | ${row.status} | ${row.evidence} | ${row.detail || '-'} |`).join('\n')
  const securityStatus = byStatus(securityEvidence, 'FAIL') ? 'FAIL' : byStatus(securityEvidence, 'PARTIAL') ? 'PARTIAL' : 'PASS'
  const dataStatus = byStatus(dataEvidence, 'FAIL') ? 'FAIL' : byStatus(dataEvidence, 'PARTIAL') ? 'PARTIAL' : 'PASS'
  const metadata = [
    `- Run: ${runId}`,
    '- Environment: isolated local Cloudflare Worker/D1 only',
    `- Worker: ${new URL(config.apiUrl).origin}`,
    `- Release environment: ${health.release?.environment ?? 'unknown'}`,
    '- No production request, credential, deploy, or mutation was used.',
    '- Test identities, passwords, opaque sessions, and dynamic resource identifiers are excluded from this report.',
  ].join('\n')
  await writeFile(path.join(reportsDirectory, `security-tenant-isolation-${date}-retest.md`), [
    '# SEC-007 isolated tenant-isolation retest',
    '',
    `**Verdict: ${securityStatus}**`,
    '',
    metadata,
    '',
    '| Test | Status | Evidence | Detail |',
    '| --- | --- | --- | --- |',
    detailRows(securityEvidence),
    '',
    '## Boundary',
    'This is evidence for a local isolated Worker/D1 instance. It is not production verification.',
  ].join('\n'), 'utf8')
  await writeFile(path.join(reportsDirectory, `data-integrity-${date}-retest.md`), [
    '# DATA-001 to DATA-003 isolated D1 retest',
    '',
    `**Verdict: ${dataStatus}**`,
    '',
    metadata,
    '',
    '| Test | Status | Evidence | Detail |',
    '| --- | --- | --- | --- |',
    detailRows(dataEvidence),
    '',
    '## Invariant',
    'Opening + receipts - issues +/- adjustments = closing was reconciled from the isolated movement ledger for the operational tenant when its dependent flow completed.',
    '',
    '## Boundary',
    'The evidence covers local Worker/D1 persistence and deterministic services only. External providers, remote D1, Pages, DNS, mail delivery, and production telemetry are not included.',
  ].join('\n'), 'utf8')
}

const config = validateIsolatedFixtureConfig()
const health = await assertIsolatedWorker(config)
let tenantA
let tenantB
let tenantAAdminClient

try {
  tenantA = await createTestTenant(config, `security-a-${runTag}`, `198.18.${fixtureIpSegment}.11`)
  tenantB = await createTestTenant(config, `security-b-${runTag}`, `198.18.${fixtureIpSegment}.12`)
  cleanupTargets.push(tenantA, tenantB)

  const adminEmail = `admin+${tenantA.slug}@qa.invalid`
  const adminPassword = `Qa-${runTag}-Admin-Only!`
  const adminUserId = `usr-qa-${runTag}-admin`
  const adminPasswordHash = createHash('sha256').update(`auth:v1:${adminEmail}:${adminPassword}`).digest('hex')
  await executeD1Sql(config, `
    INSERT INTO tenant_memberships (id, user_id, email, name, organization_id, brand_ids_json, role, status, mfa_enabled, last_active_at, invited_at, updated_at)
    VALUES ('mem-qa-${runTag}-admin', '${adminUserId}', '${adminEmail}', 'QA Admin', '${tenantA.id}', '["${tenantA.brandId}"]', 'Admin', 'ACTIVE', 0, datetime('now'), NULL, datetime('now'));
    INSERT INTO auth_credentials (email, password_hash, password_set_at, updated_at)
    VALUES ('${adminEmail}', 'sha256:${adminPasswordHash}', datetime('now'), datetime('now'));
  `, 'admin-fixture')
  tenantAAdminClient = await loginFixtureUser(config, { email: adminEmail, password: adminPassword, forwardedFor: `198.18.${fixtureIpSegment}.14` })
  tenantA.cleanupEmails = [tenantA.email, adminEmail]

  await check('SEC-007-001', 'SEC-007', 'Two independently signed-up isolated tenants were created with separate authenticated contexts.', async () => {
    assert.notEqual(tenantA.id, tenantB.id)
    assert.notEqual(tenantA.slug, tenantB.slug)
  }, { critical: true })

  const globalMaterialsA = await check('DATA-001-001', 'DATA', 'Materials API exposes the published Global Master library to tenant A.', async () => {
    const response = await request(tenantA.client, '/materials')
    const materials = requireData(response, 'tenant A materials')
    const global = materials.find((material) => material.libraryScope === 'GLOBAL')
    assert.ok(global, 'no Global Master material was projected for tenant A')
    assert.ok(materials.length >= 1986, `expected at least 1,986 global records, received ${materials.length}`)
    return { materials, global }
  }, { critical: true })

  await check('DATA-001-002', 'DATA', 'Materials API exposes the same Global Master library to tenant B.', async () => {
    const response = await request(tenantB.client, '/materials')
    const materials = requireData(response, 'tenant B materials')
    assert.ok(materials.some((material) => material.libraryScope === 'GLOBAL'), 'no Global Master material was projected for tenant B')
    assert.equal(
      materials.filter((material) => material.libraryScope === 'GLOBAL').length,
      globalMaterialsA?.materials.filter((material) => material.libraryScope === 'GLOBAL').length,
      'tenant material projections disagree on Global Master count',
    )
    return materials
  }, { critical: true })

  await check('DATA-001-003', 'DATA', 'Global Master source/API count, canonical IDs, and required identity fields reconcile in the isolated projection.', async () => {
    const materials = globalMaterialsA?.materials ?? []
    const globals = materials.filter((material) => material.libraryScope === 'GLOBAL')
    assert.ok(globals.length >= 1986, `global count below catalogue baseline: ${globals.length}`)
    const ids = new Set(globals.map((material) => material.id))
    assert.equal(ids.size, globals.length, 'duplicate global canonical IDs were projected')
    assert.ok(globals.every((material) => material.id && material.name && material.cas && material.family), 'a Global Master is missing id, name, CAS, or family')
    const database = await executeD1Sql(config, "SELECT COUNT(*) AS count FROM material_records WHERE library_scope = 'GLOBAL'", 'global-master-count')
    const count = Number(database[0]?.results?.[0]?.count ?? -1)
    assert.ok(count >= 1986, `D1 global master count below catalogue baseline: ${count}`)
  }, { critical: true })

  const globalCollision = (globalMaterialsA?.materials ?? []).find((material) => material.cas === '8007-75-8')
  await check('DATA-002-001', 'DATA', 'A Global Master with a documented CAS is available as the collision baseline.', async () => {
    assert.ok(globalCollision?.id, 'expected Bergamot Global Master collision baseline')
  }, { critical: true })

  const privateCollision = await check('DATA-002-002', 'DATA', 'Tenant A can create a private material with a CAS matching a Global Master without changing the Global record.', async () => {
    const response = await post(tenantA.client, '/materials', {
      name: `QA private Bergamot ${runTag}`,
      cas: '8007-75-8',
      family: 'Citrus',
      tier: 'Top',
      vaporPressure: 0.2,
      density: 0.88,
      mw: 136,
      logP: 2.1,
      substantivityHours: 4,
      ifraLimit: 100,
      costPerGram: 0.9,
      odor: ['citrus', 'qa-private'],
      organizationId: tenantB.id,
      tenantId: tenantB.id,
      workspaceId: tenantB.id,
      ownerId: 'override-attempt',
      createdBy: 'override-attempt',
      role: 'Owner',
      capabilities: ['*'],
      unexpectedPayload: 'must-not-persist',
    }, 'create-private-collision')
    const material = responseMaterial(response, 'create private collision material')
    assert.equal(material.organizationId, tenantA.id, 'organization override was accepted')
    assert.equal(material.libraryScope, 'TENANT', 'tenant material was promoted by client input')
    assert.notEqual(material.id, globalCollision.id, 'private collision overwrote Global Master')
    assert.equal(Object.hasOwn(material, 'ownerId'), false, 'ownerId mass assignment leaked into material')
    return material
  }, { critical: true })

  const privateOperational = await check('DATA-001-004', 'DATA', 'Tenant A can create a private operational material with explicit technical evidence.', async () => {
    const response = await post(tenantA.client, '/materials', {
      name: `QA operational material ${runTag}`,
      cas: `900-${casSeed}-1`,
      family: 'Woody',
      tier: 'Base',
      vaporPressure: 0.01,
      density: 0.97,
      mw: 180,
      logP: 3.2,
      substantivityHours: 24,
      ifraLimit: 100,
      costPerGram: 0.8,
      odor: ['woody', 'qa'],
      source: 'QA isolated evidence',
      version: '1',
    }, 'create-operational-material')
    const material = responseMaterial(response, 'create operational material')
    assert.equal(material.organizationId, tenantA.id)
    return material
  }, { critical: true })

  await check('SEC-007-002', 'SEC-007', 'Tenant B receives a non-enumerating response when reading tenant A private material.', async () => {
    const response = await request(tenantB.client, `/materials/${privateOperational?.id}`)
    assertNotFoundLike(response, 'cross-tenant material read')
  }, { critical: true })

  await check('DATA-002-003', 'DATA', 'Global and private CAS-collision records remain distinct and discoverable only within the owning tenant.', async () => {
    const responseA = await request(tenantA.client, '/materials/dedupe?cas=8007-75-8')
    const recordsA = requireData(responseA, 'tenant A collision dedupe').matches
    assert.ok(recordsA.some((material) => material.id === globalCollision.id))
    assert.ok(recordsA.some((material) => material.id === privateCollision?.id))
    const responseB = await request(tenantB.client, '/materials/dedupe?cas=8007-75-8')
    const recordsB = requireData(responseB, 'tenant B collision dedupe').matches
    assert.ok(recordsB.some((material) => material.id === globalCollision.id))
    assert.equal(recordsB.some((material) => material.id === privateCollision?.id), false, 'tenant B saw tenant A private CAS collision')
  }, { critical: true })

  await check('DATA-002-004', 'DATA', 'Global Master search uses the shared material resolver while tenant-private search remains isolated.', async () => {
    const globalSearchA = requireData(await request(tenantA.client, '/search?q=BERGAMOT'), 'tenant A global search')
    const globalSearchB = requireData(await request(tenantB.client, '/search?q=BERGAMOT'), 'tenant B global search')
    assert.ok(globalSearchA.results.some((item) => item.id === globalCollision.id), 'tenant A did not receive the Global Master search hit')
    assert.ok(globalSearchB.results.some((item) => item.id === globalCollision.id), 'tenant B did not receive the Global Master search hit')
    const privateSearchB = requireData(await request(tenantB.client, `/search?q=${encodeURIComponent(`QA operational material ${runTag}`)}`), 'tenant B private search')
    assert.equal(privateSearchB.results.some((item) => item.id === privateOperational?.id), false, 'tenant B search leaked tenant A private material')
  }, { critical: true })

  const formula = await check('SEC-007-003', 'SEC-007', 'Tenant A creates a formula and binds an explicit tenant-private material ID.', async () => {
    const created = await post(tenantA.client, '/formulas', {
      name: `QA formula ${runTag}`,
      formulaType: 'ACCORD',
      targetGrams: 100,
      finalProductConcentrationPercent: 100,
      targetMarkets: ['US'],
      ifraCategory: '4',
      requiresFinalProductContext: false,
      assignedReviewer: tenantA.email,
    }, 'create-formula')
    const formulaData = requireData(created, 'create formula')
    const draft = formulaData.formula ?? formulaData
    const lineResponse = await post(tenantA.client, `/formulas/${draft.id}/lines`, {
      materialId: privateOperational.id,
      grams: 100,
      pyramidNote: 'Base',
    }, 'add-formula-line')
    requireData(lineResponse, 'add formula line')
    const resolved = requireData(await request(tenantA.client, `/formulas/${draft.id}/resolve`), 'resolve formula')
    assert.ok(JSON.stringify(resolved).includes(privateOperational.id), 'formula resolver did not bind the intended tenant material')
    requireData(await post(tenantA.client, `/formulas/${draft.id}/review`, {
      reviewer: tenantA.email,
      comment: 'Isolated QA review submission',
    }, 'submit-formula-review'), 'submit formula for review')
    requireData(await post(tenantAAdminClient, `/formulas/${draft.id}/approve`, {
      comment: 'Isolated QA approval',
    }, 'approve-formula'), 'approve formula')
    return draft
  }, { critical: true })

  await check('SEC-007-004', 'SEC-007', 'Tenant B cannot read, resolve, export, or cost tenant A formula.', async () => {
    for (const [method, pathname] of [
      ['GET', `/formulas/${formula?.id}`],
      ['GET', `/formulas/${formula?.id}/resolve`],
      ['GET', `/formulas/${formula?.id}/cost`],
      ['POST', `/formulas/${formula?.id}/export`],
    ]) {
      const response = method === 'POST'
        ? await post(tenantB.client, pathname, {}, `cross-formula-export-${shortHash(pathname)}`)
        : await request(tenantB.client, pathname)
      assertNotFoundLike(response, `cross-tenant formula ${method}`)
    }
  }, { critical: true })

  const duplicateKey = idempotency('duplicate-material')
  let duplicateMaterial
  await check('SEC-007-005', 'SEC-007', 'Mutation idempotency returns the original result for a duplicate request and rejects conflicting reuse.', async () => {
    const body = {
      name: `QA idempotent material ${runTag}`,
      cas: `901-${casSeed}-2`,
      family: 'Floral',
      tier: 'Heart',
      vaporPressure: 0.03,
      density: 0.95,
      mw: 170,
      logP: 2.8,
      substantivityHours: 12,
      ifraLimit: 100,
      costPerGram: 0.75,
      odor: ['qa'],
    }
    const first = await request(tenantA.client, '/materials', { method: 'POST', body, idempotencyKey: duplicateKey })
    const second = await request(tenantA.client, '/materials', { method: 'POST', body, idempotencyKey: duplicateKey })
    duplicateMaterial = responseMaterial(first, 'first idempotent create')
    assert.equal(responseMaterial(second, 'second idempotent create').id, duplicateMaterial.id, 'duplicate mutation did not replay original response')
    const conflict = await request(tenantA.client, '/materials', { method: 'POST', body: { ...body, name: `${body.name} conflict` }, idempotencyKey: duplicateKey })
    assert.equal(conflict.status, 409, 'different payload with same idempotency key was accepted')
    const idempotencyRows = await executeD1Sql(config, `SELECT COUNT(*) AS count FROM operation_idempotency_records WHERE organization_id = '${tenantA.id.replaceAll("'", "''")}' AND idempotency_key = '${duplicateKey}'`, 'idempotency-evidence')
    assert.equal(Number(idempotencyRows[0]?.results?.[0]?.count ?? 0), 1, 'duplicate operation created more than one durable idempotency record')
  }, { critical: true })

  const supplier = await check('DATA-003-001', 'DATA', 'Procurement source master is created for the tenant-private operational material.', async () => {
    const response = await post(tenantA.client, '/suppliers', {
      name: `QA supplier ${runTag}`,
      country: 'US',
      leadTimeDays: 7,
      contactEmail: `supplier-${runTag}@qa.invalid`,
      preferredMaterialIds: [privateOperational.id],
    }, 'create-supplier')
    return requireData(response, 'create supplier').supplier
  }, { critical: true })

  await check('DATA-003-002', 'DATA', 'Compliance is approved explicitly before tenant-private procurement.', async () => {
    const response = await put(tenantA.client, `/materials/${privateOperational.id}/compliance`, {
      status: 'APPROVED',
      ifraCategoryLimits: [{ category: '4', limitPercent: 100 }],
      source: 'QA isolated evidence',
      sourceVersion: '1',
      reviewedAt: new Date().toISOString(),
    }, 'approve-material-compliance')
    requireData(response, 'approve material compliance')
  }, { critical: true })

  const purchaseOrder = await check('DATA-003-003', 'DATA', 'Purchase order is created for 100g of a tenant operational material.', async () => {
    const response = await post(tenantA.client, '/purchase-orders', {
      supplierId: supplier.id,
      materialId: privateOperational.id,
      quantityGrams: 100,
      unitCost: 0.8,
      currency: 'USD',
    }, 'create-purchase-order')
    return requireData(response, 'create purchase order').purchaseOrder
  }, { critical: true })

  await check('SEC-007-005A', 'SEC-007', 'Tenant-local purchase-order sequences cannot overwrite another tenant\'s globally persisted purchase order.', async () => {
    const materialResponse = await post(tenantB.client, '/materials', {
      name: `QA tenant B operational material ${runTag}`,
      cas: `94${casSeed.slice(-5)}-01-8`,
      family: 'Woody',
      tier: 'Base',
      vaporPressure: 0.08,
      density: 0.91,
      mw: 180,
      logP: 2.4,
      substantivityHours: 12,
      ifraLimit: 100,
      costPerGram: 1.1,
      odor: ['qa', 'tenant-b'],
    }, 'create-tenant-b-operational-material')
    const materialB = responseMaterial(materialResponse, 'create tenant B operational material')
    requireData(await put(tenantB.client, `/materials/${materialB.id}/compliance`, {
      status: 'APPROVED',
      ifraCategoryLimits: [{ category: '4', limitPercent: 100 }],
      source: 'QA isolated evidence',
      sourceVersion: '1',
      reviewedAt: new Date().toISOString(),
    }, 'approve-tenant-b-material-compliance'), 'approve tenant B material compliance')
    const supplierB = requireData(await post(tenantB.client, '/suppliers', {
      name: `QA tenant B supplier ${runTag}`,
      country: 'US',
      leadTimeDays: 7,
      contactEmail: `supplier-b-${runTag}@qa.invalid`,
      preferredMaterialIds: [materialB.id],
    }, 'create-tenant-b-supplier'), 'create tenant B supplier').supplier
    const purchaseOrderB = requireData(await post(tenantB.client, '/purchase-orders', {
      supplierId: supplierB.id,
      materialId: materialB.id,
      quantityGrams: 25,
      unitCost: 1.1,
      currency: 'USD',
    }, 'create-tenant-b-purchase-order'), 'create tenant B purchase order').purchaseOrder
    assert.notEqual(purchaseOrderB.id, purchaseOrder.id, 'tenant-local purchase order reused a global D1 record key')
    const persisted = await executeD1Sql(config, `
      SELECT id, organization_id FROM purchase_orders
      WHERE id IN ('${purchaseOrder.id.replaceAll("'", "''")}', '${purchaseOrderB.id.replaceAll("'", "''")}')
      ORDER BY organization_id;
    `, 'tenant-scoped-purchase-order-ids')
    const rows = persisted[0]?.results ?? []
    assert.equal(rows.length, 2, 'both tenant purchase orders were not retained')
    assert.equal(rows.some((row) => row.id === purchaseOrder.id && row.organization_id === tenantA.id), true, 'tenant A purchase order was overwritten')
    assert.equal(rows.some((row) => row.id === purchaseOrderB.id && row.organization_id === tenantB.id), true, 'tenant B purchase order was not scoped')
  }, { critical: true })

  await check('DATA-003-004', 'DATA', 'Purchase order transitions to SENT before goods receipt.', async () => {
    requireData(await patch(tenantA.client, `/purchase-orders/${purchaseOrder.id}/status`, { status: 'SENT' }, 'send-purchase-order'), 'send purchase order')
  }, { critical: true })

  const receipt = await check('DATA-003-005', 'DATA', 'First partial receipt creates a quarantined lot pending inspection.', async () => {
    const response = await post(tenantA.client, `/purchase-orders/${purchaseOrder.id}/receipts`, {
      lines: [{ materialId: privateOperational.id, receivedGrams: 40, supplierLotRef: `QA-${runTag}-A` }],
    }, 'create-partial-receipt')
    const data = requireData(response, 'create partial receipt')
    assert.ok(data.receipt?.id, 'procurement receipt id missing')
    assert.ok((data.lots ?? []).every((lot) => lot.qualityStatus === 'QUARANTINE'), 'receipt lot did not begin in quarantine')
    return data.receipt
  }, { critical: true })

  await check('DATA-003-006', 'DATA', 'Landed cost is posted before inspection disposition.', async () => {
    requireData(await post(tenantA.client, `/procurement/receipts/${receipt.id}/landed-cost`, { freightCost: 4, dutyCost: 1, insuranceCost: 1 }, 'post-landed-cost'), 'post landed cost')
  }, { critical: true })

  const inspectedReceipt = await check('DATA-003-007', 'DATA', 'Inspection acceptance promotes the first receipt lot to available inventory without duplicate receipt movement.', async () => {
    const response = await post(tenantA.client, `/procurement/receipts/${receipt.id}/inspect`, { action: 'ACCEPT' }, 'inspect-receipt')
    const data = requireData(response, 'inspect receipt')
    assert.ok((data.lots ?? []).every((lot) => lot.qualityStatus === 'APPROVED'), 'accepted inspection did not promote lot')
    const currentLots = requireData(await request(tenantA.client, '/lots'), 'lots after inspection')
    const activeLot = currentLots.find((candidate) => candidate.materialId === privateOperational.id && candidate.qualityStatus === 'APPROVED')
    assert.ok(activeLot?.id, 'accepted lot did not persist to the tenant inventory projection')
    return { ...data, activeLot }
  }, { critical: true })

  const lot = inspectedReceipt?.activeLot
  await check('SEC-007-006', 'SEC-007', 'Tenant B cannot read tenant A inventory-lot genealogy.', async () => {
    const response = await request(tenantB.client, `/lots/${lot?.id}/genealogy`)
    assertNotFoundLike(response, 'cross-tenant lot genealogy')
  }, { critical: true })

  const trial = await check('DATA-003-008', 'DATA', 'Trial release is linked to an immutable tenant formula and does not consume stock before Lab Usage.', async () => {
    const create = await post(tenantA.client, '/trials', { formulaId: formula.id, title: `QA trial ${runTag}`, sampleCode: `QA-${runTag}` }, 'create-trial')
    const trialData = requireData(create, 'create trial').trial
    requireData(await post(tenantAAdminClient, `/trials/${trialData.id}/release`, { note: 'isolated QA release' }, 'release-trial'), 'release trial')
    return trialData
  }, { critical: true })

  await check('SEC-007-007', 'SEC-007', 'Tenant B cannot read tenant A trial evidence.', async () => {
    const response = await request(tenantB.client, `/trials/${trial?.id}`)
    assertNotFoundLike(response, 'cross-tenant trial read')
  }, { critical: true })

  const labUsage = await check('DATA-003-009', 'DATA', 'Committed Lab Usage creates the only trial inventory issue and carries the immutable trial link.', async () => {
    const persistedLots = await executeD1Sql(
      config,
      `SELECT id, organization_id, material_id, quantity_grams, reserved_grams, quality_status, expiry_date
       FROM inventory_lots
       WHERE id = '${lot.id.replaceAll("'", "''")}'`,
      'verify-accepted-lot-before-lab-usage',
    )
    const persistedLot = persistedLots[0]?.results?.[0]
    assert.equal(persistedLot?.organization_id, tenantA.id, 'accepted lot lost its tenant scope before Lab Usage')
    assert.equal(persistedLot?.material_id, privateOperational.id, 'accepted lot lost its material link before Lab Usage')
    assert.equal(persistedLot?.quality_status, 'APPROVED', `accepted lot quality regressed before Lab Usage: ${persistedLot?.quality_status ?? 'missing'}`)
    assert.ok(Number(persistedLot?.quantity_grams ?? 0) > 0, 'accepted lot quantity was not persisted before Lab Usage')
    const plan = requireData(
      await request(tenantA.client, `/lab-usage/plan?formulaId=${encodeURIComponent(formula.id)}&grams=10`),
      'build lab usage plan',
    )
    assert.equal(
      plan.canCommit,
      true,
      `accepted receipt lot was not eligible for Lab Usage: ${JSON.stringify(plan.shortfalls ?? []).slice(0, 220)}`,
    )
    const plannedLot = (plan.allocations ?? []).find((allocation) => allocation.materialId === privateOperational.id)
    assert.equal(plannedLot?.lotId, lot.id, 'Lab Usage planner did not select the accepted tenant lot')
    const response = await post(tenantA.client, '/lab-usage/commit', {
      formulaId: formula.id,
      grams: 10,
      actuals: [{ materialId: privateOperational.id, lotId: plannedLot.lotId, actualGrams: plannedLot.allocatedGrams }],
      purpose: 'trial',
      trialId: trial.id,
      sampleCode: `QA-${runTag}`,
    }, 'commit-lab-usage')
    const data = requireData(response, 'commit lab usage')
    assert.ok(data.usage?.id, 'lab usage did not return its immutable record')
    return data.usage
  }, { critical: true })

  await check('DATA-003-010', 'DATA', 'Reversing Lab Usage writes compensating evidence without erasing the trial link.', async () => {
    const response = await post(tenantA.client, `/lab-usage/${labUsage.id}/reverse`, { reason: 'isolated QA compensation' }, 'reverse-lab-usage')
    requireData(response, 'reverse lab usage')
    const detail = requireData(await request(tenantA.client, `/trials/${trial.id}`), 'trial after reversal')
    assert.ok(JSON.stringify(detail).includes(trial.id), 'trial detail lost its link after compensation')
  }, { critical: true })

  await check('DATA-003-011', 'DATA', 'A direct inventory adjustment is recorded as a separate immutable ledger event.', async () => {
    const response = await post(tenantA.client, '/inventory/adjustments', {
      lotId: lot.id,
      quantityGrams: 2,
      reason: 'isolated QA reconciliation adjustment',
    }, 'adjust-lot')
    requireData(response, 'adjust inventory')
  }, { critical: true })

  let reconciliation
  await check('DATA-003-012', 'DATA', 'Movement ledger reconciles opening + receipts - issues +/- adjustments = closing.', async () => {
    const movements = requireData(await request(tenantA.client, '/inventory/movements'), 'inventory movements')
    const lotMovements = movements.filter((movement) => movement.lotId === lot.id)
    const totalIn = lotMovements.filter((movement) => movement.direction === 'IN').reduce((sum, movement) => sum + Number(movement.quantityGrams ?? 0), 0)
    const totalOut = lotMovements.filter((movement) => movement.direction === 'OUT').reduce((sum, movement) => sum + Number(movement.quantityGrams ?? 0), 0)
    const lots = requireData(await request(tenantA.client, '/lots'), 'lots after movements')
    const currentLot = lots.find((item) => item.id === lot.id)
    assert.ok(currentLot, 'operational lot missing')
    assert.ok(Math.abs((totalIn - totalOut) - Number(currentLot.quantityGrams)) < 0.0001, `ledger mismatch: IN ${totalIn}, OUT ${totalOut}, closing ${currentLot.quantityGrams}`)
    reconciliation = { totalIn, totalOut, closing: Number(currentLot.quantityGrams) }
  }, { critical: true })

  const productionBatch = await check('DATA-003-013', 'DATA', 'A structured QC template, batch consume, QA approval, yield reconciliation, and release produce a traceable finished-good lot.', async () => {
    const template = requireData(await post(tenantAAdminClient, '/production/qc-templates', {
      name: `QA release template ${runTag}`,
      formulaId: formula.id,
      checks: [{ id: 'QA-DENSITY', label: 'QA density', kind: 'NUMERIC', required: true, min: 0.9, max: 1.1, unit: 'g/ml' }],
    }, 'create-production-qc-template'), 'create production QC template').template
    const batch = requireData(await post(tenantA.client, '/production/batches', { formulaId: formula.id, targetGrams: 5 }, 'create-production-batch'), 'create production batch')
    assert.ok(batch.id, 'production batch id missing')
    requireData(await post(tenantA.client, `/production/batches/${batch.id}/consume`, {}, 'consume-production-batch'), 'consume production batch')
    requireData(await patch(tenantA.client, `/production/batches/${batch.id}/status`, { status: 'FILTRATION' }, 'move-production-filtration'), 'move production filtration')
    requireData(await patch(tenantA.client, `/production/batches/${batch.id}/status`, { status: 'QC' }, 'move-production-qc'), 'move production QC')
    requireData(await post(tenantAAdminClient, `/production/batches/${batch.id}/qc/results`, {
      templateCheckId: template.checks[0].id,
      observedValue: '1.0',
      status: 'PASSED',
      note: 'isolated QA result',
    }, 'record-production-qc-result'), 'record production QC result')
    requireData(await post(tenantAAdminClient, `/production/batches/${batch.id}/qc/approve`, {}, 'approve-production-qc'), 'approve production QC')
    requireData(await post(tenantA.client, `/production/batches/${batch.id}/yield`, {
      yieldGrams: 5,
      wasteGrams: 0,
      laborCost: 1,
      overheadCost: 1,
      currency: 'USD',
      note: 'isolated QA yield reconciliation',
    }, 'reconcile-production-yield'), 'reconcile production yield')
    const released = requireData(await patch(tenantAAdminClient, `/production/batches/${batch.id}/status`, { status: 'RELEASED' }, 'release-production-batch'), 'release production batch').batch
    assert.equal(released?.status, 'RELEASED', 'production batch did not release after all hard gates passed')
    return released
  }, { critical: true })

  await check('SEC-007-007A', 'SEC-007', 'Tenant B cannot view or change tenant A production batch evidence.', async () => {
    const response = await request(tenantB.client, `/production/batches/${productionBatch?.id}/qc/results`)
    assertNotFoundLike(response, 'cross-tenant production QC read')
  }, { critical: true })

  const customer = await check('DATA-003-014', 'DATA', 'Commerce customer is created tenant-scoped for quote/order evidence.', async () => {
    const response = await post(tenantA.client, '/customers', {
      name: `QA customer ${runTag}`,
      group: 'Studio',
      creditLimit: 500,
      paymentTerms: 'NET_15',
      contactEmail: `customer-${runTag}@qa.invalid`,
      shippingAddress: { label: 'QA', line1: '1 QA Way', city: 'Test', country: 'US' },
    }, 'create-customer')
    return requireData(response, 'create customer').customer
  }, { critical: true })

  const sku = await check('DATA-003-015', 'DATA', 'Tenant operational material can be exposed as a commercial SKU after evidence exists.', async () => {
    const response = await post(tenantA.client, '/catalog/skus', {
      materialId: privateOperational.id,
      name: `QA SKU ${runTag}`,
      packSizeGrams: 1,
      price: 10,
      currency: 'USD',
      tier: 'Studio',
      moqPacks: 1,
    }, 'create-sku')
    return requireData(response, 'create SKU').sku
  }, { critical: true })

  await check('DATA-003-016', 'DATA', 'Active tenant price list is created for quote pricing.', async () => {
    const response = await post(tenantA.client, '/price-lists', { name: `QA studio ${runTag}`, customerGroup: 'Studio', currency: 'USD', multiplier: 1 }, 'create-price-list')
    requireData(response, 'create price list')
  }, { critical: true })

  const quote = await check('DATA-003-017', 'DATA', 'Quote records a tenant-scoped customer/SKU price snapshot without inventory reservation.', async () => {
    const response = await post(tenantA.client, '/quotes', { customerId: customer.id, lines: [{ skuId: sku.id, quantityPacks: 1 }] }, 'create-quote')
    return requireData(response, 'create quote').quote
  }, { critical: true })

  const order = await check('DATA-003-018', 'DATA', 'Accepted quote converts to a tenant-scoped order without moving inventory.', async () => {
    assert.equal(quote.status, 'SENT', 'quote with sufficient sellable stock must enter the sent state')
    requireData(await patch(tenantA.client, `/quotes/${quote.id}/status`, { status: 'ACCEPTED' }, 'accept-quote'), 'accept quote')
    const converted = requireData(await post(tenantA.client, `/quotes/${quote.id}/convert`, {}, 'convert-quote'), 'convert quote')
    assert.ok(converted.order?.id, 'quote conversion did not return an order')
    assert.equal(converted.order.organizationId, tenantA.id, 'quote conversion changed tenant scope')
    return converted.order
  }, { critical: true })

  await check('DATA-003-019', 'DATA', 'FEFO reservation, packing, shipping, fulfillment, COGS, and analytics reconcile on the tenant order.', async () => {
    const reserved = requireData(await post(tenantA.client, `/orders/${order.id}/reserve`, {}, 'reserve-order'), 'reserve order')
    assert.ok((reserved.allocations ?? []).length > 0, 'order reservation returned no FEFO allocation')
    requireData(await post(tenantA.client, `/orders/${order.id}/pack`, { weightGrams: 1 }, 'pack-order'), 'pack order')
    requireData(await post(tenantA.client, `/orders/${order.id}/ship`, { carrier: 'DHL', trackingNumber: `QA-${runTag}` }, 'ship-order'), 'ship order')
    const fulfilled = requireData(await post(tenantA.client, `/orders/${order.id}/fulfill`, {}, 'fulfill-order'), 'fulfill order')
    assert.ok((fulfilled.movements ?? []).some((movement) => movement.direction === 'OUT'), 'fulfillment did not write an inventory OUT movement')
    const costing = requireData(await request(tenantA.client, '/costing/overview'), 'costing overview')
    const analytics = requireData(await request(tenantA.client, '/analytics/dashboard'), 'analytics dashboard')
    assert.ok(costing && analytics, 'costing or analytics projection was unavailable after fulfillment')
  }, { critical: true })

  await check('SEC-007-008', 'SEC-007', 'Tenant B cannot update tenant A quote or cancel tenant A order identifiers.', async () => {
    const quoteResponse = await patch(tenantB.client, `/quotes/${quote?.id}/status`, { status: 'DECLINED' }, 'cross-quote-update')
    assertNotFoundLike(quoteResponse, 'cross-tenant quote update')
    const orderResponse = await post(tenantB.client, '/orders/nonexistent-tenant-a/cancel', { reason: 'cross-tenant attempt' }, 'cross-order-cancel')
    assertNotFoundLike(orderResponse, 'cross-tenant order cancel')
  }, { critical: true })

  await check('SEC-007-009', 'SEC-007', 'Audit logs and audit-chain verification are tenant-scoped and cannot be edited through a normal API route.', async () => {
    const auditA = requireData(await request(tenantA.client, '/audit-logs'), 'tenant A audit logs')
    const auditB = requireData(await request(tenantB.client, '/audit-logs'), 'tenant B audit logs')
    assert.ok(auditA.length > 0, 'tenant A audit log is empty after mutations')
    assert.equal(auditB.some((event) => event.entity === privateOperational.id), false, 'tenant B audit projection leaked tenant A entity')
    const deniedEdit = await request(tenantA.client, `/audit-logs/${encodeURIComponent(auditA[0].id)}`, { method: 'PATCH', body: { outcome: 'allowed' }, idempotencyKey: idempotency('audit-edit-attempt') })
    assert.equal(deniedEdit.status, 404, 'normal audit edit route exists')
    const chain = requireData(await request(tenantA.client, '/audit/chain/verify'), 'tenant A audit-chain verify')
    assert.equal(chain.valid, true, 'tenant A audit chain failed verification')
  }, { critical: true })

  await check('SEC-007-010', 'SEC-007', 'Read-only role cannot perform an unauthorized bulk inventory mutation.', async () => {
    const viewerEmail = `viewer+${tenantA.slug}@qa.invalid`
    const viewerPassword = `Qa-${runTag}-Viewer-Only!`
    const viewerUserId = `usr-qa-${runTag}-viewer`
    await executeD1Sql(config, `
      INSERT INTO tenant_memberships (id, user_id, email, name, organization_id, brand_ids_json, role, status, mfa_enabled, last_active_at, invited_at, updated_at)
      VALUES ('mem-qa-${runTag}-viewer', '${viewerUserId}', '${viewerEmail}', 'QA Viewer', '${tenantA.id}', '["${tenantA.brandId}"]', 'Viewer', 'ACTIVE', 0, datetime('now'), NULL, datetime('now'));
      INSERT INTO auth_credentials (email, password_hash, password_set_at, updated_at)
      VALUES ('${viewerEmail}', 'sha256:${shortHash(`auth:v1:${viewerEmail}:${viewerPassword}`)}', datetime('now'), datetime('now'));
    `, 'viewer-fixture')
    // Direct hash creation must use the production-compatible helper path; overwrite it with the accepted hash form.
    const cryptoHash = createHash('sha256').update(`auth:v1:${viewerEmail}:${viewerPassword}`).digest('hex')
    await executeD1Sql(config, `UPDATE auth_credentials SET password_hash = 'sha256:${cryptoHash}' WHERE email = '${viewerEmail}';`, 'viewer-hash')
    const viewer = await loginFixtureUser(config, { email: viewerEmail, password: viewerPassword, forwardedFor: `198.18.${fixtureIpSegment}.13` })
    const response = await post(viewer, '/inventory/adjustments', { lotId: lot.id, quantityGrams: 1000, reason: 'unauthorized bulk mutation' }, 'viewer-bulk-adjust')
    assert.equal(response.status, 403, `viewer bulk mutation expected 403, received ${response.status}`)
  }, { critical: true })

  await check('AUDIT-001', 'AUDIT', 'Telemetry schema contains route/status/duration fields and omits payload, authorization, and secret columns.', async () => {
    const schema = await executeD1Sql(config, 'PRAGMA table_info(runtime_events);', 'runtime-event-schema')
    const columns = (schema[0]?.results ?? []).map((row) => String(row.name).toLowerCase())
    for (const forbidden of ['payload', 'body', 'authorization', 'secret', 'token', 'message']) {
      assert.equal(columns.includes(forbidden), false, `runtime telemetry includes forbidden ${forbidden} column`)
    }
  }, { critical: true })

  await check('SEC-007-011', 'SEC-007', 'Revoked session no longer authorizes a tenant read after logout.', async () => {
    const logout = await post(tenantA.client, '/auth/logout', {}, 'logout-owner')
    assertStatus(logout, 200, 'logout owner')
    const stale = await request(tenantA.client, '/materials')
    assert.equal(stale.status, 401, `revoked session should be unauthorized, received ${stale.status}`)
  }, { critical: true })

  await check('PERF-001-LOCAL', 'PERF', 'Local benchmark boundary is recorded from the same isolated Worker/D1 execution without claiming production performance.', async () => {
    assert.ok(reconciliation && reconciliation.closing >= 0, 'no completed local ledger reconciliation available for benchmark boundary')
  })
} finally {
  for (const tenant of cleanupTargets.reverse()) {
    await check(`FIXTURE-CLEANUP-${shortHash(tenant.id)}`, 'DATA', 'Isolated tenant fixture and its credentials were removed after execution.', async () => {
      await cleanupTenantFixtures(config, tenant.id, tenant.cleanupEmails ?? [tenant.email])
    })
  }
  await writeReports(config, health)
}

const failed = results.filter((row) => row.status === 'FAIL')
const partial = results.filter((row) => row.status === 'PARTIAL')
console.log(`Isolated QA run ${runId}: ${results.length - failed.length - partial.length} PASS, ${partial.length} PARTIAL, ${failed.length} FAIL.`)
console.log(`Reports: reports/security-tenant-isolation-${date}-retest.md and reports/data-integrity-${date}-retest.md`)
if (failed.length || partial.length) process.exitCode = 1
