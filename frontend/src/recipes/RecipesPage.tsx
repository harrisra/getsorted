import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  type Recipe,
  type RecipeInput,
  createRecipe,
  deleteRecipe,
  deleteRecipeImage,
  fetchGroceryItems,
  fetchRecipes,
  updateRecipe,
  uploadRecipeImage,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { useHouseholds } from '../households/HouseholdsContext'
import { PencilIcon } from '../icons'
import { RecipeEditView } from './RecipeEditView'
import { RecipeForm } from './RecipeForm'
import { downloadRecipesAsJson, parseImportFiles } from './recipeExport'

const MEAL_TYPE_LABELS: Record<Recipe['meal_type'], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

function pricedIngredientCount(recipe: Recipe): number {
  return recipe.ingredients.filter((ing) => ing.line_cost != null).length
}

export function RecipesPage() {
  const { user } = useAuth()
  const { currentHousehold } = useHouseholds()
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [mealTypeFilter, setMealTypeFilter] = useState<Recipe['meal_type'] | ''>('')
  const [textFilter, setTextFilter] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setRecipes(await fetchRecipes())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDelete(id: string) {
    await deleteRecipe(id)
    await refresh()
  }

  if (!currentHousehold) return null
  const householdId = currentHousehold.id
  // Only the recipe's creator or a household owner can delete it — every
  // recipe shown here belongs to currentHousehold, so its role applies to
  // all of them.
  const canDelete = (recipe: Recipe) =>
    recipe.created_by === user?.pk || currentHousehold.role === 'owner'

  const visibleRecipes = recipes?.filter((r) => r.household === householdId) ?? null
  const editingRecipe = editingId ? (visibleRecipes?.find((r) => r.id === editingId) ?? null) : null
  const trimmedTextFilter = textFilter.trim().toLowerCase()
  const filteredRecipes =
    visibleRecipes?.filter((r) => {
      if (mealTypeFilter && r.meal_type !== mealTypeFilter) return false
      if (trimmedTextFilter) {
        const haystack = [r.name, ...r.ingredients.map((ing) => ing.name)].join(' ').toLowerCase()
        if (!haystack.includes(trimmedTextFilter)) return false
      }
      return true
    }) ?? null
  const allSelected =
    !!filteredRecipes && filteredRecipes.length > 0 && filteredRecipes.every((r) => selectedIds.has(r.id))

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (!filteredRecipes) return
    // Only toggle the currently-visible (filtered) recipes, so this can't
    // wipe out a selection made under a different meal-type filter.
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of filteredRecipes) {
        if (allSelected) next.delete(r.id)
        else next.add(r.id)
      }
      return next
    })
  }

  function handleExportSelected() {
    // Deliberately the full (unfiltered) list — a selection made before
    // switching the meal-type filter should still be exportable, not
    // silently dropped because it's no longer visible.
    if (!visibleRecipes) return
    const selected = visibleRecipes.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) return
    downloadRecipesAsJson(selected)
  }

  async function handleDeleteSelected() {
    if (!visibleRecipes) return
    setDeleteMessage(null)
    const targets = visibleRecipes.filter((r) => selectedIds.has(r.id))
    if (targets.length === 0) return

    const results = await Promise.allSettled(targets.map((r) => deleteRecipe(r.id)))
    const failed = targets.filter((_, i) => results[i].status === 'rejected')

    // Deselect whatever actually got deleted; leave any failures selected
    // so it's obvious what still needs another try.
    setSelectedIds(new Set(failed.map((r) => r.id)))
    await refresh()

    if (failed.length > 0) {
      setDeleteMessage(
        `Deleted ${targets.length - failed.length} of ${targets.length} recipe(s) — ${failed.length} failed and are still selected.`,
      )
    }
  }

  async function handleImportFiles(files: FileList) {
    setImportMessage(null)
    setImporting(true)
    try {
      const groceryItems = await fetchGroceryItems()
      const { recipes: toImport, fileErrors } = await parseImportFiles(files, householdId, groceryItems)

      let succeeded = 0
      const importErrors: string[] = []
      for (const recipe of toImport) {
        try {
          await createRecipe(recipe)
          succeeded++
        } catch (err) {
          const detail =
            err instanceof ApiError
              ? Object.values(err.fieldErrors).flat().join(' ')
              : 'Something went wrong.'
          importErrors.push(`${recipe.name}: ${detail}`)
        }
      }

      await refresh()

      const parts = [`Imported ${succeeded} of ${toImport.length} recipe(s).`]
      if (fileErrors.length > 0) parts.push(...fileErrors)
      if (importErrors.length > 0) parts.push(...importErrors)
      setImportMessage(parts.join(' '))
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (editingRecipe) {
    return (
      <div className="mx-auto max-w-[58.8rem] p-4 sm:p-8">
        <RecipeEditView
          recipe={editingRecipe}
          householdId={householdId}
          onCancel={() => setEditingId(null)}
          onSubmit={async (updated, imageFile) => {
            await updateRecipe(editingRecipe.id, updated)
            if (imageFile) await uploadRecipeImage(editingRecipe.id, imageFile)
            setEditingId(null)
            await refresh()
          }}
          onRemoveImage={async () => {
            await deleteRecipeImage(editingRecipe.id)
            await refresh()
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[58.8rem] space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Recipes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Search name, ingredients…"
            aria-label="Filter by text"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
          />
          <select
            value={mealTypeFilter}
            onChange={(e) => setMealTypeFilter(e.target.value as Recipe['meal_type'] | '')}
            aria-label="Filter by meal type"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
          >
            <option value="">All meal types</option>
            {(Object.keys(MEAL_TYPE_LABELS) as Recipe['meal_type'][]).map((mealType) => (
              <option key={mealType} value={mealType}>
                {MEAL_TYPE_LABELS[mealType]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExportSelected}
            disabled={selectedIds.size === 0}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Export selected ({selectedIds.size})
          </button>
          <ConfirmDeleteButton
            label="Delete selected recipes"
            confirmMessage={`Delete ${selectedIds.size} recipe(s)?`}
            disabled={selectedIds.size === 0}
            onConfirm={handleDeleteSelected}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete selected ({selectedIds.size})
          </ConfirmDeleteButton>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleImportFiles(e.target.files)
              }
            }}
          />
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Add recipe
            </button>
          )}
        </div>
      </div>

      {importMessage && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {importMessage}
        </p>
      )}

      {deleteMessage && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteMessage}</p>
      )}

      {showAddForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <RecipeForm
            householdId={householdId}
            submitLabel="Add recipe"
            onCancel={() => setShowAddForm(false)}
            onSubmit={async (recipe: RecipeInput, imageFile: File | null) => {
              const saved = await createRecipe(recipe)
              if (imageFile) await uploadRecipeImage(saved.id, imageFile)
              setShowAddForm(false)
              await refresh()
            }}
          />
        </div>
      )}

      {visibleRecipes === null && <p className="text-sm text-slate-400">Loading…</p>}
      {visibleRecipes !== null && visibleRecipes.length === 0 && (
        <p className="text-sm text-slate-500">No recipes yet.</p>
      )}
      {visibleRecipes !== null && visibleRecipes.length > 0 && filteredRecipes?.length === 0 && (
        <p className="text-sm text-slate-500">No recipes match your filters.</p>
      )}

      {filteredRecipes !== null && filteredRecipes.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label="Select all recipes"
            className="h-4 w-4 shrink-0 rounded border-slate-300"
          />
          Select all
        </label>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {filteredRecipes?.map((recipe) => (
          <li key={recipe.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(recipe.id)}
                  onChange={() => toggleSelected(recipe.id)}
                  aria-label={`Select ${recipe.name}`}
                  className="h-4 w-4 shrink-0 rounded border-slate-300"
                />
                {recipe.image && (
                  <img
                    src={recipe.image}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded border border-slate-200 object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{recipe.name}</p>
                  <p className="text-sm text-slate-500">
                    {MEAL_TYPE_LABELS[recipe.meal_type]} · Feeds {recipe.servings}
                    {recipe.source_url && (
                      <>
                        {' · '}
                        <a
                          href={recipe.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Recipe link
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </div>
              {/* Cost column + edit/delete buttons grouped together so
                  "justify-between" on the row only splits it into two
                  parts (info on the left, this group flush right) — with
                  three separate flex children it would spread the cost
                  column out to sit between them instead. */}
              <div className="flex shrink-0 items-center gap-4">
                {/* Total cost column, right-aligned in a large font,
                    immediately before the edit/delete buttons. */}
                <div className="w-28 shrink-0 text-right">
                  {recipe.current_cost && (
                    <>
                      <p className="text-2xl font-semibold text-slate-800">£{recipe.current_cost}</p>
                      {pricedIngredientCount(recipe) < recipe.ingredients.length && (
                        <p className="text-xs text-slate-400">
                          {pricedIngredientCount(recipe)} of {recipe.ingredients.length} priced
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(recipe.id)}
                    title="Edit"
                    aria-label="Edit"
                    className="text-slate-500 hover:text-slate-900"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  {canDelete(recipe) && (
                    <ConfirmDeleteButton
                      label="Remove recipe"
                      onConfirm={() => handleDelete(recipe.id)}
                    />
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
