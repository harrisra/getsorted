import type { GroceryItem, MealType, Recipe, RecipeInput } from '../api/client'

// The portable shape used for export/import files. Deliberately excludes
// anything household- or catalog-specific (id, household, created_by,
// created_at, image, current_cost) so a file can be shared or re-imported
// anywhere without dragging along data that wouldn't make sense outside the
// household it came from. Each ingredient's grocery matches are the one
// exception — kept as the matched product's NAME (not its id, which is only
// meaningful within this deployment's catalog) so re-importing into a
// catalog that happens to have a product of the same name reconnects the
// match (see toRecipeInput below) — a plain exact-name match, nothing
// fuzzier.
export interface ExportedRecipe {
  name: string
  meal_type: MealType
  servings: number
  instructions: string
  source_url: string
  image_url: string
  ingredients: {
    name: string
    grams: number | null
    pieces: number | null
    milliliters: number | null
    grocery_matches: string[]
  }[]
}

function toExportedRecipe(recipe: Recipe): ExportedRecipe {
  return {
    name: recipe.name,
    meal_type: recipe.meal_type,
    servings: recipe.servings,
    instructions: recipe.instructions,
    source_url: recipe.source_url,
    image_url: recipe.image_url,
    ingredients: recipe.ingredients.map((ing) => ({
      name: ing.name,
      grams: ing.grams,
      pieces: ing.pieces,
      milliliters: ing.milliliters,
      grocery_matches: ing.grocery_matches.map((match) => match.grocery_item_detail.name),
    })),
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'recipe'
  )
}

export function downloadRecipesAsJson(recipes: Recipe[]): void {
  const data = recipes.map(toExportedRecipe)
  const filename =
    recipes.length === 1
      ? `${slugify(recipes[0].name)}.json`
      : `recipes-export-${new Date().toISOString().slice(0, 10)}.json`

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toRecipeInput(item: unknown, householdId: string, groceryItems: GroceryItem[]): RecipeInput | null {
  if (!isPlainRecord(item) || typeof item.name !== 'string' || !item.name.trim()) {
    return null
  }
  const rawIngredients = Array.isArray(item.ingredients) ? item.ingredients : []
  return {
    household: householdId,
    name: item.name,
    meal_type: (typeof item.meal_type === 'string' ? item.meal_type : 'dinner') as MealType,
    servings: typeof item.servings === 'number' ? item.servings : 4,
    instructions: typeof item.instructions === 'string' ? item.instructions : '',
    source_url: typeof item.source_url === 'string' ? item.source_url : '',
    image_url: typeof item.image_url === 'string' ? item.image_url : '',
    ingredients: rawIngredients.filter(isPlainRecord).map((ing) => {
      // Reconnect each match by an exact name match against this catalog —
      // nothing fuzzier — dropping any name that isn't currently in it
      // rather than failing the import over it.
      const matchNames = Array.isArray(ing.grocery_matches) ? ing.grocery_matches : []
      const grocery_matches = matchNames
        .filter((name): name is string => typeof name === 'string')
        .map((name) => groceryItems.find((gi) => gi.name === name))
        .filter((gi): gi is GroceryItem => gi !== undefined)
        .map((gi) => ({ grocery_item: gi.id }))

      return {
        name: typeof ing.name === 'string' ? ing.name : '',
        grams: typeof ing.grams === 'number' ? ing.grams : null,
        pieces: typeof ing.pieces === 'number' ? ing.pieces : null,
        milliliters: typeof ing.milliliters === 'number' ? ing.milliliters : null,
        grocery_matches,
      }
    }),
  }
}

// Reads one or more .json files, each of which may contain a single recipe
// object or an array of them, and flattens them into RecipeInputs ready to
// POST. Files that aren't valid JSON, or entries missing a name, are
// reported back separately rather than failing the whole import.
// `groceryItems` is the current grocery catalog, used to reconnect each
// ingredient's grocery matches by exact product name (see toRecipeInput) —
// a match whose name isn't in it is simply dropped.
export async function parseImportFiles(
  files: FileList,
  householdId: string,
  groceryItems: GroceryItem[],
): Promise<{ recipes: RecipeInput[]; fileErrors: string[] }> {
  const recipes: RecipeInput[] = []
  const fileErrors: string[] = []

  for (const file of Array.from(files)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      fileErrors.push(`${file.name}: not valid JSON.`)
      continue
    }

    const items = Array.isArray(parsed) ? parsed : [parsed]
    let validInFile = 0
    for (const item of items) {
      const input = toRecipeInput(item, householdId, groceryItems)
      if (input) {
        recipes.push(input)
        validInFile++
      }
    }
    if (validInFile === 0) {
      fileErrors.push(`${file.name}: no valid recipes found.`)
    }
  }

  return { recipes, fileErrors }
}
