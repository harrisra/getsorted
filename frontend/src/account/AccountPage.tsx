import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { PencilIcon } from '../icons'

export function AccountPage() {
  const { user, updateProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setFirstName(user?.first_name ?? '')
    setLastName(user?.last_name ?? '')
    setErrors([])
    setEditing(true)
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setErrors([])
    setSaving(true)
    try {
      await updateProfile(firstName, lastName)
      setEditing(false)
    } catch (err) {
      setErrors(
        err instanceof ApiError
          ? Object.values(err.fieldErrors).flat()
          : ['Something went wrong. Please try again.'],
      )
    } finally {
      setSaving(false)
    }
  }

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
            {editing ? (
              <form onSubmit={handleSave} className="space-y-2">
                {errors.length > 0 && (
                  <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    {errors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoFocus
                    className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span>
                  {user?.first_name || user?.last_name
                    ? `${user?.first_name} ${user?.last_name}`.trim()
                    : '—'}
                </span>
                <button
                  type="button"
                  onClick={startEditing}
                  title="Edit"
                  aria-label="Edit name"
                  className="text-slate-500 hover:text-slate-900"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </dd>
        </div>
      </dl>
    </div>
  )
}
