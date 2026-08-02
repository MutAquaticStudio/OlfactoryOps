import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type WorkspaceDialogProps = {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
  showHeader?: boolean
  showGrip?: boolean
  confirmDiscard?: boolean
  discardConfirmationMessage?: string
}

/**
 * The single dialog primitive for operational confirmations and forms.
 * It deliberately stays dependency-free so every current workflow keeps its handlers.
 */
export function WorkspaceDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className = '',
  showHeader = true,
  showGrip = true,
  confirmDiscard = false,
  discardConfirmationMessage = 'Discard your unsaved changes?',
}: WorkspaceDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const confirmDiscardRef = useRef(confirmDiscard)
  const discardConfirmationMessageRef = useRef(discardConfirmationMessage)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
    confirmDiscardRef.current = confirmDiscard
    discardConfirmationMessageRef.current = discardConfirmationMessage
  }, [confirmDiscard, discardConfirmationMessage, onClose])

  const requestClose = () => {
    if (confirmDiscardRef.current && !window.confirm(discardConfirmationMessageRef.current)) return
    onCloseRef.current()
  }

  useEffect(() => {
    if (!open) {
      return
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusInitialControl = () => {
      const dialog = dialogRef.current
      if (!dialog) return
      const preferred = dialog.querySelector<HTMLElement>('[data-autofocus]')
      const firstFocusable = dialog.querySelector<HTMLElement>(focusableSelector)
      ;(preferred ?? firstFocusable ?? dialog).focus()
    }

    const frame = window.requestAnimationFrame(focusInitialControl)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      if (controls.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = controls[0]!
      const last = controls[controls.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus()
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <div
      className="workspace-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) requestClose()
      }}
    >
      <section
        ref={dialogRef}
        className={`workspace-dialog ${className}`.trim()}
        data-testid="workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={showHeader ? titleId : undefined}
        aria-label={showHeader ? undefined : title}
        aria-describedby={showHeader && description ? descriptionId : undefined}
        tabIndex={-1}
      >
        {showGrip ? <div className="workspace-dialog-grip" aria-hidden="true" /> : null}
        {showHeader ? (
          <header className="workspace-dialog-header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description ? <p id={descriptionId}>{description}</p> : null}
            </div>
            <button className="icon-button" data-testid="workspace-dialog-close" type="button" onClick={requestClose} aria-label={`Close ${title}`} title="Close">
              <X size={18} strokeWidth={1.8} />
            </button>
          </header>
        ) : null}
        <div className="workspace-dialog-body">{children}</div>
        {footer ? <footer className="workspace-dialog-footer">{footer}</footer> : null}
      </section>
    </div>
  )
}
