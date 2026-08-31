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

const TOKEN_REFRESH_PATH = '/api/auth/token/refresh/'

// The access token cookie is short-lived (5 min); the refresh token cookie
// lasts much longer. Rather than proactively renewing on a timer, we renew
// lazily the first time a request comes back 401 and retry it once. Callers
// that race each other share a single in-flight refresh instead of each
// firing their own.
let refreshPromise: Promise<boolean> | null = null

// The refresh-token cookie is scoped to the browser, not this tab — if a
// different account logs in in another tab/window of the same browser, its
// login silently overwrites this cookie for every tab on the domain. A
// refresh here would then hand this tab an access token for THAT account
// with nothing to notice the swap. Listeners (see AuthContext) get notified
// after every successful silent refresh so they can re-verify identity
// rather than assume the refresh renewed the same session it started with.
const refreshListeners = new Set<() => void>()

export function onSilentTokenRefresh(listener: () => void): () => void {
  refreshListeners.add(listener)
  return () => refreshListeners.delete(listener)
}

function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}${TOKEN_REFRESH_PATH}`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((response) => response.ok)
      .then((ok) => {
        if (ok) refreshListeners.forEach((listener) => listener())
        return ok
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

async function apiFetch(path: string, options: RequestInit = {}, isRetry = false): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase()
  const csrfToken = getCookie('csrftoken')
  // FormData bodies must NOT have Content-Type set manually — the browser
  // needs to add the multipart boundary itself.
  const isFormData = options.body instanceof FormData

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(!SAFE_METHODS.has(method) && csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
      ...options.headers,
    },
  })

  if (response.status === 401 && !isRetry && path !== TOKEN_REFRESH_PATH) {
    const refreshed = await refreshAccessToken()
    if (refreshed) return apiFetch(path, options, true)
  }

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
  let response = await fetch(`${API_BASE_URL}/api/auth/user/`, {
    credentials: 'include',
  })
  // On page load the access token cookie may have already expired even
  // though the longer-lived refresh cookie is still good — try once to
  // renew before concluding the user is logged out.
  if (response.status === 401 && (await refreshAccessToken())) {
    response = await fetch(`${API_BASE_URL}/api/auth/user/`, {
      credentials: 'include',
    })
  }
  if (!response.ok) return null
  return response.json()
}

export async function updateCurrentUser(
  firstName: string,
  lastName: string,
): Promise<CurrentUser> {
  const response = await apiFetch('/api/auth/user/', {
    method: 'PATCH',
    body: JSON.stringify({ first_name: firstName, last_name: lastName }),
  })
  return response.json()
}

export interface Household {
  id: string
  name: string
  week_start_day: number
  created_at: string
  role: 'owner' | 'member'
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

export async function updateHouseholdWeekStartDay(
  householdId: string,
  weekStartDay: number,
): Promise<Household> {
  const response = await apiFetch(`/api/accounts/households/${householdId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ week_start_day: weekStartDay }),
  })
  return response.json()
}

export async function deleteHousehold(householdId: string): Promise<void> {
  await apiFetch(`/api/accounts/households/${householdId}/`, { method: 'DELETE' })
}

