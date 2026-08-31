import type { GroceryItem, GroceryItemInput } from '../api/client'
import { GroceryItemForm } from './GroceryItemForm'

// A dedicated screen for editing one grocery item, rather than expanding it
// inline within the list — with a long list, an inline edit form pushes
// everything below it out of view and makes it easy to lose track of which
// row is even being edited.
export function GroceryItemEditView({
  item,
  onCancel,
  onSubmit,
}: {
  item: GroceryItem
  onCancel: () => void
  onSubmit: (item: GroceryItemInput) => Promise<void>
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to grocery items
      </button>
      <h1 className="text-xl font-semibold text-slate-800">Edit grocery item</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <GroceryItemForm
          submitLabel="Save"
          initialValue={{
            store: item.store,
            name: item.name,
            brand: item.brand,
            aisle: item.aisle,
            grams: item.grams,
            pieces: item.pieces,
            milliliters: item.milliliters,
            price: item.price,
            product_url: item.product_url,
            image_url: item.image_url,
          }}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  )
}
