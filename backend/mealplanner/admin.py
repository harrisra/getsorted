from django.contrib import admin

from .models import MealPlan, MealSlot, Recipe, ShoppingListItem


class MealSlotInline(admin.TabularInline):
    model = MealSlot
    extra = 1


@admin.register(MealPlan)
class MealPlanAdmin(admin.ModelAdmin):
    list_display = ["household", "week_start"]
    list_filter = ["household"]
    inlines = [MealSlotInline]


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ["name", "household", "servings", "created_by"]
    list_filter = ["household"]
    search_fields = ["name"]


@admin.register(ShoppingListItem)
class ShoppingListItemAdmin(admin.ModelAdmin):
    list_display = ["name", "household", "quantity", "is_checked"]
    list_filter = ["household", "is_checked"]
