import type { Recipe, RecipeInput } from '../api/client'
import { RecipeForm } from './RecipeForm'

// A dedicated screen for editing one recipe, rather than expanding it
// inline within the list — with a long list, an inline edit form pushes
// everything below it out of view and makes it easy to lose track of which
// row is even being edited.
export function RecipeEditView({
  recipe,
  householdId,
  onCancel,
  onSubmit,
  onRemoveImage,
}: {
  recipe: Recipe
  householdId: string
  onCancel: () => void
  onSubmit: (recipe: RecipeInput, imageFile: File | null) => Promise<void>
  onRemoveImage: () => Promise<void>
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to recipes
      </button>
      <h1 className="text-xl font-semibold text-slate-800">Edit recipe</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
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
              store_options: ing.store_options.map((opt) => ({ grocery_item: opt.grocery_item })),
            })),
          }}
          onCancel={onCancel}
          onSubmit={onSubmit}
          onRemoveImage={onRemoveImage}
        />
      </div>
    </div>
  )
}
