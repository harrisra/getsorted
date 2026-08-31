import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { Fragment, useEffect, useState } from 'react'
import {
  ApiError,
  type MealPlan,
  type MealType,
  type Recipe,
  fetchMealPlanForWeek,
  fetchRecipes,
  updateMealSlotRecipes,
} from '../api/client'
import { useHouseholds } from '../households/HouseholdsContext'
import { addDays, currentWeekStart, formatDateISO, formatDayHeading, parseDateISO } from './dates'
import { DraggableRecipeCard } from './DraggableRecipeCard'
import { FilterSortPills, type RecipeSortBy } from './FilterSortPills'
import { MealSlotCell } from './MealSlotCell'
import { RecipeCardContent } from './RecipeCardContent'

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
]

export function MealPlannerPage() {
  const { currentHousehold } = useHouseholds()
  const [weekStart, setWeekStart] = useState<string | null>(null)
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null)
  const [mealTypeFilter, setMealTypeFilter] = useState<MealType | null>(null)
  const [sortBy, setSortBy] = useState<RecipeSortBy | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  useEffect(() => {
    if (currentHousehold) {
      setWeekStart(currentWeekStart(new Date(), currentHousehold.week_start_day))
    }
  }, [currentHousehold?.id, currentHousehold?.week_start_day])

  useEffect(() => {
    fetchRecipes().then(setRecipes)
  }, [])

  async function refreshPlan(householdId: string, week: string) {
    setMealPlan(await fetchMealPlanForWeek(householdId, week))
  }

  useEffect(() => {
    if (currentHousehold && weekStart) {
      setMealPlan(null)
      refreshPlan(currentHousehold.id, weekStart)
    }
  }, [currentHousehold?.id, weekStart])

  if (!currentHousehold || !weekStart) return null
  const household = currentHousehold

  const days = Array.from({ length: 7 }, (_, i) =>
    formatDateISO(addDays(parseDateISO(weekStart), i)),
  )
  const householdRecipes = recipes.filter((r) => r.household === household.id)
  const activeRecipe = householdRecipes.find((r) => r.id === activeRecipeId) ?? null

  const displayedRecipes = householdRecipes
    .filter((r) => !mealTypeFilter || r.meal_type === mealTypeFilter)
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'price') {
        const priceA = a.current_cost ? Number(a.current_cost) : Infinity
        const priceB = b.current_cost ? Number(b.current_cost) : Infinity
        return priceA - priceB
      }
      return 0
    })

  function goToWeek(offsetWeeks: number) {
    setWeekStart((prev) =>
      prev ? formatDateISO(addDays(parseDateISO(prev), offsetWeeks * 7)) : prev,
    )
  }

  async function handleSlotChange(slotId: string, recipeIds: string[]) {
    setError(null)
    try {
      await updateMealSlotRecipes(slotId, recipeIds)
      await refreshPlan(household.id, weekStart as string)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? Object.values(err.fieldErrors).flat().join(' ')
          : 'Could not update that cell. Please try again.',
      )
    }
  }

  async function handleMoveRecipe(sourceSlotId: string, targetSlotId: string, recipeId: string) {
    if (sourceSlotId === targetSlotId) return
    const sourceSlot = mealPlan?.slots.find((s) => s.id === sourceSlotId)
    const targetSlot = mealPlan?.slots.find((s) => s.id === targetSlotId)
    if (!sourceSlot || !targetSlot) return

    if (targetSlot.recipes.includes(recipeId)) {
      // Already planned on the target day/meal — just drop it from the
      // source to finish the move rather than duplicating it.
      await handleSlotChange(sourceSlotId, sourceSlot.recipes.filter((id) => id !== recipeId))
      return
    }

    setError(null)
    try {
      // Add to the target before removing from the source, so a failure
      // partway through leaves the recipe duplicated (visible, fixable)
      // rather than silently dropped from the plan.
      await updateMealSlotRecipes(targetSlotId, [...targetSlot.recipes, recipeId])
      await updateMealSlotRecipes(sourceSlotId, sourceSlot.recipes.filter((id) => id !== recipeId))
      await refreshPlan(household.id, weekStart as string)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? Object.values(err.fieldErrors).flat().join(' ')
          : 'Could not move that meal. Please try again.',
      )
      await refreshPlan(household.id, weekStart as string)
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveRecipeId(event.active.data.current?.recipeId ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveRecipeId(null)
    const { active, over } = event
    if (!over) return

    const recipeId = active.data.current?.recipeId as string | undefined
    const sourceSlotId = active.data.current?.sourceSlotId as string | undefined
    const targetSlotId = over.data.current?.slotId as string | undefined
    if (!recipeId || !targetSlotId) return

    if (sourceSlotId) {
      handleMoveRecipe(sourceSlotId, targetSlotId, recipeId)
      return
    }

    const slot = mealPlan?.slots.find((s) => s.id === targetSlotId)
    if (!slot || slot.recipes.includes(recipeId)) return

    handleSlotChange(targetSlotId, [...slot.recipes, recipeId])
  }

  function slotFor(date: string, mealType: MealType) {
    return mealPlan?.slots.find((s) => s.date === date && s.meal_type === mealType) ?? null
  }

  function dailyTotal(date: string) {
    return mealPlan?.daily_totals.find((d) => d.date === date)?.total_cost ?? null
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full flex-col space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-800">Meal planner</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => goToWeek(-1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              ← Prev
            </button>
            <span className="text-sm font-medium text-slate-600">
              Week of {formatDayHeading(weekStart)}
            </span>
            <button
              type="button"
              onClick={() => goToWeek(1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Next →
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          Week total:{' '}
          <span className="font-medium text-slate-800">
            {mealPlan?.total_cost ? `£${mealPlan.total_cost}` : '—'}
          </span>
        </p>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!mealPlan && <p className="text-sm text-slate-400">Loading…</p>}

        {mealPlan && (
          <div className="min-h-0 flex-1 overflow-auto">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: '6rem repeat(7, minmax(9rem, 1fr))' }}
            >
              <div />
              {days.map((day) => (
                <div key={day} className="text-center text-sm font-medium text-slate-700">
                  {formatDayHeading(day)}
                </div>
              ))}

              {MEAL_TYPES.map((mt) => (
                <Fragment key={mt.value}>
                  <div className="flex items-center text-sm font-medium text-slate-600">
                    {mt.label}
                  </div>
                  {days.map((day) => {
                    const slot = slotFor(day, mt.value)
                    if (!slot) return <div key={`${day}-${mt.value}`} />
                    const recipesForType = householdRecipes.filter(
                      (r) => r.meal_type === mt.value && !slot.recipes.includes(r.id),
                    )
                    return (
                      <MealSlotCell
                        key={slot.id}
                        slot={slot}
                        availableRecipes={recipesForType}
                        onChange={(recipeIds) => handleSlotChange(slot.id, recipeIds)}
                      />
                    )
                  })}
                </Fragment>
              ))}

              <div className="text-sm font-medium text-slate-600">Total</div>
              {days.map((day) => (
                <div key={`total-${day}`} className="text-center text-sm font-medium text-slate-700">
                  {dailyTotal(day) ? `£${dailyTotal(day)}` : '—'}
                </div>
              ))}
            </div>
          </div>
        )}

        {householdRecipes.length > 0 && (
          <div className="shrink-0 space-y-2 border-t border-slate-200 pt-3">
            <span className="text-sm font-medium text-slate-600">
              Drag a recipe onto a cell to add it — drag a planned meal's ⣿ handle to move it
              between days
            </span>
            <div className="flex gap-3">
              <FilterSortPills
                mealTypes={MEAL_TYPES}
                mealTypeFilter={mealTypeFilter}
                onMealTypeFilterChange={setMealTypeFilter}
                sortBy={sortBy}
                onSortByChange={setSortBy}
              />
              <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
                {displayedRecipes.length === 0 && (
                  <p className="self-center text-sm text-slate-400">No recipes match.</p>
                )}
                {displayedRecipes.map((recipe) => (
                  <DraggableRecipeCard key={recipe.id} recipe={recipe} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeRecipe && <RecipeCardContent recipe={activeRecipe} className="shadow-lg" />}
      </DragOverlay>
    </DndContext>
  )
}
