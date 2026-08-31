import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  type Household,
  type Membership,
  addMember,
  fetchMembers,
  removeMember,
} from '../api/client'
import { TrashIcon } from '../icons'

export function HouseholdMembers({ household }: { household: Household }) {
  const [members, setMembers] = useState<Membership[] | null>(null)
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const isOwner = household.role === 'owner'

  async function refresh() {
    setMembers(await fetchMembers(household.id))
  }

  useEffect(() => {
    refresh()
  }, [household.id])

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setErrors([])
    setSubmitting(true)
    try {
      await addMember(household.id, email)
      setEmail('')
      await refresh()
    } catch (err) {
      setErrors(err instanceof ApiError ? Object.values(err.fieldErrors).flat() : ['Something went wrong. Please try again.'])
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(userId: string) {
    setErrors([])
    setRemovingId(userId)
    try {
      await removeMember(household.id, userId)
      await refresh()
    } catch (err) {
      setErrors(err instanceof ApiError ? Object.values(err.fieldErrors).flat() : ['Something went wrong. Please try again.'])
    } finally {
      setRemovingId(null)
    }
  }

  if (members === null) {
    return <p className="text-sm text-slate-400">Loading members…</p>
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100">
        {members.map((member) => (
          <li key={member.user_id} className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm text-slate-800">{member.email}</span>{' '}
              <span className="text-xs capitalize text-slate-500">({member.role})</span>
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={() => handleRemove(member.user_id)}
                disabled={removingId === member.user_id}
                title={removingId === member.user_id ? 'Removing…' : 'Remove'}
                aria-label={removingId === member.user_id ? 'Removing…' : 'Remove'}
                className="text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {isOwner && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="email"
            required
            placeholder="Add member by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}
    </div>
  )
}
