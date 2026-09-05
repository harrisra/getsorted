import { useEffect, useState } from 'react'
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

function Dashboard() {
  const { currentHousehold } = useHouseholds()
  // Without a household there's nothing to plan or cook, so default to the
  // Household tab (where one can be created or joined) rather than Account.
  const [activeTab, setActiveTab] = useState<NavTab>(currentHousehold ? 'account' : 'household')

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
      {/* No separate footer here any more — the backend-health status that
          used to live in one now lives in the Sidebar, under Collapse. */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {activeTab === 'account' && <AccountPage />}
        {activeTab === 'household' && <HouseholdPage />}
        {activeTab === 'groceries' && <GroceryItemsPage />}
        {activeTab === 'recipes' && currentHousehold && <RecipesPage />}
        {activeTab === 'essentials' && currentHousehold && <EssentialsPage />}
        {activeTab === 'mealplanner' && currentHousehold && <MealPlannerPage />}
        {activeTab === 'shoppinglist' && currentHousehold && <ShoppingListsPage />}
      </main>
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
