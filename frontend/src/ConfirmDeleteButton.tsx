import { useState } from 'react'
import { TrashIcon } from './icons'

export function ConfirmDeleteButton({
  onConfirm,
  label = 'Remove',
}: {
  onConfirm: () => Promise<void>
  label?: string
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
        <span className="text-slate-500">Delete?</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={deleting}
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
      title={label}
      aria-label={label}
      className="shrink-0 text-red-500 hover:text-red-700"
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  )
}
