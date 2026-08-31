import { useEffect, useState } from 'react'
import {
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
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

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
      <div className="mx-auto max-w-2xl p-4 sm:p-8">
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

  const filteredItems = items?.filter((item) => !storeFilter || item.store === storeFilter) ?? null

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Grocery items</h1>
        <div className="flex flex-wrap items-center gap-2">
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
        <p className="text-sm text-slate-500">No grocery items for this store.</p>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {filteredItems?.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
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
