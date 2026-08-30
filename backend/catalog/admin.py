from django.contrib import admin

from .models import GroceryItem


@admin.register(GroceryItem)
class GroceryItemAdmin(admin.ModelAdmin):
    list_display = ["name", "store", "brand", "grams", "pieces", "milliliters", "price", "created_by"]
    list_filter = ["store"]
    search_fields = ["name", "brand", "store"]
