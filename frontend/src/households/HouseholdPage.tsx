import { useState } from 'react'
import { type Household, updateHouseholdWeekStartDay } from '../api/client'
import { useHouseholds } from './HouseholdsContext'
import { ConfirmDeleteButton } from '../ConfirmDeleteButton'
import { CreateHouseholdForm } from './CreateHouseholdForm'
import { HouseholdMembers } from './HouseholdMembers'

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

export function HouseholdPage() {
  const { households, deleteHousehold } = useHouseholds()
  const [showCreateForm, setShowCreateForm] = useState(false)
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
            <div className="mt-3 border-t border-slate-100 pt-3">
              <WeekStartSetting household={household} />
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
