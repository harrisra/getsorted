import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AISLE_OPTIONS,
  ApiError,
  type GroceryItem,
  type GroceryItemInput,
  type Store,
  createGroceryItem,
  deleteGroceryItem,
  fetchGroceryItems,
  fetchStores,
  populateGroceryItemFromTrolley,
  refreshGroceryItemPrice,
  updateGroceryItem,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { GroceryItemEditView } from './GroceryItemEditView'
import { GroceryItemForm } from './GroceryItemForm'
import { downloadGroceryItemsAsJson, parseImportFiles } from './groceryItemExport'

function aisleLabel(item: GroceryItem): string | null {
  return AISLE_OPTIONS.find((a) => a.value === item.aisle)?.label ?? null
}

function formatSize(item: GroceryItem): string {
  return [
    item.grams != null ? `${item.grams}g` : null,
    item.pieces != null ? `${item.pieces}pc` : null,
    item.milliliters != null ? `${item.milliliters}ml` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function GroceryItemsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<GroceryItem[] | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [textFilter, setTextFilter] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showTrolleyForm, setShowTrolleyForm] = useState(false)
  const [trolleyUrlInput, setTrolleyUrlInput] = useState('')
  const [addingFromTrolley, setAddingFromTrolley] = useState(false)
  const [trolleyMessage, setTrolleyMessage] = useState<{
    kind: 'error' | 'notice'
    text: string
  } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null)
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshAllProgress, setRefreshAllProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const [refreshAllMessage, setRefreshAllMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setItems(await fetchGroceryItems())
  }

  useEffect(() => {
    refresh()
    fetchStores().then(setStores)
  }, [])

  async function handleDelete(id: string) {
    await deleteGroceryItem(id)
    await refresh()
  }

  const editingItem = editingId ? (items?.find((i) => i.id === editingId) ?? null) : null

  if (editingItem) {
    return (
      <div className="mx-auto max-w-[58.8rem] p-4 sm:p-8">
        <GroceryItemEditView
          item={editingItem}
          onCancel={() => setEditingId(null)}
          onSubmit={async (updated) => {
            await updateGroceryItem(editingItem.id, updated)
            setEditingId(null)
            await refresh()
          }}
        />
      </div>
    )
  }

  const trimmedTextFilter = textFilter.trim().toLowerCase()
  const filteredItems =
    items?.filter((item) => {
      if (
        trimmedTextFilter &&
        !`${item.name} ${item.brand} ${item.store_prices.map((sp) => sp.store_detail.name).join(' ')}`
          .toLowerCase()
          .includes(trimmedTextFilter)
      ) {
        return false
      }
      return true
    }) ?? null
  const allSelected =
    !!filteredItems && filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id))

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (!filteredItems) return
    // Only toggle the currently-visible (filtered) items, so this can't
    // wipe out a selection made under a different store filter.
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const i of filteredItems) {
        if (allSelected) next.delete(i.id)
        else next.add(i.id)
      }
      return next
    })
  }

  function handleExportSelected() {
    // Deliberately the full (unfiltered) list — a selection made before
    // switching the store filter should still be exportable, not silently
    // dropped because it's no longer visible.
    if (!items) return
    const selected = items.filter((i) => selectedIds.has(i.id))
    if (selected.length === 0) return
    downloadGroceryItemsAsJson(selected)
  }

  async function handleDeleteSelected() {
    if (!items) return
    setDeleteMessage(null)
    const targets = items.filter((i) => selectedIds.has(i.id))
    if (targets.length === 0) return

    const results = await Promise.allSettled(targets.map((i) => deleteGroceryItem(i.id)))
    const failed = targets.filter((_, i) => results[i].status === 'rejected')

    // Deselect whatever actually got deleted; leave any failures selected
    // so it's obvious what still needs another try.
    setSelectedIds(new Set(failed.map((i) => i.id)))
    await refresh()

    if (failed.length > 0) {
      setDeleteMessage(
        `Deleted ${targets.length - failed.length} of ${targets.length} item(s) — ${failed.length} failed and are still selected.`,
      )
    }
  }

  async function handleImportFiles(files: FileList) {
    setImportMessage(null)
    setImporting(true)
    try {
      const { items: toImport, fileErrors } = await parseImportFiles(files, stores)

      let succeeded = 0
      const importErrors: string[] = []
      for (const item of toImport) {
        try {
          await createGroceryItem(item)
          succeeded++
        } catch (err) {
          const detail =
            err instanceof ApiError
              ? Object.values(err.fieldErrors).flat().join(' ')
              : 'Something went wrong.'
          importErrors.push(`${item.name}: ${detail}`)
        }
      }

      await refresh()

      const parts = [`Imported ${succeeded} of ${toImport.length} item(s).`]
      if (fileErrors.length > 0) parts.push(...fileErrors)
      if (importErrors.length > 0) parts.push(...importErrors)
      setImportMessage(parts.join(' '))
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleAddFromTrolley(event: FormEvent) {
    event.preventDefault()
    const url = trolleyUrlInput.trim()
    if (!url) return
    setTrolleyMessage(null)
    setAddingFromTrolley(true)
    try {
      const created = await populateGroceryItemFromTrolley(url)
      await refresh()
      setTrolleyUrlInput('')
      setShowTrolleyForm(false)
      const notes = [`Added "${created.name}" with ${created.store_prices.length} store price(s).`]
      if (created.unmatched_stores.length > 0) {
        notes.push(`Not on the known store list: ${created.unmatched_stores.join(', ')}.`)
      }
      setTrolleyMessage({ kind: 'notice', text: notes.join(' ') })
    } catch (err) {
      setTrolleyMessage({
        kind: 'error',
        text:
          err instanceof ApiError
            ? Object.values(err.fieldErrors).flat().join(' ')
            : 'Could not add that item. Please try again.',
      })
    } finally {
      setAddingFromTrolley(false)
    }
  }

  // Refreshes every item with a trolley_url set, one at a time — each hits
  // trolley.co.uk for real (via the backend's refresh-price action), so
  // this runs sequentially rather than all at once, both to avoid hammering
  // trolley.co.uk with a burst of simultaneous requests and to keep a
  // simple running "done/total" count to show while it works.
  async function handleRefreshAllPrices() {
    if (!items) return
    const targets = items.filter((i) => i.trolley_url)
    if (targets.length === 0) return

    setRefreshAllMessage(null)
    setRefreshingAll(true)
    setRefreshAllProgress({ done: 0, total: targets.length })

    let succeeded = 0
    const errors: string[] = []
    for (const item of targets) {
      try {
        await refreshGroceryItemPrice(item.id, item.trolley_url)
        succeeded++
      } catch (err) {
        const detail =
          err instanceof ApiError
            ? Object.values(err.fieldErrors).flat().join(' ')
            : 'Something went wrong.'
        errors.push(`${item.name}: ${detail}`)
      }
      setRefreshAllProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev))
    }

    await refresh()
    const parts = [`Refreshed ${succeeded} of ${targets.length} item(s) with a trolley.co.uk URL.`]
    if (errors.length > 0) parts.push(...errors)
    setRefreshAllMessage(parts.join(' '))
    setRefreshingAll(false)
    setRefreshAllProgress(null)
  }

  return (
    <div className="mx-auto max-w-[58.8rem] space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Grocery items</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Search name, brand, store…"
            aria-label="Filter by text"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleExportSelected}
            disabled={selectedIds.size === 0}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Export selected ({selectedIds.size})
          </button>
          <ConfirmDeleteButton
            label="Delete selected grocery items"
            confirmMessage={`Delete ${selectedIds.size} item(s)?`}
            disabled={selectedIds.size === 0}
            onConfirm={handleDeleteSelected}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete selected ({selectedIds.size})
          </ConfirmDeleteButton>
          <button
            type="button"
            onClick={handleRefreshAllPrices}
            disabled={refreshingAll || !items?.some((i) => i.trolley_url)}
            title="Re-fetch prices from trolley.co.uk for every item with a trolley.co.uk URL"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {refreshingAll
              ? `Refreshing… (${refreshAllProgress?.done ?? 0}/${refreshAllProgress?.total ?? 0})`
              : 'Refresh prices'}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleImportFiles(e.target.files)
              }
            }}
          />
          {!showTrolleyForm && (
            <button
              type="button"
              onClick={() => setShowTrolleyForm(true)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Add from Trolley
            </button>
          )}
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Add item
            </button>
          )}
        </div>
      </div>

      {importMessage && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {importMessage}
        </p>
      )}

      {deleteMessage && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteMessage}</p>
      )}

      {refreshAllMessage && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {refreshAllMessage}
        </p>
      )}

      {showTrolleyForm && (
        <form
          onSubmit={handleAddFromTrolley}
          className="space-y-2 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div>
            <span className="text-sm font-medium text-slate-700">Add from Trolley</span>
            <p className="text-xs text-slate-500">
              Paste a trolley.co.uk product page URL — its name, size, image, and every listed
              store's price are filled in automatically.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              required
              autoFocus
              placeholder="https://www.trolley.co.uk/product/…"
              value={trolleyUrlInput}
              onChange={(e) => setTrolleyUrlInput(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={addingFromTrolley || !trolleyUrlInput.trim()}
              className="shrink-0 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {addingFromTrolley ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowTrolleyForm(false)
                setTrolleyMessage(null)
              }}
              className="shrink-0 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {trolleyMessage && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            trolleyMessage.kind === 'error'
              ? 'bg-red-50 text-red-700'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          {trolleyMessage.text}
        </p>
      )}

      {showAddForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <GroceryItemForm
            submitLabel="Add item"
            onCancel={() => setShowAddForm(false)}
            onSubmit={async (item: GroceryItemInput) => {
              await createGroceryItem(item)
              setShowAddForm(false)
              await refresh()
            }}
          />
        </div>
      )}

      {items === null && <p className="text-sm text-slate-400">Loading…</p>}
      {items !== null && items.length === 0 && (
        <p className="text-sm text-slate-500">No grocery items yet.</p>
      )}
      {items !== null && items.length > 0 && filteredItems?.length === 0 && (
        <p className="text-sm text-slate-500">No grocery items match your filters.</p>
      )}

      {filteredItems !== null && filteredItems.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label="Select all grocery items"
            className="h-4 w-4 shrink-0 rounded border-slate-300"
          />
          Select all
        </label>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {filteredItems?.map((item) => (
          <li
            key={item.id}
            onClick={() => setEditingId(item.id)}
            title="Click to edit"
            className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
          >
            <div className="flex min-w-0 items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggleSelected(item.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${item.name}`}
                className="h-4 w-4 shrink-0 rounded border-slate-300"
              />
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded border border-slate-200 object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{item.name}</p>
                <p className="truncate text-sm text-slate-500">
                  {[item.brand, formatSize(item), aisleLabel(item)].filter(Boolean).join(' · ')}
                  {item.trolley_url && (
                    <>
                      {' · '}
                      <a
                        href={item.trolley_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-600 hover:underline"
                      >
                        Trolley
                      </a>
                    </>
                  )}
                </p>
                {item.store_prices.length > 0 && (
                  <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    {item.store_prices.map((sp) => (
                      <li key={sp.id} className="flex items-center gap-1">
                        <span className="font-medium text-slate-600">{sp.store_detail.name}</span>
                        {sp.price && ` £${sp.price}`}
                        {sp.promo_price && (
                          <span
                            title="Currently a promo/loyalty-card price"
                            className="rounded bg-amber-100 px-1 font-medium text-amber-700"
                          >
                            promo £{sp.promo_price}
                          </span>
                        )}
                        {sp.product_url && (
                          <>
                            {' · '}
                            <a
                              href={sp.product_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:underline"
                            >
                              Product page
                            </a>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {/* stopPropagation here — none of this should also open the
                edit view the row's own click already opens. */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex shrink-0 items-center gap-3"
            >
              {(item.created_by_email == null || item.created_by_email === user?.email) && (
                <ConfirmDeleteButton
                  label="Remove grocery item"
                  onConfirm={() => handleDelete(item.id)}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
