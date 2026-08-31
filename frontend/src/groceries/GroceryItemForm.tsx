import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, type GroceryItemInput, type Store, fetchStores, populateGroceryItem } from '../api/client'

const EMPTY: GroceryItemInput = {
  store: '',
  name: '',
  brand: '',
  grams: null,
  pieces: null,
  milliliters: null,
  price: '',
  product_url: '',
  image_url: '',
}

export function GroceryItemForm({
  initialValue,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialValue?: GroceryItemInput
  submitLabel: string
  onSubmit: (item: GroceryItemInput) => Promise<void>
  onCancel?: () => void
}) {
  const [values, setValues] = useState<GroceryItemInput>(initialValue ?? EMPTY)
  const [stores, setStores] = useState<Store[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [populating, setPopulating] = useState(false)
  const [populateMessage, setPopulateMessage] = useState<{
    kind: 'error' | 'notice'
    text: string
  } | null>(null)

  useEffect(() => {
    fetchStores().then(setStores)
  }, [])

  function set<K extends keyof GroceryItemInput>(key: K, value: GroceryItemInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handlePopulate() {
    setPopulateMessage(null)
    if (!values.name.trim()) {
      setPopulateMessage({
        kind: 'error',
        text: 'Enter a product name first, then Populate to fill in the rest.',
      })
      return
    }
    if (!values.product_url.trim()) {
      setPopulateMessage({ kind: 'error', text: 'Enter a product URL first.' })
      return
    }

    setPopulating(true)
    try {
      const result = await populateGroceryItem(values.name, values.product_url)
      setValues((prev) => ({
        ...prev,
        store: result.store || prev.store,
        name: result.name || prev.name,
        grams: result.grams ?? prev.grams,
        pieces: result.pieces ?? prev.pieces,
        milliliters: result.milliliters ?? prev.milliliters,
        price: result.price ?? prev.price,
        product_url: result.product_url || prev.product_url,
        image_url: result.image_url || prev.image_url,
      }))
      const notes: string[] = []
      notes.push(
        result.matched_exact
          ? 'Matched the exact product.'
          : "Couldn't confirm an exact match — filled in the closest product found. Please double-check grams/pieces/milliliters and price.",
      )
      if (!result.store) {
        notes.push(`Couldn't match "${result.store_name}" to a store in the list — please pick one.`)
      }
      setPopulateMessage({ kind: 'notice', text: notes.join(' ') })
    } catch (err) {
      setPopulateMessage({
        kind: 'error',
        text:
          err instanceof ApiError
            ? Object.values(err.fieldErrors).flat().join(' ')
            : 'Could not populate from this URL.',
      })
    } finally {
      setPopulating(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors([])
    setSubmitting(true)
    try {
      await onSubmit({ ...values, price: values.price?.trim() || null })
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
    <form onSubmit={handleSubmit} className="space-y-3">
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="col-span-2 space-y-1 text-sm">
          <span className="font-medium text-slate-700">Product URL</span>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://…"
              value={values.product_url}
              onChange={(e) => set('product_url', e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handlePopulate}
              disabled={populating}
              className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {populating ? 'Populating…' : 'Populate'}
            </button>
          </div>
          {populateMessage && (
            <p
              className={`text-xs ${
                populateMessage.kind === 'error' ? 'text-red-600' : 'text-amber-600'
              }`}
            >
              {populateMessage.text}
            </p>
          )}
        </div>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Store</span>
          <select
            required
            value={values.store}
            onChange={(e) => set('store', e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="" disabled>
              Select a store…
            </option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <Field label="Name" required value={values.name} onChange={(v) => set('name', v)} />
        <Field label="Brand" value={values.brand} onChange={(v) => set('brand', v)} />
        <div className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Grams</span>
          <input
            type="number"
            min={0}
            placeholder="e.g. 120"
            value={values.grams ?? ''}
            onChange={(e) => set('grams', e.target.value === '' ? null : Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Pieces</span>
          <input
            type="number"
            min={0}
            placeholder="e.g. 6"
            value={values.pieces ?? ''}
            onChange={(e) => set('pieces', e.target.value === '' ? null : Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Milliliters</span>
          <input
            type="number"
            min={0}
            placeholder="e.g. 500"
            value={values.milliliters ?? ''}
            onChange={(e) =>
              set('milliliters', e.target.value === '' ? null : Number(e.target.value))
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <p className="text-[11px] text-slate-400">Provide grams, pieces, and/or milliliters</p>
        </div>
        <Field
          label="Price"
          placeholder="e.g. 2.20"
          value={values.price ?? ''}
          onChange={(v) => set('price', v)}
        />
        <div className="col-span-2 flex items-end gap-3">
          <div className="flex-1">
            <Field
              label="Image URL"
              type="url"
              placeholder="https://…"
              value={values.image_url}
              onChange={(v) => set('image_url', v)}
            />
          </div>
          {values.image_url && (
            <img
              src={values.image_url}
              alt=""
              className="h-10 w-10 shrink-0 rounded border border-slate-200 object-cover"
            />
          )}
        </div>
      </div>

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

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  type?: string
  placeholder?: string
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </label>
  )
}
