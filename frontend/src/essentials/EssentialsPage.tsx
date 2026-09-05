import { useEffect, useState } from 'react'
import {
  type Essentials,
  type EssentialsInput,
  createEssentials,
  deleteEssentials,
  fetchEssentials,
  updateEssentials,
} from '../api/client'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { useHouseholds } from '../households/HouseholdsContext'
import { EssentialsEditView } from './EssentialsEditView'
import { EssentialsForm } from './EssentialsForm'

// The household's recurring, non-meal grocery groupings — e.g. "Soft
// drinks", "Snacks", "Toiletries": the regular weekly buys that aren't tied
// to any particular recipe. Mirrors RecipesPage's layout/interactions
// (click a row to edit, select-all/delete-selected row once something's
// selected) minus the meal-specific bits Recipes has that don't apply here
// (meal type/servings/instructions/photo, import/export).
export function EssentialsPage() {
  const { currentHousehold } = useHouseholds()
  const [essentials, setEssentials] = useState<Essentials[] | null>(null)
  const [textFilter, setTextFilter] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null)

  async function refresh() {
    setEssentials(await fetchEssentials())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDelete(id: string) {
    await deleteEssentials(id)
    await refresh()
  }

  if (!currentHousehold) return null
  const householdId = currentHousehold.id

  const visibleEssentials = essentials?.filter((e) => e.household === householdId) ?? null
  const editingEssentials = editingId
    ? (visibleEssentials?.find((e) => e.id === editingId) ?? null)
    : null
  const trimmedTextFilter = textFilter.trim().toLowerCase()
  const filteredEssentials =
    visibleEssentials?.filter((e) => {
      if (!trimmedTextFilter) return true
      const haystack = [e.name, ...e.items.map((item) => item.name)].join(' ').toLowerCase()
      return haystack.includes(trimmedTextFilter)
    }) ?? null
  const allSelected =
    !!filteredEssentials &&
    filteredEssentials.length > 0 &&
    filteredEssentials.every((e) => selectedIds.has(e.id))

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (!filteredEssentials) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const e of filteredEssentials) {
        if (allSelected) next.delete(e.id)
        else next.add(e.id)
      }
      return next
    })
  }

  async function handleDeleteSelected() {
    if (!visibleEssentials) return
    setDeleteMessage(null)
    const targets = visibleEssentials.filter((e) => selectedIds.has(e.id))
    if (targets.length === 0) return

    const results = await Promise.allSettled(targets.map((e) => deleteEssentials(e.id)))
    const failed = targets.filter((_, i) => results[i].status === 'rejected')

    // Deselect whatever actually got deleted; leave any failures selected
    // so it's obvious what still needs another try.
    setSelectedIds(new Set(failed.map((e) => e.id)))
    await refresh()

    if (failed.length > 0) {
      setDeleteMessage(
        `Deleted ${targets.length - failed.length} of ${targets.length} group(s) — ${failed.length} failed and are still selected.`,
      )
    }
  }

  if (editingEssentials) {
    return (
      <div className="mx-auto max-w-[58.8rem] p-4 sm:p-8">
        <EssentialsEditView
          essentials={editingEssentials}
          householdId={householdId}
          onCancel={() => setEditingId(null)}
          onSubmit={async (updated) => {
            await updateEssentials(editingEssentials.id, updated)
            setEditingId(null)
            await refresh()
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[58.8rem] space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Essentials</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Search name, items…"
            aria-label="Filter by text"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
          />
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              New
            </button>
          )}
        </div>
      </div>

      {deleteMessage && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteMessage}</p>
      )}

      {showAddForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <EssentialsForm
            householdId={householdId}
            submitLabel="Add essentials"
            onCancel={() => setShowAddForm(false)}
            onSubmit={async (essentials: EssentialsInput) => {
              await createEssentials(essentials)
              setShowAddForm(false)
              await refresh()
            }}
          />
        </div>
      )}

      {visibleEssentials === null && <p className="text-sm text-slate-400">Loading…</p>}
      {visibleEssentials !== null && visibleEssentials.length === 0 && (
        <p className="text-sm text-slate-500">
          No essentials groups yet — e.g. "Soft drinks", "Snacks", "Toiletries": the household's
          regular weekly buys, addable to a shopping list on demand rather than tied to a recipe.
        </p>
      )}
      {visibleEssentials !== null &&
        visibleEssentials.length > 0 &&
        filteredEssentials?.length === 0 && (
          <p className="text-sm text-slate-500">No essentials match your filter.</p>
        )}

      {/* Only worth showing once something's actually selected — see the
          same pattern on RecipesPage/GroceryItemsPage. */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <ConfirmDeleteButton
            label="Delete selected essentials"
            confirmMessage={`Delete ${selectedIds.size} group(s)?`}
            onConfirm={handleDeleteSelected}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete selected ({selectedIds.size})
          </ConfirmDeleteButton>
        </div>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {filteredEssentials?.map((group) => (
          <li
            key={group.id}
            onClick={() => setEditingId(group.id)}
            title="Click to edit"
            className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
          >
            <div className="flex min-w-0 items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.has(group.id)}
                onChange={() => toggleSelected(group.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${group.name}`}
                className="h-4 w-4 shrink-0 rounded border-slate-300"
              />
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{group.name}</p>
                <p className="text-sm text-slate-500">
                  {group.items.length} item{group.items.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <div className="w-28 shrink-0 text-right">
                {group.current_cost && (
                  <p className="text-2xl font-semibold text-slate-800">£{group.current_cost}</p>
                )}
              </div>
              {/* stopPropagation — deleting shouldn't also open the edit
                  view the row's own click already opens. */}
              <div onClick={(e) => e.stopPropagation()} className="flex shrink-0 gap-3">
                <ConfirmDeleteButton
                  label="Remove essentials group"
                  onConfirm={() => handleDelete(group.id)}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
