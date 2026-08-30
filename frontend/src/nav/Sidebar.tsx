import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useHouseholds } from '../households/HouseholdsContext'
import {
  BasketIcon,
  BookIcon,
  CalendarIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  HomeIcon,
  LogoutIcon,
  UserIcon,
} from '../icons'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'getsorted:sidebarCollapsed'

export type NavTab = 'account' | 'household' | 'groceries' | 'recipes' | 'mealplanner'

const TABS: { id: NavTab; label: string; icon: typeof UserIcon }[] = [
  { id: 'account', label: 'Account', icon: UserIcon },
  { id: 'household', label: 'Household', icon: HomeIcon },
  { id: 'groceries', label: 'Groceries', icon: BasketIcon },
  { id: 'recipes', label: 'Recipes', icon: BookIcon },
  { id: 'mealplanner', label: 'Meal Planner', icon: CalendarIcon },
]

function loadInitialCollapsed(): boolean {
  const stored = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
  if (stored !== null) return stored === 'true'
  return window.innerWidth < 768
}

export function Sidebar({
  activeTab,
  onSelectTab,
}: {
  activeTab: NavTab
  onSelectTab: (tab: NavTab) => void
}) {
  const { logout } = useAuth()
  const { households, currentHousehold, setCurrentHouseholdId } = useHouseholds()
  const [collapsed, setCollapsed] = useState(loadInitialCollapsed)

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next))
      return next
    })
  }

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-4">
        <span className="text-lg font-semibold text-slate-800">{collapsed ? 'GS' : 'GetSorted'}</span>
      </div>

      {currentHousehold && !collapsed && (
        <div className="border-b border-slate-200 px-3 py-2">
          {households.length > 1 ? (
            <select
              value={currentHousehold.id}
              onChange={(e) => setCurrentHouseholdId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 focus:border-slate-500 focus:outline-none"
            >
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="block truncate text-xs font-medium text-slate-400">
              {currentHousehold.name}
            </span>
          )}
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              title={collapsed ? tab.label : undefined}
              onClick={() => onSelectTab(tab.id)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                active ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{tab.label}</span>}
            </button>
          )
        })}
      </nav>

      <div className="space-y-1 border-t border-slate-200 px-2 py-3">
        <button
          type="button"
          title={collapsed ? 'Logout' : undefined}
          onClick={() => logout()}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogoutIcon className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed ? (
            <ChevronsRightIcon className="h-5 w-5 shrink-0" />
          ) : (
            <>
              <ChevronsLeftIcon className="h-5 w-5 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
