import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  type ShoppingList,
  createShoppingList,
  deleteShoppingList,
  fetchShoppingLists,
} from '../api/client'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { useHouseholds } from '../households/HouseholdsContext'
import { formatFullDate } from '../mealplanner/dates'
import { ShoppingListDetailView } from './ShoppingListDetailView'

// Defaults a new list's name to today's date (e.g. "Saturday 5th September")
// — ready to use as-is for "this week's shop" without typing anything,
// while still just a normal editable text field if something else fits.
function defaultListName(): string {
  return formatFullDate(new Date())
}

export function ShoppingListsPage() {
  const { currentHousehold } = useHouseholds()
  const [lists, setLists] = useState<ShoppingList[] | null>(null)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newListName, setNewListName] = useState(defaultListName)
  const [creating, setCreating] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  async function refresh() {
    setLists(await fetchShoppingLists())
  }

  useEffect(() => {
    refresh()
  }, [])

  if (!currentHousehold) return null
  const householdId = currentHousehold.id

  const visibleLists = lists?.filter((list) => list.household === householdId) ?? null
  const selectedList = selectedListId
    ? (visibleLists?.find((list) => list.id === selectedListId) ?? null)
    : null

  if (selectedList) {
    // Full-width here (not the centered max-w-[58.8rem] the browse page
    // uses) — ShoppingListDetailView pins its own left panel to the left
    // edge and centers the list in whatever's left, which needs the whole
    // viewport width to work with rather than a pre-capped column.
    return (
      <div className="h-full w-full p-4 sm:p-8">
        <ShoppingListDetailView
          list={selectedList}
          onBack={() => setSelectedListId(null)}
          onUpdated={(updated) =>
            setLists((prev) => prev?.map((l) => (l.id === updated.id ? updated : l)) ?? prev)
          }
        />
      </div>
    )
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    const name = newListName.trim()
    if (!name) return
    setErrors([])
    setCreating(true)
    try {
      const created = await createShoppingList(householdId, name)
      setNewListName('')
      setShowAddForm(false)
      await refresh()
      setSelectedListId(created.id)
    } catch (err) {
      setErrors(
        err instanceof ApiError
          ? Object.values(err.fieldErrors).flat()
          : ['Something went wrong. Please try again.'],
      )
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    await deleteShoppingList(id)
    await refresh()
  }

  return (
    <div className="mx-auto max-w-[58.8rem] space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Shopping lists</h1>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => {
              setNewListName(defaultListName())
              setShowAddForm(true)
            }}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            New list
          </button>
        )}
      </div>

      {showAddForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-2 rounded-lg border border-slate-200 bg-white p-4"
        >
          {errors.length > 0 && (
            <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">List name</span>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. This week's shop"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {visibleLists === null && <p className="text-sm text-slate-400">Loading…</p>}
      {visibleLists !== null && visibleLists.length === 0 && (
        <p className="text-sm text-slate-500">No shopping lists yet.</p>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {visibleLists?.map((list) => (
          <li key={list.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setSelectedListId(list.id)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate font-medium text-slate-800">{list.name}</p>
              <p className="text-sm text-slate-500">
                {list.item_count} item{list.item_count === 1 ? '' : 's'}
              </p>
            </button>
            <ConfirmDeleteButton
              label="Delete shopping list"
              confirmMessage={`Delete "${list.name}"?`}
              onConfirm={() => handleDelete(list.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
