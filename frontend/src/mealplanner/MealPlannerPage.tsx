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
import { RecipePicker } from './RecipePicker'

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

  function slotFor(date: string, mealType: MealType) {
    return mealPlan?.slots.find((s) => s.date === date && s.meal_type === mealType) ?? null
  }

  function dailyTotal(date: string) {
    return mealPlan?.daily_totals.find((d) => d.date === date)?.total_cost ?? null
  }

  return (
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

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

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
                    <div
                      key={slot.id}
                      className="min-h-[3.5rem] space-y-1 rounded-md border border-slate-200 bg-white p-2"
                    >
                      {slot.recipes_detail.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-start justify-between gap-1 rounded bg-slate-100 px-1.5 py-1.5 text-xs"
                        >
                          <span className="flex min-w-0 items-start gap-1.5">
                            {r.image && (
                              <img
                                src={r.image}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded object-cover"
                              />
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
                            onClick={() =>
                              handleSlotChange(
                                slot.id,
                                slot.recipes.filter((id) => id !== r.id),
                              )
                            }
                            className="shrink-0 text-slate-400 hover:text-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <RecipePicker
                        recipes={recipesForType}
                        onSelect={(recipe) =>
                          handleSlotChange(slot.id, [...slot.recipes, recipe.id])
                        }
                      />
                    </div>
                  )
                })}
              </Fragment>
            ))}

            <div className="text-sm font-medium text-slate-600">Total</div>
            {days.map((day) => (
              <div
                key={`total-${day}`}
                className="text-center text-sm font-medium text-slate-700"
              >
                {dailyTotal(day) ? `£${dailyTotal(day)}` : '—'}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
