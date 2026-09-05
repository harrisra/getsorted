import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  type GroceryItem,
  type MealType,
  type RecipeIngredientInput,
  type RecipeInput,
  fetchGroceryItems,
} from '../api/client'
import { TrashIcon } from '../icons'
import { GroceryItemCombobox } from './GroceryItemCombobox'

type RecipeFormValues = Omit<RecipeInput, 'household'>
type IngredientQuantity = Pick<RecipeIngredientInput, 'grams' | 'pieces' | 'milliliters'>

interface StoreCostPreview {
  store: string
  storeName: string
  lineCost: number | null
}

// Mirrors the backend's RecipeIngredientGroceryItemSerializer.get_store_costs
// exactly, so a just-added match shows its cost breakdown immediately
// rather than only after saving: every store the matched product is
// currently priced at, scaled by whichever unit (grams/milliliters/pieces)
// both the ingredient and the item share.
function storeCostPreviews(item: GroceryItem, ingredient: IngredientQuantity): StoreCostPreview[] {
  let ratio: number | null = null
  for (const dimension of ['grams', 'milliliters', 'pieces'] as const) {
    const itemAmount = item[dimension]
    const ingredientAmount = ingredient[dimension]
    if (itemAmount && ingredientAmount != null) {
      ratio = ingredientAmount / itemAmount
      break
    }
  }
  return item.store_prices.map((sp) => ({
    store: sp.store,
    storeName: sp.store_detail.name,
    lineCost: ratio != null && sp.price != null ? Math.round(Number(sp.price) * ratio * 100) / 100 : null,
  }))
}

const EMPTY: RecipeFormValues = {
  name: '',
  meal_type: 'dinner',
  servings: 4,
  instructions: '',
  source_url: '',
  image_url: '',
  ingredients: [],
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
]

