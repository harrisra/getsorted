import { useEffect, useState } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

type HealthStatus = 'checking' | 'ok' | 'error'

function App() {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-slate-800">getsorted</h1>
        <p className="text-slate-500">
          Backend API:{' '}
          {status === 'checking' && 'checking…'}
          {status === 'ok' && <span className="text-green-600">connected</span>}
          {status === 'error' && <span className="text-red-600">unreachable</span>}
        </p>
      </div>
    </div>
  )
}

export default App
