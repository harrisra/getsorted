import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  type EssentialsInput,
  type GroceryItem,
  fetchGroceryItems,
} from '../api/client'
import { ItemGroceryMatchesEditor } from '../ItemGroceryMatchesEditor'

type EssentialsFormValues = Omit<EssentialsInput, 'household'>

const EMPTY: EssentialsFormValues = {
  name: '',
  items: [],
}

export function EssentialsForm({
  householdId,
  initialValue,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  householdId: string
  initialValue?: EssentialsFormValues
  submitLabel: string
  onSubmit: (essentials: EssentialsInput) => Promise<void>
  onCancel?: () => void
}) {
  const [values, setValues] = useState<EssentialsFormValues>(initialValue ?? EMPTY)
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchGroceryItems().then(setGroceryItems)
  }, [])

  function set<K extends keyof EssentialsFormValues>(key: K, value: EssentialsFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors([])

    const namedItems = values.items.filter((item) => item.name.trim())
    if (
      namedItems.some(
        (item) => item.grams == null && item.pieces == null && item.milliliters == null,
      )
    ) {
      setErrors(['Each item needs grams, pieces, and/or milliliters.'])
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        ...values,
        household: householdId,
        items: namedItems,
      })
    } catch (err) {
      setErrors(
        err instanceof ApiError
          ? Object.values(err.fieldErrors).flat()
          : ['Something went wrong. Please try again.'],
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-slate-700">Name</span>
        <input
          type="text"
          required
          placeholder="e.g. Soft drinks, Snacks, Toiletries"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </label>

      <ItemGroceryMatchesEditor
        title="Items"
        itemNamePlaceholder="Item"
        addButtonLabel="Add item"
        items={values.items}
        onChange={(items) => set('items', items)}
        groceryItems={groceryItems}
      />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
