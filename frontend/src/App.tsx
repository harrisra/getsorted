import { useEffect, useState } from 'react'
import { API_BASE_URL } from './api/client'
import { AccountPage } from './account/AccountPage'
import { AuthPage } from './auth/AuthPage'
import { useAuth } from './auth/AuthContext'
import { EssentialsPage } from './essentials/EssentialsPage'
import { GroceryItemsPage } from './groceries/GroceryItemsPage'
import { HouseholdPage } from './households/HouseholdPage'
import { HouseholdsProvider, useHouseholds } from './households/HouseholdsContext'
import { MealPlannerPage } from './mealplanner/MealPlannerPage'
import { Sidebar, type NavTab } from './nav/Sidebar'
import { RecipesPage } from './recipes/RecipesPage'
import { ShoppingListsPage } from './shoppinglist/ShoppingListsPage'

type HealthStatus = 'checking' | 'ok' | 'error'

function useHealthStatus(): HealthStatus {
  const [status, setStatus] = useState<HealthStatus>('checking')

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/health/`)
      .then((res) => {
        if (!res.ok) throw new Error(`Unexpected status ${res.status}`)
        return res.json()
      })
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'))
  }, [])

  return status
}

function Dashboard() {
  const { currentHousehold } = useHouseholds()
  // Without a household there's nothing to plan or cook, so default to the
  // Household tab (where one can be created or joined) rather than Account.
  const [activeTab, setActiveTab] = useState<NavTab>(currentHousehold ? 'account' : 'household')
  const status = useHealthStatus()

  // Recipes/Essentials/Meal Planner/Shopping List need a household — if the
  // one in view gets deleted while a household-scoped tab is active, fall
  // back to Household instead of rendering a page with nothing to show.
  useEffect(() => {
    if (
      !currentHousehold &&
      (activeTab === 'recipes' ||
        activeTab === 'essentials' ||
        activeTab === 'mealplanner' ||
        activeTab === 'shoppinglist')
    ) {
      setActiveTab('household')
    }
  }, [currentHousehold, activeTab])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'account' && <AccountPage />}
          {activeTab === 'household' && <HouseholdPage />}
          {activeTab === 'groceries' && <GroceryItemsPage />}
          {activeTab === 'recipes' && currentHousehold && <RecipesPage />}
          {activeTab === 'essentials' && currentHousehold && <EssentialsPage />}
          {activeTab === 'mealplanner' && currentHousehold && <MealPlannerPage />}
          {activeTab === 'shoppinglist' && currentHousehold && <ShoppingListsPage />}
        </main>
        <p className="shrink-0 border-t border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-400">
          Backend API:{' '}
          {status === 'checking' && 'checking…'}
          {status === 'ok' && <span className="text-green-600">connected</span>}
          {status === 'error' && <span className="text-red-600">unreachable</span>}
        </p>
      </div>
    </div>
  )
}

function AuthenticatedApp() {
  const { loading } = useHouseholds()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading…</p>
      </div>
    )
  }

  return <Dashboard />
}

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return (
    <HouseholdsProvider>
      <AuthenticatedApp />
    </HouseholdsProvider>
  )
}

export default App
