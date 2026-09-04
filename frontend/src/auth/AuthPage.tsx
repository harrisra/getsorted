import { useState } from 'react'
import type { FormEvent } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { ApiError } from '../api/client'
import { GoogleIcon } from '../icons'
import { useAuth } from './AuthContext'

// Empty when Google OAuth hasn't been set up yet — see .env.example.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? ''

type Mode = 'login' | 'signup'

export function AuthPage() {
  const { login, googleLogin, signup } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setErrors([])
    setNotice(null)
    setPassword('')
    setPassword2('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors([])
    setNotice(null)
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await signup(email, password, password2)
        switchMode('login')
        setNotice('Account created. If you are not signed in automatically, log in below.')
      }
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

  const triggerGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setErrors([])
      setNotice(null)
      setSubmitting(true)
      try {
        await googleLogin(tokenResponse.access_token)
      } catch {
        setErrors(['Google sign-in failed. Please try again.'])
      } finally {
        setSubmitting(false)
      }
    },
    onError: () => setErrors(['Google sign-in failed. Please try again.']),
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">GetSorted</h1>
          <p className="text-sm text-slate-500">
            {mode === 'login' ? 'Log in to your household' : 'Create a new account'}
          </p>
        </div>

        <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 rounded-md py-1.5 transition ${
              mode === 'login' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 rounded-md py-1.5 transition ${
              mode === 'signup' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            Sign up
          </button>
        </div>

        {notice && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
        )}
        {errors.length > 0 && (
          <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          {mode === 'signup' && (
            <div className="space-y-1">
              <label htmlFor="password2" className="text-sm font-medium text-slate-700">
                Confirm password
              </label>
              <input
                id="password2"
                type="password"
                required
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-slate-800 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        {GOOGLE_CLIENT_ID && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={() => triggerGoogleLogin()}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <GoogleIcon className="h-4 w-4" />
              Continue with Google
            </button>
          </>
        )}
      </div>
    </div>
  )
}
