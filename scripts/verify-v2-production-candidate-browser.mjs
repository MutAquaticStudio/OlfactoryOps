import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { candidateBrowserConfig } from './verify-v2-production-candidate-acceptance.mjs'

export const candidateBrowserPaths = ['/', '/login', '/signup', '/v2/login', '/v2/signup']

export function candidateBrowserApiProbeUrl(apiOrigin) {
  return new URL('/api/v1/v2/platform/me', apiOrigin).toString()
}

export function candidateBrowserProbeIsExpected(result, expectedUrl) {
  return result.url === expectedUrl && result.status === 401
}

export function safeBrowserFailure(error) {
  const message = error instanceof Error ? error.message : ''
  if (/^PRODUCTION_CANDIDATE_BROWSER=FAIL [a-z0-9_]+$/.test(message)) return new Error(message)
  return new Error('PRODUCTION_CANDIDATE_BROWSER=FAIL BROWSER')
}

export async function verifyProductionCandidateBrowser(environment = process.env) {
  // Validate every target before importing a browser engine or opening a network connection.
  const config = candidateBrowserConfig(environment)
  let browser
  try {
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()
    const failures = []

    page.on('pageerror', () => failures.push('PAGE_ERROR'))
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push('CONSOLE_ERROR')
    })

    for (const pathname of candidateBrowserPaths) {
      const response = await page.goto(new URL(pathname, config.tenant).toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 })
      assert(response?.status() === 200, 'candidate_browser_route_unavailable')
      if (pathname === '/') {
        await page.getByText('OlfactoryOps').first().waitFor({ state: 'visible', timeout: 15_000 })
      } else {
        await page.getByTestId('v2-auth-card').waitFor({ state: 'visible', timeout: 15_000 })
        const heading = await page.locator('[data-testid="v2-auth-card"] h1').textContent()
        assert(pathname.includes('signup') ? /create|sign up/i.test(heading ?? '') : /sign in/i.test(heading ?? ''), 'candidate_browser_auth_view_invalid')
      }
    }

    const configuredCandidateApi = await page.evaluate(async (expectedApiOrigin) => {
      const sources = Array.from(document.scripts)
        .map((script) => script.src)
        .filter(Boolean)
      const bundles = await Promise.all(sources.map(async (source) => (await fetch(source)).text()))
      return bundles.some((bundle) => bundle.includes(`${expectedApiOrigin}/api/v1`))
    }, config.api.origin)
    assert(configuredCandidateApi, 'candidate_browser_api_origin_not_configured')

    const apiProbe = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
      return { status: response.status, url: response.url }
    }, candidateBrowserApiProbeUrl(config.api.origin))
    assert(candidateBrowserProbeIsExpected(apiProbe, candidateBrowserApiProbeUrl(config.api.origin)), 'candidate_browser_api_session_boundary_invalid')
    assert(failures.length === 0, 'candidate_browser_runtime_errors')
    console.log(JSON.stringify({ productionCandidateBrowser: 'PASS', routes: candidateBrowserPaths.length, api: 'api-next' }))
  } catch (error) {
    throw safeBrowserFailure(error)
  } finally {
    await browser?.close()
  }
}

function assert(condition, code) {
  if (!condition) throw new Error(`PRODUCTION_CANDIDATE_BROWSER=FAIL ${code}`)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  await verifyProductionCandidateBrowser()
}
