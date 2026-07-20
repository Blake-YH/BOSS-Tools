import { AlertTriangle, Trash2, X } from 'lucide-react'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm
}: ConfirmDialogProps): React.JSX.Element | null => {
  if (!open) return null
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        aria-describedby="confirm-action-description"
        aria-labelledby="confirm-action-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <h2 id="confirm-action-title">{title}</h2>
            <p id="confirm-action-description">{description}</p>
          </div>
          <button className="icon-button" type="button" title="关闭" onClick={onCancel}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="dialog-actions">
          <button className="button ghost" type="button" onClick={onCancel}>取消</button>
          <button className="button danger" type="button" onClick={onConfirm}>
            <Trash2 size={16} aria-hidden="true" /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
