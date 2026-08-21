export function motionDisabledForPreferences(systemPrefersReducedMotion: boolean | null, userPrefersReducedMotion = false) {
  return Boolean(systemPrefersReducedMotion || userPrefersReducedMotion)
}
