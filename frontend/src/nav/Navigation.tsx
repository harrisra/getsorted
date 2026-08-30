import { useAuth } from '../auth/AuthContext'

export type NavTab = 'account' | 'household' | 'groceries'

const TABS: { id: NavTab; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'household', label: 'Household' },
  { id: 'groceries', label: 'Groceries' },
]

export function Navigation({
  activeTab,
  onSelectTab,
}: {
  activeTab: NavTab
  onSelectTab: (tab: NavTab) => void
}) {
  const { logout } = useAuth()

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-8 py-3">
        <span className="text-lg font-semibold text-slate-800">GetSorted</span>
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
