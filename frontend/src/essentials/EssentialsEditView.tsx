import type { Essentials, EssentialsInput } from '../api/client'
import { EssentialsForm } from './EssentialsForm'

// A dedicated screen for editing one Essentials group, same reasoning as
// RecipeEditView/GroceryItemEditView — with a long list, editing inline
// pushes everything below it out of view.
export function EssentialsEditView({
  essentials,
  householdId,
  onCancel,
  onSubmit,
}: {
  essentials: Essentials
  householdId: string
  onCancel: () => void
  onSubmit: (essentials: EssentialsInput) => Promise<void>
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to essentials
      </button>
      <h1 className="text-xl font-semibold text-slate-800">Edit essentials</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <EssentialsForm
          householdId={householdId}
          submitLabel="Save"
          initialValue={{
            name: essentials.name,
            items: essentials.items.map((item) => ({
              name: item.name,
              grams: item.grams,
              pieces: item.pieces,
              milliliters: item.milliliters,
              grocery_matches: item.grocery_matches.map((match) => ({
                grocery_item: match.grocery_item,
              })),
            })),
          }}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  )
}
