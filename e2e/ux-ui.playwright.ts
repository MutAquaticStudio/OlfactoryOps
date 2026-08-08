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

test('public sign-in always starts at the central identity route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'Desktop navigation exposes the dedicated sign-in action.')
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in to your lab workspace' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectNoSeriousAccessibilityViolations(page)
})

test('signup creates a workspace before a custom domain is connected', async ({ page }) => {
  await page.goto('/signup')
  await expect(page.getByRole('heading', { name: 'Create your lab workspace' })).toBeVisible()
  await expect(page.getByLabel('Signup organization')).toHaveValue('')
  await expect(page.getByLabel('Signup owner name')).toHaveValue('')
  await expect(page.getByLabel('Signup workspace domain')).toHaveCount(0)
  await expect(page.getByText('Cloudflare will provide the DNS validation record before it goes live.')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectNoSeriousAccessibilityViolations(page)
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
