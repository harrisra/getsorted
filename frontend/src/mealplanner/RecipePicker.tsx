import { useEffect, useRef, useState } from 'react'
import type { Recipe } from '../api/client'

export function RecipePicker({
  recipes,
  onSelect,
}: {
  recipes: Recipe[]
  onSelect: (recipe: Recipe) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
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

  const trimmed = query.trim().toLowerCase()
  const matches = (
    trimmed === '' ? recipes : recipes.filter((r) => r.name.toLowerCase().includes(trimmed))
  ).slice(0, 8)

  function select(recipe: Recipe) {
    onSelect(recipe)
    setQuery('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded border border-dashed border-slate-300 py-1 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600"
      >
        + Add
      </button>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        autoFocus
        type="text"
        placeholder="Search recipes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
      />
      <ul className="absolute z-10 mt-1 max-h-40 w-40 overflow-auto rounded-md border border-slate-200 bg-white text-xs shadow-lg">
        {matches.map((recipe) => (
          <li key={recipe.id}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(recipe)}
              className="block w-full truncate px-2 py-1 text-left hover:bg-slate-100"
            >
              {recipe.name}
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="px-2 py-1 text-slate-400">No matches</li>}
      </ul>
    </div>
  )
}
