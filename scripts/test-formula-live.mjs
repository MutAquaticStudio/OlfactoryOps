import { createHmac } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.FORMULA_TEST_URL ?? 'http://127.0.0.1:5173/'
const email = process.env.FORMULA_TEST_EMAIL
const password = process.env.FORMULA_TEST_PASSWORD
const formulaName = process.env.FORMULA_TEST_NAME ?? 'Formula Persistence QA'
const evidenceDir = path.resolve(
  process.env.FORMULA_EVIDENCE_DIR ?? 'reports/evidence/formula-module-live',
)

if (!email || !password) {
  throw new Error('FORMULA_TEST_EMAIL and FORMULA_TEST_PASSWORD are required')
}

function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let accumulator = 0
  const bytes = []
  for (const character of secret.toUpperCase().replace(/=+$/g, '')) {
    const index = alphabet.indexOf(character)
    if (index < 0) {
      throw new Error('Authenticator setup returned an invalid Base32 key')
    }
    accumulator = (accumulator << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function currentTotp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0)
  counterBuffer.writeUInt32BE(counter >>> 0, 4)
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(binary % 1_000_000).padStart(6, '0')
}

await mkdir(evidenceDir, { recursive: true })
const startedAt = Date.now()
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'dark',
})
const page = await context.newPage()
const consoleErrors = []
const consoleWarnings = []
const failedRequests = []

page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text())
  } else if (message.type() === 'warning') {
    consoleWarnings.push(message.text())
  }
})
page.on('requestfailed', (request) => {
  failedRequests.push({
    method: request.method(),
    url: request.url(),
    error: request.failure()?.errorText ?? 'unknown',
  })
})

