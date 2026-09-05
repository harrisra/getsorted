import { Fragment, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AISLE_OPTIONS,
  ApiError,
  type GroceryItemStorePriceOption,
  type ShoppingList,
  type ShoppingListItem,
  type Store,
  createShoppingListItem,
  deleteShoppingListItem,
  fetchGroceryItems,
  fetchShoppingListItems,
  fetchStores,
  flattenGroceryItemPrices,
  generateShoppingList,
  renameShoppingList,
  updateShoppingListExcludedStores,
  updateShoppingListItem,
} from '../api/client'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { PencilIcon } from '../icons'
import { addDays, formatDateISO, formatDayHeading } from '../mealplanner/dates'
import { StoreLogo, hasStoreLogo } from '../StoreLogo'

// Cheapest first — priced options before unpriced ones, since there's
// nothing to compare an unpriced one on.
function sortByPrice(options: GroceryItemStorePriceOption[]): GroceryItemStorePriceOption[] {
  return [...options].sort((a, b) => {
    if (a.price == null && b.price == null) return 0
    if (a.price == null) return 1
    if (b.price == null) return -1
    return Number(a.price) - Number(b.price)
  })
}

// Catalog (item, store) prices whose name mentions this shopping-list
// item's name (e.g. "Cheddar" matches "Tesco Mature Cheddar Block 400g").
function matchingGroceryItemOptions(
  itemName: string,
  options: GroceryItemStorePriceOption[],
): GroceryItemStorePriceOption[] {
  const needle = itemName.trim().toLowerCase()
  if (!needle) return []
  return sortByPrice(options.filter((option) => option.name.toLowerCase().includes(needle)))
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// What this option actually costs right now — its promo price when it has
// one, else its regular price — same "effective price" concept the backend
// uses for recipe costing (catalog.GroceryItemPrice.effective_price).
function effectivePrice(option: GroceryItemStorePriceOption): number | null {
  const raw = option.promo_price ?? option.price
  return raw != null ? Number(raw) : null
}

// Every priced option's effective price, only when there's more than one to
// compare — a single priced option (or none) has nothing to be cheaper or
// pricier than, so nothing should be colored either way.
function cheapestEffectivePrice(matches: GroceryItemStorePriceOption[]): number | null {
  const priced = matches.map(effectivePrice).filter((price): price is number => price != null)
  return priced.length >= 2 ? Math.min(...priced) : null
}

// Background/border classes for the product dropdown itself: pale green
// when the selected match is the cheapest priced option available, pale red
// when a cheaper one exists instead. Neutral (default) when there's nothing
// to compare — a single match, or no priced matches at all.
function selectPriceClasses(matches: GroceryItemStorePriceOption[], selectedId: string): string {
  const cheapest = cheapestEffectivePrice(matches)
  if (cheapest == null) return 'border-slate-300'
  const selected = matches.find((option) => option.id === selectedId)
  const selectedPrice = selected ? effectivePrice(selected) : null
  if (selectedPrice == null) return 'border-slate-300'
  return selectedPrice <= cheapest ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
}

// Inline background for one <option> row in that same dropdown — same
// green/red-or-neutral rule as selectPriceClasses, but per row rather than
// just for whichever is selected. Tailwind classes don't reliably style
// <option> elements across browsers, so this is plain CSS via style= instead.
function optionRowBackground(option: GroceryItemStorePriceOption, cheapest: number | null): string | undefined {
  if (cheapest == null) return undefined
  const price = effectivePrice(option)
  if (price == null) return undefined
  return price <= cheapest ? '#f0fdf4' /* green-50 */ : '#fef2f2' /* red-50 */
}

// Cost of buying enough packs of the matched product to cover this row —
// packs_needed times the pack price. Uses the promo price when the matched
// product currently has one at this store, same as everywhere else in the
// app now prefers effectivePrice over the regular shelf price. Null unless
// both are known (i.e. a grocery item is actually matched and priced).
function rowCost(item: ShoppingListItem): number | null {
  const detail = item.grocery_item_price_detail
  if (item.packs_needed == null || !detail) return null
  const price = detail.promo_price ?? detail.price
  return price != null ? Number(price) * item.packs_needed : null
}

// The same row's cost ignoring any promo — always the regular shelf price —
// used only for the "without promos" total, so that total reflects what the
// list would cost without relying on any current offer.
function rowCostWithoutPromo(item: ShoppingListItem): number | null {
  const price = item.grocery_item_price_detail?.price
  if (item.packs_needed == null || price == null) return null
  return Number(price) * item.packs_needed
}

function formatRowCost(item: ShoppingListItem): string | null {
  const cost = rowCost(item)
  return cost != null ? `£${cost.toFixed(2)}` : null
}

type SortMode = 'alpha' | 'price' | 'store' | 'store_aisle'

const SORT_MODE_LABELS: Record<SortMode, string> = {
  alpha: 'A–Z',
  price: 'Price',
  store: 'Store',
  store_aisle: 'Store + Aisle',
}

interface EnrichedItem {
  item: ShoppingListItem
  matches: GroceryItemStorePriceOption[]
  effectiveGroceryItemPriceId: string
  // The store (and aisle) of whichever product this item would actually be
  // bought as — its saved match, or (nothing chosen yet) the same
  // default-to-cheapest match shown in the dropdown. Used for the "grouped
  // by store"/"store + aisle" sorts so items group under the store/aisle
  // they'll really be bought from, not just the ones with an explicitly
  // saved match.
  effectiveStore: string | null
  effectiveAisleLabel: string | null
}

function enrichItems(
  items: ShoppingListItem[],
  groceryItemOptions: GroceryItemStorePriceOption[],
): EnrichedItem[] {
  return items.map((item) => {
    const nameMatches = matchingGroceryItemOptions(item.name, groceryItemOptions)
    // Every store price of the item's actually-assigned product counts as
    // a switchable match too, even when a name search wouldn't have found
    // any of them itself — the ingredient's name and the matched product's
    // own name don't always literally overlap (e.g. "Tilda Microwave Rice
    // Pilau Basmati" vs. "Microwave Pilau Basmati Rice Steamed Classic"),
    // and that shouldn't make an already-matched item look unmatched, nor
    // hide its other stores (the assigned match is set by "Generate" via
    // the real recipe-ingredient -> grocery-item link, not this search —
    // picking the cheapest store at the time, but every other store
    // selling that exact product should still be pickable here).
    const assigned = item.grocery_item_price
      ? groceryItemOptions.find((option) => option.id === item.grocery_item_price)
      : undefined
    const assignedProductOptions = assigned
      ? groceryItemOptions.filter((option) => option.groceryItemId === assigned.groceryItemId)
      : []
    const matches = sortByPrice(
      [...assignedProductOptions, ...nameMatches].filter(
        (option, index, all) => all.findIndex((o) => o.id === option.id) === index,
      ),
    )
    const effective = matches.find((option) => option.id === item.grocery_item_price) ?? matches[0]
    return {
      item,
      matches,
      effectiveGroceryItemPriceId: item.grocery_item_price ?? (matches[0]?.id ?? ''),
      effectiveStore: effective?.storeName ?? null,
      effectiveAisleLabel: AISLE_OPTIONS.find((a) => a.value === effective?.aisle)?.label ?? null,
    }
  })
}

// The heading text for a group in "store"/"store + aisle" mode, or null in
// modes that don't group items under headings at all.
function groupHeading(mode: SortMode, effectiveStore: string | null, effectiveAisleLabel: string | null): string | null {
  if (mode === 'store') return effectiveStore ?? 'Unmatched'
  if (mode === 'store_aisle') {
    return effectiveStore ? `${effectiveStore} — ${effectiveAisleLabel ?? 'No aisle'}` : 'Unmatched'
  }
  return null
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
    // "store" and "store_aisle": items with no matched product at all
    // (nothing to group by) sort last.
    if (a.effectiveStore == null && b.effectiveStore == null) {
      return a.item.name.localeCompare(b.item.name)
    }
    if (a.effectiveStore == null) return 1
    if (b.effectiveStore == null) return -1
    if (a.effectiveStore !== b.effectiveStore) return a.effectiveStore.localeCompare(b.effectiveStore)
    if (mode === 'store_aisle') {
      // Within the same store, items with no aisle set sort after ones
      // that have one.
      const aisleA = a.effectiveAisleLabel
      const aisleB = b.effectiveAisleLabel
      if (aisleA == null && aisleB == null) return a.item.name.localeCompare(b.item.name)
      if (aisleA == null) return 1
      if (aisleB == null) return -1
      if (aisleA !== aisleB) return aisleA.localeCompare(aisleB)
    }
    return a.item.name.localeCompare(b.item.name)
  })
  return sorted
}

