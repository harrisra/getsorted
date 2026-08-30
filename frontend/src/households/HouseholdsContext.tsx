import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  type Household,
  createHousehold as apiCreateHousehold,
  fetchHouseholds,
} from '../api/client'

interface HouseholdsContextValue {
  households: Household[]
  loading: boolean
  createHousehold: (name: string) => Promise<Household>
}

const HouseholdsContext = createContext<HouseholdsContextValue | null>(null)

export function HouseholdsProvider({ children }: { children: ReactNode }) {
  const [households, setHouseholds] = useState<Household[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setHouseholds(await fetchHouseholds())
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const createHousehold = useCallback(
    async (name: string) => {
      const household = await apiCreateHousehold(name)
      await refresh()
      return household
    },
    [refresh],
  )

  return (
    <HouseholdsContext.Provider value={{ households, loading, createHousehold }}>
      {children}
    </HouseholdsContext.Provider>
  )
}

export function useHouseholds(): HouseholdsContextValue {
  const context = useContext(HouseholdsContext)
  if (!context) throw new Error('useHouseholds must be used within a HouseholdsProvider')
  return context
}
