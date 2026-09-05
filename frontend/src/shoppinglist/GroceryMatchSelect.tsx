import { useEffect, useRef, useState } from 'react'
import type { GroceryItemStorePriceOption } from '../api/client'

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
function cheapestEffectivePrice(options: GroceryItemStorePriceOption[]): number | null {
  const priced = options.map(effectivePrice).filter((price): price is number => price != null)
  return priced.length >= 2 ? Math.min(...priced) : null
}

// The item's own pack size, e.g. "550g", "6pc", "500ml" — the "quantity"
// column, distinct from the shopping-list row's own amount needed shown
// elsewhere.
function formatSize(option: GroceryItemStorePriceOption): string {
  return [
    option.grams != null ? `${option.grams}g` : null,
    option.pieces != null ? `${option.pieces}pc` : null,
    option.milliliters != null ? `${option.milliliters}ml` : null,
  ]
    .filter((part): part is string => part != null)
    .join(' ')
}

// Pale green when this option is (tied for) cheapest, pale red when a
// cheaper one exists, neutral (no class) when there's nothing to compare —
// a single priced option, or none at all.
function rowBackgroundClass(option: GroceryItemStorePriceOption, cheapest: number | null): string {
  if (cheapest == null) return ''
  const price = effectivePrice(option)
  if (price == null) return ''
  return price <= cheapest ? 'bg-green-50' : 'bg-red-50'
}

function triggerBorderClasses(option: GroceryItemStorePriceOption | null, cheapest: number | null): string {
  if (!option || cheapest == null) return 'border-slate-300'
  const price = effectivePrice(option)
  if (price == null) return 'border-slate-300'
  return price <= cheapest ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
}

// Column widths shared between every option row (and the star/store/name/
// quantity/price order the caller asked for) so they actually line up
// underneath one another.
const GRID_COLS = 'grid-cols-[1rem_5rem_minmax(6rem,1fr)_3.5rem_4rem]'

// Which product+store to buy a shopping-list item as, styled as columns
// (promo star, store, name, quantity, price) that line up across rows — a
// native <select>'s <option> elements only support a plain background/text
// color, nothing layout-related, so getting real column alignment meant
// building this instead of styling a real <select>. Built the same way
// GroceryItemCombobox is: an absolutely positioned panel, closed on an
// outside click.
export function GroceryMatchSelect({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: GroceryItemStorePriceOption[]
  value: string
  onChange: (id: string) => void
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const cheapest = cheapestEffectivePrice(options)
  const selected = options.find((option) => option.id === value) ?? null

  return (
    <div ref={containerRef} className="relative w-full text-xs">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full truncate rounded-md border px-2 py-1 text-left text-slate-700 focus:border-slate-500 focus:outline-none ${triggerBorderClasses(selected, cheapest)}`}
      >
        {selected ? (
          <>
            {selected.promo_price ? '⭐ ' : ''}
            {selected.storeName} — {selected.name}
            {effectivePrice(selected) != null ? ` — £${selected.promo_price ?? selected.price}` : ''}
          </>
        ) : (
          '—'
        )}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-max max-w-[28rem] overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
        >
          {options.map((option) => (
            <li key={option.id} role="option" aria-selected={option.id === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(option.id)
                  setOpen(false)
                }}
                title={option.promo_price ? 'Currently a promo/loyalty-card price' : undefined}
                className={`grid w-full ${GRID_COLS} items-center gap-x-2 px-2 py-1 text-left hover:bg-slate-100 ${rowBackgroundClass(option, cheapest)}`}
              >
                <span className="text-amber-500">{option.promo_price ? '⭐' : ''}</span>
                <span className="min-w-0 truncate font-medium text-slate-600">{option.storeName}</span>
                <span className="min-w-0 truncate">{option.name}</span>
                <span className="min-w-0 truncate text-right text-slate-500">{formatSize(option)}</span>
                <span className="text-right font-medium">
                  {effectivePrice(option) != null ? `£${option.promo_price ?? option.price}` : '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
