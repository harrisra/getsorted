import { useDraggable } from '@dnd-kit/core'
import type { Recipe } from '../api/client'
import { RecipeCardContent } from './RecipeCardContent'

export function DraggableRecipeCard({ recipe }: { recipe: Recipe }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: recipe.id,
    data: { recipeId: recipe.id },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`shrink-0 cursor-grab touch-none select-none active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <RecipeCardContent recipe={recipe} />
    </div>
  )
}
