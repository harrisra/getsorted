import { useDroppable } from '@dnd-kit/core'
import type { MealSlot, Recipe } from '../api/client'
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
        <div
          key={r.id}
          className="flex items-start justify-between gap-1 rounded bg-slate-100 px-1.5 py-1.5 text-xs"
        >
          <span className="flex min-w-0 items-start gap-1.5">
            {r.image && (
              <img src={r.image} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
            )}
            <span className="inline-flex flex-wrap items-center gap-1">
              <span>{r.name}</span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                Feeds {r.servings}
              </span>
              {r.current_cost && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                  £{r.current_cost}
                </span>
              )}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onChange(slot.recipes.filter((id) => id !== r.id))}
            className="shrink-0 text-slate-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
      <RecipePicker
        recipes={availableRecipes}
        onSelect={(recipe) => onChange([...slot.recipes, recipe.id])}
      />
    </div>
  )
}
