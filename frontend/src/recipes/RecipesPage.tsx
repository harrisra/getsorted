import { useEffect, useState } from 'react'
import {
  type Recipe,
  type RecipeInput,
  createRecipe,
  deleteRecipe,
  deleteRecipeImage,
  fetchRecipes,
  updateRecipe,
  uploadRecipeImage,
} from '../api/client'
import { useHouseholds } from '../households/HouseholdsContext'
import { RecipeForm } from './RecipeForm'

const MEAL_TYPE_LABELS: Record<Recipe['meal_type'], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

function pricedIngredientCount(recipe: Recipe): number {
  return recipe.ingredients.filter((ing) => ing.grocery_item_detail?.price != null).length
}

export function RecipesPage() {
  const { currentHousehold } = useHouseholds()
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function refresh() {
    setRecipes(await fetchRecipes())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteRecipe(id)
      await refresh()
    } finally {
      setDeletingId(null)
    }
  }

  if (!currentHousehold) return null

  const visibleRecipes = recipes?.filter((r) => r.household === currentHousehold.id) ?? null

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Recipes</h1>
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

      {showAddForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <RecipeForm
            householdId={currentHousehold.id}
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
                householdId={currentHousehold.id}
                submitLabel="Save"
                existingImageUrl={recipe.image}
                initialValue={{
                  name: recipe.name,
                  meal_type: recipe.meal_type,
                  servings: recipe.servings,
                  instructions: recipe.instructions,
                  source_url: recipe.source_url,
                  ingredients: recipe.ingredients.map((ing) => ({
                    name: ing.name,
                    quantity: ing.quantity,
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
                    className="text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(recipe.id)}
                    disabled={deletingId === recipe.id}
                    className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {deletingId === recipe.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
              {recipe.ingredients.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                  {recipe.ingredients.map((ing) => (
                    <li key={ing.id}>
                      {[ing.quantity, ing.name].filter(Boolean).join(' ')}
                      {ing.grocery_item_detail && (
                        <span className="text-slate-400">
                          {' '}
                          — linked to {ing.grocery_item_detail.store} {ing.grocery_item_detail.name}
                          {ing.grocery_item_detail.price && ` (£${ing.grocery_item_detail.price})`}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
