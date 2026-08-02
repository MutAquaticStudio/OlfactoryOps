import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(overflow.scrollWidth, `document width ${overflow.scrollWidth}px exceeds viewport ${overflow.clientWidth}px`).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  const blocking = result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
  expect(blocking, blocking.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([])
}

async function signIn(page: Page) {
  if (process.env.UX_TEST_STORAGE_STATE) {
    await page.goto('/workspace')
    await expect(page).toHaveURL(/\/workspace(?:\/|$)/)
    return
  }
  const email = process.env.UX_TEST_EMAIL
  const password = process.env.UX_TEST_PASSWORD
  test.skip(!email || !password, 'Authenticated UX checks require UX_TEST_EMAIL and UX_TEST_PASSWORD.')
  await page.goto('/login')
  await page.getByLabel('Login email').fill(email!)
  await page.getByLabel('Login password').fill(password!)
  await page.locator('.auth-form .primary-button.full').click()
  await expect(page).toHaveURL(/\/workspace(?:\/|$)/, { timeout: 30_000 })
}

test('public landing is responsive, accessible, and language-aware', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('The operating system for fragrance teams')
  await expectNoHorizontalOverflow(page)
  await expectNoSeriousAccessibilityViolations(page)
  await expect(page).toHaveScreenshot(`public-landing-${testInfo.project.name}.png`, { fullPage: true })

  await page.getByRole('button', { name: 'VI', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi-VN')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('He dieu hanh cho doi ngu nuoc hoa')
})

test('Design Studio restores its route and keeps key actions usable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'Authenticated role flow runs once and checks both desktop and mobile viewports in the same session.')
  await signIn(page)
  for (const viewport of [{ name: 'desktop-1280', width: 1280, height: 900 }, { name: 'mobile-390', width: 390, height: 844 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/ai/formula-design-studio')
    await expect(page).toHaveURL(/\/ai\/formula-design-studio$/)
    await expect(page.getByRole('heading', { name: 'Formula Design Studio' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const primaryAction = page.getByTestId('formula-design-primary-action')
    if (await primaryAction.isVisible()) {
      const box = await primaryAction.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }

    const reviewButton = page.getByRole('button', { name: 'Review brief' }).first()
    if (!(await reviewButton.isVisible())) {
      await page.getByLabel('Project name').fill('Marine woods visual QA')
      await page.getByLabel('Creative request').fill('A bright bergamot opening, mineral floral heart, long amber trail, and no powdery character.')
      await primaryAction.click()
    } else {
      await reviewButton.click()
    }
    const generateButtons = page.getByRole('button', { name: 'Generate directions' })
    expect(await generateButtons.count()).toBeGreaterThan(0)
    const dialog = page.getByTestId('workspace-dialog')
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(250)
    await expect(dialog.getByLabel('Product type')).toHaveCSS('min-height', '44px')
    await expectNoHorizontalOverflow(page)
    await expectNoSeriousAccessibilityViolations(page)
    await expect(page).toHaveScreenshot(`design-studio-brief-dialog-${viewport.name}.png`)
    if (viewport.name === 'desktop-1280') {
      const productType = dialog.getByLabel('Product type')
      const currentProductType = await productType.inputValue()
      const alternateProductType = await productType.locator('option').evaluateAll(
        (options, current) => options.map((option) => (option as HTMLOptionElement).value).find((value) => value && value !== current),
        currentProductType,
      )
      expect(alternateProductType).toBeTruthy()
      await productType.selectOption(alternateProductType!)
      let dismissMessage = ''
      page.once('dialog', async (prompt) => {
        dismissMessage = prompt.message()
        await prompt.dismiss()
      })
      await page.keyboard.press('Escape')
      expect(dismissMessage).toContain('Discard the changes')
      await expect(dialog).toBeVisible()
      page.once('dialog', async (prompt) => prompt.accept())
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    } else {
      await page.getByTestId('workspace-dialog-close').click()
    }
  }
})

test('Reformulation Optimizer resolves a baseline and renders governed candidates', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'Authenticated optimizer flow runs once, then checks the restored mobile layout.')
  await signIn(page)
  await page.goto('/ai/reformulation-optimizer')
  await expect(page).toHaveURL(/\/ai\/reformulation-optimizer$/)
  await expect(page.getByRole('heading', { name: 'Reformulation Optimizer' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByLabel('Formula').selectOption('frm-0421')
  const version = page.getByLabel('Immutable version')
  await expect(version).toHaveValue('v12')
  await expect(page.getByText('No materials are available.')).toHaveCount(0)

  const analyze = page.getByTestId('formula-optimizer-primary-action')
  await expect(analyze).toBeEnabled()
  await analyze.click()
  await expect(page.getByRole('heading', { name: 'Ranked candidates' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.optimizer-comparison')).toBeVisible()
  await expectNoSeriousAccessibilityViolations(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await expect(page.getByTestId('formula-optimizer-controls')).toBeVisible()
  await expect(page.getByTestId('formula-optimizer-results')).toBeVisible()
})

test('Orders exposes responsive detail history and domestic shipping choices', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'Authenticated role flow runs once and checks desktop and mobile in the same session.')
  await signIn(page)

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/workspace/orders')
    await expect(page.getByRole('heading', { name: 'Orders & Fulfillment' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const domesticCarrier = page.getByLabel('Carrier').locator('option[value="GHN"]')
    await expect(domesticCarrier).toHaveText('GHN')

    await page.getByRole('button', { name: 'View details' }).first().click()
    const dialog = page.getByTestId('workspace-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveClass(/is-drawer/)
    await expect(dialog.getByTestId('order-detail-view')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await expectNoSeriousAccessibilityViolations(page)
    await page.getByTestId('workspace-dialog-close').click()
    await expect(dialog).toBeHidden()
  }
})
