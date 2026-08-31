import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  type GroceryItem,
  type GroceryItemInput,
  type Store,
  createGroceryItem,
  deleteGroceryItem,
  fetchGroceryItems,
  fetchStores,
  updateGroceryItem,
} from '../api/client'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { PencilIcon } from '../icons'
import { GroceryItemEditView } from './GroceryItemEditView'
import { GroceryItemForm } from './GroceryItemForm'
import { downloadGroceryItemsAsJson, parseImportFiles } from './groceryItemExport'

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
  const [items, setItems] = useState<GroceryItem[] | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [storeFilter, setStoreFilter] = useState('')
  const [textFilter, setTextFilter] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null)
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
      if (storeFilter && item.store !== storeFilter) return false
      if (
        trimmedTextFilter &&
        !`${item.name} ${item.brand} ${item.store_detail.name}`
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
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            aria-label="Filter by store"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
          >
            <option value="">All stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
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
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggleSelected(item.id)}
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
                <p className="truncate font-medium text-slate-800">
                  {item.store_detail.name} — {item.name}
                </p>
                <p className="truncate text-sm text-slate-500">
                  {[item.brand, formatSize(item)].filter(Boolean).join(' · ')}
                  {item.price && ` · £${item.price}`}
                  {item.product_url && (
                    <>
                      {' · '}
                      <a
                        href={item.product_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Product page
                      </a>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() => setEditingId(item.id)}
                title="Edit"
                aria-label="Edit"
                className="text-slate-500 hover:text-slate-900"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
              <ConfirmDeleteButton
                label="Remove grocery item"
                onConfirm={() => handleDelete(item.id)}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