const report = {
  status: 'failed',
  baseUrl,
  formulaName,
  startedAt: new Date(startedAt).toISOString(),
  page: {},
  checks: {},
  consoleErrors,
  consoleWarnings,
  failedRequests,
  screenshots: {},
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  report.page = {
    url: page.url(),
    title: await page.title(),
  }
  report.checks.notBlank = (await page.locator('body').innerText()).trim().length > 100
  report.checks.noFrameworkOverlay =
    (await page.locator('vite-error-overlay, [data-nextjs-dialog-overlay]').count()) === 0

  await page.getByLabel('Login email').fill(email)
  await page.getByLabel('Login password').fill(password)
  await page.locator('.auth-form').getByRole('button', { name: 'Login', exact: true }).click()
  await page.getByRole('button', { name: 'Formulas', exact: true }).waitFor({ state: 'visible' })

  await page.getByRole('button', { name: 'Formulas', exact: true }).click()
  const formulaCard = page.getByRole('button', { name: new RegExp(formulaName) })
  await formulaCard.waitFor({ state: 'visible' })
  await formulaCard.click()
  await page.locator('.formula-lab-topbar h2').filter({ hasText: formulaName }).waitFor({ state: 'visible' })

  report.checks.ifraFinalProductVisible = await page.getByText('All limits pass', { exact: true }).isVisible()
  report.checks.evaporationVisible = await page.getByText('Evaporation simulation', { exact: true }).isVisible()
  const submitReviewButton = page.getByRole('button', { name: 'Submit review', exact: true }).first()
  if (await submitReviewButton.isVisible().catch(() => false)) {
    await submitReviewButton.click()
    const reviewDialog = page.getByRole('dialog', { name: 'Formula workflow' })
    await reviewDialog.waitFor({ state: 'visible' })
    const reviewerInput = reviewDialog.getByLabel('Reviewer')
    if (!(await reviewerInput.inputValue()).trim()) {
      await reviewerInput.fill(email)
    }
    await reviewDialog.getByLabel('Comment').fill('Remote Formula review snapshot before MFA approval')
    await reviewDialog.getByRole('button', { name: 'Submit review', exact: true }).click()
    await reviewDialog.waitFor({ state: 'hidden' })
  }
  await page.getByRole('button', { name: 'Approve', exact: true }).waitFor({ state: 'visible' })
  report.checks.reviewSubmitted = true

  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Formula workflow' })
  await dialog.waitFor({ state: 'visible' })
  const dialogBox = await dialog.boundingBox()
  const viewport = page.viewportSize()
  if (!dialogBox || !viewport) {
    throw new Error('Formula approval dialog geometry was unavailable')
  }
  const centerDelta = {
    x: Math.round(dialogBox.x + dialogBox.width / 2 - viewport.width / 2),
    y: Math.round(dialogBox.y + dialogBox.height / 2 - viewport.height / 2),
  }
  report.checks.dialogCentered = Math.abs(centerDelta.x) <= 2 && Math.abs(centerDelta.y) <= 2
  report.checks.dialogCenterDelta = centerDelta
  report.screenshots.mfaRequired = path.join(evidenceDir, 'mfa-required.png')
  await page.screenshot({ path: report.screenshots.mfaRequired, fullPage: false })

  await dialog.getByLabel('Current account password').fill(password)
  await dialog.getByRole('button', { name: 'Set up authenticator' }).click()
  const manualKey = dialog.locator('.formula-mfa-setup-row code')
  await manualKey.waitFor({ state: 'visible' })
  const secret = (await manualKey.innerText()).replace(/\s+/g, '')
  const recoveryCode = (await dialog.locator('.formula-mfa-code-grid code').first().innerText()).trim()
  report.checks.recoveryCodeCount = await dialog.locator('.formula-mfa-code-grid code').count()
  report.checks.secretNotInReport = true

  await dialog.getByLabel('6-digit authenticator code').fill(currentTotp(secret))
  await dialog.getByRole('button', { name: 'Verify MFA' }).click()
  const enrollmentSignature = dialog.getByLabel('Electronic signature')
  await enrollmentSignature.waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Electronic signature"]')
    return input instanceof HTMLInputElement && !input.disabled
  })
  report.checks.totpEnrollmentVerified = await enrollmentSignature.isEnabled()

  await dialog.getByRole('button', { name: 'Close' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Logout', exact: true }).click()
  await page.getByLabel('Login email').waitFor({ state: 'visible' })
  await page.getByLabel('Login email').fill(email)
  await page.getByLabel('Login password').fill(password)
  await page.locator('.auth-form').getByRole('button', { name: 'Login', exact: true }).click()
  await page.getByRole('button', { name: 'Formulas', exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Formulas', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(formulaName) }).click()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()

  const recoveryDialog = page.getByRole('dialog', { name: 'Formula workflow' })
  await recoveryDialog.waitFor({ state: 'visible' })
  await recoveryDialog.getByLabel('Authenticator or recovery code').fill(recoveryCode)
  await recoveryDialog.getByRole('button', { name: 'Verify MFA' }).click()
  await recoveryDialog
    .getByText('Recovery code accepted. 7 recovery codes remain.', { exact: true })
    .waitFor({ state: 'visible' })
  report.checks.recoveryCodeAccepted = true
  report.checks.remainingRecoveryCodes = 7

  await recoveryDialog.getByRole('button', { name: 'Close' }).click()
  await recoveryDialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Logout', exact: true }).click()
  await page.getByLabel('Login email').waitFor({ state: 'visible' })
  await page.getByLabel('Login email').fill(email)
  await page.getByLabel('Login password').fill(password)
  await page.locator('.auth-form').getByRole('button', { name: 'Login', exact: true }).click()
  await page.getByRole('button', { name: 'Formulas', exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Formulas', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(formulaName) }).click()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()

  const replayDialog = page.getByRole('dialog', { name: 'Formula workflow' })
  const replayCodeInput = replayDialog.getByLabel('Authenticator or recovery code')
  const consoleErrorCountBeforeReplay = consoleErrors.length
  await replayCodeInput.fill(recoveryCode)
  await replayDialog.getByRole('button', { name: 'Verify MFA' }).click()
  await replayDialog.getByText('MFA code is invalid or expired', { exact: true }).waitFor({ state: 'visible' })
  report.checks.recoveryCodeReplayBlocked = true

  await replayCodeInput.fill(currentTotp(secret))
  await replayDialog.getByRole('button', { name: 'Verify MFA' }).click()
  const signature = replayDialog.getByLabel('Electronic signature')
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Electronic signature"]')
    return input instanceof HTMLInputElement && !input.disabled
  })
  report.checks.mfaVerified = await signature.isEnabled()
  await signature.fill('Formula Local Owner')
  await replayDialog.getByLabel('Comment').fill('Live Formula approval after recovery-code replay rejection')
  await replayDialog.getByRole('button', { name: 'Approve & lock' }).click()
  await replayDialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Fork working copy' }).waitFor({ state: 'visible' })
  report.checks.approved = true

  report.screenshots.approved = path.join(evidenceDir, 'approved.png')
  await page.screenshot({ path: report.screenshots.approved, fullPage: false })

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Formulas', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(formulaName) }).click()
  await page.getByRole('button', { name: 'Fork working copy' }).waitFor({ state: 'visible' })
  report.checks.approvalPersistedAfterReload = true

  await page.setViewportSize({ width: 390, height: 844 })
  report.screenshots.mobileApproved = path.join(evidenceDir, 'approved-mobile.png')
  await page.screenshot({ path: report.screenshots.mobileApproved, fullPage: false })
  report.checks.mobileHasNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )

  let expectedReplayConsoleErrorConsumed = false
  const expectedConsoleErrors = []
  const unexpectedConsoleErrors = consoleErrors.filter((message, index) => {
    if (index >= consoleErrorCountBeforeReplay && !expectedReplayConsoleErrorConsumed && /status of 403/i.test(message)) {
      expectedReplayConsoleErrorConsumed = true
      expectedConsoleErrors.push(message)
      return false
    }
    return true
  })
  report.expectedConsoleErrors = expectedConsoleErrors
  report.unexpectedConsoleErrors = unexpectedConsoleErrors
  report.checks.consoleHealthy = unexpectedConsoleErrors.length === 0
  report.checks.requestsHealthy = failedRequests.length === 0
  const requiredChecks = [
    report.checks.notBlank,
    report.checks.noFrameworkOverlay,
    report.checks.ifraFinalProductVisible,
    report.checks.evaporationVisible,
    report.checks.reviewSubmitted,
    report.checks.dialogCentered,
    report.checks.recoveryCodeCount === 8,
    report.checks.totpEnrollmentVerified,
    report.checks.recoveryCodeAccepted,
    report.checks.recoveryCodeReplayBlocked,
    report.checks.remainingRecoveryCodes === 7,
    report.checks.mfaVerified,
    report.checks.approved,
    report.checks.approvalPersistedAfterReload,
    report.checks.mobileHasNoHorizontalOverflow,
    report.checks.consoleHealthy,
    report.checks.requestsHealthy,
  ]
  report.status = requiredChecks.every(Boolean) ? 'passed' : 'failed'
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error)
  await page.evaluate(() => {
    document.querySelectorAll('.formula-mfa-setup').forEach((element) => element.remove())
  }).catch(() => undefined)
  report.screenshots.failure = path.join(evidenceDir, 'failure-latest.png')
  await page.screenshot({ path: report.screenshots.failure, fullPage: false }).catch(() => undefined)
} finally {
  report.completedAt = new Date().toISOString()
  report.durationMs = Date.now() - startedAt
  await writeFile(path.join(evidenceDir, 'result.json'), JSON.stringify(report, null, 2))
  await browser.close()
}

if (report.status !== 'passed') {
  throw new Error(`Formula live test failed: ${report.error ?? 'one or more checks failed'}`)
}

console.log(
  JSON.stringify({
    status: report.status,
    checks: report.checks,
    expectedSecurityConsoleErrors: report.expectedConsoleErrors?.length ?? 0,
    unexpectedConsoleErrors: report.unexpectedConsoleErrors?.length ?? report.consoleErrors.length,
    failedRequests: report.failedRequests.length,
  }),
)

