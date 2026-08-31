import { Fragment, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  type GroceryItem,
  type ShoppingList,
  type ShoppingListItem,
  createShoppingListItem,
  deleteShoppingListItem,
  fetchGroceryItems,
  fetchShoppingListItems,
  generateShoppingList,
  updateShoppingListItem,
} from '../api/client'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { addDays, formatDateISO, formatDayHeading } from '../mealplanner/dates'

// Catalog items whose name mentions this shopping-list item's name (e.g.
// "Cheddar" matches "Tesco Mature Cheddar Block 400g"), cheapest first —
// priced items before unpriced ones, since there's nothing to compare an
// unpriced item on.
function matchingGroceryItems(itemName: string, groceryItems: GroceryItem[]): GroceryItem[] {
  const needle = itemName.trim().toLowerCase()
  if (!needle) return []
  return groceryItems
    .filter((gi) => gi.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      if (a.price == null && b.price == null) return 0
      if (a.price == null) return 1
      if (b.price == null) return -1
      return Number(a.price) - Number(b.price)
    })
}

// The raw amount needed, e.g. "500g" or "2pc + 300ml" — used as a fallback
// when there's no matched grocery item to express the amount as a pack
// count instead.
function formatAmount(item: ShoppingListItem): string | null {
  const parts = [
    item.grams ? `${item.grams}g` : null,
    item.pieces ? `${item.pieces}pc` : null,
    item.milliliters ? `${item.milliliters}ml` : null,
  ].filter((part): part is string => part != null)
  return parts.length > 0 ? parts.join(' + ') : null
}

