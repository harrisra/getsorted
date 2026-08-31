import { useDraggable } from '@dnd-kit/core'
import type { RecipeSummary } from '../api/client'
import { GripIcon } from '../icons'

// Draggable id for a recipe already planned into a slot — distinct from a
// palette DraggableRecipeCard's id (just the recipe id) so the same recipe
// can be simultaneously registered as two different draggables (one in the
// palette, one here) without an id collision.
export function plannedRecipeDragId(slotId: string, recipeId: string): string {
  return `planned:${slotId}:${recipeId}`
}

export function PlannedRecipeChip({
  slotId,
  recipe,
  onRemove,
}: {
  slotId: string
  recipe: RecipeSummary
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: plannedRecipeDragId(slotId, recipe.id),
    data: { recipeId: recipe.id, sourceSlotId: slotId },
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex items-start justify-between gap-1 rounded bg-slate-100 px-1.5 py-1.5 text-xs ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <span className="flex min-w-0 items-start gap-1">
        <button
          type="button"
          {...listeners}
          {...attributes}
          title="Drag to another day"
          aria-label="Drag to another day"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-slate-400 hover:text-slate-600 active:cursor-grabbing"
        >
          <GripIcon className="h-3.5 w-3.5" />
        </button>
        {recipe.image && (
          <img src={recipe.image} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
        )}
        <span className="inline-flex flex-wrap items-center gap-1">
          <span>{recipe.name}</span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
            Feeds {recipe.servings}
          </span>
          {recipe.current_cost && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
              £{recipe.current_cost}
            </span>
          )}
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        aria-label="Remove"
        className="shrink-0 text-slate-400 hover:text-red-600"
      >
        ✕
      </button>
    </div>
  )
}
