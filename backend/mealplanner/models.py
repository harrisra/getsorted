import uuid

from django.conf import settings
from django.db import models

from accounts.models import Household


class MealType(models.TextChoices):
    BREAKFAST = "breakfast", "Breakfast"
    LUNCH = "lunch", "Lunch"
    DINNER = "dinner", "Dinner"
    SNACK = "snack", "Snack"


class Recipe(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="recipes")
    name = models.CharField(max_length=255)
    meal_type = models.CharField(max_length=20, choices=MealType.choices)
    servings = models.PositiveSmallIntegerField(default=4, help_text="Number of people it feeds")
    instructions = models.TextField(blank=True)
    source_url = models.URLField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class RecipeIngredient(models.Model):
    """One ingredient line within a Recipe, optionally linked to a catalog GroceryItem."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="ingredients")
    name = models.CharField(max_length=255)
    quantity = models.CharField(max_length=100, blank=True)
    grocery_item = models.ForeignKey(
        "catalog.GroceryItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recipe_ingredients",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.quantity} {self.name}".strip()


class MealPlan(models.Model):
    """A single household's meal plan for one week."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="meal_plans")
    week_start = models.DateField(help_text="Monday of the planned week")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("household", "week_start")
        ordering = ["-week_start"]

    def __str__(self):
        return f"{self.household.name} — week of {self.week_start}"


class MealSlot(models.Model):
    """A single meal (e.g. Tuesday dinner) within a MealPlan."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meal_plan = models.ForeignKey(MealPlan, on_delete=models.CASCADE, related_name="slots")
    date = models.DateField()
    meal_type = models.CharField(max_length=20, choices=MealType.choices)
    recipe = models.ForeignKey(Recipe, on_delete=models.SET_NULL, null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        unique_together = ("meal_plan", "date", "meal_type")
        ordering = ["date", "meal_type"]

    def __str__(self):
        return f"{self.date} {self.meal_type}"


class ShoppingListItem(models.Model):
    """An item on a household's shopping list, optionally linked to a meal plan."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(
        Household, on_delete=models.CASCADE, related_name="shopping_list_items"
    )
    meal_plan = models.ForeignKey(
        MealPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name="shopping_items"
    )
    name = models.CharField(max_length=255)
    quantity = models.CharField(max_length=100, blank=True)
    is_checked = models.BooleanField(default=False)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["is_checked", "name"]

    def __str__(self):
        return self.name
