import { expect, test } from '@playwright/test'

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
  expect(dimensions.scroll, `V2 page overflowed by ${dimensions.scroll - dimensions.client}px`).toBeLessThanOrEqual(dimensions.client + 1)
}

test('V2 login is isolated, keyboard reachable, and responsive', async ({ page }) => {
  await page.goto('/v2/login')
  await expect(page.getByTestId('v2-auth-card')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Email').focus()
  await expect(page.getByLabel('Email')).toBeFocused()
  await expectNoHorizontalOverflow(page)
})

test('canonical public auth routes render only V2 authority', async ({ page }) => {
  for (const path of ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/v2/login', '/v2/signup', '/v2/forgot-password', '/v2/reset-password', '/v2/verify-email']) {
    const legacyAuthRequests: string[] = []
    const captureLegacyAuthRequest = (request: import('@playwright/test').Request) => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/auth/')) legacyAuthRequests.push(request.url())
    }
    page.on('request', captureLegacyAuthRequest)
    await page.goto(path)
    await expect(page.locator('[data-testid^="v2-"]')).toBeVisible()
    await expect(page.locator('.auth-shell')).toHaveCount(0)
    expect(legacyAuthRequests).toEqual([])
    page.off('request', captureLegacyAuthRequest)
  }
})

test('V2 protected workspace fails closed without a session', async ({ page }) => {
  await page.goto('/v2/workspace')
  await expect(page).toHaveURL(/\/v2\/login$/)
  await expect(page.getByTestId('v2-auth-card')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
