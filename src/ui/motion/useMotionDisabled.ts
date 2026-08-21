import { useContext } from 'react'
import { MotionDisabledContext } from './motionContext'

export function useMotionDisabled() {
  return useContext(MotionDisabledContext)
}
