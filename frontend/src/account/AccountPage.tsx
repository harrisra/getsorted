import { useAuth } from '../auth/AuthContext'

export function AccountPage() {
  const { user } = useAuth()

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <h1 className="text-xl font-semibold text-slate-800">Account</h1>

      <dl className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-3 gap-4 px-4 py-3">
          <dt className="text-sm font-medium text-slate-500">Email</dt>
          <dd className="col-span-2 text-sm text-slate-800">{user?.email}</dd>
        </div>
        <div className="grid grid-cols-3 gap-4 px-4 py-3">
          <dt className="text-sm font-medium text-slate-500">Name</dt>
          <dd className="col-span-2 text-sm text-slate-800">
            {user?.first_name || user?.last_name
              ? `${user?.first_name} ${user?.last_name}`.trim()
              : '—'}
          </dd>
        </div>
      </dl>
    </div>
  )
}
