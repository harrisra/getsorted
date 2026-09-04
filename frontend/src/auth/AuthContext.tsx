import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  type CurrentUser,
  fetchCurrentUser,
  googleLogin as apiGoogleLogin,
  login as apiLogin,
  logout as apiLogout,
  onSilentTokenRefresh,
  signup as apiSignup,
  updateCurrentUser,
} from '../api/client'

interface AuthContextValue {
  user: CurrentUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  googleLogin: (accessToken: string) => Promise<void>
  signup: (email: string, password1: string, password2: string) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (firstName: string, lastName: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const userRef = useRef<CurrentUser | null>(null)
  userRef.current = user

  const refresh = useCallback(async () => {
    setUser(await fetchCurrentUser())
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  // A silent access-token refresh reuses whatever refresh-token cookie is in
  // the browser at that moment — if another account logged in elsewhere in
  // this same browser meanwhile, that's no longer this tab's session. Rather
  // than silently keep going as whoever that cookie now belongs to, check
  // identity held steady and reload if it didn't, so every piece of state
  // (household, recipes, everything) gets rebuilt fresh under whoever is
  // actually logged in now.
  useEffect(() => {
    return onSilentTokenRefresh(() => {
      fetchCurrentUser().then((refreshedUser) => {
        const previousId = userRef.current?.pk ?? null
        const refreshedId = refreshedUser?.pk ?? null
        if (refreshedId !== previousId) {
          window.location.reload()
        }
      })
    })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password)
    await refresh()
  }, [refresh])

  const googleLogin = useCallback(async (accessToken: string) => {
    await apiGoogleLogin(accessToken)
    await refresh()
  }, [refresh])

  const signup = useCallback(async (email: string, password1: string, password2: string) => {
    await apiSignup(email, password1, password2)
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (firstName: string, lastName: string) => {
    setUser(await updateCurrentUser(firstName, lastName))
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, loading, login, googleLogin, signup, logout, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
