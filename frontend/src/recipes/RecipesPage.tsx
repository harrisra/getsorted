import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  type Recipe,
  type RecipeInput,
  createRecipe,
  deleteRecipe,
  deleteRecipeImage,
  fetchRecipes,
  updateRecipe,
  uploadRecipeImage,
} from '../api/client'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { useHouseholds } from '../households/HouseholdsContext'
import { PencilIcon } from '../icons'
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
  const { currentHousehold } = useHouseholds()
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
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

  const visibleRecipes = recipes?.filter((r) => r.household === householdId) ?? null

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleExportSelected() {
    if (!visibleRecipes) return
    const selected = visibleRecipes.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) return
    downloadRecipesAsJson(selected)
  }

  async function handleImportFiles(files: FileList) {
    setImportMessage(null)
    setImporting(true)
    try {
      const { recipes: toImport, fileErrors } = await parseImportFiles(files, householdId)

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

  return (
    <div className="mx-auto max-w-[58.8rem] space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Recipes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportSelected}
            disabled={selectedIds.size === 0}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Export selected ({selectedIds.size})
          </button>
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

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {visibleRecipes?.map((recipe) =>
          editingId === recipe.id ? (
            <li key={recipe.id} className="p-4">
              <RecipeForm
                householdId={householdId}
                submitLabel="Save"
                existingImageUrl={recipe.image}
                initialValue={{
                  name: recipe.name,
                  meal_type: recipe.meal_type,
                  servings: recipe.servings,
                  instructions: recipe.instructions,
                  source_url: recipe.source_url,
                  image_url: recipe.image_url,
                  ingredients: recipe.ingredients.map((ing) => ({
                    name: ing.name,
                    grams: ing.grams,
                    pieces: ing.pieces,
                    milliliters: ing.milliliters,
                    grocery_item: ing.grocery_item,
                  })),
                }}
                onCancel={() => setEditingId(null)}
                onSubmit={async (updated, imageFile) => {
                  await updateRecipe(recipe.id, updated)
                  if (imageFile) await uploadRecipeImage(recipe.id, imageFile)
                  setEditingId(null)
                  await refresh()
                }}
                onRemoveImage={async () => {
                  await deleteRecipeImage(recipe.id)
                  await refresh()
                }}
              />
            </li>
          ) : (
            <li key={recipe.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(recipe.id)}
                    onChange={() => toggleSelected(recipe.id)}
                    aria-label={`Select ${recipe.name} for export`}
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
                      {recipe.current_cost && (
                        <>
                          {' · '}
                          <span className="font-medium text-slate-700">
                            £{recipe.current_cost}
                          </span>
                          {pricedIngredientCount(recipe) < recipe.ingredients.length && (
                            <span className="text-slate-400">
                              {' '}
                              (based on {pricedIngredientCount(recipe)} of{' '}
                              {recipe.ingredients.length} ingredients)
                            </span>
                          )}
                        </>
                      )}
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
                  <ConfirmDeleteButton
                    label="Remove recipe"
                    onConfirm={() => handleDelete(recipe.id)}
                  />
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
