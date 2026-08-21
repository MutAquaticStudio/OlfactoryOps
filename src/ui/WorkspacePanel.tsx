import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type WorkspacePanelProps = {
  id?: string
  title: string
  icon: LucideIcon
  right?: ReactNode
  children: ReactNode
  className?: string
}

/** A stable, task-oriented surface shared by workspace modules. */
export function WorkspacePanel({
  id,
  title,
  icon: Icon,
  right,
  children,
  className = '',
}: WorkspacePanelProps) {
  return (
    <section id={id} className={`panel workspace-panel ${className}`.trim()}>
      <div className="panel-header">
        <div className="panel-title-row">
          <span className="icon-chip" aria-hidden="true">
            <Icon size={17} strokeWidth={1.8} />
          </span>
          <h2>{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}