export function RecipeForm({
  householdId,
  initialValue,
  existingImageUrl,
  submitLabel,
  onSubmit,
  onRemoveImage,
  onCancel,
}: {
  householdId: string
  initialValue?: RecipeFormValues
  existingImageUrl?: string | null
  submitLabel: string
  onSubmit: (recipe: RecipeInput, imageFile: File | null) => Promise<void>
  onRemoveImage?: () => Promise<void>
  onCancel?: () => void
}) {
  const [values, setValues] = useState<RecipeFormValues>(initialValue ?? EMPTY)
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [removingImage, setRemovingImage] = useState(false)
  // Only trust the typed image_url for the preview once it's actually been
  // edited this session — until then, existingImageUrl (the server's
  // computed effective image) is the more accurate preview, since it already
  // reflects "an uploaded photo wins over image_url" even when a stored-but-
  // shadowed image_url happens to be prefilled here too.
  const [imageUrlEdited, setImageUrlEdited] = useState(false)

  useEffect(() => {
    fetchGroceryItems().then(setGroceryItems)
  }, [])

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  function set<K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function addIngredient() {
    set('ingredients', [
      ...values.ingredients,
      { name: '', grams: null, pieces: null, milliliters: null, grocery_matches: [] },
    ])
  }

  function updateIngredient(index: number, patch: Partial<RecipeIngredientInput>) {
    set(
      'ingredients',
      values.ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)),
    )
  }

  function removeIngredient(index: number) {
    set(
      'ingredients',
      values.ingredients.filter((_, i) => i !== index),
    )
  }

  function addGroceryMatch(index: number, groceryItemId: string) {
    const ingredient = values.ingredients[index]
    updateIngredient(index, {
      grocery_matches: [...ingredient.grocery_matches, { grocery_item: groceryItemId }],
    })
  }

  function removeGroceryMatch(index: number, groceryItemId: string) {
    const ingredient = values.ingredients[index]
    updateIngredient(index, {
      grocery_matches: ingredient.grocery_matches.filter(
        (match) => match.grocery_item !== groceryItemId,
      ),
    })
  }

  // Products this ingredient isn't already matched to, so the "add a match"
  // combobox doesn't offer the same product twice.
  function availableGroceryItems(ingredient: RecipeIngredientInput) {
    const matchedIds = new Set(ingredient.grocery_matches.map((match) => match.grocery_item))
    return groceryItems.filter((item) => !matchedIds.has(item.id))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors([])

    const namedIngredients = values.ingredients.filter((ing) => ing.name.trim())
    if (
      namedIngredients.some(
        (ing) => ing.grams == null && ing.pieces == null && ing.milliliters == null,
      )
    ) {
      setErrors(['Each ingredient needs grams, pieces, and/or milliliters.'])
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(
        {
          ...values,
          household: householdId,
          ingredients: namedIngredients,
        },
        imageFile,
      )
    } catch (err) {
      setErrors(
        err instanceof ApiError
          ? Object.values(err.fieldErrors).flat()
          : ['Something went wrong. Please try again.'],
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemoveImage() {
    if (!onRemoveImage) return
    setRemovingImage(true)
    try {
      await onRemoveImage()
    } finally {
      setRemovingImage(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 space-y-1 text-sm">
          <span className="font-medium text-slate-700">Name</span>
          <input
            type="text"
            required
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Meal type</span>
          <select
            value={values.meal_type}
            onChange={(e) => set('meal_type', e.target.value as MealType)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          >
            {MEAL_TYPES.map((mt) => (
              <option key={mt.value} value={mt.value}>
                {mt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Feeds (people)</span>
          <input
            type="number"
            min={1}
            required
            value={values.servings}
            onChange={(e) => set('servings', Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>

        <label className="sm:col-span-2 space-y-1 text-sm">
          <span className="font-medium text-slate-700">Recipe URL (optional)</span>
          <input
            type="url"
            placeholder="https://…"
            value={values.source_url}
            onChange={(e) => set('source_url', e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>

        <label className="sm:col-span-2 space-y-1 text-sm">
          <span className="font-medium text-slate-700">Instructions (optional)</span>
          <textarea
            rows={3}
            value={values.instructions}
            onChange={(e) => set('instructions', e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>

        <div className="sm:col-span-2 space-y-1 text-sm">
          <span className="font-medium text-slate-700">Photo (optional)</span>
          <div className="flex items-center gap-3">
            {(() => {
              const previewSrc =
                imagePreviewUrl ?? (imageUrlEdited ? values.image_url : existingImageUrl)
              return (
                previewSrc && (
                  <img
                    src={previewSrc}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded border border-slate-200 object-cover"
                  />
                )
              )
            })()}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-600"
            />
            {existingImageUrl && !imageFile && onRemoveImage && (
              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={removingImage}
                title={removingImage ? 'Removing…' : 'Remove photo'}
                aria-label={removingImage ? 'Removing…' : 'Remove photo'}
                className="shrink-0 text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <label className="sm:col-span-2 space-y-1 text-sm">
          <span className="font-medium text-slate-700">External image URL (optional)</span>
          <input
            type="url"
            placeholder="https://…"
            value={values.image_url}
            onChange={(e) => {
              set('image_url', e.target.value)
              setImageUrlEdited(true)
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <span className="block text-xs text-slate-400">
            Shown only when there's no uploaded photo above.
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-slate-700">Ingredients</span>
        <div className="space-y-2">
          {values.ingredients.map((ingredient, index) => (
            <div
              key={index}
              className="space-y-2 rounded-md border border-slate-100 p-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Ingredient"
                  value={ingredient.name}
                  onChange={(e) => updateIngredient(index, { name: e.target.value })}
                  className="min-w-[8rem] flex-[2] rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Grams"
                  value={ingredient.grams ?? ''}
                  onChange={(e) =>
                    updateIngredient(index, {
                      grams: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="w-20 min-w-[5rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Pieces"
                  value={ingredient.pieces ?? ''}
                  onChange={(e) =>
                    updateIngredient(index, {
                      pieces: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="w-20 min-w-[5rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="ml"
                  value={ingredient.milliliters ?? ''}
                  onChange={(e) =>
                    updateIngredient(index, {
                      milliliters: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="w-20 min-w-[5rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(index)}
                  title="Remove"
                  aria-label="Remove ingredient"
                  className="shrink-0 text-red-500 hover:text-red-700"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-1 pl-4">
                <span className="text-xs font-medium text-slate-500">Grocery matches</span>
                {ingredient.grocery_matches.map((match) => {
                  const item = groceryItems.find((gi) => gi.id === match.grocery_item)
                  const costs = item ? storeCostPreviews(item, ingredient) : []
                  return (
                    <div
                      key={match.grocery_item}
                      className="space-y-0.5 rounded-md bg-slate-50 px-2 py-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium text-slate-700">
                          {item ? item.name : 'Unknown item'}
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
                            <li key={cost.store}>
                              {cost.storeName}: {cost.lineCost != null ? `£${cost.lineCost.toFixed(2)}` : '—'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
                <GroceryItemCombobox
                  items={availableGroceryItems(ingredient)}
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
          onClick={addIngredient}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Add ingredient
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
