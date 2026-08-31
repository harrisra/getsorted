import { useDroppable } from '@dnd-kit/core'
import type { MealSlot, Recipe } from '../api/client'
import { PlannedRecipeChip } from './PlannedRecipeChip'
import { RecipePicker } from './RecipePicker'

export function MealSlotCell({
  slot,
  availableRecipes,
  onChange,
}: {
  slot: MealSlot
  availableRecipes: Recipe[]
  onChange: (recipeIds: string[]) => void
}) {
  const { isOver, setNodeRef } = useDroppable({ id: slot.id, data: { slotId: slot.id } })

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[3.5rem] space-y-1 rounded-md border p-2 transition-colors ${
        isOver ? 'border-slate-500 bg-slate-100' : 'border-slate-200 bg-white'
      }`}
    >
      {slot.recipes_detail.map((r) => (
        <PlannedRecipeChip
          key={r.id}
          slotId={slot.id}
          recipe={r}
          onRemove={() => onChange(slot.recipes.filter((id) => id !== r.id))}
        />
      ))}
      <RecipePicker
        recipes={availableRecipes}
        onSelect={(recipe) => onChange([...slot.recipes, recipe.id])}
      />
    </div>
  )
}
