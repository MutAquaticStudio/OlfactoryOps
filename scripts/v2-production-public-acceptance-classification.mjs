const safePhases = new Set([
  'PRECONDITION',
  'API_HEALTH',
  'PAGES_IDENTITY',
  'PAGES_ROUTES',
  'TENANT_ROUTER',
  'SIGNUP',
  'FIXTURE_VERIFICATION',
  'LOGIN',
  'SESSION',
  'MATERIALS',
  'TENANT_ISOLATION',
  'CROSS_TENANT_READ',
  'CROSS_TENANT_WRITE',
  'INVENTORY',
  'PLATFORM_ADMIN',
])

export function publicAcceptanceFailurePhase(value) {
  return safePhases.has(value) ? value : 'UNCLASSIFIED'
}
