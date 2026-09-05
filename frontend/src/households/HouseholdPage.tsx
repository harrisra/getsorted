import { useEffect, useState } from 'react'
import {
  type Household,
  type Store,
  fetchStores,
  updateHouseholdDefaultExcludedStores,
  updateHouseholdWeekStartDay,
} from '../api/client'
import { useHouseholds } from './HouseholdsContext'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { CreateHouseholdForm } from './CreateHouseholdForm'
import { HouseholdMembers } from './HouseholdMembers'
import { StoreLogo, hasStoreLogo } from '../StoreLogo'

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

function WeekStartSetting({ household }: { household: Household }) {
  const { refreshHouseholds } = useHouseholds()
  const [saving, setSaving] = useState(false)

  if (household.role !== 'owner') {
    return (
      <p className="text-xs text-slate-400">
        Meal planner week starts on {WEEKDAYS[household.week_start_day]}.
      </p>
    )
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      <span>Meal planner week starts on</span>
      <select
        value={household.week_start_day}
        disabled={saving}
        onChange={async (e) => {
          setSaving(true)
          try {
            await updateHouseholdWeekStartDay(household.id, Number(e.target.value))
            await refreshHouseholds()
          } finally {
            setSaving(false)
          }
        }}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
      >
        {WEEKDAYS.map((day, index) => (
          <option key={day} value={index}>
            {day}
          </option>
        ))}
      </select>
    </label>
  )
}

// Which stores a newly-created shopping list starts with excluded — same
// toggle-button treatment as ShoppingListDetailView's "visiting" buttons
// (logo, greyed out when off), since it's the same underlying idea: a store
// this household doesn't currently want "in".
function DefaultStoresSetting({ household, stores }: { household: Household; stores: Store[] }) {
  const { refreshHouseholds } = useHouseholds()
  const [saving, setSaving] = useState(false)

  if (stores.length === 0) return null

  if (household.role !== 'owner') {
    const visiting = stores.filter((store) => !household.default_excluded_stores.includes(store.id))
    return (
      <p className="text-xs text-slate-400">
        New shopping lists default to visiting{' '}
        {visiting.length > 0 ? visiting.map((store) => store.name).join(', ') : 'no stores'}.
      </p>
    )
  }

  async function handleToggleStore(storeId: string) {
    const excluded = new Set(household.default_excluded_stores)
    if (excluded.has(storeId)) excluded.delete(storeId)
    else excluded.add(storeId)
    setSaving(true)
    try {
      await updateHouseholdDefaultExcludedStores(household.id, Array.from(excluded))
      await refreshHouseholds()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-slate-500">Stores new shopping lists visit by default</span>
      <div className="flex flex-wrap items-center gap-2">
        {stores.map((store) => {
          const visiting = !household.default_excluded_stores.includes(store.id)
          const logoAvailable = hasStoreLogo(store.name)
          return (
            <button
              key={store.id}
              type="button"
              disabled={saving}
              onClick={() => handleToggleStore(store.id)}
              aria-pressed={visiting}
              aria-label={logoAvailable ? store.name : undefined}
              title={
                visiting
                  ? `Exclude ${store.name} from new shopping lists by default.`
                  : `Include ${store.name} in new shopping lists by default.`
              }
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                visiting
                  ? 'border-slate-300 hover:bg-slate-100'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              {logoAvailable ? (
                <StoreLogo
                  name={store.name}
                  className={`h-4 w-auto transition ${visiting ? '' : 'opacity-40 grayscale'}`}
                />
              ) : (
                <span className={visiting ? 'text-slate-700' : 'text-slate-400'}>{store.name}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function HouseholdPage() {
  const { households, deleteHousehold } = useHouseholds()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [stores, setStores] = useState<Store[]>([])

  useEffect(() => {
    fetchStores().then(setStores)
  }, [])

  // Always show the form once the last household is gone — e.g. right after
  // deleting one — not just on first mount with none.
  const displayCreateForm = showCreateForm || households.length === 0

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <h1 className="text-xl font-semibold text-slate-800">Your households</h1>

      {households.length === 0 && (
        <p className="text-sm text-slate-500">
          You don't belong to a household yet. Create one below, or ask an existing member to
          add you by email — until then, Recipes and Meal Planner aren't available.
        </p>
      )}

      <div className="space-y-4">
        {households.map((household) => (
          <div key={household.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium text-slate-800">{household.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm capitalize text-slate-500">{household.role}</span>
                {household.role === 'owner' && (
                  <ConfirmDeleteButton
                    label="Delete household"
                    onConfirm={() => deleteHousehold(household.id)}
                  />
                )}
              </div>
            </div>
            <HouseholdMembers household={household} />
            <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
              <WeekStartSetting household={household} />
              <DefaultStoresSetting household={household} stores={stores} />
            </div>
          </div>
        ))}
      </div>

      {displayCreateForm ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <CreateHouseholdForm onCreated={() => setShowCreateForm(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          {households.length === 0 ? 'Create a household' : 'Create another household'}
        </button>
      )}
    </div>
  )
}
