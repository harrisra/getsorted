import type { GroceryItem } from './api/client'
import { GroceryItemCombobox } from './recipes/GroceryItemCombobox'
import { TrashIcon } from './icons'

// Anything shaped like a recipe ingredient or an Essentials item: a name, an
// amount needed in one (or more) of grams/pieces/milliliters, and zero or
// more catalog product matches. Shared by RecipeForm and EssentialsForm —
// both edit exactly this shape, just attached to a different parent.
export interface QuantifiedItem {
  name: string
  grams: number | null
  pieces: number | null
  milliliters: number | null
  grocery_matches: { grocery_item: string }[]
}

interface StoreCostPreview {
  store: string
  storeName: string
  lineCost: number | null
  isPromo: boolean
}

// How many of this item's own pack the row's amount needed comes to — e.g.
// 0.5 for a row needing 250g of a 500g pack, 2 for one needing 1000g of it.
// null if the item and row share no unit to compare (grams/milliliters/
// pieces) at all.
export function matchRatio(item: GroceryItem, row: QuantifiedItem): number | null {
  for (const dimension of ['grams', 'milliliters', 'pieces'] as const) {
    const itemAmount = item[dimension]
    const rowAmount = row[dimension]
    if (itemAmount && rowAmount != null) {
      return rowAmount / itemAmount
    }
  }
  return null
}

// Mirrors the backend's *GroceryItemSerializer.get_store_costs exactly, so
// a just-added match shows its cost breakdown immediately rather than only
// after saving: every store the matched product is currently priced at,
// scaled by whichever unit (grams/milliliters/pieces) both the row and the
// item share, using each store's promo price when it has one (same as
// GroceryItemPrice.effective_price on the backend).
function storeCostPreviews(item: GroceryItem, row: QuantifiedItem): StoreCostPreview[] {
  const ratio = matchRatio(item, row)
  return item.store_prices.map((sp) => {
    const effectivePrice = sp.promo_price ?? sp.price
    return {
      store: sp.store,
      storeName: sp.store_detail.name,
      lineCost:
        ratio != null && effectivePrice != null ? Math.round(Number(effectivePrice) * ratio * 100) / 100 : null,
      isPromo: sp.promo_price != null,
    }
  })
}

// For every named row, adds a match for whichever grocery item(s) whose
// name contains the row's name (case-insensitive) are the closest-sized
// fit, one per store — see the "Auto-match grocery items" button below.
//
// Name alone can match several pack sizes of the same product (a 200g and
// a 500g pack, say); rather than adding all of them and leaving it unclear
// which is really "the" price at a store both happen to be sold at, this
// picks, for each store any candidate is priced at, only the candidate
// whose grams/pieces/milliliters is closest to what the row needs. A
// candidate with no store prices at all can still be the only thing found
// for a row, so the single closest-sized one of those is kept too. Only
// adds matches, never removes any already made by hand.
export function autoMatchByName<T extends QuantifiedItem>(rows: T[], groceryItems: GroceryItem[]): T[] {
  return rows.map((row) => {
    const needle = row.name.trim().toLowerCase()
    if (!needle) return row

    let dimension: 'grams' | 'milliliters' | 'pieces' | null = null
    let rowAmount: number | null = null
    for (const d of ['grams', 'milliliters', 'pieces'] as const) {
      if (row[d] != null) {
        dimension = d
        rowAmount = row[d]
        break
      }
    }
    if (dimension === null || rowAmount === null) return row

    const matchedIds = new Set(row.grocery_matches.map((match) => match.grocery_item))
    const candidates = groceryItems.filter(
      (item) =>
        !matchedIds.has(item.id) &&
        item.name.toLowerCase().includes(needle) &&
        item[dimension as 'grams' | 'milliliters' | 'pieces'] != null,
    )
    if (candidates.length === 0) return row

    const sizeDiff = (item: GroceryItem) =>
      Math.abs(item[dimension as 'grams' | 'milliliters' | 'pieces']! - (rowAmount as number))

    const found = new Map<string, GroceryItem>()
    const bestPerStore = new Map<string, { item: GroceryItem; diff: number }>()
    for (const item of candidates) {
      const diff = sizeDiff(item)
      for (const storePrice of item.store_prices) {
        const current = bestPerStore.get(storePrice.store)
        if (!current || diff < current.diff) {
          bestPerStore.set(storePrice.store, { item, diff })
        }
      }
    }
    for (const { item } of bestPerStore.values()) found.set(item.id, item)

    const unpriced = candidates.filter((item) => item.store_prices.length === 0)
    if (unpriced.length > 0) {
      const closestUnpriced = unpriced.reduce((best, item) =>
        sizeDiff(item) < sizeDiff(best) ? item : best,
      )
      found.set(closestUnpriced.id, closestUnpriced)
    }

    if (found.size === 0) return row
    return {
      ...row,
      grocery_matches: [
        ...row.grocery_matches,
        ...Array.from(found.values()).map((item) => ({ grocery_item: item.id })),
      ],
    }
  })
}

