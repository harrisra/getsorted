import { useState } from 'react'
import { useHouseholds } from './HouseholdsContext'
import { CreateHouseholdForm } from './CreateHouseholdForm'
import { HouseholdMembers } from './HouseholdMembers'

export function HouseholdPage() {
  const { households } = useHouseholds()
  const [showCreateForm, setShowCreateForm] = useState(false)

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-xl font-semibold text-slate-800">Your households</h1>

      <div className="space-y-4">
        {households.map((household) => (
          <div key={household.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium text-slate-800">{household.name}</span>
              <span className="text-sm capitalize text-slate-500">{household.role}</span>
            </div>
            <HouseholdMembers household={household} />
          </div>
        ))}
      </div>

      {showCreateForm ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <CreateHouseholdForm onCreated={() => setShowCreateForm(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Create another household
        </button>
      )}
    </div>
  )
}
