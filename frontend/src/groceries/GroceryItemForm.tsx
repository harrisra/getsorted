import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AISLE_OPTIONS,
  ApiError,
  type GroceryItemInput,
  type GroceryItemStorePriceInput,
  type Store,
  fetchStores,
  refreshGroceryItemPrice,
} from '../api/client'

const EMPTY: GroceryItemInput = {
  name: '',
  brand: '',
  aisle: '',
  grams: null,
  pieces: null,
  milliliters: null,
  store_prices: [],
  trolley_url: '',
  image_url: '',
}

export function GroceryItemForm({
  itemId,
  initialValue,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  // The item's id, so "Refresh price" can hit /refresh-price/ on it — only
  // present when editing an already-saved item, not when adding a new one
  // (there's nothing to refresh until it's been created once).
  itemId?: string
  initialValue?: GroceryItemInput
  submitLabel: string
  onSubmit: (item: GroceryItemInput) => Promise<void>
  onCancel?: () => void
}) {
  const [values, setValues] = useState<GroceryItemInput>(initialValue ?? EMPTY)
  const [stores, setStores] = useState<Store[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [refreshingPrice, setRefreshingPrice] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<{
    kind: 'error' | 'notice'
    text: string
  } | null>(null)

  useEffect(() => {
    fetchStores().then(setStores)
  }, [])

  function set<K extends keyof GroceryItemInput>(key: K, value: GroceryItemInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function addStorePrice(storeId: string) {
    set('store_prices', [
      ...values.store_prices,
      { store: storeId, price: null, promo_price: null, product_url: '' },
    ])
  }

  function updateStorePrice(storeId: string, patch: Partial<GroceryItemStorePriceInput>) {
    set(
      'store_prices',
      values.store_prices.map((sp) => (sp.store === storeId ? { ...sp, ...patch } : sp)),
    )
  }

  function removeStorePrice(storeId: string) {
    set(
      'store_prices',
      values.store_prices.filter((sp) => sp.store !== storeId),
    )
  }

  const availableStores = stores.filter(
    (store) => !values.store_prices.some((sp) => sp.store === store.id),
  )

  async function handleRefreshPrice() {
    setRefreshMessage(null)
    if (!itemId) return
    if (!values.trolley_url.trim()) {
      setRefreshMessage({ kind: 'error', text: 'Enter a trolley.co.uk URL first.' })
      return
    }

    setRefreshingPrice(true)
    try {
      const updated = await refreshGroceryItemPrice(itemId, values.trolley_url)
      set('trolley_url', updated.trolley_url)
      set(
        'store_prices',
        updated.store_prices.map((sp) => ({
          store: sp.store,
          price: sp.price,
          promo_price: sp.promo_price,
          product_url: sp.product_url,
        })),
      )
      const notes = [`Refreshed ${updated.store_prices.length} store price(s).`]
      if (updated.unmatched_stores.length > 0) {
        notes.push(`Not on the known store list: ${updated.unmatched_stores.join(', ')}.`)
      }
      setRefreshMessage({ kind: 'notice', text: notes.join(' ') })
    } catch (err) {
      setRefreshMessage({
        kind: 'error',
        text:
          err instanceof ApiError
            ? Object.values(err.fieldErrors).flat().join(' ')
            : 'Could not refresh prices from trolley.co.uk.',
      })
    } finally {
      setRefreshingPrice(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors([])
    setSubmitting(true)
    try {
      await onSubmit({
        ...values,
        store_prices: values.store_prices.map((sp) => ({
          ...sp,
          price: sp.price?.toString().trim() || null,
          promo_price: sp.promo_price?.toString().trim() || null,
        })),
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
          <span className="font-medium text-slate-700">Trolley URL</span>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://www.trolley.co.uk/product/…"
              value={values.trolley_url}
              onChange={(e) => set('trolley_url', e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            {itemId && (
              <button
                type="button"
                onClick={handleRefreshPrice}
                disabled={refreshingPrice}
                className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {refreshingPrice ? 'Refreshing…' : 'Refresh prices'}
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            A trolley.co.uk product page — lets every store's price below be pulled in
            automatically.
          </p>
          {refreshMessage && (
            <p
              className={`text-xs ${
                refreshMessage.kind === 'error' ? 'text-red-600' : 'text-amber-600'
              }`}
            >
              {refreshMessage.text}
            </p>
          )}
        </div>

        <Field label="Name" required value={values.name} onChange={(v) => set('name', v)} />
        <Field label="Brand" value={values.brand} onChange={(v) => set('brand', v)} />
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Aisle</span>
          <select
            value={values.aisle}
            onChange={(e) => set('aisle', e.target.value as GroceryItemInput['aisle'])}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="">No aisle</option>
            {AISLE_OPTIONS.map((aisle) => (
              <option key={aisle.value} value={aisle.value}>
                {aisle.label}
              </option>
            ))}
          </select>
        </label>
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

      <div className="space-y-2">
        <span className="text-sm font-medium text-slate-700">Store prices</span>
        <div className="space-y-2">
          {values.store_prices.map((sp) => {
            const store = stores.find((s) => s.id === sp.store)
            return (
              <div
                key={sp.store}
                className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 p-2"
              >
                <span className="min-w-[6rem] flex-1 text-sm font-medium text-slate-700">
                  {store?.name ?? 'Unknown store'}
                </span>
                <input
                  type="text"
                  placeholder="Price, e.g. 2.20"
                  value={sp.price ?? ''}
                  onChange={(e) => updateStorePrice(sp.store, { price: e.target.value })}
                  className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                <input
                  type="text"
                  title="Promo/loyalty-card price, if there's one on right now"
                  placeholder="Promo price"
                  value={sp.promo_price ?? ''}
                  onChange={(e) => updateStorePrice(sp.store, { promo_price: e.target.value })}
                  className="w-24 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm focus:border-amber-400 focus:outline-none"
                />
                <input
                  type="url"
                  placeholder="Product URL"
                  value={sp.product_url}
                  onChange={(e) => updateStorePrice(sp.store, { product_url: e.target.value })}
                  className="min-w-[10rem] flex-[2] rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeStorePrice(sp.store)}
                  title="Remove"
                  aria-label={`Remove ${store?.name ?? 'store'} price`}
                  className="shrink-0 text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
        {availableStores.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addStorePrice(e.target.value)
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-500 focus:border-slate-500 focus:outline-none"
          >
            <option value="">+ Add a store price…</option>
            {availableStores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        )}
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
