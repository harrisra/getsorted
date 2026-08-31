import { useEffect, useRef, useState } from 'react'
import type { GroceryItem } from '../api/client'

function formatSize(item: GroceryItem): string {
  return [
    item.grams != null ? `${item.grams}g` : null,
    item.pieces != null ? `${item.pieces}pc` : null,
    item.milliliters != null ? `${item.milliliters}ml` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function label(item: GroceryItem): string {
  const size = formatSize(item)
  return `${item.store_detail.name} — ${item.name}${size ? ` (${size})` : ''}`
}

export function GroceryItemCombobox({
  items,
  value,
  onChange,
}: {
  items: GroceryItem[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = items.find((item) => item.id === value) ?? null

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const trimmed = query.trim().toLowerCase()
  const matches = (
    trimmed === ''
      ? items
      : items.filter((item) =>
          `${item.store_detail.name} ${item.brand} ${item.name}`.toLowerCase().includes(trimmed),
        )
  ).slice(0, 8)

  function selectItem(item: GroceryItem | null) {
    onChange(item?.id ?? null)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative min-w-[10rem] flex-[2]">
      <input
        type="text"
        placeholder="Search grocery items…"
        value={open ? query : (selected ? label(selected) : '')}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
      />
      {selected && !open && (
        <button
          type="button"
          onClick={() => selectItem(null)}
          title="Unlink"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
        >
          ✕
        </button>
      )}
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          <li>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectItem(null)}
              className="block w-full px-3 py-1.5 text-left text-slate-400 hover:bg-slate-100"
            >
              Not linked
            </button>
          </li>
          {matches.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectItem(item)}
                className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
              >
                {label(item)}
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-1.5 text-slate-400">No matches</li>
          )}
        </ul>
      )}
    </div>
  )
}
