import { useEffect, useRef, useState } from 'react'
import type { GroceryItemStorePriceOption } from '../api/client'

function formatSize(option: GroceryItemStorePriceOption): string {
  return [
    option.grams != null ? `${option.grams}g` : null,
    option.pieces != null ? `${option.pieces}pc` : null,
    option.milliliters != null ? `${option.milliliters}ml` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function label(option: GroceryItemStorePriceOption): string {
  const size = formatSize(option)
  return `${option.storeName} — ${option.name}${size ? ` (${size})` : ''}`
}

export function GroceryItemCombobox({
  options,
  value,
  onChange,
  allowClear = true,
  placeholder = 'Search grocery items…',
}: {
  options: GroceryItemStorePriceOption[]
  value: string | null
  onChange: (id: string | null) => void
  /** Show the "Not linked" option and ✕ unlink button — set false when this
   * combobox always adds a new selection rather than replacing one. */
  allowClear?: boolean
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find((option) => option.id === value) ?? null

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
      ? options
      : options.filter((option) =>
          `${option.storeName} ${option.brand} ${option.name}`.toLowerCase().includes(trimmed),
        )
  ).slice(0, 8)

  function selectOption(option: GroceryItemStorePriceOption | null) {
    onChange(option?.id ?? null)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative min-w-[10rem] flex-[2]">
      <input
        type="text"
        placeholder={placeholder}
        value={open ? query : (selected ? label(selected) : '')}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
      />
      {allowClear && selected && !open && (
        <button
          type="button"
          onClick={() => selectOption(null)}
          title="Unlink"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
        >
          ✕
        </button>
      )}
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          {allowClear && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(null)}
                className="block w-full px-3 py-1.5 text-left text-slate-400 hover:bg-slate-100"
              >
                Not linked
              </button>
            </li>
          )}
          {matches.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(option)}
                className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
              >
                {label(option)}
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
