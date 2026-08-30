import type { MealType } from '../api/client'

export type RecipeSortBy = 'name' | 'price'

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active
          ? 'bg-slate-800 text-white'
          : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

export function FilterSortPills({
  mealTypes,
  mealTypeFilter,
  onMealTypeFilterChange,
  sortBy,
  onSortByChange,
}: {
  mealTypes: { value: MealType; label: string }[]
  mealTypeFilter: MealType | null
  onMealTypeFilterChange: (value: MealType | null) => void
  sortBy: RecipeSortBy | null
  onSortByChange: (value: RecipeSortBy | null) => void
}) {
  return (
    <div className="flex w-32 shrink-0 flex-col gap-2">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Filter
        </p>
        <div className="flex flex-wrap gap-1">
          {mealTypes.map((mt) => (
            <Pill
              key={mt.value}
              active={mealTypeFilter === mt.value}
              onClick={() => onMealTypeFilterChange(mealTypeFilter === mt.value ? null : mt.value)}
            >
              {mt.label}
            </Pill>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Sort
        </p>
        <div className="flex flex-wrap gap-1">
          <Pill
            active={sortBy === 'name'}
            onClick={() => onSortByChange(sortBy === 'name' ? null : 'name')}
          >
            Name
          </Pill>
          <Pill
            active={sortBy === 'price'}
            onClick={() => onSortByChange(sortBy === 'price' ? null : 'price')}
          >
            Price
          </Pill>
        </div>
      </div>
    </div>
  )
}
