import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  type Household,
  createHousehold as apiCreateHousehold,
  fetchHouseholds,
} from '../api/client'

const CURRENT_HOUSEHOLD_STORAGE_KEY = 'getsorted:currentHouseholdId'

interface HouseholdsContextValue {
  households: Household[]
  loading: boolean
  currentHousehold: Household | null
  setCurrentHouseholdId: (id: string) => void
  createHousehold: (name: string) => Promise<Household>
  refreshHouseholds: () => Promise<Household[]>
}

const HouseholdsContext = createContext<HouseholdsContextValue | null>(null)

export function HouseholdsProvider({ children }: { children: ReactNode }) {
  const [households, setHouseholds] = useState<Household[]>([])
  const [loading, setLoading] = useState(true)
  const [currentHouseholdId, setCurrentHouseholdIdState] = useState<string | null>(() =>
    localStorage.getItem(CURRENT_HOUSEHOLD_STORAGE_KEY),
  )

  const refresh = useCallback(async () => {
    const data = await fetchHouseholds()
    setHouseholds(data)
    return data
  }, [])

  // Keeps the selection valid whenever the household list loads or changes —
  // falls back to the first household if there's no stored choice, or the
  // stored one no longer applies (e.g. removed).
  const resolveCurrentHousehold = useCallback((data: Household[]) => {
    if (data.length === 0) return
    setCurrentHouseholdIdState((current) =>
      current && data.some((h) => h.id === current) ? current : data[0].id,
    )
  }, [])

  useEffect(() => {
    refresh()
      .then(resolveCurrentHousehold)
      .finally(() => setLoading(false))
  }, [refresh, resolveCurrentHousehold])

  const setCurrentHouseholdId = useCallback((id: string) => {
    setCurrentHouseholdIdState(id)
    localStorage.setItem(CURRENT_HOUSEHOLD_STORAGE_KEY, id)
  }, [])

  const createHousehold = useCallback(
    async (name: string) => {
      const household = await apiCreateHousehold(name)
      await refresh()
      setCurrentHouseholdId(household.id)
      return household
    },
    [refresh, setCurrentHouseholdId],
  )

  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null

  return (
    <HouseholdsContext.Provider
      value={{
        households,
        loading,
        currentHousehold,
        setCurrentHouseholdId,
        createHousehold,
        refreshHouseholds: refresh,
      }}
    >
      {children}
    </HouseholdsContext.Provider>
  )
}

export function useHouseholds(): HouseholdsContextValue {
  const context = useContext(HouseholdsContext)
  if (!context) throw new Error('useHouseholds must be used within a HouseholdsProvider')
  return context
}
