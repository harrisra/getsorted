import { useState } from 'react'
import type { ReactNode } from 'react'
import { TrashIcon } from './icons'

export function ConfirmDeleteButton({
  onConfirm,
  label = 'Remove',
  confirmMessage = 'Delete?',
  className,
  children,
  disabled = false,
}: {
  onConfirm: () => Promise<void>
  label?: string
  /** Shown while confirming, e.g. "Delete 3 recipes?" for a bulk action. */
  confirmMessage?: string
  /** Idle-state button content/styling — defaults to a small trash icon
   * link; pass a full label (with a matching `className`) for a toolbar-
   * style button instead. */
  className?: string
  children?: ReactNode
  disabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleConfirm() {
    setDeleting(true)
    try {
      await onConfirm()
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs">
        <span className="text-slate-500">{confirmMessage}</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={deleting || disabled}
          className="font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          {deleting ? '…' : 'Yes'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          No
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={disabled}
      title={children ? undefined : label}
      aria-label={label}
      className={`${className ?? 'shrink-0 text-red-500 hover:text-red-700'} disabled:opacity-50`}
    >
      {children ?? <TrashIcon className="h-4 w-4" />}
    </button>
  )
}
