import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useHouseholds } from './HouseholdsContext'

export function CreateHouseholdPage() {
  const { createHousehold } = useHouseholds()
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors([])
    setSubmitting(true)
    try {
      await createHousehold(name)
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(Object.values(err.fieldErrors).flat())
      } else {
        setErrors(['Something went wrong. Please try again.'])
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">Create your household</h1>
          <p className="text-sm text-slate-500">
            You'll be its admin, and any member you add later can view and edit its plans.
          </p>
        </div>

        {errors.length > 0 && (
          <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="household-name" className="text-sm font-medium text-slate-700">
              Household name
            </label>
            <input
              id="household-name"
              type="text"
              required
              autoComplete="off"
              placeholder="e.g. The Harris Family"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-slate-800 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create household'}
          </button>
        </form>
      </div>
    </div>
  )
}