// Parse a quantity input's text into a positive int, or null if blank/invalid.
function parseAmount(value: string): number | null {
  const n = Number(value)
  return value.trim() !== '' && Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

// Background/border classes for the product dropdown: pale green when the
// selected match is the cheapest priced option available, pale red when a
// cheaper one exists instead. Neutral (default) when there's nothing to
// compare — a single match, or no priced matches at all.
function selectPriceClasses(matches: GroceryItem[], selectedId: string): string {
  const priced = matches.filter((gi) => gi.price != null)
  if (priced.length < 2) return 'border-slate-300'
  const cheapest = Math.min(...priced.map((gi) => Number(gi.price)))
  const selected = matches.find((gi) => gi.id === selectedId)
  if (selected?.price == null) return 'border-slate-300'
  return Number(selected.price) <= cheapest
    ? 'border-green-300 bg-green-50'
    : 'border-red-300 bg-red-50'
}

// Cost of buying enough packs of the matched product to cover this row —
// packs_needed times the pack price. Null unless both are known (i.e. a
// grocery item is actually matched and priced).
function rowCost(item: ShoppingListItem): number | null {
  const price = item.grocery_item_detail?.price
  if (item.packs_needed == null || price == null) return null
  return Number(price) * item.packs_needed
}

function formatRowCost(item: ShoppingListItem): string | null {
  const cost = rowCost(item)
  return cost != null ? `£${cost.toFixed(2)}` : null
}

type SortMode = 'alpha' | 'price' | 'store'

const SORT_MODE_LABELS: Record<SortMode, string> = {
  alpha: 'A–Z',
  price: 'Price',
  store: 'Store',
}

interface EnrichedItem {
  item: ShoppingListItem
  matches: GroceryItem[]
  effectiveGroceryItemId: string
  // The store of whichever product this item would actually be bought as —
  // its saved match, or (nothing chosen yet) the same default-to-cheapest
  // match shown in the dropdown. Used for the "grouped by store" sort so
  // items group under the store they'll really be bought from, not just
  // the ones with an explicitly saved match.
  effectiveStore: string | null
}

function enrichItems(items: ShoppingListItem[], groceryItems: GroceryItem[]): EnrichedItem[] {
  return items.map((item) => {
    const matches = matchingGroceryItems(item.name, groceryItems)
    const effective = matches.find((gi) => gi.id === item.grocery_item) ?? matches[0]
    return {
      item,
      matches,
      effectiveGroceryItemId: item.grocery_item ?? (matches[0]?.id ?? ''),
      effectiveStore: effective?.store_detail.name ?? null,
    }
  })
}

// Unchecked items always sort before checked ones, regardless of mode —
// only the ordering within those two groups changes.
function sortEnriched(enriched: EnrichedItem[], mode: SortMode): EnrichedItem[] {
  const sorted = [...enriched]
  sorted.sort((a, b) => {
    if (a.item.is_checked !== b.item.is_checked) return a.item.is_checked ? 1 : -1
    if (mode === 'alpha') return a.item.name.localeCompare(b.item.name)
    if (mode === 'price') {
      // Costliest first — items with no known cost sort to the end.
      return (rowCost(b.item) ?? -1) - (rowCost(a.item) ?? -1)
    }
    // Items with no matched product at all (nothing to group by) sort last.
    if (a.effectiveStore == null && b.effectiveStore == null) {
      return a.item.name.localeCompare(b.item.name)
    }
    if (a.effectiveStore == null) return 1
    if (b.effectiveStore == null) return -1
    return a.effectiveStore !== b.effectiveStore
      ? a.effectiveStore.localeCompare(b.effectiveStore)
      : a.item.name.localeCompare(b.item.name)
  })
  return sorted
}

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
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([])
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [generateMessage, setGenerateMessage] = useState<string | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [newItemGrams, setNewItemGrams] = useState('')
  const [newItemPieces, setNewItemPieces] = useState('')
  const [newItemMilliliters, setNewItemMilliliters] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('alpha')

  async function refresh() {
    setItems(await fetchShoppingListItems())
  }

  useEffect(() => {
    refresh()
    fetchGroceryItems().then(setGroceryItems)
  }, [])

  const visibleItems = items?.filter((item) => item.shopping_list === list.id) ?? null
  // Sum of every row's cost that's actually known (matched product with a
  // price) — items with no match/no price simply don't contribute, rather
  // than treating "unknown" as £0.
  const totalCost = visibleItems?.reduce((sum, item) => sum + (rowCost(item) ?? 0), 0) ?? 0
  const sortedItems = visibleItems ? sortEnriched(enrichItems(visibleItems, groceryItems), sortMode) : null

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
      const affected = await generateShoppingList(list.id, Array.from(selectedDates))
      await refresh()
      setSelectedDates(new Set())
      setGenerateMessage(
        affected.length > 0
          ? `Updated ${affected.length} item(s) on the list.`
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

  async function handleChangeGroceryItem(itemId: string, groceryItemId: string) {
    await updateShoppingListItem(itemId, { grocery_item: groceryItemId || null })
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
        grams: parseAmount(newItemGrams),
        pieces: parseAmount(newItemPieces),
        milliliters: parseAmount(newItemMilliliters),
        grocery_item: null,
        is_checked: false,
      })
      setNewItemName('')
      setNewItemGrams('')
      setNewItemPieces('')
      setNewItemMilliliters('')
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
        <form onSubmit={handleAddItem} className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Add an item…"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="min-w-[10rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <input
            type="number"
            min={0}
            placeholder="g"
            value={newItemGrams}
            onChange={(e) => setNewItemGrams(e.target.value)}
            className="w-20 rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <input
            type="number"
            min={0}
            placeholder="pc"
            value={newItemPieces}
            onChange={(e) => setNewItemPieces(e.target.value)}
            className="w-20 rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <input
            type="number"
            min={0}
            placeholder="ml"
            value={newItemMilliliters}
            onChange={(e) => setNewItemMilliliters(e.target.value)}
            className="w-20 rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-slate-500 focus:outline-none"
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

      {visibleItems !== null && visibleItems.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Sort by:</span>
          {(Object.keys(SORT_MODE_LABELS) as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                sortMode === mode
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {SORT_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {(() => {
          let lastStoreHeading: string | undefined
          return sortedItems?.map(({ item, matches, effectiveGroceryItemId, effectiveStore }) => {
            // In "grouped by store" mode, drop in a heading row each time
            // the store changes — items with no matched product at all fall
            // under a trailing "Unmatched" heading rather than being hidden.
            const showStoreHeading = sortMode === 'store' && effectiveStore !== lastStoreHeading
            if (sortMode === 'store') lastStoreHeading = effectiveStore ?? undefined

            return (
              <Fragment key={item.id}>
                {showStoreHeading && (
                  <li className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {effectiveStore ?? 'Unmatched'}
                  </li>
                )}
                <li className="flex items-center justify-between gap-3 px-4 py-3">
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
                    </span>
                  </label>
                  <div className="flex shrink-0 items-center gap-3">
                    {/* Raw amount needed, to the left of the product
                        dropdown. Fixed-width and always rendered (even
                        empty) so this column lines up between rows
                        regardless of whether a given item has anything to
                        show in it. */}
                    <span className="w-20 shrink-0 text-xs text-slate-500">
                      {formatAmount(item) ?? ''}
                    </span>
                    <div className="w-64 shrink-0">
                      {matches.length > 0 && (
                        <select
                          value={effectiveGroceryItemId}
                          onChange={(e) => handleChangeGroceryItem(item.id, e.target.value)}
                          aria-label={`Choose which product to buy for ${item.name}`}
                          className={`w-full rounded-md border px-2 py-1 text-xs text-slate-700 focus:border-slate-500 focus:outline-none ${selectPriceClasses(matches, effectiveGroceryItemId)}`}
                        >
                          {matches.map((gi) => (
                            <option key={gi.id} value={gi.id}>
                              {gi.store_detail.name} — {gi.name}
                              {gi.price ? ` — £${gi.price}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {/* Packs needed of the matched product, to the right of
                        the dropdown. */}
                    <span className="w-10 shrink-0 text-xs text-slate-500">
                      {item.packs_needed != null ? `× ${item.packs_needed}` : ''}
                    </span>
                    {/* Total cost for this row: packs needed × pack price. */}
                    <span className="w-16 shrink-0 text-right text-sm font-medium text-slate-700">
                      {formatRowCost(item) ?? ''}
                    </span>
                    <ConfirmDeleteButton label="Remove item" onConfirm={() => handleDelete(item.id)} />
                  </div>
                </li>
              </Fragment>
            )
          })
        })()}
      </ul>

      {visibleItems !== null && visibleItems.length > 0 && (
        <p className="text-right text-sm font-semibold text-slate-800">
          Total: £{totalCost.toFixed(2)}
        </p>
      )}
    </div>
  )
}
