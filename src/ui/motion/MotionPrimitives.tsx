import { motion, type HTMLMotionProps } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMotionDisabled } from './useMotionDisabled'
import './motion.css'

type RevealProps = HTMLMotionProps<'div'> & { children: ReactNode; delay?: number }

function revealTransition(delay: number) {
  return { duration: 0.2, delay, ease: [0.22, 1, 0.36, 1] as const }
}

export function AnimatedContent({ children, delay = 0, ...props }: RevealProps) {
  const disabled = useMotionDisabled()
  return <motion.div {...props} initial={disabled ? false : { opacity: 0, y: 8 }} animate={disabled ? undefined : { opacity: 1, y: 0 }} transition={revealTransition(delay)}>{children}</motion.div>
}

export function ScrollReveal({ children, delay = 0, ...props }: RevealProps) {
  const disabled = useMotionDisabled()
  return <motion.div {...props} initial={disabled ? false : { opacity: 0, y: 10 }} whileInView={disabled ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.16 }} transition={revealTransition(delay)}>{children}</motion.div>
}

export function AnimatedList({ children, ...props }: HTMLMotionProps<'div'> & { children: ReactNode }) {
  const disabled = useMotionDisabled()
  return <motion.div {...props} initial={disabled ? false : 'hidden'} animate={disabled ? undefined : 'visible'} variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.035 } } }}>
    {children}
  </motion.div>
}

export function AnimatedListItem({ children, ...props }: HTMLMotionProps<'div'> & { children: ReactNode }) {
  const disabled = useMotionDisabled()
  return <motion.div {...props} variants={disabled ? undefined : { hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } } }}>{children}</motion.div>
}

export function MotionCardButton({ children, ...props }: HTMLMotionProps<'button'> & { children: ReactNode }) {
  const disabled = useMotionDisabled()
  return (
    <motion.button
      {...props}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.button>
  )
}

export type StepperStep = { id: string; label: string; status: 'complete' | 'active' | 'upcoming' | 'blocked' }

export function Stepper({ steps, label = 'Workflow progress' }: { steps: StepperStep[]; label?: string }) {
  return <ol className="motion-stepper" aria-label={label}>{steps.map((step) => <li key={step.id} className={`is-${step.status}`}><span aria-hidden="true" /><span>{step.label}</span></li>)}</ol>
}

export function CountUp({ value, formatter = (next: number) => String(next), duration = 200 }: { value: number; formatter?: (value: number) => string; duration?: number }) {
  const disabled = useMotionDisabled()
  const previous = useRef<number | null>(null)
  const [display, setDisplay] = useState(() => disabled ? value : 0)

  useEffect(() => {
    if (disabled) {
      previous.current = value
      setDisplay(value)
      return
    }
    const from = previous.current ?? 0
    if (previous.current === value) return
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min((now - started) / duration, 1)
      setDisplay(from + (value - from) * progress)
      if (progress < 1) frame = requestAnimationFrame(tick)
      else previous.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [disabled, duration, value])

  return <span className="motion-count-up">{formatter(display)}</span>
}