export interface Membership {
  user_id: string
  email: string
  role: 'owner' | 'member'
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

export interface Store {
  id: string
  name: string
}

export type Aisle =
  | 'fruit_veg'
  | 'bakery'
  | 'meat_fish'
  | 'dairy_eggs'
  | 'chilled_ready_meals'
  | 'frozen'
  | 'tins_packets'
  | 'pasta_rice_world_foods'
  | 'sauces_oils_seasonings'
  | 'breakfast_spreads'
  | 'snacks_sweets'
  | 'tea_coffee_soft_drinks'
  | 'alcohol'
  | 'free_from_vegan'
  | 'baby_pet'
  | 'household_cleaning'
  | 'toiletries_health'

export const AISLE_OPTIONS: { value: Aisle; label: string }[] = [
  { value: 'fruit_veg', label: 'Fruit & Veg' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'meat_fish', label: 'Meat & Fish' },
  { value: 'dairy_eggs', label: 'Dairy & Eggs' },
  { value: 'chilled_ready_meals', label: 'Chilled & Ready Meals' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'tins_packets', label: 'Tins & Packets' },
  { value: 'pasta_rice_world_foods', label: 'Pasta Rice & World Foods' },
  { value: 'sauces_oils_seasonings', label: 'Sauces Oils & Seasonings' },
  { value: 'breakfast_spreads', label: 'Breakfast & Spreads' },
  { value: 'snacks_sweets', label: 'Snacks & Sweets' },
  { value: 'tea_coffee_soft_drinks', label: 'Tea Coffee & Soft Drinks' },
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'free_from_vegan', label: 'Free From & Vegan' },
  { value: 'baby_pet', label: 'Baby & Pet' },
  { value: 'household_cleaning', label: 'Household & Cleaning' },
  { value: 'toiletries_health', label: 'Toiletries & Health' },
]

