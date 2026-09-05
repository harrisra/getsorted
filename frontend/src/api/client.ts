export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

// Short git commit SHA this build was made from — baked in at Docker build
// time per deployment target (see .github/workflows/ci.yml), so it's obvious
// which build is running where. null in local dev unless set explicitly (see
// docker-compose.yml).
export const GIT_SHA: string | null = import.meta.env.VITE_GIT_SHA || null

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

// Exchanges a Google OAuth access token (obtained client-side) for our own
// JWT cookies — see accounts.views.GoogleLogin on the backend.
export async function googleLogin(accessToken: string): Promise<void> {
  await apiFetch('/api/auth/google/', {
    method: 'POST',
    body: JSON.stringify({ access_token: accessToken }),
  })
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

// One store's price for a GroceryItem — a product can be priced at several
// stores at once, each with its own price and product page URL (moved here
// from GroceryItem, since it's store-specific).
export interface GroceryItemStorePrice {
  id: string
  store: string
  store_detail: Store
  price: string | null
  // This store's current promotional/loyalty-card price (e.g. Tesco
  // Clubcard, Sainsbury's Nectar), if it has one right now — separate from
  // `price` (the regular shelf price) since it's often conditional rather
  // than what everyone pays. null if there's no current offer.
  promo_price: string | null
  product_url: string
  updated_at: string
}

export type GroceryItemStorePriceInput = Omit<GroceryItemStorePrice, 'id' | 'store_detail' | 'updated_at'>

export interface GroceryItem {
  id: string
  name: string
  brand: string
  // Which supermarket aisle this is shelved in — optional, '' means unset.
  aisle: Aisle | ''
  grams: number | null
  pieces: number | null
  milliliters: number | null
  store_prices: GroceryItemStorePrice[]
  // A trolley.co.uk product page for this item, e.g.
  // https://www.trolley.co.uk/product/tesco-semi-skimmed-milk/MAC224 — optional,
  // and only used to refresh every store's price at once (see
  // refreshGroceryItemPrice below) — one URL for the whole product, not per
  // store, since trolley.co.uk itself compares one product across stores.
  trolley_url: string
  image_url: string
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export type GroceryItemInput = Omit<
  GroceryItem,
  'id' | 'store_prices' | 'created_by_email' | 'created_at' | 'updated_at'
> & {
  store_prices: GroceryItemStorePriceInput[]
}

// One (product, store) combination flattened out of GroceryItem.store_prices
// — the unit recipes and shopping-list items actually match against, since
// a product can now be priced at several stores at once. Built with
// flattenGroceryItemPrices below rather than fetched from its own endpoint.
export interface GroceryItemStorePriceOption {
  id: string
  groceryItemId: string
  store: string
  storeName: string
  name: string
  brand: string
  aisle: Aisle | ''
  grams: number | null
  pieces: number | null
  milliliters: number | null
  price: string | null
  promo_price: string | null
  product_url: string
  image_url: string
}

export function flattenGroceryItemPrices(items: GroceryItem[]): GroceryItemStorePriceOption[] {
  return items.flatMap((item) =>
    item.store_prices.map((sp) => ({
      id: sp.id,
      groceryItemId: item.id,
      store: sp.store,
      storeName: sp.store_detail.name,
      name: item.name,
      brand: item.brand,
      aisle: item.aisle,
      grams: item.grams,
      pieces: item.pieces,
      milliliters: item.milliliters,
      price: sp.price,
      promo_price: sp.promo_price,
      product_url: sp.product_url,
      image_url: item.image_url,
    })),
  )
}

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

export interface RefreshPriceResult extends GroceryItem {
  /** Store names trolley.co.uk listed that don't match any known Store —
   * their prices were found but couldn't be saved anywhere. */
  unmatched_stores: string[]
}

// Re-fetches every store's price for the item from trolley.co.uk and saves
// them (updating or creating a GroceryItemStorePrice per matched store) —
// only possible for an already-saved item (it's a detail action).
// `trolleyUrl` is optional: pass the form's current (possibly unsaved) value
// so this can be used right after typing a new URL in, without saving first
// — the server saves it onto the item alongside the refreshed prices. Omit
// it to reuse whatever trolley_url the item already has stored.
export async function refreshGroceryItemPrice(
  id: string,
  trolleyUrl?: string,
): Promise<RefreshPriceResult> {
  const response = await apiFetch(`/api/catalog/grocery-items/${id}/refresh-price/`, {
    method: 'POST',
    body: JSON.stringify({ trolley_url: trolleyUrl || '' }),
  })
  return response.json()
}

export interface PopulateFromTrolleyResult extends GroceryItem {
  /** Store names trolley.co.uk listed that don't match any known Store —
   * their prices were found but couldn't be saved anywhere. */
  unmatched_stores: string[]
}

// Creates a new grocery item entirely from a trolley.co.uk product page —
// name, size, image, trolley_url, and a store price for every store
// trolley.co.uk lists a price for that matches a known Store.
export async function populateGroceryItemFromTrolley(
  trolleyUrl: string,
): Promise<PopulateFromTrolleyResult> {
  const response = await apiFetch('/api/catalog/grocery-items/populate-from-trolley/', {
    method: 'POST',
    body: JSON.stringify({ trolley_url: trolleyUrl }),
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
  promo_price: string | null
}

// The matched product itself, just enough to display/search it — each
// store's price for it is reported separately (see GroceryMatchStoreCost),
// since a product can be priced at several stores at once.
export interface GroceryItemSummary {
  id: string
  name: string
  brand: string
  image_url: string
  grams: number | null
  pieces: number | null
  milliliters: number | null
}

// One store's current price for a matched product, scaled to this
// ingredient's amount needed — computed server-side (not stored), so a
// store starting/stopping stocking it is reflected automatically.
export interface GroceryMatchStoreCost {
  store: string
  store_name: string
  price: string | null
  line_cost: string | null
  // This store's current promotional/loyalty-card price, if it has one
  // right now — reported for callers that want to flag "this ingredient
  // has a current promo" (e.g. highlighting a recipe), not used in
  // line_cost/cost calculations, which stay on the regular price only.
  promo_price: string | null
}

export interface RecipeIngredientGroceryItem {
  id: string
  grocery_item: string
  grocery_item_detail: GroceryItemSummary
  /** This match's cost at every store its product is currently priced at. */
  store_costs: GroceryMatchStoreCost[]
}

export type RecipeIngredientGroceryItemInput = { grocery_item: string }

export interface RecipeIngredient {
  id: string
  name: string
  grams: number | null
  pieces: number | null
  milliliters: number | null
  /** One or more matched catalog products — see RecipeIngredientGroceryItem.
   * At most one match per product; several products can be matched at once
   * (e.g. both a Tesco and an Aldi cheddar). */
  grocery_matches: RecipeIngredientGroceryItem[]
  /** The cheapest cost across every store any matched product is priced at. */
  line_cost: string | null
}

export type RecipeIngredientInput = Omit<
  RecipeIngredient,
  'id' | 'grocery_matches' | 'line_cost'
> & {
  grocery_matches: RecipeIngredientGroceryItemInput[]
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
  // Stores this list's household isn't planning to visit — empty by
  // default (every store shown "depressed"/selected). Changing this set,
  // in either direction, re-points every priced item at the cheapest
  // currently-selected store for it (computed server-side — see
  // updateShoppingListExcludedStores).
  excluded_stores: string[]
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

// Toggling a store in or out of this list re-points every priced item at
// the cheapest currently-selected store for it (see the backend's
// ShoppingList.reoptimize_item_stores) — excluding a store moves items
// away from it, and re-including one can bring it back if it's cheapest
// again.
export async function updateShoppingListExcludedStores(
  id: string,
  excludedStores: string[],
): Promise<ShoppingList> {
  const response = await apiFetch(`/api/mealplanner/shopping-lists/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ excluded_stores: excludedStores }),
  })
  return response.json()
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
  /** The specific catalog product+store price chosen for this item. */
  grocery_item_price: string | null
  grocery_item_price_detail: GroceryItemRef | null
  /** How many of grocery_item_price's packs to buy to cover the amount
   * needed (ceiling division), or null if there's no match or no shared
   * unit to compare against. Server-computed. */
  packs_needed: number | null
  is_checked: boolean
  added_by: string | null
  added_by_email: string | null
  created_at: string
}

export type ShoppingListItemInput = Omit<
  ShoppingListItem,
  'id' | 'grocery_item_price_detail' | 'packs_needed' | 'added_by' | 'added_by_email' | 'created_at'
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
