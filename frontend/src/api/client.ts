export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface CurrentUser {
  pk: string
  email: string
  first_name: string
  last_name: string
}

export class ApiError extends Error {
  fieldErrors: Record<string, string[]>

  constructor(fieldErrors: Record<string, string[]>) {
    super(flattenFieldErrors(fieldErrors).join(' '))
    this.fieldErrors = fieldErrors
  }
}

function flattenFieldErrors(fieldErrors: Record<string, string[]>): string[] {
  return Object.values(fieldErrors).flat()
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase()
  const csrfToken = getCookie('csrftoken')

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(!SAFE_METHODS.has(method) && csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    let fieldErrors: Record<string, string[]> = {}
    try {
      const body = await response.json()
      fieldErrors = normalizeErrorBody(body)
    } catch {
      fieldErrors = { non_field_errors: [`Request failed (${response.status})`] }
    }
    throw new ApiError(fieldErrors)
  }

  return response
}

function normalizeErrorBody(body: unknown): Record<string, string[]> {
  if (typeof body !== 'object' || body === null) {
    return { non_field_errors: [String(body)] }
  }
  const result: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    result[key] = Array.isArray(value) ? value.map(String) : [String(value)]
  }
  return result
}

export async function login(email: string, password: string): Promise<void> {
  await apiFetch('/api/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function signup(
  email: string,
  password1: string,
  password2: string,
): Promise<void> {
  await apiFetch('/api/auth/registration/', {
    method: 'POST',
    body: JSON.stringify({ email, password1, password2 }),
  })
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout/', { method: 'POST' })
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${API_BASE_URL}/api/auth/user/`, {
    credentials: 'include',
  })
  if (!response.ok) return null
  return response.json()
}

export interface Household {
  id: string
  name: string
  created_at: string
  role: 'admin' | 'member'
}

export async function fetchHouseholds(): Promise<Household[]> {
  const response = await apiFetch('/api/accounts/households/')
  return response.json()
}

export async function createHousehold(name: string): Promise<Household> {
  const response = await apiFetch('/api/accounts/households/', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return response.json()
}