// A dedicated screen for one shopping list — its "generate from planned
// meals" controls and its items — rather than a single page trying to
// juggle every list a household has going at once.
export function ShoppingListDetailView({
  list,
  onBack,
  onUpdated,
}: {
  list: ShoppingList
  onBack: () => void
  // Called with the updated list after a successful rename or store-toggle,
  // so the parent (which owns the list of ShoppingLists) can keep its copy
  // — and so the browse page's row — in sync too, rather than this view's
  // header being the only place that knows about the change.
  onUpdated: (list: ShoppingList) => void
}) {
  const [items, setItems] = useState<ShoppingListItem[] | null>(null)
  const [groceryItemOptions, setGroceryItemOptions] = useState<GroceryItemStorePriceOption[]>([])
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
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(list.name)
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogStoreFilter, setCatalogStoreFilter] = useState('')
  const [addingCatalogItemId, setAddingCatalogItemId] = useState<string | null>(null)
  const [catalogAddError, setCatalogAddError] = useState<string | null>(null)

  async function refresh() {
    setItems(await fetchShoppingListItems())
  }

  useEffect(() => {
    refresh()
    fetchGroceryItems().then((items) => setGroceryItemOptions(flattenGroceryItemPrices(items)))
    fetchStores().then(setStores)
  }, [])

  const visibleItems = items?.filter((item) => item.shopping_list === list.id) ?? null
  // Sum of every row's cost that's actually known (matched product with a
  // price) — items with no match/no price simply don't contribute, rather
  // than treating "unknown" as £0. totalCost uses each row's promo price
  // when it has one; totalCostWithoutPromo is the same list at regular
  // shelf prices only, shown alongside so it's clear how much of the total
  // depends on current offers.
  const totalCost = visibleItems?.reduce((sum, item) => sum + (rowCost(item) ?? 0), 0) ?? 0
  const totalCostWithoutPromo =
    visibleItems?.reduce((sum, item) => sum + (rowCostWithoutPromo(item) ?? 0), 0) ?? 0
  const sortedItems = visibleItems
    ? sortEnriched(enrichItems(visibleItems, groceryItemOptions), sortMode)
    : null

  // Grocery catalog (item, store) prices shown in the "Add from grocery
  // items" panel — free-text search over name/brand plus an optional store
  // filter, same filtering shape as the main grocery items page.
  const trimmedCatalogSearch = catalogSearch.trim().toLowerCase()
  const catalogResults = groceryItemOptions.filter((option) => {
    if (catalogStoreFilter && option.store !== catalogStoreFilter) return false
    if (
      trimmedCatalogSearch &&
      !`${option.name} ${option.brand}`.toLowerCase().includes(trimmedCatalogSearch)
    ) {
      return false
    }
    return true
  })

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

  function startEditingName() {
    setNameInput(list.name)
    setRenameError(null)
    setEditingName(true)
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault()
    const name = nameInput.trim()
    if (!name || name === list.name) {
      setEditingName(false)
      return
    }
    setRenameError(null)
    setRenaming(true)
    try {
      const updated = await renameShoppingList(list.id, name)
      onUpdated(updated)
      setEditingName(false)
    } catch (err) {
      setRenameError(
        err instanceof ApiError
          ? Object.values(err.fieldErrors).flat().join(' ')
          : 'Could not rename the list. Please try again.',
      )
    } finally {
      setRenaming(false)
    }
  }

  // Re-points (server-side) every priced item at the cheapest currently-
  // selected store in either direction — excluding a store moves items
  // away from it, re-including one can bring it back if it's cheapest
  // again. Refetches items afterward so any reassignment shows up
  // immediately.
  async function handleToggleStore(storeId: string) {
    const excluded = new Set(list.excluded_stores)
    if (excluded.has(storeId)) excluded.delete(storeId)
    else excluded.add(storeId)
    const updated = await updateShoppingListExcludedStores(list.id, Array.from(excluded))
    onUpdated(updated)
    await refresh()
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

  async function handleChangeGroceryItem(itemId: string, groceryItemPriceId: string) {
    await updateShoppingListItem(itemId, { grocery_item_price: groceryItemPriceId || null })
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
        grocery_item_price: null,
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

  async function handleAddFromCatalog(option: GroceryItemStorePriceOption) {
    setCatalogAddError(null)
    setAddingCatalogItemId(option.id)
    try {
      // Defaults the amount needed to one pack of the item itself (whichever
      // size dimension it has set), so it shows up with packs_needed = 1
      // straight away rather than needing grams/pieces/milliliters filled in
      // by hand — merges into an existing same-named item as usual if there
      // is one.
      await createShoppingListItem({
        shopping_list: list.id,
        meal_plan: null,
        name: option.name,
        grams: option.grams,
        pieces: option.pieces,
        milliliters: option.milliliters,
        grocery_item_price: option.id,
        is_checked: false,
      })
      await refresh()
    } catch (err) {
      setCatalogAddError(
        err instanceof ApiError
          ? Object.values(err.fieldErrors).flat().join(' ')
          : 'Could not add that item. Please try again.',
      )
    } finally {
      setAddingCatalogItemId(null)
    }
  }

  function handlePrint() {
    if (!sortedItems || sortedItems.length === 0) return

    const rows: string[] = []
    let lastHeading: string | null | undefined
    for (const { item, effectiveStore, effectiveAisleLabel } of sortedItems) {
      const heading = groupHeading(sortMode, effectiveStore, effectiveAisleLabel)
      if (heading !== null && heading !== lastHeading) {
        rows.push(`<h2>${escapeHtml(heading)}</h2>`)
        lastHeading = heading
      }
      const detail = item.packs_needed != null ? `× ${item.packs_needed}` : (formatAmount(item) ?? '')
      rows.push(`
        <div class="item${item.is_checked ? ' checked' : ''}">
          <span class="box"></span>
          <span class="name">${escapeHtml(item.name)}</span>
          <span class="detail">${escapeHtml(detail)}</span>
        </div>
      `)
    }

    const printWindow = window.open('', '_blank', 'width=800,height=640')
    if (!printWindow) return
    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(list.name)}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 1.5rem; color: #1e293b; }
            h1 { font-size: 1.25rem; margin: 0 0 1rem; }
            .columns { column-count: 2; column-gap: 2rem; }
            /* Spacing above a heading is padding, not margin — a margin
               here gets dropped when the heading happens to land at the
               very top of the second column (fragmentation start), which
               made that column's items start higher than the first
               column's. Padding doesn't get that treatment, so both
               columns line up at the same top edge either way. */
            h2 {
              font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;
              color: #64748b; margin: 0; padding: 1rem 0 0.25rem; border-bottom: 1px solid #e2e8f0;
              break-inside: avoid;
            }
            .columns > *:first-child { padding-top: 0; }
            .item {
              display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0;
              border-bottom: 1px solid #f1f5f9;
              break-inside: avoid;
            }
            .box {
              width: 0.85rem; height: 0.85rem; border: 1px solid #94a3b8; border-radius: 2px;
              flex-shrink: 0;
            }
            .name { flex: 1; }
            .detail { color: #64748b; font-size: 0.85rem; }
            .item.checked .name { text-decoration: line-through; color: #94a3b8; }
            @media print {
              body { padding: 0; }
              /* column-fill: auto fills column one all the way down the
                 page before spilling into column two, instead of the
                 default "balance" behavior that splits a short list into
                 two half-height columns with blank space below both. No
                 explicit height here — the actual printed page height
                 (via the browser's page box) is what bounds each column;
                 forcing a fixed height (e.g. 100vh) instead reserves that
                 much space regardless of content, which pushed a trailing
                 blank page even for a short list. */
              .columns { column-count: 2; column-fill: auto; }
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(list.name)}</h1>
          <div class="columns">${rows.join('')}</div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[30rem_1fr] lg:items-start">
        {/* Left panel: building the list, rather than looking at it. */}
        <div className="space-y-6">
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
              className="w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {generating ? 'Generating…' : `Generate shopping list (${selectedDates.size})`}
            </button>
            {generateMessage && <p className="text-sm text-slate-600">{generateMessage}</p>}
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-700">Add an item</span>
            <form onSubmit={handleAddItem} className="space-y-2">
              <input
                type="text"
                placeholder="Item name…"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="g"
                  value={newItemGrams}
                  onChange={(e) => setNewItemGrams(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="pc"
                  value={newItemPieces}
                  onChange={(e) => setNewItemPieces(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="ml"
                  value={newItemMilliliters}
                  onChange={(e) => setNewItemMilliliters(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={addingItem || !newItemName.trim()}
                className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Add
              </button>
            </form>
            {addError && <p className="text-sm text-red-600">{addError}</p>}
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-700">Add from grocery items</span>
            <input
              type="search"
              placeholder="Search grocery items…"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              aria-label="Search grocery items to add"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <select
              value={catalogStoreFilter}
              onChange={(e) => setCatalogStoreFilter(e.target.value)}
              aria-label="Filter grocery items by store"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
            >
              <option value="">All stores</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>

            {catalogAddError && <p className="text-sm text-red-600">{catalogAddError}</p>}

            <ul className="max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-200">
              {catalogResults.length === 0 && (
                <li className="px-3 py-3 text-sm text-slate-400">
                  {trimmedCatalogSearch || catalogStoreFilter
                    ? 'No grocery items match.'
                    : 'Search for a grocery item to add it.'}
                </li>
              )}
              {catalogResults.map((option) => (
                <li key={option.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {option.image_url && (
                      <img
                        src={option.image_url}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded border border-slate-200 object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">{option.name}</p>
                      {option.price && (
                        <p className="text-xs text-slate-500">
                          £{option.price}
                          {option.promo_price && (
                            <span className="font-medium text-amber-600"> (promo £{option.promo_price})</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Store column, between the item name and the Add button —
                      just the logo when we have one, since it identifies the
                      store on its own; falls back to the name as text for a
                      store with no logo on file. */}
                  <span
                    className="flex w-24 shrink-0 items-center gap-1 truncate text-xs text-slate-500"
                    title={option.storeName}
                  >
                    {hasStoreLogo(option.storeName) ? (
                      <StoreLogo name={option.storeName} className="h-4 w-auto" />
                    ) : (
                      option.storeName
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAddFromCatalog(option)}
                    disabled={addingCatalogItemId === option.id}
                    className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {addingCatalogItemId === option.id ? 'Adding…' : 'Add'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right panel: the list itself, filling whatever width is left
            next to the left panel. min-w-0 overrides the grid item's default
            min-width: auto — without it, this column refuses to shrink
            below the item row's intrinsic content width (several
            fixed-width, non-wrapping controls), which was forcing the whole
            page to grow a horizontal scrollbar instead of the row content
            reflowing to fit. */}
        <div className="min-w-0 w-full space-y-4">
          {editingName ? (
            <form
              onSubmit={handleRename}
              className="flex w-full items-center justify-between gap-2 rounded-lg bg-slate-800 px-4 py-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xl font-semibold text-slate-800 focus:border-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={renaming}
                  className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  {renaming ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingName(false)}
                  className="rounded-md border border-slate-400 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
              <button
                type="button"
                onClick={onBack}
                className="shrink-0 text-sm font-medium text-slate-300 hover:text-white"
              >
                ← Back to shopping lists
              </button>
            </form>
          ) : (
            <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-slate-800 px-4 py-2">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-white">{list.name}</h1>
                <button
                  type="button"
                  onClick={startEditingName}
                  title="Rename list"
                  aria-label="Rename list"
                  className="text-slate-300 hover:text-white"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={onBack}
                className="shrink-0 text-sm font-medium text-slate-300 hover:text-white"
              >
                ← Back to shopping lists
              </button>
            </div>
          )}
          {renameError && <p className="text-sm text-red-600">{renameError}</p>}

          {visibleItems === null && <p className="text-sm text-slate-400">Loading…</p>}
          {visibleItems !== null && visibleItems.length === 0 && (
            <p className="text-sm text-slate-500">Nothing on this list yet.</p>
          )}

          {visibleItems !== null && visibleItems.length > 0 && stores.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {stores.map((store) => {
                const visiting = !list.excluded_stores.includes(store.id)
                const logoAvailable = hasStoreLogo(store.name)
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => handleToggleStore(store.id)}
                    aria-pressed={visiting}
                    aria-label={logoAvailable ? store.name : undefined}
                    title={
                      visiting
                        ? `Not going to ${store.name}? Click to move its items elsewhere.`
                        : `Visit ${store.name} after all.`
                    }
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                      visiting
                        ? 'border-slate-300 hover:bg-slate-100'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {logoAvailable ? (
                      <StoreLogo
                        name={store.name}
                        className={`h-4 w-auto transition ${visiting ? '' : 'opacity-40 grayscale'}`}
                      />
                    ) : (
                      <span className={visiting ? 'text-slate-700' : 'text-slate-400'}>{store.name}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {visibleItems !== null && visibleItems.length > 0 && (
            <div className="flex items-center justify-between gap-2">
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
              <button
                type="button"
                onClick={handlePrint}
                className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Print
              </button>
            </div>
          )}

          <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {(() => {
          let lastHeading: string | null | undefined
          return sortedItems?.map(({ item, matches, effectiveGroceryItemPriceId, effectiveStore, effectiveAisleLabel }) => {
            // In "grouped by store"/"store + aisle" mode, drop in a heading
            // row each time the group changes — items with no matched
            // product at all fall under a trailing "Unmatched" heading
            // rather than being hidden.
            const heading = groupHeading(sortMode, effectiveStore, effectiveAisleLabel)
            const showHeading = heading !== null && heading !== lastHeading
            if (heading !== null) lastHeading = heading

            return (
              <Fragment key={item.id}>
                {showHeading && (
                  <li className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {heading}
                  </li>
                )}
                <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
                  <label className="flex min-w-0 flex-1 basis-40 cursor-pointer items-center gap-3">
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
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Raw amount needed, to the left of the product
                        dropdown. Fixed-width and always rendered (even
                        empty) so this column lines up between rows
                        regardless of whether a given item has anything to
                        show in it. */}
                    <span className="w-20 shrink-0 text-xs text-slate-500">
                      {formatAmount(item) ?? ''}
                    </span>
                    <div className="w-64 max-w-full shrink-0">
                      {matches.length > 0 && (
                        <select
                          value={effectiveGroceryItemPriceId}
                          onChange={(e) => handleChangeGroceryItem(item.id, e.target.value)}
                          aria-label={`Choose which product to buy for ${item.name}`}
                          className={`w-full rounded-md border px-2 py-1 text-xs text-slate-700 focus:border-slate-500 focus:outline-none ${selectPriceClasses(matches, effectiveGroceryItemPriceId)}`}
                        >
                          {(() => {
                            const cheapest = cheapestEffectivePrice(matches)
                            return matches.map((option) => (
                              <option
                                key={option.id}
                                value={option.id}
                                style={{ backgroundColor: optionRowBackground(option, cheapest) }}
                              >
                                {option.promo_price ? '⭐ ' : ''}
                                {option.storeName} — {option.name}
                                {option.price ? ` — £${option.price}` : ''}
                                {option.promo_price ? ` (promo £${option.promo_price})` : ''}
                              </option>
                            ))
                          })()}
                        </select>
                      )}
                    </div>
                    {/* Packs needed of the matched product, to the right of
                        the dropdown. */}
                    <span className="w-10 shrink-0 text-base font-semibold text-slate-600">
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
            <div className="text-right text-sm">
              <p className="font-semibold text-slate-800">Total: £{totalCost.toFixed(2)}</p>
              <p className="text-slate-500">
                Without promos: £{totalCostWithoutPromo.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
