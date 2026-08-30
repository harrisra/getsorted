import { useAuth } from '../auth/AuthContext'
import { useHouseholds } from '../households/HouseholdsContext'

export type NavTab = 'account' | 'household' | 'groceries' | 'recipes'

const TABS: { id: NavTab; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'household', label: 'Household' },
  { id: 'groceries', label: 'Groceries' },
  { id: 'recipes', label: 'Recipes' },
]

export function Navigation({
  activeTab,
  onSelectTab,
}: {
  activeTab: NavTab
  onSelectTab: (tab: NavTab) => void
}) {
  const { logout } = useAuth()
  const { households, currentHousehold, setCurrentHouseholdId } = useHouseholds()

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-8 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-slate-800">GetSorted</span>
          {currentHousehold &&
            (households.length > 1 ? (
              <select
                value={currentHousehold.id}
                onChange={(e) => setCurrentHouseholdId(e.target.value)}
                className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 focus:border-slate-500 focus:outline-none"
              >
                {households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-medium text-slate-400">{currentHousehold.name}</span>
            ))}
        </div>
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}
