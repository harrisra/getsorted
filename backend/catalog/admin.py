from django.contrib import admin

from .models import GroceryItem, GroceryItemPrice, Store


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = ["name"]
    search_fields = ["name"]


class GroceryItemPriceInline(admin.TabularInline):
    model = GroceryItemPrice
    extra = 0


@admin.register(GroceryItem)
class GroceryItemAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "brand",
        "aisle",
        "grams",
        "pieces",
        "milliliters",
        "created_by",
    ]
    list_filter = ["aisle"]
    search_fields = ["name", "brand"]
    inlines = [GroceryItemPriceInline]


@admin.register(GroceryItemPrice)
class GroceryItemPriceAdmin(admin.ModelAdmin):
    list_display = ["grocery_item", "store", "price", "promo_price", "updated_at"]
    list_filter = ["store"]
    search_fields = ["grocery_item__name", "store__name"]
