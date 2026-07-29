import { useReducedMotion } from 'framer-motion'
import { type PropsWithChildren } from 'react'
import { MotionDisabledContext } from './motionContext'
import { motionDisabledForPreferences } from './motionPolicy'

export function MotionProvider({ children, reduceMotion = false }: PropsWithChildren<{ reduceMotion?: boolean }>) {
  const systemReducedMotion = useReducedMotion()
  return <MotionDisabledContext.Provider value={motionDisabledForPreferences(systemReducedMotion, reduceMotion)}>{children}</MotionDisabledContext.Provider>
}
