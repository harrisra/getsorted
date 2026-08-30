import { useEffect, useState } from 'react'
import {
  type GroceryItem,
  type GroceryItemInput,
  createGroceryItem,
  deleteGroceryItem,
  fetchGroceryItems,
  updateGroceryItem,
} from '../api/client'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { PencilIcon } from '../icons'
import { GroceryItemForm } from './GroceryItemForm'

export function GroceryItemsPage() {
  const [items, setItems] = useState<GroceryItem[] | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function refresh() {
    setItems(await fetchGroceryItems())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDelete(id: string) {
    await deleteGroceryItem(id)
    await refresh()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Grocery items</h1>
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

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {items?.map((item) =>
          editingId === item.id ? (
            <li key={item.id} className="p-4">
              <GroceryItemForm
                submitLabel="Save"
                initialValue={{
                  store: item.store,
                  name: item.name,
                  brand: item.brand,
                  size: item.size,
                  price: item.price,
                  product_url: item.product_url,
                  image_url: item.image_url,
                }}
                onCancel={() => setEditingId(null)}
                onSubmit={async (updated) => {
                  await updateGroceryItem(item.id, updated)
                  setEditingId(null)
                  await refresh()
                }}
              />
            </li>
          ) : (
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
                    {item.store} — {item.name}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {[item.brand, item.size].filter(Boolean).join(' · ')}
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
          ),
        )}
      </ul>
    </div>
  )
}