// The full "Ingredients"/"Items" editing section shared by RecipeForm and
// EssentialsForm: a title + auto-match button, then one row per item (name/
// grams/pieces/milliliters + remove), each with its own grocery-match list
// (cost preview per store, promo highlight, pack-size-mismatch flag) and an
// "add a match" combobox, then an "add row" button.
export function ItemGroceryMatchesEditor<T extends QuantifiedItem>({
  title,
  itemNamePlaceholder,
  addButtonLabel,
  items,
  onChange,
  groceryItems,
}: {
  title: string
  itemNamePlaceholder: string
  addButtonLabel: string
  items: T[]
  onChange: (items: T[]) => void
  groceryItems: GroceryItem[]
}) {
  function update(index: number, patch: Partial<T>) {
    onChange(items.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function addRow() {
    const row: QuantifiedItem = { name: '', grams: null, pieces: null, milliliters: null, grocery_matches: [] }
    onChange([...items, row as unknown as T])
  }

  function addGroceryMatch(index: number, groceryItemId: string) {
    const row = items[index]
    update(index, { grocery_matches: [...row.grocery_matches, { grocery_item: groceryItemId }] } as Partial<T>)
  }

  function removeGroceryMatch(index: number, groceryItemId: string) {
    const row = items[index]
    update(index, {
      grocery_matches: row.grocery_matches.filter((match) => match.grocery_item !== groceryItemId),
    } as Partial<T>)
  }

  // Products this row isn't already matched to, so the "add a match"
  // combobox doesn't offer the same product twice.
  function availableGroceryItems(row: T) {
    const matchedIds = new Set(row.grocery_matches.map((match) => match.grocery_item))
    return groceryItems.filter((item) => !matchedIds.has(item.id))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <button
          type="button"
          onClick={() => onChange(autoMatchByName(items, groceryItems))}
          title="Match each row to whichever product(s) with a matching name are the closest size, one per store"
          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Auto-match grocery items
        </button>
      </div>
      <div className="space-y-2">
        {items.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-3 rounded-md border border-slate-100 p-2 lg:grid-cols-2"
          >
            {/* Left: this row's own details. Right: what it's matched to —
                split into two columns (rather than the matches stacked
                below, indented) so a row's details and its matches line up
                side by side instead of one on top of the other. */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder={itemNamePlaceholder}
                value={row.name}
                onChange={(e) => update(index, { name: e.target.value } as Partial<T>)}
                className="min-w-[8rem] flex-[2] rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
              <input
                type="number"
                min={0}
                placeholder="Grams"
                value={row.grams ?? ''}
                onChange={(e) =>
                  update(index, { grams: e.target.value === '' ? null : Number(e.target.value) } as Partial<T>)
                }
                className="w-20 min-w-[5rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
              <input
                type="number"
                min={0}
                placeholder="Pieces"
                value={row.pieces ?? ''}
                onChange={(e) =>
                  update(index, { pieces: e.target.value === '' ? null : Number(e.target.value) } as Partial<T>)
                }
                className="w-20 min-w-[5rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
              <input
                type="number"
                min={0}
                placeholder="ml"
                value={row.milliliters ?? ''}
                onChange={(e) =>
                  update(index, {
                    milliliters: e.target.value === '' ? null : Number(e.target.value),
                  } as Partial<T>)
                }
                className="w-20 min-w-[5rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => remove(index)}
                title="Remove"
                aria-label="Remove"
                className="shrink-0 text-red-500 hover:text-red-700"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1 lg:border-l lg:border-slate-100 lg:pl-4">
              <span className="text-xs font-medium text-slate-500">Grocery matches</span>
              {row.grocery_matches.map((match) => {
                const item = groceryItems.find((gi) => gi.id === match.grocery_item)
                const costs = item ? storeCostPreviews(item, row) : []
                const ratio = item ? matchRatio(item, row) : null
                // Flagged whenever this product's own pack size doesn't
                // land on exactly one pack for the amount needed — either
                // more than one pack required, or less than a whole pack
                // (leftover) — so it's obvious at a glance which matches
                // don't cleanly cover the row. A small tolerance avoids
                // flagging harmless floating-point noise around 1.
                const ratioMismatch = ratio != null && Math.abs(ratio - 1) > 0.01
                return (
                  <div key={match.grocery_item} className="space-y-0.5 rounded-md bg-slate-50 px-2 py-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="min-w-0 truncate font-medium text-slate-700">
                          {item ? item.name : 'Unknown item'}
                        </span>
                        {ratioMismatch && (
                          <span
                            title="This product's pack size doesn't come to exactly one pack for the amount needed"
                            className="shrink-0 font-semibold text-red-600"
                          >
                            ×{Math.round(ratio! * 100) / 100}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeGroceryMatch(index, match.grocery_item)}
                        title="Remove match"
                        aria-label="Remove match"
                        className="shrink-0 text-slate-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                    {item && (
                      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
                        {costs.length === 0 && <li>No store prices yet</li>}
                        {costs.map((cost) => (
                          <li
                            key={cost.store}
                            title={cost.isPromo ? 'Currently a promo/loyalty-card price' : undefined}
                            className={cost.isPromo ? 'rounded bg-amber-100 px-1' : undefined}
                          >
                            {cost.storeName}: {cost.lineCost != null ? `£${cost.lineCost.toFixed(2)}` : '—'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
              <GroceryItemCombobox
                items={availableGroceryItems(row)}
                value={null}
                onChange={(id) => {
                  if (id) addGroceryMatch(index, id)
                }}
                allowClear={false}
                placeholder="+ Add a grocery match…"
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        {addButtonLabel}
      </button>
    </div>
  )
}