export interface GroceryItem {
  id: string
  store: string
  store_detail: Store
  name: string
  brand: string
  // Which supermarket aisle this is shelved in — optional, '' means unset.
  aisle: Aisle | ''
  grams: number | null
  pieces: number | null
  milliliters: number | null
  price: string | null
  product_url: string
  image_url: string
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export type GroceryItemInput = Omit<
  GroceryItem,
  'id' | 'store_detail' | 'created_by_email' | 'created_at' | 'updated_at'
>

export async function fetchStores(): Promise<Store[]> {
  const response = await apiFetch('/api/catalog/stores/')
  return response.json()
}

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
  /** A matched Store id, or null if the URL's domain didn't confidently
   * match one of the known stores — see store_name. */
  store: string | null
  /** Best-effort store name guessed from the URL, shown even when `store`
   * couldn't be matched so the user knows what to pick manually. */
  store_name: string
  name: string
  grams: number | null
  pieces: number | null
  milliliters: number | null
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

export interface RecipeIngredientStoreOption {
  id: string
  /** The store this match is for (derived server-side from grocery_item). */
  store: string
  grocery_item: string
  grocery_item_detail: GroceryItemRef
  line_cost: string | null
}

export type RecipeIngredientStoreOptionInput = { grocery_item: string }

export interface RecipeIngredient {
  id: string
  name: string
  grams: number | null
  pieces: number | null
  milliliters: number | null
  /** At most one match per store — see RecipeIngredientStoreOption. */
  store_options: RecipeIngredientStoreOption[]
  /** The cheapest of store_options' line costs. */
  line_cost: string | null
}

export type RecipeIngredientInput = Omit<
  RecipeIngredient,
  'id' | 'store_options' | 'line_cost'
> & {
  store_options: RecipeIngredientStoreOptionInput[]
}

export interface Recipe {
  id: string
  household: string
  name: string
  meal_type: MealType
  servings: number
  instructions: string
  source_url: string
  image: string | null
  image_url: string
  ingredients: RecipeIngredient[]
  current_cost: string | null
  created_by: string | null
  created_at: string
}

export type RecipeInput = Omit<
  Recipe,
  'id' | 'image' | 'current_cost' | 'created_by' | 'created_at' | 'ingredients'
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

export async function uploadRecipeImage(id: string, file: File): Promise<Recipe> {
  const formData = new FormData()
  formData.append('image', file)
  const response = await apiFetch(`/api/mealplanner/recipes/${id}/image/`, {
    method: 'PUT',
    body: formData,
  })
  return response.json()
}

export async function deleteRecipeImage(id: string): Promise<void> {
  await apiFetch(`/api/mealplanner/recipes/${id}/image/`, { method: 'DELETE' })
}

export interface RecipeSummary {
  id: string
  name: string
  meal_type: MealType
  servings: number
  current_cost: string | null
  image: string | null
}

export interface MealSlot {
  id: string
  meal_plan: string
  date: string
  meal_type: MealType
  recipes: string[]
  recipes_detail: RecipeSummary[]
  notes: string
}

export interface DailyTotal {
  date: string
  total_cost: string | null
}

export interface MealPlan {
  id: string
  household: string
  week_start: string
  created_at: string
  slots: MealSlot[]
  total_cost: string | null
  daily_totals: DailyTotal[]
}

export async function fetchMealPlanForWeek(
  householdId: string,
  weekStart: string,
): Promise<MealPlan> {
  const response = await apiFetch(
    `/api/mealplanner/meal-plans/for-week/?household=${householdId}&week_start=${weekStart}`,
  )
  return response.json()
}

export async function updateMealSlotRecipes(
  slotId: string,
  recipeIds: string[],
): Promise<MealSlot> {
  const response = await apiFetch(`/api/mealplanner/meal-slots/${slotId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ recipes: recipeIds }),
  })
  return response.json()
}

export interface ShoppingList {
  id: string
  household: string
  name: string
  item_count: number
  created_by: string | null
  created_by_email: string | null
  created_at: string
}

export async function fetchShoppingLists(): Promise<ShoppingList[]> {
  const response = await apiFetch('/api/mealplanner/shopping-lists/')
  return response.json()
}

export async function createShoppingList(
  householdId: string,
  name: string,
): Promise<ShoppingList> {
  const response = await apiFetch('/api/mealplanner/shopping-lists/', {
    method: 'POST',
    body: JSON.stringify({ household: householdId, name }),
  })
  return response.json()
}

export async function renameShoppingList(id: string, name: string): Promise<ShoppingList> {
  const response = await apiFetch(`/api/mealplanner/shopping-lists/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
  return response.json()
}

export async function deleteShoppingList(id: string): Promise<void> {
  await apiFetch(`/api/mealplanner/shopping-lists/${id}/`, { method: 'DELETE' })
}

// Builds items on this list from the recipes planned across the given
// dates (see the backend for the merge-by-ingredient-name behavior).
export async function generateShoppingList(
  shoppingListId: string,
  dates: string[],
): Promise<ShoppingListItem[]> {
  const response = await apiFetch(`/api/mealplanner/shopping-lists/${shoppingListId}/generate/`, {
    method: 'POST',
    body: JSON.stringify({ dates }),
  })
  return response.json()
}

export interface ShoppingListItem {
  id: string
  shopping_list: string
  meal_plan: string | null
  name: string
  // The total amount needed, across everything this item was added for —
  // a manually added item with none of these set is just "make sure this
  // is on the list", no amount implied.
  grams: number | null
  pieces: number | null
  milliliters: number | null
  /** The specific catalog product (and so store) chosen for this item. */
  grocery_item: string | null
  grocery_item_detail: GroceryItemRef | null
  /** How many of grocery_item's packs to buy to cover the amount needed
   * (ceiling division), or null if there's no match or no shared unit to
   * compare against. Server-computed. */
  packs_needed: number | null
  is_checked: boolean
  added_by: string | null
  added_by_email: string | null
  created_at: string
}

export type ShoppingListItemInput = Omit<
  ShoppingListItem,
  'id' | 'grocery_item_detail' | 'packs_needed' | 'added_by' | 'added_by_email' | 'created_at'
>

export async function fetchShoppingListItems(): Promise<ShoppingListItem[]> {
  const response = await apiFetch('/api/mealplanner/shopping-list-items/')
  return response.json()
}

export async function createShoppingListItem(
  item: ShoppingListItemInput,
): Promise<ShoppingListItem> {
  const response = await apiFetch('/api/mealplanner/shopping-list-items/', {
    method: 'POST',
    body: JSON.stringify(item),
  })
  return response.json()
}

export async function updateShoppingListItem(
  id: string,
  patch: Partial<ShoppingListItemInput>,
): Promise<ShoppingListItem> {
  const response = await apiFetch(`/api/mealplanner/shopping-list-items/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return response.json()
}

export async function deleteShoppingListItem(id: string): Promise<void> {
  await apiFetch(`/api/mealplanner/shopping-list-items/${id}/`, { method: 'DELETE' })
}
