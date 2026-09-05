import { AISLE_OPTIONS, type Aisle, type GroceryItem, type GroceryItemInput, type Store } from '../api/client'

// The portable shape used for export/import files. Each store price's store
// is the chain's NAME rather than its internal id — the id is only
// meaningful within this deployment's catalog, whereas the name can be
// resolved back to whichever Store row it matches on import (see
// toGroceryItemInput below).
export interface ExportedGroceryItemPrice {
  store: string
  price: string | null
  product_url: string
}

export interface ExportedGroceryItem {
  name: string
  brand: string
  aisle: Aisle | ''
  grams: number | null
  pieces: number | null
  milliliters: number | null
  store_prices: ExportedGroceryItemPrice[]
  trolley_url: string
  image_url: string
}

function toExportedGroceryItem(item: GroceryItem): ExportedGroceryItem {
  return {
    name: item.name,
    brand: item.brand,
    aisle: item.aisle,
    grams: item.grams,
    pieces: item.pieces,
    milliliters: item.milliliters,
    store_prices: item.store_prices.map((sp) => ({
      store: sp.store_detail.name,
      price: sp.price,
      product_url: sp.product_url,
    })),
    trolley_url: item.trolley_url,
    image_url: item.image_url,
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'grocery-item'
  )
}

export function downloadGroceryItemsAsJson(items: GroceryItem[]): void {
  const data = items.map(toExportedGroceryItem)
  const filename =
    items.length === 1
      ? `${slugify(items[0].name)}.json`
      : `grocery-items-export-${new Date().toISOString().slice(0, 10)}.json`

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

function toStorePriceInput(
  entry: unknown,
  stores: Store[],
): GroceryItemInput['store_prices'][number] | null {
  if (!isPlainRecord(entry) || typeof entry.store !== 'string') return null
  const store = stores.find((s) => s.name.toLowerCase() === entry.store.trim().toLowerCase())
  if (!store) return null
  return {
    store: store.id,
    price: typeof entry.price === 'string' ? entry.price : null,
    product_url: typeof entry.product_url === 'string' ? entry.product_url : '',
  }
}

function toGroceryItemInput(item: unknown, stores: Store[]): GroceryItemInput | null {
  if (!isPlainRecord(item) || typeof item.name !== 'string' || !item.name.trim()) {
    return null
  }

  const storePricesRaw = Array.isArray(item.store_prices) ? item.store_prices : []
  let store_prices = storePricesRaw
    .map((entry) => toStorePriceInput(entry, stores))
    .filter((sp): sp is GroceryItemInput['store_prices'][number] => sp !== null)

  // Files exported before store prices moved to their own list (a single
  // store/price/product_url per item, rather than a store_prices array) —
  // read those the old way too, as one store price, so a previously
  // exported backup file can still be re-imported.
  if (store_prices.length === 0) {
    const legacy = toStorePriceInput(
      { store: item.store, price: item.price, product_url: item.product_url },
      stores,
    )
    if (legacy) store_prices = [legacy]
  }
  if (store_prices.length === 0) return null

  const aisle =
    typeof item.aisle === 'string' && AISLE_OPTIONS.some((a) => a.value === item.aisle)
      ? (item.aisle as Aisle)
      : ''

  return {
    name: item.name,
    brand: typeof item.brand === 'string' ? item.brand : '',
    aisle,
    grams: typeof item.grams === 'number' ? item.grams : null,
    pieces: typeof item.pieces === 'number' ? item.pieces : null,
    milliliters: typeof item.milliliters === 'number' ? item.milliliters : null,
    store_prices,
    trolley_url: typeof item.trolley_url === 'string' ? item.trolley_url : '',
    image_url: typeof item.image_url === 'string' ? item.image_url : '',
  }
}

// Reads one or more .json files, each of which may contain a single grocery
// item object or an array of them, and flattens them into GroceryItemInputs
// ready to POST. Files that aren't valid JSON, or that yield no entries with
// both a name and at least one store price matching the known list, are
// reported back separately rather than failing the whole import.
export async function parseImportFiles(
  files: FileList,
  stores: Store[],
): Promise<{ items: GroceryItemInput[]; fileErrors: string[] }> {
  const items: GroceryItemInput[] = []
  const fileErrors: string[] = []

  for (const file of Array.from(files)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      fileErrors.push(`${file.name}: not valid JSON.`)
      continue
    }

    const entries = Array.isArray(parsed) ? parsed : [parsed]
    let validInFile = 0
    for (const entry of entries) {
      const input = toGroceryItemInput(entry, stores)
      if (input) {
        items.push(input)
        validInFile++
      }
    }
    if (validInFile === 0) {
      fileErrors.push(`${file.name}: no valid grocery items found (check names and store names match).`)
    }
  }

  return { items, fileErrors }
}
