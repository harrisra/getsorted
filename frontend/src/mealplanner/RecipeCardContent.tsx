import type { Recipe } from '../api/client'

const MEAL_TYPE_LABELS: Record<Recipe['meal_type'], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

export function RecipeCardContent({ recipe, className = '' }: { recipe: Recipe; className?: string }) {
  return (
    <div
      title={
        recipe.has_promo_price
          ? 'One or more ingredients are matched to a product currently on a promo/loyalty-card price'
          : undefined
      }
      className={`flex w-40 flex-col gap-1.5 rounded-lg border border-slate-200 p-2 shadow-sm ${
        recipe.has_promo_price ? 'bg-amber-50' : 'bg-white'
      } ${className}`}
    >
      {recipe.image ? (
        <img
          src={recipe.image}
          alt=""
          className="h-20 w-full rounded object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-20 w-full items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
          No photo
        </div>
      )}
      <p className="truncate text-xs font-medium text-slate-800" title={recipe.name}>
        {recipe.name}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          {MEAL_TYPE_LABELS[recipe.meal_type]}
        </span>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          Feeds {recipe.servings}
        </span>
        {recipe.current_cost && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
            £{recipe.current_cost}
          </span>
        )}
      </div>
    </div>
  )
}
