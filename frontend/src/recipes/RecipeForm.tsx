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
import { GroceryItemCombobox } from './GroceryItemCombobox'

type RecipeFormValues = Omit<RecipeInput, 'household'>

const EMPTY: RecipeFormValues = {
  name: '',
  meal_type: 'dinner',
  servings: 4,
  instructions: '',
  source_url: '',
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
    set('ingredients', [...values.ingredients, { name: '', quantity: '', grocery_item: null }])
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors([])
    setSubmitting(true)
    try {
      await onSubmit(
        {
          ...values,
          household: householdId,
          ingredients: values.ingredients.filter((ing) => ing.name.trim()),
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
            {(imagePreviewUrl || existingImageUrl) && (
              <img
                src={imagePreviewUrl ?? existingImageUrl ?? undefined}
                alt=""
                className="h-16 w-16 shrink-0 rounded border border-slate-200 object-cover"
              />
            )}
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
                className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {removingImage ? 'Removing…' : 'Remove'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-slate-700">Ingredients</span>
        <div className="space-y-2">
          {values.ingredients.map((ingredient, index) => (
            <div
              key={index}
              className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 p-2 sm:border-0 sm:p-0"
            >
              <input
                type="text"
                placeholder="Ingredient"
                value={ingredient.name}
                onChange={(e) => updateIngredient(index, { name: e.target.value })}
                className="min-w-[8rem] flex-[2] rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Quantity"
                value={ingredient.quantity}
                onChange={(e) => updateIngredient(index, { quantity: e.target.value })}
                className="min-w-[6rem] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
              <GroceryItemCombobox
                items={groceryItems}
                value={ingredient.grocery_item}
                onChange={(id) => updateIngredient(index, { grocery_item: id })}
              />
              <button
                type="button"
                onClick={() => removeIngredient(index)}
                className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800"
              >
                Remove
              </button>
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
