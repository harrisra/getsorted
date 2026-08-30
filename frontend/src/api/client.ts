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

export interface Membership {
  user_id: string
  email: string
  role: 'admin' | 'member'
  joined_at: string
}

export async function fetchMembers(householdId: string): Promise<Membership[]> {
  const response = await apiFetch(`/api/accounts/households/${householdId}/members/`)
  return response.json()
}

export async function addMember(householdId: string, email: string): Promise<Membership> {
  const response = await apiFetch(`/api/accounts/households/${householdId}/members/`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  return response.json()
}

export async function removeMember(householdId: string, userId: string): Promise<void> {
  await apiFetch(`/api/accounts/households/${householdId}/members/${userId}/`, {
    method: 'DELETE',
  })
}

export interface GroceryItem {
  id: string
  store: string
  name: string
  brand: string
  size: string
  price: string | null
  product_url: string
  image_url: string
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export type GroceryItemInput = Omit<
  GroceryItem,
  'id' | 'created_by_email' | 'created_at' | 'updated_at'
>

export async function fetchGroceryItems(): Promise<GroceryItem[]> {
  const response = await apiFetch('/api/catalog/grocery-items/')
  return response.json()
}

export async function createGroceryItem(item: GroceryItemInput): Promise<GroceryItem> {
  const response = await apiFetch('/api/catalog/grocery-items/', {
    method: 'POST',
    body: JSON.stringify(item),
  })
  return response.json()
}

export async function updateGroceryItem(
  id: string,
  item: GroceryItemInput,
): Promise<GroceryItem> {
  const response = await apiFetch(`/api/catalog/grocery-items/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(item),
  })
  return response.json()
}

export async function deleteGroceryItem(id: string): Promise<void> {
  await apiFetch(`/api/catalog/grocery-items/${id}/`, { method: 'DELETE' })
}

export interface PopulateResult {
  store: string
  name: string
  size: string
  price: string | null
  product_url: string
  image_url: string
  matched_exact: boolean
}

export async function populateGroceryItem(
  name: string,
  productUrl: string,
): Promise<PopulateResult> {
  const response = await apiFetch('/api/catalog/grocery-items/populate/', {
    method: 'POST',
    body: JSON.stringify({ name, product_url: productUrl }),
  })
  return response.json()
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface GroceryItemRef {
  id: string
  store: string
  name: string
  image_url: string
  price: string | null
}

export interface RecipeIngredient {
  id: string
  name: string
  quantity: string
  grocery_item: string | null
  grocery_item_detail: GroceryItemRef | null
}

export type RecipeIngredientInput = Omit<RecipeIngredient, 'id' | 'grocery_item_detail'>

export interface Recipe {
  id: string
  household: string
  name: string
  meal_type: MealType
  servings: number
  instructions: string
  source_url: string
  ingredients: RecipeIngredient[]
  current_cost: string | null
  created_by: string | null
  created_at: string
}

export type RecipeInput = Omit<
  Recipe,
  'id' | 'current_cost' | 'created_by' | 'created_at' | 'ingredients'
> & {
  ingredients: RecipeIngredientInput[]
}

export async function fetchRecipes(): Promise<Recipe[]> {
  const response = await apiFetch('/api/mealplanner/recipes/')
  return response.json()
}

export async function createRecipe(recipe: RecipeInput): Promise<Recipe> {
  const response = await apiFetch('/api/mealplanner/recipes/', {
    method: 'POST',
    body: JSON.stringify(recipe),
  })
  return response.json()
}

export async function updateRecipe(id: string, recipe: RecipeInput): Promise<Recipe> {
  const response = await apiFetch(`/api/mealplanner/recipes/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(recipe),
  })
  return response.json()
}

export async function deleteRecipe(id: string): Promise<void> {
  await apiFetch(`/api/mealplanner/recipes/${id}/`, { method: 'DELETE' })
}
