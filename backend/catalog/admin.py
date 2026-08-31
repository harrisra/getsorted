from django.contrib import admin

from .models import GroceryItem, Store


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = ["name"]
    search_fields = ["name"]


@admin.register(GroceryItem)
class GroceryItemAdmin(admin.ModelAdmin):
    list_display = ["name", "store", "brand", "grams", "pieces", "milliliters", "price", "created_by"]
    list_filter = ["store"]
    search_fields = ["name", "brand", "store__name"]
