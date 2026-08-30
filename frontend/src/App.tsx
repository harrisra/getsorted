import { useEffect, useState } from 'react'
import { API_BASE_URL } from './api/client'
import { AuthPage } from './auth/AuthPage'
import { useAuth } from './auth/AuthContext'
import { CreateHouseholdPage } from './households/CreateHouseholdPage'
import { HouseholdsProvider, useHouseholds } from './households/HouseholdsContext'

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
  const { user, logout } = useAuth()
  const { households } = useHouseholds()
  const status = useHealthStatus()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-semibold text-slate-800">GetSorted</h1>
        <p className="text-slate-600">Signed in as {user?.email}</p>
        <p className="text-slate-600">
          Household{households.length > 1 ? 's' : ''}:{' '}
          {households.map((h) => h.name).join(', ')}
        </p>
        <p className="text-slate-500">
          Backend API:{' '}
          {status === 'checking' && 'checking…'}
          {status === 'ok' && <span className="text-green-600">connected</span>}
          {status === 'error' && <span className="text-red-600">unreachable</span>}
        </p>
        <button
          type="button"
          onClick={() => logout()}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Log out
        </button>
      </div>
    </div>
  )
}

function AuthenticatedApp() {
  const { households, loading } = useHouseholds()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading…</p>
      </div>
    )
  }

  if (households.length === 0) {
    return <CreateHouseholdPage />
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
