import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  type ShoppingList,
  type ShoppingListItem,
  createShoppingListItem,
  deleteShoppingListItem,
  fetchShoppingListItems,
  generateShoppingList,
  updateShoppingListItem,
} from '../api/client'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { addDays, formatDateISO, formatDayHeading } from '../mealplanner/dates'

// A dedicated screen for one shopping list — its "generate from planned
// meals" controls and its items — rather than a single page trying to
// juggle every list a household has going at once.
export function ShoppingListDetailView({
  list,
  onBack,
}: {
  list: ShoppingList
  onBack: () => void
}) {
  const [items, setItems] = useState<ShoppingListItem[] | null>(null)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [generateMessage, setGenerateMessage] = useState<string | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addingItem, setAddingItem] = useState(false)

  async function refresh() {
    setItems(await fetchShoppingListItems())
  }

  useEffect(() => {
    refresh()
  }, [])

  const visibleItems = items?.filter((item) => item.shopping_list === list.id) ?? null

  // Today through the next 6 days — the window generation can draw from.
  const next7Days = Array.from({ length: 7 }, (_, i) => formatDateISO(addDays(new Date(), i)))

  function toggleDate(day: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  async function handleGenerate() {
    if (selectedDates.size === 0) return
    setGenerateMessage(null)
    setGenerating(true)
    try {
      const created = await generateShoppingList(list.id, Array.from(selectedDates))
      await refresh()
      setSelectedDates(new Set())
      setGenerateMessage(
        created.length > 0
          ? `Added ${created.length} item(s) to the list.`
          : 'Nothing planned for those days — no items added.',
      )
    } catch (err) {
      setGenerateMessage(
        err instanceof ApiError
          ? Object.values(err.fieldErrors).flat().join(' ')
          : 'Could not generate the shopping list. Please try again.',
      )
    } finally {
      setGenerating(false)
    }
  }

  async function handleToggleChecked(item: ShoppingListItem) {
    await updateShoppingListItem(item.id, { is_checked: !item.is_checked })
    await refresh()
  }

  async function handleDelete(id: string) {
    await deleteShoppingListItem(id)
    await refresh()
  }

  async function handleAddItem(event: FormEvent) {
    event.preventDefault()
    const name = newItemName.trim()
    if (!name) return
    setAddError(null)
    setAddingItem(true)
    try {
      await createShoppingListItem({
        shopping_list: list.id,
        meal_plan: null,
        name,
        quantity: '',
        is_checked: false,
      })
      setNewItemName('')
      await refresh()
    } catch (err) {
      setAddError(
        err instanceof ApiError
          ? Object.values(err.fieldErrors).flat().join(' ')
          : 'Could not add that item. Please try again.',
      )
    } finally {
      setAddingItem(false)
    }
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to shopping lists
      </button>
      <h1 className="text-xl font-semibold text-slate-800">{list.name}</h1>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <span className="text-sm font-medium text-slate-700">Generate from planned meals</span>
        <div className="flex flex-wrap gap-2">
          {next7Days.map((day) => (
            <label
              key={day}
              className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-sm font-medium transition ${
                selectedDates.has(day)
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedDates.has(day)}
                onChange={() => toggleDate(day)}
                className="sr-only"
              />
              {formatDayHeading(day)}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={selectedDates.size === 0 || generating}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {generating ? 'Generating…' : `Generate shopping list (${selectedDates.size})`}
        </button>
        {generateMessage && <p className="text-sm text-slate-600">{generateMessage}</p>}
      </div>

      <div className="space-y-2">
        <form onSubmit={handleAddItem} className="flex gap-2">
          <input
            type="text"
            placeholder="Add an item…"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={addingItem || !newItemName.trim()}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Add
          </button>
        </form>
        {addError && <p className="text-sm text-red-600">{addError}</p>}
      </div>

      {visibleItems === null && <p className="text-sm text-slate-400">Loading…</p>}
      {visibleItems !== null && visibleItems.length === 0 && (
        <p className="text-sm text-slate-500">Nothing on this list yet.</p>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {visibleItems?.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={item.is_checked}
                onChange={() => handleToggleChecked(item)}
                className="h-4 w-4 shrink-0 rounded border-slate-300"
              />
              <span
                className={`min-w-0 truncate text-sm ${
                  item.is_checked ? 'text-slate-400 line-through' : 'text-slate-800'
                }`}
              >
                {item.name}
                {item.quantity && <span className="text-slate-500"> · {item.quantity}</span>}
              </span>
            </label>
            <div className="flex shrink-0 items-center gap-3">
              {item.added_by_email && (
                <span
                  className="max-w-[8rem] truncate text-xs text-slate-400"
                  title={item.added_by_email}
                >
                  {item.added_by_email}
                </span>
              )}
              <ConfirmDeleteButton label="Remove item" onConfirm={() => handleDelete(item.id)} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
