import type { MealType, Recipe, RecipeInput } from '../api/client'

// The portable shape used for export/import files. Deliberately excludes
// anything household- or catalog-specific (id, household, created_by,
// created_at, image, current_cost, and any grocery-item store matches) so a
// file can be shared or re-imported anywhere without dragging along data
// that wouldn't make sense outside the household — or even the catalog —
// it came from.
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

function toRecipeInput(item: unknown, householdId: string): RecipeInput | null {
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
    ingredients: rawIngredients.filter(isPlainRecord).map((ing) => ({
      name: typeof ing.name === 'string' ? ing.name : '',
      grams: typeof ing.grams === 'number' ? ing.grams : null,
      pieces: typeof ing.pieces === 'number' ? ing.pieces : null,
      milliliters: typeof ing.milliliters === 'number' ? ing.milliliters : null,
      // Grocery matches are intentionally ignored on import, even if a file
      // happens to include some (e.g. a hand-edited export) — they're
      // catalog-specific and wouldn't make sense re-imported elsewhere.
      grocery_matches: [],
    })),
  }
}

// Reads one or more .json files, each of which may contain a single recipe
// object or an array of them, and flattens them into RecipeInputs ready to
// POST. Files that aren't valid JSON, or entries missing a name, are
// reported back separately rather than failing the whole import.
export async function parseImportFiles(
  files: FileList,
  householdId: string,
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
      const input = toRecipeInput(item, householdId)
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
